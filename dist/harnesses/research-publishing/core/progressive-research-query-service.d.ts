import type { RuntimeContextResult } from './memory-types.js';
import type { ResearchIndexCatalogV1, ResearchIndexShardV1 } from './research-index-types.js';
import { type PlanResearchQueryInput, type ResearchContextReviewV2, type ResearchContextSnapshotV2, type ResearchQueryPlanV2, type ReviewResearchContextInput } from './research-query-types.js';
import type { ResearchContentPackageV1_1, ResearchContentPackageV1_2 } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';
interface ProgressiveQueryRuntime {
    findRecords(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
    loadPaths(input: Readonly<{
        paths: readonly string[];
        max_items: number;
        max_item_chars: number;
        max_total_chars: number;
    }>): Promise<RuntimeContextResult>;
}
interface ProgressiveQueryIds {
    readonly snapshotId?: () => string;
    readonly reviewId?: () => string;
    readonly now?: () => Date;
}
export interface ResearchQueryStatusProjectionV2 {
    readonly schema_version: 'research-query-status/v2';
    readonly query_id: string;
    readonly plan_digest: `sha256:${string}`;
    readonly phase: 'planned' | 'executed' | 'reviewed' | 'package_bound';
    readonly snapshot_digest: `sha256:${string}` | null;
    readonly review_digest: `sha256:${string}` | null;
    readonly updated_at: string;
}
export declare function parseResearchIndexCatalogRecord(content: string): ResearchIndexCatalogV1;
export declare function parseResearchIndexShardRecord(content: string, checksum: `sha256:${string}`): ResearchIndexShardV1;
export declare class ProgressiveResearchQueryService {
    private readonly store;
    private readonly runtime;
    private readonly ids;
    private readonly now;
    constructor(store: WorkspaceStore, runtime: ProgressiveQueryRuntime, ids?: ProgressiveQueryIds);
    private root;
    private planPath;
    private snapshotPath;
    private reviewPath;
    private statusPath;
    plan(input: PlanResearchQueryInput): Promise<ResearchQueryPlanV2>;
    execute(queryId: string): Promise<ResearchContextSnapshotV2>;
    review(queryId: string, input: Omit<ReviewResearchContextInput, 'review_id'>): Promise<ResearchContextReviewV2>;
    bindPackage<T extends ResearchContentPackageV1_1 | ResearchContentPackageV1_2>(queryId: string, draft: T): Promise<T>;
    status(queryId: string): Promise<ResearchQueryStatusProjectionV2>;
    private loadExact;
    private persistSnapshot;
    private writeStatus;
}
export {};
