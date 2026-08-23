import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { RuntimeEnvelope } from '../adapters/llm-wiki/runtime-protocol.js';
import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import { ResearchIndexProjector } from './research-index-projector.js';
import type {
  ResearchIndexCatalogV1,
  ResearchIndexSourceRecordV1
} from './research-index-types.js';
import { RESEARCH_MEMORY_POLICY_V1 } from './research-memory-policy.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import type {
  MemoryPromotionApprovalV2,
  MemoryPromotionPlanV2,
  MemoryPromotionReceiptV2,
  MemoryPromotionStepStatus,
  PromotionArtifactRefV2,
  PromotionRecordOperationV2,
  ResearchPromotionAction,
  ReviewDeltaInput,
  SemanticMemoryDeltaV1,
  SemanticMemoryOperationV1,
  SemanticPromotionReviewV1
} from './research-memory-types.js';
import { renderResearchRecord, type RenderResearchRecordInput } from './research-record-renderer.js';
import { validateContract } from './schema-validator.js';
import { withPromotionLock } from './promotion-lock.js';
import type { WorkspaceStore } from './workspace-store.js';

const ACTIONS = [
  'validate_mapping', 'verify_evidence', 'copy_source', 'write_semantic_records',
  'write_document_records', 'register_artifact', 'append_log', 'write_index_shards',
  'recheck_base_catalog', 'commit_catalog'
] as const satisfies readonly ResearchPromotionAction[];
const COMPLETE = new Set<MemoryPromotionStepStatus>(['succeeded', 'already_exists']);
const NULL_CATALOG_DIGEST = sha256({ catalog: null });

export interface RuntimeCatalogLookupNotFound { readonly status: 'not_found' }
export interface RuntimeCatalogLookupFound {
  readonly status: 'found';
  readonly path: string;
  readonly digest: `sha256:${string}`;
}
export type RuntimeCatalogLookup = RuntimeCatalogLookupNotFound | RuntimeCatalogLookupFound;

export interface MemoryPromotionRuntime {
  version(): Promise<'0.2.0'>;
  validateMapping(): Promise<RuntimeEnvelope>;
  findCatalog(trackId: string): Promise<RuntimeCatalogLookup>;
  copySource(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
  writeRecord(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
  registerArtifact(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
  appendLog(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
}

export interface PromotionDomainAssets {
  readonly profile_path: string;
  readonly mapping_path: string;
  readonly scp_paths: readonly string[];
}

export interface MemoryPromotionIds {
  readonly planId?: () => string;
  readonly approvalId?: () => string;
  readonly receiptId?: () => string;
  readonly now?: () => Date;
}

interface PromotionStepStateV2 {
  readonly name: ResearchPromotionAction;
  readonly status: MemoryPromotionStepStatus;
  readonly artifact_ref: string | null;
  readonly checksum: `sha256:${string}` | null;
  readonly error_code: string | null;
  readonly runtime_status: string | null;
}

export interface MemoryPromotionStatusV2 {
  readonly schema_version: 'memory-promotion-status/v2';
  readonly plan_id: string;
  readonly plan_digest: `sha256:${string}`;
  readonly approval_digest: `sha256:${string}` | null;
  readonly track_id: string;
  readonly phase: 'planned' | 'approved' | 'executing' | 'partial' | 'reconciliation_required' | 'complete';
  readonly active_step: ResearchPromotionAction | null;
  readonly steps: readonly PromotionStepStateV2[];
  readonly record_refs: readonly string[];
  readonly latest_receipt_path: string | null;
  readonly receipt_seq: number;
  readonly updated_at: string;
}

interface PromotionCatalogMirrorV1 {
  readonly schema_version: 'promotion-catalog-mirror/v1';
  readonly runtime_catalog_digest: `sha256:${string}`;
  readonly catalog: ResearchIndexCatalogV1;
  readonly records: readonly ResearchIndexSourceRecordV1[];
}

interface PromotionTargetContent {
  readonly frontmatter: RenderResearchRecordInput['frontmatter'];
  readonly body: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly refs: Readonly<Record<string, string>>;
  readonly index_entry: ResearchIndexSourceRecordV1;
}

function unsigned<T extends object>(value: T, key: keyof T): object {
  const copy = { ...value } as Record<PropertyKey, unknown>;
  Reflect.deleteProperty(copy, key);
  return copy;
}

function digestValue(value: unknown): `sha256:${string}` | null {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
    ? value as `sha256:${string}` : null;
}

function artifact(path: string, content: string | Uint8Array): PromotionArtifactRefV2 {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  return { relative_path: path, digest: sha256Bytes(bytes) };
}

export class MemoryPromotionService {
  private readonly now: () => Date;
  private readonly evidence: ResearchEvidenceService;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly runtime: MemoryPromotionRuntime,
    private readonly assets: PromotionDomainAssets,
    private readonly ids: MemoryPromotionIds = {}
  ) {
    this.now = ids.now ?? (() => new Date());
    this.evidence = new ResearchEvidenceService(store);
  }

  private root(planId: string): string {
    if (!STABLE_ID_PATTERN.test(planId)) throw new HarnessError('CONTRACT_INVALID', 'Promotion Plan id must be stable');
    return `memory/promotions/${planId}`;
  }

  private workspaceDigest(): `sha256:${string}` {
    return sha256({ publishing_workspace: this.store.root });
  }

  private async domainDigests() {
    const [profile, mapping, ...scps] = await Promise.all([
      readFile(this.assets.profile_path), readFile(this.assets.mapping_path),
      ...this.assets.scp_paths.map((path) => readFile(path))
    ]);
    if (scps.length === 0) throw new HarnessError('CONTRACT_INVALID', 'Promotion requires at least one SCP');
    return {
      profile_digest: sha256Bytes(profile), mapping_digest: sha256Bytes(mapping),
      scp_digests: scps.map(sha256Bytes)
    };
  }

  private async loadDelta(deltaId: string): Promise<SemanticMemoryDeltaV1> {
    const delta = validateContract<SemanticMemoryDeltaV1>(
      'semantic-memory-delta', await this.store.readJson(`memory/deltas/${deltaId}/delta.json`)
    );
    if (sha256(unsigned(delta, 'delta_digest')) !== delta.delta_digest) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'Semantic Delta digest is stale');
    }
    return delta;
  }

  private async loadReview(reviewId: string): Promise<SemanticPromotionReviewV1> {
    const review = validateContract<SemanticPromotionReviewV1>(
      'semantic-promotion-review', await this.store.readJson(`memory/reviews/${reviewId}/review.json`)
    );
    if (sha256(unsigned(review, 'review_digest')) !== review.review_digest) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'Semantic Promotion Review digest is stale');
    }
    return review;
  }

  async plan(deltaId: string, reviewId: string): Promise<MemoryPromotionPlanV2> {
    const [delta, review, domain] = await Promise.all([
      this.loadDelta(deltaId), this.loadReview(reviewId), this.domainDigests()
    ]);
    if (review.delta_id !== delta.delta_id || review.delta_digest !== delta.delta_digest) {
      throw new HarnessError('CONTRACT_INVALID', 'Review does not bind the requested Delta');
    }
    const trackMatch = /^increment:([a-z0-9][a-z0-9_-]{0,95}):/.exec(delta.increment_ref);
    if (trackMatch === null) throw new HarnessError('CONTRACT_INVALID', 'Delta Track cannot be resolved');
    const trackId = trackMatch[1]!;
    const planId = this.ids.planId?.() ?? `promotion_plan_${randomUUID().replaceAll('-', '')}`;
    const currentCatalog = await this.runtime.findCatalog(trackId);
    const mirrorPath = `memory/promotions/catalog-mirrors/${trackId}/state.json`;
    const hasMirror = await this.store.exists(mirrorPath);
    let priorCatalog: ResearchIndexCatalogV1 | null = null;
    let priorRecords: readonly ResearchIndexSourceRecordV1[] = [];
    if (currentCatalog.status === 'found') {
      if (!hasMirror) {
        throw new HarnessError('MEMORY_PROMOTION_RECONCILIATION_REQUIRED', 'Runtime Catalog has no verified local projection mirror');
      }
      const mirror = await this.store.readJson<PromotionCatalogMirrorV1>(mirrorPath);
      if (mirror.runtime_catalog_digest !== currentCatalog.digest) {
        throw new HarnessError('MEMORY_SOURCE_STALE', 'Runtime Catalog differs from the local projection mirror');
      }
      priorCatalog = mirror.catalog;
      priorRecords = mirror.records;
    } else if (hasMirror) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'local Catalog mirror exists but Runtime Catalog is absent');
    }
    const baseCatalogDigest = currentCatalog.status === 'found' ? currentCatalog.digest : NULL_CATALOG_DIGEST;
    if (delta.base_catalog_digest !== baseCatalogDigest) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'Delta base Catalog digest is stale');
    }

    const accepted = delta.proposed_operations.filter((operation) =>
      review.accepted_operation_ids.includes(operation.operation_id)
    );
    if (accepted.length === 0) throw new HarnessError('CONTRACT_INVALID', 'Promotion Plan has no accepted operations');
    for (const operation of accepted) {
      if (operation.record_type !== 'research_lifecycle_event') continue;
      const semantic = (operation.target_content as { semantic_record?: {
        event_type?: string; approval_ref?: string | null;
      } }).semantic_record;
      if (semantic?.event_type === 'accepted' && semantic.approval_ref !== `review:${review.review_id}`) {
        throw new HarnessError('CONTRACT_INVALID', 'accepted lifecycle event must bind the exact Human Review');
      }
    }
    const replacements = new Map(review.operation_replacements.map((item) => [item.operation_id, item]));
    const rendered = accepted.map((operation) => this.renderOperation(operation, replacements.get(operation.operation_id)));
    const recordMap = new Map(priorRecords.map((record) => [record.ref, record]));
    for (const item of rendered) recordMap.set(item.indexEntry.ref, item.indexEntry);
    const projection = new ResearchIndexProjector().project({
      track_id: trackId, prior_catalog: priorCatalog, records: [...recordMap.values()]
    });

    const evidenceSnapshots = [];
    for (const ref of delta.evidence_snapshot_refs) {
      const id = ref.startsWith('evidence:') ? ref.slice('evidence:'.length) : '';
      const status = await this.evidence.status(id);
      evidenceSnapshots.push({ ref, digest: status.snapshot_digest });
    }
    const sourceBundle = `${JSON.stringify({ delta, review, evidence_snapshots: evidenceSnapshots }, null, 2)}\n`;
    const sourcePath = `${this.root(planId)}/staging/source.json`;
    const sourceArtifact = artifact(sourcePath, sourceBundle);
    const sourceId = `src-${sourceArtifact.digest.slice('sha256:'.length, 'sha256:'.length + 12)}`;
    const entries: Record<string, string | object | Uint8Array> = { 'source.json': Buffer.from(sourceBundle, 'utf8') };

    const semanticOperations: PromotionRecordOperationV2[] = [];
    const documentOperations: PromotionRecordOperationV2[] = [];
    for (const item of rendered) {
      const relative = `${this.root(planId)}/staging/records/${item.operation.operation_id}.md`;
      const contentArtifact = artifact(relative, item.content);
      entries[`records/${item.operation.operation_id}.md`] = Buffer.from(item.content, 'utf8');
      const planned: PromotionRecordOperationV2 = {
        operation_id: item.operation.operation_id,
        record_type: item.operation.record_type,
        variables: item.target.variables,
        refs: { ...item.target.refs, source_id: sourceId },
        content_artifact: contentArtifact,
        expected_digest: contentArtifact.digest,
        write_mode: item.operation.record_type === 'research_index_catalog' ? 'update_allowed' : 'create_only'
      };
      if (item.operation.record_type === 'canonical_document_manifest' || item.operation.record_type === 'canonical_document_chunk') {
        documentOperations.push(planned);
      } else {
        semanticOperations.push(planned);
      }
    }

    const shardOperations: PromotionRecordOperationV2[] = projection.shards.map((shard, index) => {
      const relative = `${this.root(planId)}/staging/index/shard-${index + 1}.md`;
      entries[`index/shard-${index + 1}.md`] = Buffer.from(shard.content, 'utf8');
      return {
        operation_id: `index_shard_${index + 1}`,
        record_type: 'research_index_shard',
        variables: {
          research_track: trackId, generation: projection.generation, view: shard.record.view,
          shard_id: shard.record.shard_id,
          digest_hex: shard.content_digest.slice('sha256:'.length)
        },
        refs: { promotion_id: planId },
        content_artifact: artifact(relative, shard.content),
        expected_digest: shard.content_digest,
        write_mode: 'create_only'
      };
    });
    const catalogPath = `${this.root(planId)}/staging/index/catalog.md`;
    entries['index/catalog.md'] = Buffer.from(projection.catalog_content, 'utf8');
    const catalogOperation: PromotionRecordOperationV2 = {
      operation_id: 'index_catalog_commit', record_type: 'research_index_catalog',
      variables: { research_track: trackId }, refs: { promotion_id: planId },
      content_artifact: artifact(catalogPath, projection.catalog_content),
      expected_digest: projection.catalog_content_digest, write_mode: 'update_allowed'
    };
    await this.store.writeNewDirectory(`${this.root(planId)}/staging`, entries);

    const body = {
      schema_version: 'memory-promotion-plan/v2' as const,
      kind: 'research_increment_promotion' as const,
      plan_id: planId,
      track_id: trackId,
      workspace_identity_digest: this.workspaceDigest(),
      runtime_requirement: RESEARCH_MEMORY_POLICY_V1.runtime_requirement,
      ...domain,
      evidence_snapshots: evidenceSnapshots,
      delta_ref: `delta:${delta.delta_id}`,
      delta_digest: delta.delta_digest,
      review_ref: `review:${review.review_id}`,
      review_digest: review.review_digest,
      base_catalog_ref: currentCatalog.status === 'found' ? currentCatalog.path : null,
      base_catalog_digest: baseCatalogDigest,
      source_artifact: sourceArtifact,
      immutable_record_operations: semanticOperations,
      document_record_operations: documentOperations,
      index_shard_operations: shardOperations,
      catalog_operation: catalogOperation,
      artifact_operation: { artifact_id: planId, artifact_type: 'research_promotion' as const },
      log_event: { event_id: `research-promotion:${planId}`.replace(':', '_'), log_type: 'memory_event' as const },
      action_sequence: ACTIONS,
      expected_final_catalog_digest: projection.catalog_content_digest,
      planned_at: this.now().toISOString()
    };
    const plan = validateContract<MemoryPromotionPlanV2>('memory-promotion-plan-v2', {
      ...body, plan_digest: sha256(body)
    });
    await this.store.writeNew(`${this.root(planId)}/plan.json`, plan);
    await this.store.writeNew(`${this.root(planId)}/projection.json`, {
      catalog: projection.catalog, records: [...recordMap.values()]
    });
    await this.writeState({
      schema_version: 'memory-promotion-status/v2', plan_id: planId, plan_digest: plan.plan_digest,
      approval_digest: null, track_id: trackId, phase: 'planned', active_step: null,
      steps: ACTIONS.map((name) => ({ name, status: 'pending', artifact_ref: null, checksum: null, error_code: null, runtime_status: null })),
      record_refs: [], latest_receipt_path: null, receipt_seq: 0, updated_at: this.now().toISOString()
    });
    return plan;
  }

  private renderOperation(
    operation: SemanticMemoryOperationV1,
    replacement: ReviewDeltaInput['operation_replacements'][number] | undefined
  ): { operation: SemanticMemoryOperationV1; target: PromotionTargetContent; content: string; indexEntry: ResearchIndexSourceRecordV1 } {
    const target = operation.target_content as unknown as PromotionTargetContent;
    if (
      target === null || typeof target !== 'object' || typeof target.body !== 'string' ||
      target.frontmatter === undefined || target.variables === undefined || target.refs === undefined ||
      target.index_entry === undefined
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'accepted operation lacks complete rendered target content');
    }
    const frontmatter = replacement?.claim_status === undefined
      ? target.frontmatter : { ...target.frontmatter, claim_status: replacement.claim_status };
    const content = renderResearchRecord({ record_type: operation.record_type, frontmatter, body: target.body });
    const contentDigest = sha256Bytes(Buffer.from(content, 'utf8'));
    return {
      operation,
      target: { ...target, frontmatter },
      content,
      indexEntry: {
        ...target.index_entry,
        record_digest: contentDigest,
        ...(replacement?.claim_status === undefined ? {} : { claim_status: replacement.claim_status })
      }
    };
  }

  async approve(
    planId: string,
    confirmedPlanDigest: `sha256:${string}`,
    actor: string,
    ttlMs: number
  ): Promise<MemoryPromotionApprovalV2> {
    const plan = await this.loadPlan(planId);
    if (
      confirmedPlanDigest !== plan.plan_digest || actor.trim().length === 0 ||
      !Number.isFinite(ttlMs) || ttlMs <= 0
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Promotion approval requires the exact Plan digest');
    }
    const now = this.now();
    const body = {
      schema_version: 'memory-promotion-approval/v2' as const,
      approval_id: this.ids.approvalId?.() ?? `promotion_approval_${randomUUID().replaceAll('-', '')}`,
      plan_id: plan.plan_id,
      plan_digest: plan.plan_digest,
      review_digest: plan.review_digest,
      workspace_identity_digest: plan.workspace_identity_digest,
      confirmation_text: `确认 Research Promotion Plan ${plan.plan_digest}`,
      approved_action: 'promote_once' as const,
      approved_by: actor.trim(),
      approved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + ttlMs).toISOString()
    };
    const approval = validateContract<MemoryPromotionApprovalV2>('memory-promotion-approval-v2', {
      ...body, approval_digest: sha256(body)
    });
    await this.store.writeNew(`${this.root(planId)}/approval.json`, approval);
    const state = await this.status(planId);
    await this.writeState({
      ...state, approval_digest: approval.approval_digest, phase: 'approved', updated_at: this.now().toISOString()
    });
    return approval;
  }

  async execute(planId: string, approval: MemoryPromotionApprovalV2): Promise<MemoryPromotionReceiptV2> {
    const plan = await this.loadPlan(planId);
    return withPromotionLock(this.store, plan.track_id, async () => {
      const state = await this.status(planId);
      if (state.phase !== 'approved') throw new HarnessError('STATE_TRANSITION_INVALID', 'Promotion is not approved');
      await this.preflight(plan, approval);
      return this.run(plan, approval, { ...state, phase: 'executing' });
    });
  }

  async resume(planId: string, approval: MemoryPromotionApprovalV2): Promise<MemoryPromotionReceiptV2> {
    const plan = await this.loadPlan(planId);
    return withPromotionLock(this.store, plan.track_id, async () => {
      let state = await this.status(planId);
      if (state.phase === 'reconciliation_required') {
        throw new HarnessError('MEMORY_PROMOTION_RECONCILIATION_REQUIRED', 'Promotion requires explicit Runtime reconciliation');
      }
      if (state.phase !== 'partial') throw new HarnessError('STATE_TRANSITION_INVALID', 'only partial Promotion may resume');
      await this.preflight(plan, approval);
      if (state.active_step !== null) {
        if (state.active_step === 'register_artifact' || state.active_step === 'commit_catalog') {
          throw new HarnessError('MEMORY_PROMOTION_RECONCILIATION_REQUIRED', 'uncertain side effect requires reconciliation');
        }
        state = { ...state, active_step: null };
      }
      return this.run(plan, approval, { ...state, phase: 'executing' });
    });
  }

  async status(planId: string): Promise<MemoryPromotionStatusV2> {
    return this.store.readJson<MemoryPromotionStatusV2>(`${this.root(planId)}/state.json`);
  }

  private async loadPlan(planId: string): Promise<MemoryPromotionPlanV2> {
    const plan = validateContract<MemoryPromotionPlanV2>(
      'memory-promotion-plan-v2', await this.store.readJson(`${this.root(planId)}/plan.json`)
    );
    if (sha256(unsigned(plan, 'plan_digest')) !== plan.plan_digest) {
      throw new HarnessError('APPROVAL_STALE', 'Promotion Plan digest is stale');
    }
    return plan;
  }

  private async preflight(plan: MemoryPromotionPlanV2, approval: MemoryPromotionApprovalV2): Promise<void> {
    let valid: MemoryPromotionApprovalV2;
    try {
      valid = validateContract<MemoryPromotionApprovalV2>('memory-promotion-approval-v2', approval);
    } catch {
      throw new HarnessError('APPROVAL_STALE', 'Promotion Approval contract is invalid');
    }
    const stored = await this.store.readJson<MemoryPromotionApprovalV2>(`${this.root(plan.plan_id)}/approval.json`);
    if (
      sha256(unsigned(valid, 'approval_digest')) !== valid.approval_digest ||
      sha256(valid) !== sha256(stored) || valid.plan_digest !== plan.plan_digest ||
      valid.review_digest !== plan.review_digest || valid.workspace_identity_digest !== this.workspaceDigest() ||
      valid.confirmation_text !== `确认 Research Promotion Plan ${plan.plan_digest}` ||
      Date.parse(valid.expires_at) <= this.now().getTime()
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Promotion Approval no longer binds the exact Plan');
    }
    const domain = await this.domainDigests();
    if (
      domain.profile_digest !== plan.profile_digest || domain.mapping_digest !== plan.mapping_digest ||
      sha256(domain.scp_digests) !== sha256(plan.scp_digests) ||
      await this.runtime.version() !== plan.runtime_requirement.version
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Promotion dependency digest changed');
    }
    for (const bound of [
      plan.source_artifact,
      ...plan.immutable_record_operations.map((operation) => operation.content_artifact),
      ...plan.document_record_operations.map((operation) => operation.content_artifact),
      ...plan.index_shard_operations.map((operation) => operation.content_artifact),
      plan.catalog_operation.content_artifact
    ]) {
      const current = await this.store.resolveExistingArtifact(bound.relative_path);
      if (current.digest !== bound.digest) throw new HarnessError('APPROVAL_STALE', 'Promotion staged bytes changed');
    }
    for (const evidence of plan.evidence_snapshots) {
      const status = await this.evidence.status(evidence.ref.slice('evidence:'.length));
      if (status.snapshot_digest !== evidence.digest) throw new HarnessError('APPROVAL_STALE', 'Promotion Evidence changed');
    }
  }

  private async run(
    plan: MemoryPromotionPlanV2,
    approval: MemoryPromotionApprovalV2,
    initial: MemoryPromotionStatusV2
  ): Promise<MemoryPromotionReceiptV2> {
    let state = initial;
    await this.writeState(state);
    for (const name of ACTIONS) {
      const existing = state.steps.find((step) => step.name === name)!;
      if (COMPLETE.has(existing.status)) continue;
      state = {
        ...state, active_step: name,
        steps: state.steps.map((step) => step.name === name
          ? { ...step, status: 'started', error_code: null } : step),
        updated_at: this.now().toISOString()
      };
      await this.writeState(state);
      try {
        const result = await this.perform(name, plan);
        const status = result.runtime_status === 'already_exists' ? 'already_exists' : 'succeeded';
        const { record_refs: completedRecordRefs, ...stepResult } = result;
        state = {
          ...state, active_step: null,
          steps: state.steps.map((step) => step.name === name ? { ...step, ...stepResult, status } : step),
          record_refs: completedRecordRefs === undefined
            ? state.record_refs : [...new Set([...state.record_refs, ...completedRecordRefs])],
          updated_at: this.now().toISOString()
        };
        await this.writeState(state);
      } catch (error) {
        const uncertain = name === 'register_artifact' || name === 'commit_catalog';
        state = {
          ...state,
          phase: uncertain ? 'reconciliation_required' : 'partial',
          active_step: uncertain ? name : null,
          steps: state.steps.map((step) => step.name === name ? {
            ...step, status: uncertain ? 'uncertain' : 'failed',
            error_code: error instanceof HarnessError ? error.code : 'MEMORY_RUNTIME_FAILED'
          } : step),
          updated_at: this.now().toISOString()
        };
        await this.writeState(state);
        return this.receipt(plan, approval, state, uncertain ? 'reconciliation_required' : 'partial', name);
      }
    }
    state = { ...state, phase: 'complete', active_step: null, updated_at: this.now().toISOString() };
    await this.writeState(state);
    return this.receipt(plan, approval, state, 'complete', null);
  }

  private async perform(name: ResearchPromotionAction, plan: MemoryPromotionPlanV2): Promise<{
    artifact_ref: string | null;
    checksum: `sha256:${string}` | null;
    error_code: null;
    runtime_status: string | null;
    record_refs?: readonly string[];
  }> {
    if (name === 'validate_mapping') {
      const result = await this.runtime.validateMapping();
      return { artifact_ref: null, checksum: null, error_code: null, runtime_status: result.status };
    }
    if (name === 'verify_evidence') {
      for (const evidence of plan.evidence_snapshots) await this.evidence.status(evidence.ref.slice('evidence:'.length));
      return { artifact_ref: null, checksum: null, error_code: null, runtime_status: null };
    }
    if (name === 'copy_source') {
      const source = await this.store.resolveExistingArtifact(plan.source_artifact.relative_path);
      const result = await this.runtime.copySource({
        source: source.absolute_path,
        logical_path: `sources/originals/research-publishing/${plan.plan_id}.json`,
        source_type: 'research_promotion', metadata: {}
      });
      return this.checkedMutation(result, plan.source_artifact.digest);
    }
    if (name === 'write_semantic_records') return this.writeOperations(plan.immutable_record_operations);
    if (name === 'write_document_records') return this.writeOperations(plan.document_record_operations);
    if (name === 'register_artifact') {
      const result = await this.runtime.registerArtifact({
        ...plan.artifact_operation, plan_id: plan.plan_id, plan_digest: plan.plan_digest
      });
      return { artifact_ref: typeof result.path === 'string' ? result.path : null, checksum: digestValue(result.checksum), error_code: null, runtime_status: result.status };
    }
    if (name === 'append_log') {
      const result = await this.runtime.appendLog({
        ...plan.log_event, event_type: 'research_promotion', plan_id: plan.plan_id,
        plan_digest: plan.plan_digest, occurred_at: this.now().toISOString()
      });
      return { artifact_ref: typeof result.path === 'string' ? result.path : null, checksum: digestValue(result.checksum), error_code: null, runtime_status: result.status };
    }
    if (name === 'write_index_shards') return this.writeOperations(plan.index_shard_operations);
    if (name === 'recheck_base_catalog') {
      const current = await this.runtime.findCatalog(plan.track_id);
      const matches = plan.base_catalog_ref === null
        ? current.status === 'not_found' && plan.base_catalog_digest === NULL_CATALOG_DIGEST
        : current.status === 'found' && current.path === plan.base_catalog_ref && current.digest === plan.base_catalog_digest;
      if (!matches) throw new HarnessError('MEMORY_SOURCE_STALE', 'base Catalog changed while Promotion waited');
      return { artifact_ref: current.status === 'found' ? current.path : null, checksum: current.status === 'found' ? current.digest : null, error_code: null, runtime_status: current.status };
    }
    const committed = await this.writeOperations([plan.catalog_operation]);
    const projection = await this.store.readJson<{
      catalog: ResearchIndexCatalogV1; records: readonly ResearchIndexSourceRecordV1[];
    }>(`${this.root(plan.plan_id)}/projection.json`);
    await this.store.replaceAtomic(`memory/promotions/catalog-mirrors/${plan.track_id}/state.json`, {
      schema_version: 'promotion-catalog-mirror/v1',
      runtime_catalog_digest: plan.expected_final_catalog_digest,
      catalog: projection.catalog,
      records: projection.records
    } satisfies PromotionCatalogMirrorV1);
    return committed;
  }

  private async writeOperations(operations: readonly PromotionRecordOperationV2[]) {
    let allExisting = operations.length > 0;
    const refs: string[] = [];
    for (const operation of operations) {
      const content = await this.store.resolveExistingArtifact(operation.content_artifact.relative_path);
      const result = await this.runtime.writeRecord({
        record_type: operation.record_type, variables: operation.variables,
        refs: operation.refs, content_file: content.absolute_path
      });
      const checked = this.checkedMutation(result, operation.expected_digest);
      allExisting = allExisting && result.status === 'already_exists';
      if (checked.artifact_ref !== null) refs.push(checked.artifact_ref);
    }
    return {
      artifact_ref: null, checksum: null, error_code: null,
      runtime_status: allExisting ? 'already_exists' : 'ok', record_refs: refs
    };
  }

  private checkedMutation(result: RuntimeEnvelope, expected: `sha256:${string}`) {
    const checksum = digestValue(result.checksum);
    const path = typeof result.path === 'string' ? result.path : null;
    if (
      (result.status !== 'ok' && result.status !== 'already_exists') ||
      checksum !== expected || path === null
    ) {
      throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'Runtime mutation does not match Promotion Plan bytes');
    }
    return { artifact_ref: path, checksum, error_code: null, runtime_status: result.status };
  }

  private async receipt(
    plan: MemoryPromotionPlanV2,
    approval: MemoryPromotionApprovalV2,
    state: MemoryPromotionStatusV2,
    status: MemoryPromotionReceiptV2['status'],
    cursor: ResearchPromotionAction | null
  ): Promise<MemoryPromotionReceiptV2> {
    const receiptSeq = state.receipt_seq + 1;
    const body = {
      schema_version: 'memory-promotion-receipt/v2' as const,
      receipt_id: `${this.ids.receiptId?.() ?? `promotion_receipt_${randomUUID().replaceAll('-', '')}`}_${receiptSeq}`,
      plan_id: plan.plan_id,
      plan_digest: plan.plan_digest,
      approval_digest: approval.approval_digest,
      runtime_version: '0.2.0' as const,
      status,
      steps: state.steps,
      record_refs: state.record_refs,
      prior_catalog_digest: plan.base_catalog_digest,
      final_catalog_digest: status === 'complete' ? plan.expected_final_catalog_digest : null,
      reconciliation_required: status === 'reconciliation_required',
      resume_cursor: status === 'partial' ? cursor : null
    };
    const receipt = validateContract<MemoryPromotionReceiptV2>('memory-promotion-receipt-v2', {
      ...body, receipt_digest: sha256(body)
    });
    const path = `${this.root(plan.plan_id)}/receipts/${receipt.receipt_id}.json`;
    await this.store.writeNew(path, receipt);
    await this.writeState({ ...state, latest_receipt_path: path, receipt_seq: receiptSeq });
    return receipt;
  }

  private async writeState(state: MemoryPromotionStatusV2): Promise<void> {
    await this.store.replaceAtomic(`${this.root(state.plan_id)}/state.json`, state);
  }
}
