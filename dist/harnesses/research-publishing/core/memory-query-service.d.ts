import type { ContextSnapshotV1, Digest, MemoryContextV1, MemoryQueryPlanV1, MemoryQueryState, RuntimeContextResult } from './memory-types.js';
import type { ResearchContentPackageV1_1 } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface MemoryQueryRuntime {
    version?(): Promise<'0.2.0' | '0.3.0'>;
    query(input: Readonly<{
        allowed_paths: readonly string[];
        excluded_paths: readonly string[];
        max_items: number;
        max_item_chars: number;
        ordering_policy: 'path_asc';
    }>): Promise<RuntimeContextResult>;
}
export interface PlanMemoryQueryInput {
    readonly research_track: string;
    readonly purpose: 'candidate_enrichment' | 'feedback_followup';
    readonly query_terms: readonly string[];
    readonly context_budget: Readonly<{
        max_items: number;
        max_chars: number;
        max_item_chars: number;
    }>;
    readonly profile_digest: Digest;
    readonly scp_digest: Digest;
}
export interface MemoryContextReviewV1 {
    readonly schema_version: 'memory-context-review/v1';
    readonly query_id: string;
    readonly query_plan_digest: Digest;
    readonly context_snapshot_digest: Digest;
    readonly selected_refs: readonly string[];
    readonly status: 'applied' | 'reviewed_not_applied' | 'memory_unavailable';
    readonly reviewed_by: string;
    readonly reviewed_at: string;
    readonly review_digest: Digest;
}
export interface MemoryQueryStatusV1 {
    readonly schema_version: 'memory-query-status/v1';
    readonly query_id: string;
    readonly state: MemoryQueryState;
    readonly plan_digest: Digest;
    readonly snapshot_digest: Digest | null;
    readonly review_digest: Digest | null;
    readonly updated_at: string;
}
export interface MemoryQueryServiceIds {
    readonly queryId?: () => string;
    readonly runId?: () => string;
    readonly snapshotId?: () => string;
    readonly now?: () => Date;
}
export declare class MemoryQueryService {
    private readonly store;
    private readonly runtime;
    private readonly ids;
    private readonly now;
    constructor(store: WorkspaceStore, runtime: MemoryQueryRuntime, ids?: MemoryQueryServiceIds);
    private base;
    private writeStatus;
    planQuery(input: PlanMemoryQueryInput): Promise<MemoryQueryPlanV1>;
    private boundResult;
    executeQuery(queryId: string): Promise<ContextSnapshotV1>;
    reviewContext(queryId: string, input: Readonly<{
        selected_refs: readonly string[];
        reviewed_by: string;
        reviewed_at: Date;
    }>): Promise<MemoryContextReviewV1>;
    unavailableContext(plan: MemoryQueryPlanV1, reviewer: string, reviewedAt?: Date): MemoryContextV1;
    bindPackage(queryId: string, packageDraft: ResearchContentPackageV1_1): Promise<ResearchContentPackageV1_1>;
    queryStatus(queryId: string): Promise<MemoryQueryStatusV1>;
}
