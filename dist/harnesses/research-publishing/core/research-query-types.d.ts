import type { Digest } from './memory-types.js';
import type { DocumentLoadMode, ResearchQueryView } from './research-memory-types.js';
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
export type ResearchQueryStatusV2 = 'loaded' | 'empty' | 'runtime_unavailable' | 'index_unavailable' | 'index_rebuild_required' | 'context_budget_exceeded' | 'failed';
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
export declare const RESEARCH_QUERY_BUDGETS_V2: ResearchQueryBudgetsV2;
export declare function createResearchQueryPlan(input: PlanResearchQueryInput): ResearchQueryPlanV2;
export declare function createResearchContextSnapshot(input: ResearchContextSnapshotInputV2): ResearchContextSnapshotV2;
export declare function createResearchContextReview(snapshot: ResearchContextSnapshotV2, input: ReviewResearchContextInput): ResearchContextReviewV2;
