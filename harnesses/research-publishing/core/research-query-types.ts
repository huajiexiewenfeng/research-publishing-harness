import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import type { Digest } from './memory-types.js';
import { RESEARCH_MEMORY_POLICY_V1 } from './research-memory-policy.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import type { DocumentLoadMode, ResearchQueryView } from './research-memory-types.js';
import { validateContract } from './schema-validator.js';

export type { DocumentLoadMode, ResearchQueryView } from './research-memory-types.js';

export interface ResearchIndexRefV1 {
  readonly path: string;
  readonly digest: Digest;
  readonly generation: string;
}

export interface ResearchIndexShardRefV1 extends ResearchIndexRefV1 {
  readonly shard_id: string;
  readonly view: ResearchQueryView;
}

export interface ResearchRecordRefV1 {
  readonly ref: string;
  readonly path: string;
  readonly digest: Digest;
  readonly evidence_refs: readonly string[];
  readonly document_manifest_ref: ResearchDocumentManifestRefV1 | null;
}

export interface ResearchDocumentManifestRefV1 {
  readonly document_id: string;
  readonly path: string;
  readonly digest: Digest;
}

export interface CanonicalChunkRefV1 {
  readonly chunk_id: string;
  readonly path: string;
  readonly digest: Digest;
  readonly ordinal: number;
  readonly char_start: number;
  readonly char_end: number;
}

export interface ResearchQueryBudgetsV2 {
  readonly max_shards: 4;
  readonly max_records: 12;
  readonly max_chunks: 6;
  readonly max_chars_per_index_record: 12000;
  readonly max_reconstructed_document_chars: 60000;
}

export interface PlanResearchQueryInput {
  readonly query_id: string;
  readonly track_id: string;
  readonly query_intent: string;
  readonly view: ResearchQueryView;
  readonly include_working: boolean;
  readonly selection_terms: readonly string[];
  readonly selection_rationale: string;
  readonly document_mode: DocumentLoadMode;
  readonly full_document_requested?: boolean;
  readonly catalog_ref: ResearchIndexRefV1 | null;
  readonly selected_shard_refs: readonly ResearchIndexShardRefV1[];
  readonly selected_record_refs: readonly ResearchRecordRefV1[];
  readonly selected_manifest_refs: readonly ResearchDocumentManifestRefV1[];
  readonly selected_chunk_refs: readonly CanonicalChunkRefV1[];
  readonly created_at: string;
}

export interface ResearchQueryPlanV2 extends Omit<PlanResearchQueryInput, 'full_document_requested'> {
  readonly schema_version: 'research-query-plan/v2';
  readonly index_id: string;
  readonly full_document_requested: boolean;
  readonly policy_version: 'research-memory-policy/v1';
  readonly budgets: ResearchQueryBudgetsV2;
  readonly plan_digest: Digest;
}

export type ResearchQueryStatusV2 =
  | 'loaded' | 'empty' | 'runtime_unavailable' | 'index_unavailable'
  | 'index_rebuild_required' | 'context_budget_exceeded' | 'failed';

export interface ResearchContextItemV2 {
  readonly context_ref: string;
  readonly relative_path: string;
  readonly content_digest: Digest;
  readonly content: string;
  readonly source_layer: 'semantic_record' | 'document_chunk';
  readonly classification: 'data_only';
  readonly sanitized: boolean;
  readonly risk_flags: readonly string[];
}

export interface ResearchContextSnapshotInputV2 {
  readonly snapshot_id: string;
  readonly query_plan_digest: Digest;
  readonly query_id: string;
  readonly query_intent: string;
  readonly track_id: string;
  readonly view: ResearchQueryView;
  readonly index_refs: readonly ResearchIndexRefV1[];
  readonly selected_summary_refs: readonly string[];
  readonly selected_record_refs: readonly ResearchRecordRefV1[];
  readonly selected_evidence_refs: readonly string[];
  readonly context_items: readonly ResearchContextItemV2[];
  readonly risk_flags: readonly string[];
  readonly budgets: ResearchQueryBudgetsV2;
  readonly selection_rationale: string;
  readonly query_status: ResearchQueryStatusV2;
  readonly runtime_version: '0.2.0' | '0.3.0' | null;
  readonly created_at: string;
}

export interface ResearchContextSnapshotV2 extends ResearchContextSnapshotInputV2 {
  readonly schema_version: 'research-context-snapshot/v2';
  readonly snapshot_digest: Digest;
}

export interface ReviewResearchContextInput {
  readonly review_id: string;
  readonly selected_context_refs: readonly string[];
  readonly reviewer: string;
  readonly reviewed_at: string;
}

export interface ResearchContextReviewV2 extends ReviewResearchContextInput {
  readonly schema_version: 'research-context-review/v2';
  readonly query_id: string;
  readonly query_plan_digest: Digest;
  readonly snapshot_digest: Digest;
  readonly review_digest: Digest;
}

export const RESEARCH_QUERY_BUDGETS_V2: ResearchQueryBudgetsV2 = Object.freeze({
  max_shards: RESEARCH_MEMORY_POLICY_V1.max_shards_per_query,
  max_records: RESEARCH_MEMORY_POLICY_V1.max_semantic_records_per_query,
  max_chunks: RESEARCH_MEMORY_POLICY_V1.max_document_chunks_per_query,
  max_chars_per_index_record: RESEARCH_MEMORY_POLICY_V1.max_chars_per_index_record,
  max_reconstructed_document_chars: RESEARCH_MEMORY_POLICY_V1.max_reconstructed_document_chars
});

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new HarnessError('CONTRACT_INVALID', `${label} must be unique`);
  }
}

function exactRuntimePath(value: string): boolean {
  return /^domains\/research-publishing\/[A-Za-z0-9._/-]+$/.test(value) &&
    !value.includes('..') && !value.includes('//') && !value.includes('\\') &&
    !/[?*\[\]]/.test(value);
}

export function createResearchQueryPlan(input: PlanResearchQueryInput): ResearchQueryPlanV2 {
  if (!STABLE_ID_PATTERN.test(input.query_id) || !STABLE_ID_PATTERN.test(input.track_id)) {
    throw new HarnessError('CONTRACT_INVALID', 'Query and Track ids must be stable');
  }
  if (input.view === 'working' && !input.include_working) {
    throw new HarnessError('CONTRACT_INVALID', 'Working view requires include_working');
  }
  const fullDocumentRequested = input.full_document_requested ?? false;
  if (fullDocumentRequested && input.document_mode !== 'full_explicit') {
    throw new HarnessError('CONTRACT_INVALID', 'full document reconstruction requires full_explicit');
  }
  if (input.query_intent.trim().length === 0 || input.selection_rationale.trim().length === 0) {
    throw new HarnessError('CONTRACT_INVALID', 'Query intent and selection rationale are required');
  }
  unique(input.selection_terms, 'selection terms');
  unique(input.selected_shard_refs.map((item) => item.shard_id), 'selected Shards');
  unique(input.selected_record_refs.map((item) => item.ref), 'selected records');
  unique(input.selected_manifest_refs.map((item) => item.document_id), 'selected Manifests');
  unique(input.selected_chunk_refs.map((item) => item.chunk_id), 'selected Chunks');
  const paths = [
    ...(input.catalog_ref === null ? [] : [input.catalog_ref.path]),
    ...input.selected_shard_refs.map((item) => item.path),
    ...input.selected_record_refs.map((item) => item.path),
    ...input.selected_manifest_refs.map((item) => item.path),
    ...input.selected_chunk_refs.map((item) => item.path)
  ];
  if (paths.some((path) => !exactRuntimePath(path))) {
    throw new HarnessError('CONTRACT_INVALID', 'Query Plan requires exact contained Runtime paths');
  }
  if (
    input.selected_shard_refs.length > RESEARCH_QUERY_BUDGETS_V2.max_shards ||
    input.selected_record_refs.length > RESEARCH_QUERY_BUDGETS_V2.max_records ||
    input.selected_manifest_refs.length > RESEARCH_QUERY_BUDGETS_V2.max_records ||
    input.selected_chunk_refs.length > RESEARCH_QUERY_BUDGETS_V2.max_chunks
  ) {
    throw new HarnessError('CONTRACT_INVALID', 'context_budget_exceeded');
  }
  if (input.catalog_ref === null && (
    input.selected_shard_refs.length > 0 || input.selected_record_refs.length > 0 ||
    input.selected_manifest_refs.length > 0 || input.selected_chunk_refs.length > 0
  )) {
    throw new HarnessError('CONTRACT_INVALID', 'Query selections require an exact Catalog ref');
  }
  if (input.catalog_ref !== null && input.selected_shard_refs.some(
    (item) => item.generation !== input.catalog_ref!.generation || item.view !== input.view
  )) {
    throw new HarnessError('CONTRACT_INVALID', 'selected Shards must match the Catalog generation and view');
  }
  if (input.document_mode === 'none' && (
    input.selected_manifest_refs.length > 0 || input.selected_chunk_refs.length > 0
  )) {
    throw new HarnessError('CONTRACT_INVALID', 'document_mode none cannot select document records');
  }
  const body = {
    schema_version: 'research-query-plan/v2' as const,
    query_id: input.query_id, track_id: input.track_id,
    index_id: `${input.track_id}:research`, query_intent: input.query_intent,
    view: input.view, include_working: input.include_working,
    selection_terms: [...input.selection_terms], selection_rationale: input.selection_rationale,
    document_mode: input.document_mode, full_document_requested: fullDocumentRequested,
    catalog_ref: input.catalog_ref, selected_shard_refs: [...input.selected_shard_refs],
    selected_record_refs: [...input.selected_record_refs],
    selected_manifest_refs: [...input.selected_manifest_refs], selected_chunk_refs: [...input.selected_chunk_refs],
    policy_version: 'research-memory-policy/v1' as const, budgets: RESEARCH_QUERY_BUDGETS_V2,
    created_at: input.created_at
  };
  return validateContract<ResearchQueryPlanV2>('research-query-plan-v2', {
    ...body, plan_digest: sha256(body)
  });
}

export function createResearchContextSnapshot(
  input: ResearchContextSnapshotInputV2
): ResearchContextSnapshotV2 {
  if (!STABLE_ID_PATTERN.test(input.snapshot_id) || !STABLE_ID_PATTERN.test(input.query_id)) {
    throw new HarnessError('CONTRACT_INVALID', 'Snapshot ids must be stable');
  }
  unique(input.selected_summary_refs, 'selected summary refs');
  unique(input.selected_record_refs.map((item) => item.ref), 'Snapshot record refs');
  unique(input.selected_evidence_refs, 'selected Evidence refs');
  unique(input.context_items.map((item) => item.context_ref), 'context refs');
  if (input.selected_record_refs.length > input.budgets.max_records) {
    throw new HarnessError('CONTRACT_INVALID', 'context_budget_exceeded');
  }
  const body = { schema_version: 'research-context-snapshot/v2' as const, ...input };
  return validateContract<ResearchContextSnapshotV2>('research-context-snapshot-v2', {
    ...body, snapshot_digest: sha256(body)
  });
}

export function createResearchContextReview(
  snapshot: ResearchContextSnapshotV2,
  input: ReviewResearchContextInput
): ResearchContextReviewV2 {
  if (!STABLE_ID_PATTERN.test(input.review_id) || input.reviewer.trim().length === 0) {
    throw new HarnessError('CONTRACT_INVALID', 'Review id and reviewer are required');
  }
  unique(input.selected_context_refs, 'reviewed context refs');
  const available = new Set(snapshot.context_items.map((item) => item.context_ref));
  if (input.selected_context_refs.some((ref) => !available.has(ref))) {
    throw new HarnessError('CONTRACT_INVALID', 'Review selected context ref is absent from Snapshot');
  }
  const body = {
    schema_version: 'research-context-review/v2' as const, review_id: input.review_id,
    query_id: snapshot.query_id, query_plan_digest: snapshot.query_plan_digest,
    snapshot_digest: snapshot.snapshot_digest, selected_context_refs: [...input.selected_context_refs],
    reviewer: input.reviewer, reviewed_at: input.reviewed_at
  };
  return validateContract<ResearchContextReviewV2>('research-context-review-v2', {
    ...body, review_digest: sha256(body)
  });
}
