import type { WorkspaceStore } from './workspace-store.js';
import type { XArticleMaterializationCheckpointV1, XArticleMaterializationPlanV1, XArticleStageProgressV1 } from './x-article-materialization.js';
export type UpdateCheckpoint = (current: XArticleMaterializationCheckpointV1) => XArticleMaterializationCheckpointV1;
export interface XArticleMaterializationStoreApi {
    create(plan: XArticleMaterializationPlanV1, checkpoint: XArticleMaterializationCheckpointV1): Promise<XArticleMaterializationCheckpointV1>;
    readCheckpoint(executionId: string): Promise<XArticleMaterializationCheckpointV1>;
    updateCheckpoint(executionId: string, expectedRevision: number, update: UpdateCheckpoint): Promise<XArticleMaterializationCheckpointV1>;
    appendProgress(progress: XArticleStageProgressV1): Promise<XArticleStageProgressV1>;
    readProgress(executionId: string): Promise<readonly XArticleStageProgressV1[]>;
}
export declare class XArticleMaterializationStore implements XArticleMaterializationStoreApi {
    private readonly store;
    constructor(store: WorkspaceStore);
    create(plan: XArticleMaterializationPlanV1, checkpoint: XArticleMaterializationCheckpointV1): Promise<XArticleMaterializationCheckpointV1>;
    readCheckpoint(executionId: string): Promise<XArticleMaterializationCheckpointV1>;
    updateCheckpoint(executionId: string, expectedRevision: number, update: UpdateCheckpoint): Promise<XArticleMaterializationCheckpointV1>;
    appendProgress(progress: XArticleStageProgressV1): Promise<XArticleStageProgressV1>;
    readProgress(executionId: string): Promise<readonly XArticleStageProgressV1[]>;
    private assertCheckpointMatchesPlan;
    private assertSafeExecutionId;
    private prefix;
    private planPath;
    private checkpointPath;
    private progressPath;
    private lockPath;
    private conflict;
}
