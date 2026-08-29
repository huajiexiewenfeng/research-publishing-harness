import type { OpenQuestionCandidateV1, SemanticMemoryDeltaV1 } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface ResearchFlywheelServiceOptions {
    readonly deltaId?: () => string;
    readonly lifecycleEventId?: () => string;
    readonly now?: () => Date;
    readonly baseCatalogDigest?: () => Promise<`sha256:${string}`>;
}
export declare class ResearchFlywheelService {
    private readonly store;
    private readonly options;
    private readonly evidence;
    private readonly now;
    constructor(store: WorkspaceStore, options?: ResearchFlywheelServiceOptions);
    proposeFromEvidence(snapshotId: string): Promise<SemanticMemoryDeltaV1>;
    proposeNextQuestions(incrementRef: string): Promise<readonly OpenQuestionCandidateV1[]>;
    private expressionTarget;
    private lifecycleTarget;
}
