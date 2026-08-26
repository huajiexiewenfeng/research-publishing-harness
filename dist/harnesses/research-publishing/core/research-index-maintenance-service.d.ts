import type { WorkspaceStore } from './workspace-store.js';
interface IndexMaintenanceRuntime {
    findRecords(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
    loadPaths(input: Readonly<{
        paths: readonly string[];
        max_items: number;
        max_item_chars: number;
        max_total_chars: number;
    }>): Promise<Readonly<{
        status: string;
        items: readonly Readonly<{
            path: string;
            checksum: `sha256:${string}`;
            content: string;
        }>[];
    }>>;
}
export interface ResearchIndexFindingV1 {
    readonly code: string;
    readonly path: string | null;
    readonly message: string;
}
export interface ResearchIndexDoctorReportV1 {
    readonly schema_version: 'research-index-doctor-report/v1';
    readonly report_id: string;
    readonly track_id: string;
    readonly status: 'healthy' | 'legacy_only' | 'index_rebuild_required';
    readonly catalog_ref: Readonly<{
        path: string;
        digest: `sha256:${string}`;
    }> | null;
    readonly checked_shard_refs: ReadonlyArray<{
        path: string;
        digest: `sha256:${string}`;
    }>;
    readonly checked_record_refs: ReadonlyArray<{
        ref: string;
        path: string;
        digest: `sha256:${string}`;
    }>;
    readonly findings: readonly ResearchIndexFindingV1[];
    readonly checked_at: string;
    readonly report_digest: `sha256:${string}`;
}
export interface ResearchIndexRebuildPlanV1 {
    readonly schema_version: 'research-index-rebuild-plan/v1';
    readonly plan_id: string;
    readonly track_id: string;
    readonly base_catalog_digest: `sha256:${string}`;
    readonly source_record_refs: ReadonlyArray<{
        ref: string;
        path: string;
        digest: `sha256:${string}`;
    }>;
    readonly proposed_generation: string;
    readonly proposed_shard_refs: ReadonlyArray<{
        path: string;
        digest: `sha256:${string}`;
    }>;
    readonly proposed_catalog_ref: Readonly<{
        path: string;
        digest: `sha256:${string}`;
    }>;
    readonly approval_required: true;
    readonly planned_at: string;
    readonly plan_digest: `sha256:${string}`;
}
interface MaintenanceIds {
    readonly reportId?: () => string;
    readonly planId?: () => string;
    readonly now?: () => Date;
}
export declare class ResearchIndexMaintenanceService {
    private readonly store;
    private readonly runtime;
    private readonly ids;
    private readonly now;
    constructor(store: WorkspaceStore, runtime: IndexMaintenanceRuntime, ids?: MaintenanceIds);
    doctor(trackId: string): Promise<ResearchIndexDoctorReportV1>;
    rebuildPlan(trackId: string): Promise<ResearchIndexRebuildPlanV1>;
    private inspect;
    private loadOne;
}
export {};
