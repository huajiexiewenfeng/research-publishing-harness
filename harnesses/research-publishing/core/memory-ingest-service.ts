import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { RuntimeEnvelope } from '../adapters/llm-wiki/runtime-protocol.js';
import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import type { MemoryInsightReviewV1 } from './memory-insight-service.js';
import {
  renderCandidateInsightRecord,
  renderFeedbackRecord,
  renderMemoryIngestPreview,
  renderPublicationEvidenceRecord
} from './memory-renderer.js';
import { transitionMemoryIngestState } from './memory-state.js';
import type {
  CandidateInsightProposalV1,
  Digest,
  MemoryIngestApprovalV1,
  MemoryIngestPlanV1,
  MemoryIngestReceiptV1,
  MemoryIngestState,
  MemoryIngestStepName,
  PublicationFeedbackSnapshotV1
} from './memory-types.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const STEPS = [
  'validate_mapping', 'copy_source', 'write_records', 'register_artifact', 'append_log'
] as const satisfies readonly MemoryIngestStepName[];
const COMPLETE_STEP = new Set(['succeeded', 'already_exists']);

export interface MemoryIngestRuntime {
  version(): Promise<'0.2.0' | '0.3.0'>;
  validateMapping(): Promise<RuntimeEnvelope>;
  copySource(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
  writeRecord(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
  registerArtifact(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
  appendLog(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
}

export interface MemoryDomainAssets {
  readonly profile_path: string;
  readonly mapping_path: string;
  readonly scp_paths: readonly string[];
}

export interface MemoryIngestIds {
  readonly ingestId?: () => string;
  readonly approvalId?: () => string;
  readonly receiptId?: () => string;
  readonly now?: () => Date;
}

export interface PublicationCheckpointInput {
  readonly receipt_path: string;
  readonly receipt_digest: Digest;
  readonly research_track: string;
  readonly publication_id: string;
}

export interface FeedbackInsightInput extends PublicationCheckpointInput {
  readonly feedback_snapshot_path: string;
  readonly feedback_snapshot_file_digest: Digest;
  readonly proposal_ids: readonly string[];
  readonly feedback_id: string;
}

interface SourceBinding {
  readonly path: string;
  readonly digest: Digest;
}

interface MemoryIngestSourceBundle {
  readonly schema_version: 'memory-ingest-source/v1';
  readonly publication_receipt: SourceBinding & { readonly value: Record<string, unknown> };
  readonly feedback_snapshot: (SourceBinding & { readonly value: PublicationFeedbackSnapshotV1 }) | null;
  readonly proposals: ReadonlyArray<SourceBinding & {
    readonly value: CandidateInsightProposalV1;
    readonly review_path: string;
    readonly review_digest: Digest;
  }>;
}

interface IngestStepState {
  readonly name: MemoryIngestStepName;
  readonly status: 'pending' | 'succeeded' | 'already_exists' | 'failed';
  readonly artifact_ref: string | null;
  readonly checksum: Digest | null;
  readonly error_code: string | null;
}

export interface MemoryIngestExecutionStateV1 {
  readonly schema_version: 'memory-ingest-state/v1';
  readonly ingest_id: string;
  readonly plan_digest: Digest;
  readonly approval_digest: Digest | null;
  readonly state: MemoryIngestState;
  readonly active_step: MemoryIngestStepName | null;
  readonly steps: readonly IngestStepState[];
  readonly records: ReadonlyArray<{ readonly relative_path: string; readonly digest: Digest }>;
  readonly log_event_ref: string | null;
  readonly latest_receipt_path: string | null;
  readonly updated_at: string;
}

function unsigned<T extends object, K extends keyof T>(value: T, key: K): object {
  const copy = { ...value } as Record<PropertyKey, unknown>;
  Reflect.deleteProperty(copy, key);
  return copy;
}

function requireSlug(value: string, label: string): void {
  if (!SAFE_SLUG.test(value)) throw new HarnessError('CONTRACT_INVALID', `${label} must be a safe slug`);
}

function digestFromEnvelope(value: unknown): Digest | null {
  return typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value)
    ? value as Digest
    : null;
}

function pathFromEnvelope(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function approveMemoryIngest(
  plan: MemoryIngestPlanV1,
  approvedBy: string,
  ttlMs: number,
  now: Date = new Date(),
  id: () => string = () => `approval_${randomUUID().replaceAll('-', '')}`
): MemoryIngestApprovalV1 {
  validateContract<MemoryIngestPlanV1>('memory-ingest-plan', plan);
  if (sha256(unsigned(plan, 'plan_digest')) !== plan.plan_digest) {
    throw new HarnessError('CONTRACT_INVALID', 'Memory Ingest Plan digest does not match');
  }
  const approver = approvedBy.trim();
  if (approver.length === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0 || !Number.isFinite(now.getTime())) {
    throw new HarnessError('CONTRACT_INVALID', 'Memory Ingest approval requires approver, positive TTL, and valid time');
  }
  const body = {
    schema_version: 'memory-ingest-approval/v1' as const,
    approval_id: id(),
    ingest_plan_digest: plan.plan_digest,
    workspace_identity_digest: plan.workspace_identity_digest,
    target_domain: plan.target_domain,
    target_profile: plan.target_profile,
    approved_action: plan.action,
    approved_by: approver,
    approved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString()
  };
  return validateContract<MemoryIngestApprovalV1>('memory-ingest-approval', {
    ...body,
    approval_digest: sha256(body)
  });
}

export class MemoryIngestService {
  private readonly now: () => Date;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly runtime: MemoryIngestRuntime,
    private readonly assets: MemoryDomainAssets,
    private readonly ids: MemoryIngestIds = {}
  ) {
    this.now = ids.now ?? (() => new Date());
  }

  private root(ingestId: string): string {
    requireSlug(ingestId, 'ingest id');
    return `memory/ingests/${ingestId}`;
  }

  private async domainDigests(): Promise<{
    profile_digest: Digest;
    mapping_digest: Digest;
    scp_digest: Digest;
  }> {
    const [profile, mapping, ...scps] = await Promise.all([
      readFile(this.assets.profile_path),
      readFile(this.assets.mapping_path),
      ...this.assets.scp_paths.map((path) => readFile(path))
    ]);
    if (scps.length === 0) throw new HarnessError('CONTRACT_INVALID', 'Memory Domain requires at least one SCP');
    return {
      profile_digest: sha256Bytes(profile),
      mapping_digest: sha256Bytes(mapping),
      scp_digest: sha256(scps.map((value) => sha256Bytes(value)))
    };
  }

  private workspaceDigest(): Digest {
    return sha256({ publishing_workspace: this.store.root });
  }

  private async loadBoundJson<T>(path: string, expected: Digest): Promise<{
    value: T;
    raw_digest: Digest;
  }> {
    const artifact = await this.store.resolveExistingArtifact(path);
    if (artifact.digest !== expected) {
      throw new HarnessError('MEMORY_SOURCE_STALE', `source artifact changed: ${path}`);
    }
    const bytes = await this.store.readBytes(path);
    if (sha256Bytes(bytes) !== expected) {
      throw new HarnessError('MEMORY_SOURCE_STALE', `source artifact changed during read: ${path}`);
    }
    try {
      return { value: JSON.parse(bytes.toString('utf8')) as T, raw_digest: expected };
    } catch {
      throw new HarnessError('CONTRACT_INVALID', `source artifact is not valid JSON: ${path}`);
    }
  }

  private async publication(input: PublicationCheckpointInput): Promise<Record<string, unknown>> {
    requireSlug(input.research_track, 'research track');
    requireSlug(input.publication_id, 'publication id');
    const loaded = await this.loadBoundJson<Record<string, unknown>>(input.receipt_path, input.receipt_digest);
    if (
      loaded.value === null || typeof loaded.value !== 'object' || Array.isArray(loaded.value) ||
      typeof loaded.value.receipt_id !== 'string' || typeof loaded.value.status !== 'string'
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'Publication Receipt identity is incomplete');
    }
    return loaded.value;
  }

  private async writeStaging(
    ingestId: string,
    bundle: MemoryIngestSourceBundle,
    records: ReadonlyArray<{
      operation_id: string;
      record_type: MemoryIngestPlanV1['record_operations'][number]['record_type'];
      variables: Readonly<Record<string, string>>;
      refs: Readonly<Record<string, string>>;
      content: string;
    }>
  ): Promise<{
    source_artifact: { relative_path: string; digest: Digest };
    operations: MemoryIngestPlanV1['record_operations'];
    previews: readonly string[];
  }> {
    const sourcePath = `${this.root(ingestId)}/staging/source.json`;
    const source = await this.store.writeNewBytes(
      sourcePath,
      Buffer.from(`${JSON.stringify(bundle, null, 2)}\n`, 'utf8')
    );
    const operations: Array<MemoryIngestPlanV1['record_operations'][number]> = [];
    for (const record of records) {
      const path = `${this.root(ingestId)}/staging/${record.operation_id}.md`;
      const artifact = await this.store.writeNewBytes(path, Buffer.from(record.content, 'utf8'));
      operations.push({
        operation_id: record.operation_id,
        record_type: record.record_type,
        variables: record.variables,
        refs: record.refs,
        content_artifact: { relative_path: artifact.relative_path, digest: artifact.digest }
      });
    }
    return {
      source_artifact: { relative_path: source.relative_path, digest: source.digest },
      operations,
      previews: records.map((record) => record.content)
    };
  }

  private async finalizePlan(
    input: PublicationCheckpointInput,
    ingestId: string,
    kind: MemoryIngestPlanV1['ingest_kind'],
    staging: Awaited<ReturnType<MemoryIngestService['writeStaging']>>,
    sourceFeedbackDigest: Digest | null,
    insightDigests: readonly Digest[],
    artifactOperation: MemoryIngestPlanV1['artifact_operation']
  ): Promise<MemoryIngestPlanV1> {
    const domain = await this.domainDigests();
    // Runtime 0.2.0 derives source_id deterministically from the copied bytes.
    // Freeze that exact ref into the Plan so approval covers the refs used by write-record.
    const runtimeSourceId = `src-${staging.source_artifact.digest.slice('sha256:'.length, 'sha256:'.length + 12)}`;
    const recordOperations = staging.operations.map((operation) => ({
      ...operation,
      refs: { ...operation.refs, source_id: runtimeSourceId }
    }));
    const body = {
      schema_version: 'memory-ingest-plan/v1' as const,
      ingest_id: ingestId,
      ingest_kind: kind,
      research_track: input.research_track,
      source_publication_receipt_digest: input.receipt_digest,
      source_feedback_snapshot_digest: sourceFeedbackDigest,
      candidate_insight_digests: insightDigests,
      target_domain: 'research-publishing' as const,
      target_profile: 'research-publishing' as const,
      workspace_identity_digest: this.workspaceDigest(),
      runtime_version: await this.runtime.version(),
      record_operations: recordOperations,
      source_artifact: staging.source_artifact,
      artifact_operation: artifactOperation,
      log_event: { log_type: 'memory_event' as const, event_id: `memory-ingest:${ingestId}` },
      ...domain,
      action: 'ingest_confirmed' as const
    };
    const plan = validateContract<MemoryIngestPlanV1>('memory-ingest-plan', {
      ...body,
      plan_digest: sha256(body)
    });
    await this.store.writeNew(`${this.root(ingestId)}/plan.json`, plan);
    await this.store.writeNew(`${this.root(ingestId)}/preview.md`, renderMemoryIngestPreview(plan, staging.previews));
    await this.store.replaceAtomic(`${this.root(ingestId)}/state.json`, this.initialState(plan));
    return plan;
  }

  async planPublicationCheckpoint(input: PublicationCheckpointInput): Promise<MemoryIngestPlanV1> {
    const receipt = await this.publication(input);
    await this.runtime.validateMapping();
    const ingestId = this.ids.ingestId?.() ?? `ingest_${randomUUID().replaceAll('-', '')}`;
    requireSlug(ingestId, 'ingest id');
    const content = renderPublicationEvidenceRecord(receipt);
    const bundle: MemoryIngestSourceBundle = {
      schema_version: 'memory-ingest-source/v1',
      publication_receipt: { path: input.receipt_path, digest: input.receipt_digest, value: receipt },
      feedback_snapshot: null,
      proposals: []
    };
    const staging = await this.writeStaging(ingestId, bundle, [{
      operation_id: 'record_publication_evidence',
      record_type: 'publication_evidence',
      variables: { research_track: input.research_track, publication_id: input.publication_id },
      refs: { source_id: `source_${input.publication_id}` },
      content
    }]);
    return this.finalizePlan(
      input, ingestId, 'publication_checkpoint', staging, null, [],
      { artifact_type: 'publication_receipt', artifact_id: input.publication_id }
    );
  }

  async planFeedbackInsight(input: FeedbackInsightInput): Promise<MemoryIngestPlanV1> {
    const receipt = await this.publication(input);
    requireSlug(input.feedback_id, 'feedback id');
    if (input.proposal_ids.length === 0) {
      throw new HarnessError('CONTRACT_INVALID', 'feedback insight ingest requires accepted proposals');
    }
    const feedbackLoaded = await this.loadBoundJson<PublicationFeedbackSnapshotV1>(
      input.feedback_snapshot_path,
      input.feedback_snapshot_file_digest
    );
    const feedback = validateContract<PublicationFeedbackSnapshotV1>(
      'publication-feedback-snapshot', feedbackLoaded.value
    );
    if (sha256(unsigned(feedback, 'snapshot_digest')) !== feedback.snapshot_digest) {
      throw new HarnessError('MEMORY_SOURCE_STALE', 'Feedback Snapshot self-digest no longer matches');
    }
    const proposals: Array<SourceBinding & {
      value: CandidateInsightProposalV1;
      review_path: string;
      review_digest: Digest;
    }> = [];
    for (const proposalId of input.proposal_ids) {
      requireSlug(proposalId, 'proposal id');
      const proposalPath = `memory/insights/${proposalId}/proposal.json`;
      const proposalArtifact = await this.store.resolveExistingArtifact(proposalPath);
      const loadedProposal = await this.loadBoundJson<CandidateInsightProposalV1>(proposalPath, proposalArtifact.digest);
      const proposal = validateContract<CandidateInsightProposalV1>('candidate-insight-proposal', loadedProposal.value);
      if (sha256(unsigned(proposal, 'proposal_digest')) !== proposal.proposal_digest) {
        throw new HarnessError('MEMORY_SOURCE_STALE', 'Candidate Insight self-digest no longer matches');
      }
      const reviewPath = `memory/insights/${proposalId}/review.json`;
      const reviewArtifact = await this.store.resolveExistingArtifact(reviewPath);
      const loadedReview = await this.loadBoundJson<MemoryInsightReviewV1>(reviewPath, reviewArtifact.digest);
      const review = loadedReview.value;
      if (
        sha256(unsigned(review, 'review_digest')) !== review.review_digest ||
        review.proposal_digest !== proposal.proposal_digest || !review.accepted
      ) {
        throw new HarnessError('CONTRACT_INVALID', 'only accepted Candidate Insights may enter Ingest Plan');
      }
      proposals.push({
        path: proposalPath, digest: proposalArtifact.digest, value: proposal,
        review_path: reviewPath, review_digest: reviewArtifact.digest
      });
    }
    await this.runtime.validateMapping();
    const ingestId = this.ids.ingestId?.() ?? `ingest_${randomUUID().replaceAll('-', '')}`;
    const records = [
      {
        operation_id: 'record_feedback_snapshot', record_type: 'feedback_snapshot' as const,
        variables: { research_track: input.research_track, feedback_id: input.feedback_id },
        refs: { source_id: `source_${input.feedback_id}`, publication_id: input.publication_id },
        content: renderFeedbackRecord(feedback)
      },
      ...proposals.map((proposal) => ({
        operation_id: `record_${proposal.value.proposal_id}`,
        record_type: 'candidate_insight' as const,
        variables: { research_track: input.research_track, insight_id: proposal.value.proposal_id },
        refs: { source_id: `source_${input.feedback_id}`, feedback_id: input.feedback_id },
        content: renderCandidateInsightRecord(proposal.value)
      }))
    ];
    const bundle: MemoryIngestSourceBundle = {
      schema_version: 'memory-ingest-source/v1',
      publication_receipt: { path: input.receipt_path, digest: input.receipt_digest, value: receipt },
      feedback_snapshot: {
        path: input.feedback_snapshot_path,
        digest: input.feedback_snapshot_file_digest,
        value: feedback
      },
      proposals
    };
    const staging = await this.writeStaging(ingestId, bundle, records);
    return this.finalizePlan(
      input, ingestId, 'feedback_insight', staging, feedback.snapshot_digest,
      proposals.map((proposal) => proposal.value.proposal_digest),
      { artifact_type: 'memory_ingest_receipt', artifact_id: ingestId }
    );
  }

  private initialState(plan: MemoryIngestPlanV1): MemoryIngestExecutionStateV1 {
    return {
      schema_version: 'memory-ingest-state/v1', ingest_id: plan.ingest_id,
      plan_digest: plan.plan_digest, approval_digest: null,
      state: 'ingest_previewed', active_step: null,
      steps: STEPS.map((name) => ({ name, status: 'pending', artifact_ref: null, checksum: null, error_code: null })),
      records: [], log_event_ref: null, latest_receipt_path: null,
      updated_at: this.now().toISOString()
    };
  }

  async approve(ingestId: string, approvedBy: string, ttlMs: number): Promise<MemoryIngestApprovalV1> {
    const plan = await this.plan(ingestId);
    const approval = approveMemoryIngest(
      plan, approvedBy, ttlMs, this.now(),
      this.ids.approvalId ?? (() => `approval_${randomUUID().replaceAll('-', '')}`)
    );
    await this.store.writeNew(`${this.root(ingestId)}/approval.json`, approval);
    const state = await this.status(ingestId);
    await this.writeState({
      ...state,
      state: transitionMemoryIngestState(state.state, 'ingest_approved'),
      approval_digest: approval.approval_digest,
      updated_at: this.now().toISOString()
    });
    return approval;
  }

  private async plan(ingestId: string): Promise<MemoryIngestPlanV1> {
    const plan = validateContract<MemoryIngestPlanV1>(
      'memory-ingest-plan',
      await this.store.readJson(`${this.root(ingestId)}/plan.json`)
    );
    if (sha256(unsigned(plan, 'plan_digest')) !== plan.plan_digest) {
      throw new HarnessError('APPROVAL_STALE', 'Memory Ingest Plan digest no longer matches');
    }
    return plan;
  }

  private async writeState(state: MemoryIngestExecutionStateV1): Promise<void> {
    await this.store.replaceAtomic(`${this.root(state.ingest_id)}/state.json`, state);
  }

  async status(ingestId: string): Promise<MemoryIngestExecutionStateV1> {
    return this.store.readJson<MemoryIngestExecutionStateV1>(`${this.root(ingestId)}/state.json`);
  }

  private async assertApproval(
    plan: MemoryIngestPlanV1,
    approval: MemoryIngestApprovalV1
  ): Promise<void> {
    let valid: MemoryIngestApprovalV1;
    try {
      valid = validateContract<MemoryIngestApprovalV1>('memory-ingest-approval', approval);
    } catch {
      throw new HarnessError('APPROVAL_STALE', 'Memory Ingest Approval contract is invalid');
    }
    const stored = await this.store.readJson<MemoryIngestApprovalV1>(`${this.root(plan.ingest_id)}/approval.json`);
    const now = this.now().getTime();
    if (
      sha256(unsigned(valid, 'approval_digest')) !== valid.approval_digest ||
      sha256(stored) !== sha256(valid) ||
      valid.ingest_plan_digest !== plan.plan_digest ||
      valid.workspace_identity_digest !== plan.workspace_identity_digest ||
      valid.target_domain !== plan.target_domain || valid.target_profile !== plan.target_profile ||
      valid.approved_action !== plan.action || Date.parse(valid.expires_at) <= now
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Memory Ingest Approval no longer matches the exact Plan');
    }
  }

  private async preflight(plan: MemoryIngestPlanV1, approval: MemoryIngestApprovalV1): Promise<MemoryIngestSourceBundle> {
    await this.assertApproval(plan, approval);
    if (this.workspaceDigest() !== plan.workspace_identity_digest) {
      throw new HarnessError('APPROVAL_STALE', 'publishing Workspace identity changed');
    }
    const domain = await this.domainDigests();
    if (
      domain.profile_digest !== plan.profile_digest ||
      domain.mapping_digest !== plan.mapping_digest ||
      domain.scp_digest !== plan.scp_digest
    ) {
      throw new HarnessError('APPROVAL_STALE', 'Memory Domain assets changed after approval');
    }
    if (await this.runtime.version() !== plan.runtime_version) {
      throw new HarnessError('APPROVAL_STALE', 'Runtime version changed after approval');
    }
    const source = await this.store.resolveExistingArtifact(plan.source_artifact.relative_path);
    if (source.digest !== plan.source_artifact.digest) {
      throw new HarnessError('APPROVAL_STALE', 'staging source changed after approval');
    }
    for (const operation of plan.record_operations) {
      const content = await this.store.resolveExistingArtifact(operation.content_artifact.relative_path);
      if (content.digest !== operation.content_artifact.digest) {
        throw new HarnessError('APPROVAL_STALE', 'staging record changed after approval');
      }
    }
    const bundle = await this.store.readJson<MemoryIngestSourceBundle>(plan.source_artifact.relative_path);
    const sourceBindings: SourceBinding[] = [
      bundle.publication_receipt,
      ...(bundle.feedback_snapshot === null ? [] : [bundle.feedback_snapshot]),
      ...bundle.proposals.flatMap((proposal) => [
        { path: proposal.path, digest: proposal.digest },
        { path: proposal.review_path, digest: proposal.review_digest }
      ])
    ];
    for (const binding of sourceBindings) {
      const artifact = await this.store.resolveExistingArtifact(binding.path);
      if (artifact.digest !== binding.digest) {
        throw new HarnessError('MEMORY_SOURCE_STALE', `source changed after Plan: ${binding.path}`);
      }
    }
    return bundle;
  }

  async execute(
    ingestId: string,
    approval: MemoryIngestApprovalV1
  ): Promise<MemoryIngestReceiptV1> {
    return this.store.withLock(`${this.root(ingestId)}/execution.lock`, async () => {
      const plan = await this.plan(ingestId);
      const state = await this.status(ingestId);
      if (state.state !== 'ingest_approved') {
        throw new HarnessError('STATE_TRANSITION_INVALID', 'Memory Ingest is not approved for execution');
      }
      try {
        await this.preflight(plan, approval);
      } catch (error) {
        if (error instanceof HarnessError && error.code === 'APPROVAL_STALE') {
          await this.writeState({
            ...state,
            state: transitionMemoryIngestState(state.state, 'approval_stale'),
            updated_at: this.now().toISOString()
          });
        }
        throw error;
      }
      return this.runSteps(plan, approval, state);
    });
  }

  async resume(
    ingestId: string,
    approval: MemoryIngestApprovalV1
  ): Promise<MemoryIngestReceiptV1> {
    return this.store.withLock(`${this.root(ingestId)}/execution.lock`, async () => {
      const plan = await this.plan(ingestId);
      await this.preflight(plan, approval);
      let state = await this.status(ingestId);
      if (state.active_step === 'register_artifact') {
        throw new HarnessError(
          'MEMORY_INGEST_RECONCILIATION_REQUIRED',
          'register-artifact outcome is uncertain; inspect the Runtime artifact index before continuing'
        );
      }
      if (state.state !== 'partial_failure') {
        const interrupted = new Set<MemoryIngestState>([
          'ingest_approved', 'source_copied', 'records_written',
          'artifacts_registered', 'log_appended'
        ]);
        if (!interrupted.has(state.state) || (state.state === 'ingest_approved' && state.active_step === null)) {
          throw new HarnessError(
            'STATE_TRANSITION_INVALID',
            'only partial or interrupted Memory Ingest may resume'
          );
        }
        state = {
          ...state,
          state: transitionMemoryIngestState(state.state, 'partial_failure'),
          updated_at: this.now().toISOString()
        };
        await this.writeState(state);
      }
      const resumed = {
        ...state,
        state: transitionMemoryIngestState(state.state, 'ingest_approved'),
        active_step: null,
        updated_at: this.now().toISOString()
      };
      await this.writeState(resumed);
      return this.runSteps(plan, approval, resumed);
    });
  }

  private async runSteps(
    plan: MemoryIngestPlanV1,
    approval: MemoryIngestApprovalV1,
    initial: MemoryIngestExecutionStateV1
  ): Promise<MemoryIngestReceiptV1> {
    let state = initial;
    const advance = (step: MemoryIngestStepName, current: MemoryIngestState): MemoryIngestState => {
      if (step === 'copy_source') return transitionMemoryIngestState(current, 'source_copied');
      if (step === 'write_records') return transitionMemoryIngestState(current, 'records_written');
      if (step === 'register_artifact') return transitionMemoryIngestState(current, 'artifacts_registered');
      if (step === 'append_log') return transitionMemoryIngestState(current, 'log_appended');
      return current;
    };
    const run = async (
      name: MemoryIngestStepName,
      action: () => Promise<{ status: 'succeeded' | 'already_exists'; artifact_ref: string | null; checksum: Digest | null; records?: MemoryIngestExecutionStateV1['records']; log_event_ref?: string | null }>
    ): Promise<MemoryIngestReceiptV1 | null> => {
      const index = state.steps.findIndex((step) => step.name === name);
      const existing = state.steps[index]!;
      if (COMPLETE_STEP.has(existing.status)) {
        state = { ...state, state: advance(name, state.state), updated_at: this.now().toISOString() };
        await this.writeState(state);
        return null;
      }
      const pending = state.steps.map((step, stepIndex) => stepIndex === index
        ? { ...step, status: 'pending' as const, error_code: null }
        : step);
      state = { ...state, active_step: name, steps: pending, updated_at: this.now().toISOString() };
      await this.writeState(state);
      try {
        const result = await action();
        const {
          records: completedRecords,
          log_event_ref: completedLogEventRef,
          ...stepResult
        } = result;
        const completed = state.steps.map((step, stepIndex) => stepIndex === index
          ? { ...step, ...stepResult }
          : step);
        state = {
          ...state,
          state: advance(name, state.state),
          active_step: null,
          steps: completed,
          records: completedRecords ?? state.records,
          log_event_ref: completedLogEventRef ?? state.log_event_ref,
          updated_at: this.now().toISOString()
        };
        await this.writeState(state);
        return null;
      } catch (error) {
        const code = error instanceof HarnessError ? error.code : 'MEMORY_RUNTIME_FAILED';
        const failed = state.steps.map((step, stepIndex) => stepIndex === index
          ? { ...step, status: 'failed' as const, error_code: code }
          : step);
        state = {
          ...state,
          state: transitionMemoryIngestState(state.state, 'partial_failure'),
          active_step: null,
          steps: failed,
          updated_at: this.now().toISOString()
        };
        await this.writeState(state);
        return this.receipt(plan, approval, state, 'partial', name);
      }
    };

    let partial = await run('validate_mapping', async () => {
      const result = await this.runtime.validateMapping();
      return { status: result.status === 'already_exists' ? 'already_exists' : 'succeeded', artifact_ref: null, checksum: null };
    });
    if (partial !== null) return partial;

    partial = await run('copy_source', async () => {
      const source = await this.store.resolveExistingArtifact(plan.source_artifact.relative_path);
      const result = await this.runtime.copySource({
        source: source.absolute_path,
        logical_path: `sources/originals/research-publishing/${plan.ingest_id}.json`,
        source_type: plan.ingest_kind,
        // Runtime 0.2.0 reserves metadata for confirmed excerpt provenance.
        // The complete ingest provenance is already frozen in this source bundle.
        metadata: {}
      });
      return {
        status: result.status === 'already_exists' ? 'already_exists' : 'succeeded',
        artifact_ref: pathFromEnvelope(result.path), checksum: digestFromEnvelope(result.checksum)
      };
    });
    if (partial !== null) return partial;

    partial = await run('write_records', async () => {
      const records: Array<{ relative_path: string; digest: Digest }> = [];
      let allAlreadyExists = true;
      for (const operation of plan.record_operations) {
        const content = await this.store.resolveExistingArtifact(operation.content_artifact.relative_path);
        const result = await this.runtime.writeRecord({
          record_type: operation.record_type,
          variables: operation.variables,
          refs: operation.refs,
          content_file: content.absolute_path
        });
        allAlreadyExists = allAlreadyExists && result.status === 'already_exists';
        const path = pathFromEnvelope(result.path);
        const digest = digestFromEnvelope(result.checksum);
        if (path === null || digest === null) {
          throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'Runtime record result lacks path or checksum');
        }
        records.push({ relative_path: path, digest });
      }
      return {
        status: allAlreadyExists ? 'already_exists' : 'succeeded',
        artifact_ref: null, checksum: null, records
      };
    });
    if (partial !== null) return partial;

    partial = await run('register_artifact', async () => {
      const result = await this.runtime.registerArtifact({
        artifact_id: plan.artifact_operation.artifact_id,
        artifact_type: plan.artifact_operation.artifact_type,
        ingest_id: plan.ingest_id,
        plan_digest: plan.plan_digest
      });
      return {
        status: result.status === 'already_exists' ? 'already_exists' : 'succeeded',
        artifact_ref: pathFromEnvelope(result.path), checksum: digestFromEnvelope(result.checksum)
      };
    });
    if (partial !== null) return partial;

    partial = await run('append_log', async () => {
      const result = await this.runtime.appendLog({
        event_id: plan.log_event.event_id,
        event_type: 'memory_ingest', ingest_id: plan.ingest_id,
        ingest_kind: plan.ingest_kind, plan_digest: plan.plan_digest,
        occurred_at: this.now().toISOString()
      });
      return {
        status: result.status === 'already_exists' ? 'already_exists' : 'succeeded',
        artifact_ref: pathFromEnvelope(result.path), checksum: digestFromEnvelope(result.checksum),
        log_event_ref: pathFromEnvelope(result.path)
      };
    });
    if (partial !== null) return partial;

    state = {
      ...state,
      state: transitionMemoryIngestState(state.state, 'finalized'),
      updated_at: this.now().toISOString()
    };
    await this.writeState(state);
    const allAlreadyExists = state.steps
      .filter((step) => step.name !== 'validate_mapping')
      .every((step) => step.status === 'already_exists');
    return this.receipt(plan, approval, state, allAlreadyExists ? 'already_exists' : 'succeeded', null);
  }

  private async receipt(
    plan: MemoryIngestPlanV1,
    approval: MemoryIngestApprovalV1,
    state: MemoryIngestExecutionStateV1,
    status: MemoryIngestReceiptV1['status'],
    resumeCursor: MemoryIngestStepName | null
  ): Promise<MemoryIngestReceiptV1> {
    const body = {
      schema_version: 'memory-ingest-receipt/v1' as const,
      receipt_id: this.ids.receiptId?.() ?? `memory_receipt_${randomUUID().replaceAll('-', '')}`,
      ingest_plan_digest: plan.plan_digest,
      approval_digest: approval.approval_digest,
      runtime_version: plan.runtime_version,
      status,
      steps: state.steps,
      records: state.records,
      log_event_ref: state.log_event_ref,
      resume_cursor: resumeCursor
    };
    const receipt = validateContract<MemoryIngestReceiptV1>('memory-ingest-receipt', {
      ...body,
      receipt_digest: sha256(body)
    });
    const path = `receipts/memory/${receipt.receipt_id}.json`;
    await this.store.writeNew(path, receipt);
    await this.writeState({
      ...state,
      latest_receipt_path: path,
      updated_at: this.now().toISOString()
    });
    return receipt;
  }
}
