import type { ResearchIncrementRevisionInput, ResearchIncrementRevisionV1, ResearchLifecycleState } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface AssembleResearchIncrementInput extends Omit<ResearchIncrementRevisionInput, 'track_id' | 'created_at'> {
    readonly track_id?: string;
    readonly created_at?: string;
}
export interface ResearchIncrementStatusV1 {
    readonly schema_version: 'research-increment-status/v1';
    readonly increment_id: string;
    readonly track_id: string;
    readonly state: ResearchLifecycleState;
    readonly latest_revision: number;
    readonly latest_revision_ref: string;
    readonly latest_event_ref: string;
    readonly updated_at: string;
}
export interface ResearchIncrementLineageV1 {
    readonly schema_version: 'research-increment-lineage/v1';
    readonly increment_id: string;
    readonly track_id: string;
    readonly state: ResearchLifecycleState;
    readonly revisions: ReadonlyArray<{
        readonly revision: number;
        readonly content_digest: `sha256:${string}`;
        readonly predecessor_refs: readonly string[];
        readonly created_at: string;
    }>;
}
export declare class ResearchIncrementService {
    private readonly store;
    private readonly ids;
    private readonly evidence;
    constructor(store: WorkspaceStore, ids?: Readonly<{
        lifecycleEventId?: () => string;
        now?: () => Date;
    }>);
    assemble(input: AssembleResearchIncrementInput): Promise<ResearchIncrementRevisionV1>;
    status(incrementId: string): Promise<ResearchIncrementStatusV1>;
    lineage(incrementId: string): Promise<ResearchIncrementLineageV1>;
    private assertIncrementId;
    private verifyRevisionSequence;
    private verifyEvidence;
    private verifyPredecessors;
}
