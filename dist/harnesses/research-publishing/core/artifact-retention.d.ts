import type { WorkspaceStore } from './workspace-store.js';
export interface ArtifactRetentionReport {
    readonly schema_version: '2.0';
    readonly pruned_at: string;
    readonly deleted_paths: readonly string[];
    readonly deleted_bytes: number;
    readonly skipped_resumable_executions: readonly string[];
    readonly retained_audit_artifacts: number;
}
export declare function pruneBrowserArtifacts(store: WorkspaceStore, now?: Date): Promise<ArtifactRetentionReport>;
