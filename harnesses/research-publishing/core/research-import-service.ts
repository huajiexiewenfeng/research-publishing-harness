import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import type { ResearchIndexSourceRecordV1 } from './research-index-types.js';
import { createResearchLifecycleEvent } from './research-lifecycle.js';
import {
  createClaimVersion,
  createPublicationExpression
} from './research-memory-contracts.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import { ResearchIncrementService } from './research-increment-service.js';
import type {
  ClaimVersionV1,
  OpenQuestionVersionV1,
  PublicationExpressionV1,
  ResearchEvidenceSnapshotV1,
  ResearchIncrementRevisionV1,
  ResearchLifecycleEventV1,
  ResearchRuntimeRecordType,
  SemanticMemoryDeltaV1,
  SemanticMemoryOperationV1
} from './research-memory-types.js';
import { SemanticDeltaService } from './semantic-delta-service.js';
import { validateContract } from './schema-validator.js';
import type { ClaimStatus } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';

export interface ResearchImportManifestV1 {
  readonly schema_version: 'research-import-manifest/v1';
  readonly import_id: string;
  readonly import_scope: 'single_increment';
  readonly workspace_identity_digest: `sha256:${string}`;
  readonly track_id: string;
  readonly increment: Readonly<{
    increment_id: string; revision: 1; title: string; research_question: string; thesis: string;
    summary: string; tags: readonly string[]; claim_refs: readonly string[];
    boundary_refs: readonly string[]; open_question_refs: readonly string[]; source_refs: readonly string[];
  }>;
  readonly mother_article: Readonly<{
    path: string; digest: `sha256:${string}`; source_classification: 'local_verified';
  }>;
  readonly gist: Readonly<{
    url: string; source_classification: 'user_asserted' | 'public_verified';
  }>;
  readonly thread: Readonly<{
    root_url: string;
    published_at: string;
    source_classification: 'user_asserted' | 'public_verified';
    receipt: Readonly<{ path: string; digest: `sha256:${string}` }>;
    items: ReadonlyArray<{
      ordinal: number; text: string; content_digest: `sha256:${string}`;
      platform_id: string | null; public_url: string | null;
      metrics: Readonly<Record<string, number>> | null;
      source_classification: 'receipt_backed' | 'user_asserted';
    }>;
  }>;
  readonly claims: ReadonlyArray<{
    claim_id: string; version: number; statement: string; claim_status: ClaimStatus;
    evidence_refs: readonly string[]; boundary_refs: readonly string[]; summary: string;
  }>;
  readonly boundaries: Readonly<{
    established: readonly string[]; not_established: readonly string[]; planned_work: readonly string[];
  }>;
  readonly explicit_assertions: ReadonlyArray<{
    field: string; value: string; source_classification: 'user_asserted';
  }>;
  readonly imported_at: string;
  readonly manifest_digest: `sha256:${string}`;
}

export interface ResearchImportGapReportV1 {
  readonly schema_version: 'research-import-gap-report/v1';
  readonly import_id: string;
  readonly manifest_digest: `sha256:${string}`;
  readonly item_order: readonly number[];
  readonly unrecoverable_gaps: ReadonlyArray<{ readonly field: string; readonly reason: string }>;
  readonly blocking_gaps: ReadonlyArray<{ readonly field: string; readonly reason: string }>;
  readonly source_summary: Readonly<{
    local_verified: number; receipt_backed: number; user_asserted: number; public_verified: number;
  }>;
  readonly report_digest: `sha256:${string}`;
}

export interface ResearchImportServiceOptions {
  readonly deltaId?: () => string;
  readonly lifecycleEventId?: () => string;
  readonly now?: () => Date;
  readonly baseCatalogDigest?: () => Promise<`sha256:${string}`>;
}

interface PromotionTarget extends Readonly<Record<string, unknown>> {
  readonly semantic_record: unknown;
  readonly frontmatter: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  readonly body: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly refs: Readonly<Record<string, string>>;
  readonly index_entry: ResearchIndexSourceRecordV1;
}

const SAFE_PATH = /^(?:articles|packages|receipts|memory)\/[a-zA-Z0-9._\/-]+$/;

function unsigned<T extends object>(value: T, key: keyof T): object {
  const copy = { ...value } as Record<string, unknown>;
  Reflect.deleteProperty(copy, key as string);
  return copy;
}

function https(value: string, label: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new HarnessError('CONTRACT_INVALID', `${label} must be a valid URL`); }
  if (url.protocol !== 'https:') throw new HarnessError('CONTRACT_INVALID', `${label} must use HTTPS`);
}

export class ResearchImportService {
  private readonly now: () => Date;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly options: ResearchImportServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async inspect(input: ResearchImportManifestV1): Promise<ResearchImportGapReportV1> {
    this.assertStructuralSafety(input);
    const manifest = validateContract<ResearchImportManifestV1>('research-import-manifest', input);
    if (sha256(unsigned(manifest, 'manifest_digest')) !== manifest.manifest_digest) {
      throw new HarnessError('APPROVAL_STALE', 'Import Manifest digest no longer matches its fields');
    }
    const unrecoverable = [];
    for (const [index, item] of manifest.thread.items.entries()) {
      if (item.platform_id === null) unrecoverable.push({
        field: `thread.items[${index}].platform_id`, reason: 'Platform ID was not preserved in supplied evidence.'
      });
      if (item.public_url === null) unrecoverable.push({
        field: `thread.items[${index}].public_url`, reason: 'Per-item public URL was not preserved in supplied evidence.'
      });
      if (item.metrics === null) unrecoverable.push({
        field: `thread.items[${index}].metrics`, reason: 'Historical engagement metrics are unavailable and are not technical evidence.'
      });
    }
    const body = {
      schema_version: 'research-import-gap-report/v1' as const,
      import_id: manifest.import_id,
      manifest_digest: manifest.manifest_digest,
      item_order: manifest.thread.items.map((item) => item.ordinal),
      unrecoverable_gaps: unrecoverable,
      blocking_gaps: [],
      source_summary: {
        local_verified: 1,
        receipt_backed: manifest.thread.items.filter((item) => item.source_classification === 'receipt_backed').length,
        user_asserted: manifest.explicit_assertions.length +
          manifest.thread.items.filter((item) => item.source_classification === 'user_asserted').length +
          (manifest.gist.source_classification === 'user_asserted' ? 1 : 0),
        public_verified: (manifest.thread.source_classification === 'public_verified' ? 1 : 0) +
          (manifest.gist.source_classification === 'public_verified' ? 1 : 0)
      }
    };
    return validateContract<ResearchImportGapReportV1>('research-import-gap-report', {
      ...body, report_digest: sha256(body)
    });
  }

  async capture(input: ResearchImportManifestV1): Promise<ResearchEvidenceSnapshotV1> {
    const report = await this.inspect(input);
    await this.verifyArtifact(input.mother_article.path, input.mother_article.digest, 'mother article');
    await this.verifyArtifact(input.thread.receipt.path, input.thread.receipt.digest, 'publication Receipt');
    const root = this.root(input.import_id);
    const manifestPath = `${root}/manifest.json`;
    if (!(await this.store.exists(manifestPath))) {
      await this.store.writeNewDirectory(root, { 'manifest.json': input, 'gap-report.json': report });
    } else {
      const existing = await this.store.readJson<ResearchImportManifestV1>(manifestPath);
      if (existing.manifest_digest !== input.manifest_digest || sha256(existing) !== sha256(input)) {
        throw new HarnessError('APPROVAL_STALE', 'Import id is bound to a different Manifest');
      }
    }
    const snapshotId = `evidence_${input.import_id}`;
    const snapshotPath = `memory/evidence/snapshots/${snapshotId}/manifest.json`;
    const evidence = new ResearchEvidenceService(this.store, {
      evidenceSnapshotId: () => snapshotId,
      now: () => new Date(input.imported_at)
    });
    if (await this.store.exists(snapshotPath)) {
      await evidence.status(snapshotId);
      return this.store.readJson<ResearchEvidenceSnapshotV1>(snapshotPath);
    }
    return evidence.capture({
      increment_id: input.increment.increment_id,
      increment_revision: input.increment.revision,
      capture_event: 'research_increment_imported',
      capture_kind: 'explicit_import',
      workspace_identity_digest: input.workspace_identity_digest,
      artifacts: [
        { workspace_relative_path: manifestPath, role: 'research_package', media_type: 'application/json', canonical: true, privacy_classification: 'internal' },
        { workspace_relative_path: input.mother_article.path, role: 'canonical_article', media_type: 'text/markdown', canonical: true, privacy_classification: 'internal' },
        { workspace_relative_path: input.thread.receipt.path, role: 'publication_receipt', media_type: 'application/json', canonical: true, privacy_classification: 'internal' }
      ],
      source_refs: [input.gist.url, input.thread.root_url, ...input.increment.source_refs],
      privacy_classification: 'internal'
    });
  }

  async propose(
    input: ResearchImportManifestV1,
    snapshotId: string
  ): Promise<SemanticMemoryDeltaV1> {
    await this.inspect(input);
    const snapshot = await this.store.readJson<ResearchEvidenceSnapshotV1>(
      `memory/evidence/snapshots/${snapshotId}/manifest.json`
    );
    if (snapshot.capture_event !== 'research_increment_imported' ||
      snapshot.increment_id !== input.increment.increment_id ||
      snapshot.increment_revision !== input.increment.revision) {
      throw new HarnessError('CONTRACT_INVALID', 'Import Evidence does not bind this Manifest Increment');
    }
    const evidenceRef = `evidence:${snapshotId}`;
    const increments = new ResearchIncrementService(this.store, {
      lifecycleEventId: () => `event_${input.import_id}_working`,
      now: () => new Date(input.imported_at)
    });
    const revisionPath = `memory/increments/${input.increment.increment_id}/revisions/1/revision.json`;
    const revision = await this.store.exists(revisionPath)
      ? await this.store.readJson<ResearchIncrementRevisionV1>(revisionPath)
      : await increments.assemble({
          increment_id: input.increment.increment_id,
          revision: 1,
          track_id: input.track_id,
          title: input.increment.title,
          research_question: input.increment.research_question,
          thesis: input.increment.thesis,
          summary: input.increment.summary,
          document_manifest_refs: [], tags: input.increment.tags,
          claim_refs: input.increment.claim_refs, decision_refs: [],
          boundary_refs: input.increment.boundary_refs,
          open_question_refs: input.increment.open_question_refs,
          source_refs: input.increment.source_refs,
          evidence_snapshot_refs: [evidenceRef], predecessor_refs: [],
          created_at: input.imported_at
        });
    const expression = await this.createExpression(input, evidenceRef);
    const status = await increments.status(input.increment.increment_id);
    const lifecycle = createResearchLifecycleEvent({
      event_id: this.options.lifecycleEventId?.() ?? `event_${input.import_id}_accepted`,
      increment_ref: `increment:${input.track_id}:${input.increment.increment_id}@1`,
      event_seq: 2,
      previous_event_ref: status.latest_event_ref,
      event_type: 'accepted', prior_state: 'working', resulting_state: 'accepted',
      evidence_refs: [evidenceRef], approval_ref: `review:review_${input.import_id}`,
      receipt_ref: null, occurred_at: input.imported_at
    });
    const claims = input.claims.map((claim) => createClaimVersion({
      ...claim,
      canonical_claim_status: claim.claim_status,
      evidence_refs: [evidenceRef],
      increment_ref: `increment:${input.track_id}:${input.increment.increment_id}@1`,
      evolution_refs: []
    }));
    const questions = input.increment.open_question_refs.map((ref, index) =>
      this.question(ref, input.boundaries.planned_work[index] ?? ref, evidenceRef));
    const operations = [
      this.operation('op_import_increment', 'add_revision', revision.increment_id, 'research_increment', revision,
        this.targetForIncrement(input, revision)),
      ...claims.map((claim) => this.operation(`op_import_claim_${claim.claim_id}`, 'add_record', claim.claim_id, 'claim_version', claim,
        this.targetForClaim(input, claim))),
      ...questions.map((question) => this.operation(`op_import_question_${question.question_id}`, 'open_question', question.question_id, 'open_question', question,
        this.targetForQuestion(input, question))),
      this.operation(`op_import_expression_${expression.expression_id}`, 'attach_publication', expression.expression_id, 'publication_expression', expression,
        this.targetForExpression(input, expression)),
      this.operation(`op_import_lifecycle_${lifecycle.event_id}`, 'change_lifecycle', lifecycle.event_id, 'research_lifecycle_event', lifecycle,
        this.targetForLifecycle(input, lifecycle))
    ];
    const deltas = new SemanticDeltaService(this.store, { now: this.now });
    return deltas.propose({
      delta_id: this.options.deltaId?.() ?? `delta_${input.import_id}`,
      increment_ref: `increment:${input.track_id}:${input.increment.increment_id}@1`,
      base_catalog_digest: await (this.options.baseCatalogDigest?.() ?? Promise.resolve(sha256({ catalog: null }))),
      evidence_snapshot_refs: [evidenceRef], proposed_operations: operations,
      generated_by: 'research-publishing-harness/research-import-service',
      generated_at: this.now().toISOString(), policy_version: 'semantic-promotion/v1'
    });
  }

  private async createExpression(input: ResearchImportManifestV1, evidenceRef: string): Promise<PublicationExpressionV1> {
    const manifestArtifact = await this.store.resolveExistingArtifact(`${this.root(input.import_id)}/manifest.json`);
    const platformIds = input.thread.items.flatMap((item) => item.platform_id === null ? [] : [item.platform_id]);
    const publicVerified = input.thread.source_classification === 'public_verified' &&
      input.thread.items.every((item) => item.source_classification === 'receipt_backed' && item.platform_id !== null && item.public_url !== null);
    const expression = createPublicationExpression({
      expression_id: `expression_${input.import_id}`,
      increment_ref: `increment:${input.track_id}:${input.increment.increment_id}@1`,
      channel: 'x_thread', language: 'en', derivation_type: 'adaptation',
      claim_refs: input.increment.claim_refs, visual_refs: [], evidence_snapshot_refs: [evidenceRef],
      intended_content: {
        approved_plan_ref: `${this.root(input.import_id)}/manifest.json`,
        approved_plan_digest: manifestArtifact.digest,
        local_content_path: input.mother_article.path,
        content_digest: input.mother_article.digest,
        expected_item_order: input.thread.items.map((item) => item.ordinal),
        link_refs: [input.gist.url, input.thread.root_url], visual_refs: []
      },
      observed_content: {
        source: publicVerified ? 'public_page' : 'user_report',
        public_url: input.thread.root_url,
        platform_ids: platformIds,
        observed_digest: sha256(input.thread.items.map((item) => ({ ordinal: item.ordinal, digest: item.content_digest }))),
        actual_item_order: input.thread.items.map((item) => item.ordinal),
        media_verification: 'unverified', link_verification: publicVerified ? 'matched' : 'unverified',
        missing_content: [], unexpected_content: [], mismatches: []
      },
      verification_level: publicVerified ? 'public_verified' : 'manual_recorded',
      platform_refs: [input.thread.root_url, ...platformIds],
      publication_receipt_ref: `receipt:${input.thread.receipt.path}#${input.thread.receipt.digest}`,
      published_at: input.thread.published_at
    });
    const path = `${this.root(input.import_id)}/publication-expression.json`;
    if (!(await this.store.exists(path))) await this.store.writeNew(path, expression);
    return expression;
  }

  private operation(
    operationId: string,
    operationType: SemanticMemoryOperationV1['operation_type'],
    targetId: string,
    recordType: ResearchRuntimeRecordType,
    semantic: unknown,
    target: PromotionTarget
  ): SemanticMemoryOperationV1 {
    if (sha256(semantic) !== sha256(target.semantic_record)) {
      throw new HarnessError('CONTRACT_INVALID', 'Import operation target differs from its semantic record');
    }
    return {
      operation_id: operationId, operation_type: operationType, target_id: targetId,
      record_type: recordType, target_content: target, target_content_digest: sha256(target),
      evidence_refs: target.index_entry.evidence_available ? [target.refs.source_id!] : [],
      evidence_privacy_classification: 'internal', target_privacy_classification: 'internal',
      index_impact: recordType === 'publication_expression' ? ['publication', 'history'] : ['mainline', 'history']
    };
  }

  private target(
    semantic: unknown,
    recordType: ResearchRuntimeRecordType,
    frontmatter: PromotionTarget['frontmatter'],
    variables: PromotionTarget['variables'],
    refs: PromotionTarget['refs'],
    indexEntry: ResearchIndexSourceRecordV1
  ): PromotionTarget {
    return {
      semantic_record: semantic, frontmatter,
      body: `# Imported ${recordType}\n\n${JSON.stringify(semantic, null, 2)}\n`,
      variables, refs, index_entry: indexEntry
    };
  }

  private index(
    ref: string, path: string, title: string, summary: string,
    category: ResearchIndexSourceRecordV1['category'], importedAt: string,
    lifecycle: ResearchIndexSourceRecordV1['lifecycle_status'], claimStatus: ClaimStatus | null = null,
    publishedAt: string | null = null
  ): ResearchIndexSourceRecordV1 {
    return {
      ref, record_path: path, record_digest: sha256({ imported: ref }), title, summary,
      tags: ['imported'], category, claim_status: claimStatus, lifecycle_status: lifecycle,
      evolution_target: null, updated_at: importedAt,
      accepted_at: lifecycle === 'working' ? null : importedAt,
      published_at: category === 'publication' ? publishedAt : null,
      evidence_available: true, document_manifest_available: false
    };
  }

  private targetForIncrement(input: ResearchImportManifestV1, revision: ResearchIncrementRevisionV1): PromotionTarget {
    const sourceId = `evidence:evidence_${input.import_id}`;
    return this.target(revision, 'research_increment', {
      increment_id: revision.increment_id, track_id: revision.track_id, revision: revision.revision
    }, { research_track: input.track_id, increment_id: revision.increment_id, revision: '1' }, { source_id: sourceId },
    this.index(`increment:${input.track_id}:${revision.increment_id}@1`, `domains/research-publishing/tracks/${input.track_id}/increments/${revision.increment_id}/revisions/1/summary.md`, revision.title, revision.summary, 'semantic', input.imported_at, 'accepted'));
  }

  private targetForClaim(input: ResearchImportManifestV1, claim: ClaimVersionV1): PromotionTarget {
    const sourceId = `evidence:evidence_${input.import_id}`;
    return this.target(claim, 'claim_version', {
      claim_id: claim.claim_id, version: claim.version, claim_status: claim.claim_status
    }, { research_track: input.track_id, claim_id: claim.claim_id, version: String(claim.version) }, { source_id: sourceId },
    this.index(`claim:${claim.claim_id}@${claim.version}`, `domains/research-publishing/tracks/${input.track_id}/claims/${claim.claim_id}/versions/${claim.version}.md`, claim.statement, claim.summary, 'semantic', input.imported_at, 'accepted', claim.claim_status));
  }

  private targetForQuestion(input: ResearchImportManifestV1, question: OpenQuestionVersionV1): PromotionTarget {
    const sourceId = `evidence:evidence_${input.import_id}`;
    return this.target(question, 'open_question', {
      question_id: question.question_id, version: question.version, status: question.status
    }, { research_track: input.track_id, question_id: question.question_id, version: String(question.version) }, { source_id: sourceId },
    this.index(`question:${question.question_id}@${question.version}`, `domains/research-publishing/tracks/${input.track_id}/questions/${question.question_id}/versions/${question.version}.md`, question.question, question.why_it_matters, 'semantic', input.imported_at, 'accepted'));
  }

  private targetForExpression(input: ResearchImportManifestV1, expression: PublicationExpressionV1): PromotionTarget {
    const sourceId = `evidence:evidence_${input.import_id}`;
    return this.target(expression, 'publication_expression', {
      expression_id: expression.expression_id, channel: expression.channel,
      increment_ref: expression.increment_ref, verification_level: expression.verification_level
    }, { research_track: input.track_id, expression_id: expression.expression_id }, { source_id: sourceId },
    this.index(`publication:${expression.expression_id}@${expression.expression_digest}`, `domains/research-publishing/tracks/${input.track_id}/publications/${expression.expression_id}.md`, expression.expression_id, 'Imported six-item X Thread expression.', 'publication', input.imported_at, 'published', null, input.thread.published_at));
  }

  private targetForLifecycle(input: ResearchImportManifestV1, event: ResearchLifecycleEventV1): PromotionTarget {
    const sourceId = `evidence:evidence_${input.import_id}`;
    return this.target(event, 'research_lifecycle_event', {
      event_id: event.event_id, increment_ref: event.increment_ref, event_seq: event.event_seq,
      event_type: event.event_type, resulting_state: event.resulting_state
    }, { research_track: input.track_id, increment_id: input.increment.increment_id, event_id: event.event_id }, { source_id: sourceId },
    this.index(`lifecycle:${event.event_id}@${event.event_digest}`, `domains/research-publishing/tracks/${input.track_id}/increments/${input.increment.increment_id}/lifecycle/${event.event_id}.md`, `Lifecycle ${event.event_type}`, 'Imported Increment awaits ordinary Promotion approval.', 'semantic', input.imported_at, 'accepted'));
  }

  private question(
    ref: string, label: string, evidenceRef: string
  ): OpenQuestionVersionV1 {
    const match = /^question:([a-z0-9][a-z0-9_-]{0,95})@1$/.exec(ref);
    if (match === null) throw new HarnessError('CONTRACT_INVALID', `invalid imported Open Question ref: ${ref}`);
    const body = {
      schema_version: 'open-question-version/v1' as const,
      question_id: match[1]!, version: 1,
      question: `What is the minimal enterprise Agent Runtime contract for ${label}?`,
      why_it_matters: `${label} is planned research, not a completed phase.`,
      origin_refs: [evidenceRef], candidate_next_actions: [`Investigate ${label} using real failures.`],
      status: 'open' as const, answered_by_ref: null
    };
    return validateContract<OpenQuestionVersionV1>('open-question-version', {
      ...body, question_digest: sha256(body)
    });
  }

  private assertStructuralSafety(input: ResearchImportManifestV1): void {
    if (input.import_scope !== 'single_increment' || input.thread.items.length !== 6 ||
      input.thread.items.some((item, index) => item.ordinal !== index + 1 || sha256(item.text) !== item.content_digest)) {
      throw new HarnessError('CONTRACT_INVALID', 'Import accepts exactly one six-item ordered Increment');
    }
    for (const path of [input.mother_article.path, input.thread.receipt.path]) {
      if (!SAFE_PATH.test(path) || path.includes('..') || path.includes('\\') || path.includes('//')) {
        throw new HarnessError('WORKSPACE_PATH_INVALID', 'Import local paths must be contained workspace-relative paths');
      }
    }
    https(input.gist.url, 'Gist URL');
    https(input.thread.root_url, 'Thread root URL');
    for (const item of input.thread.items) if (item.public_url !== null) https(item.public_url, 'Thread item URL');
  }

  private async verifyArtifact(path: string, digest: `sha256:${string}`, label: string): Promise<void> {
    const artifact = await this.store.resolveExistingArtifact(path);
    if (artifact.digest !== digest) throw new HarnessError('MEMORY_SOURCE_STALE', `${label} digest changed`);
  }

  private root(importId: string): string {
    if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(importId)) throw new HarnessError('CONTRACT_INVALID', 'Import id must be stable');
    return `memory/imports/${importId}`;
  }
}
