import type { XArticleApprovalV1 } from './x-article-approval.js';
import type { XArticlePublicationPlanV1 } from './x-article-publication-plan.js';
import type { XArticleExecutionSnapshotV1 } from './x-article-execution.js';
import type { ApprovalV2 } from './approval-v2.js';
import type { ApprovalV2_1 } from './approval-v2-1.js';
import type { BrowserExecutionSnapshot } from './browser-execution.js';
import type { PublicationPlanV2 } from './publication-plan-v2.js';
import type { PublicationPlanV2_1 } from './publication-plan-v2-1.js';
import type { ResearchArtifactRefV1 } from './research-program-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface InspectedArticleExecution {
    readonly snapshot: XArticleExecutionSnapshotV1;
    readonly installed_plan_ref: ResearchArtifactRefV1;
    readonly installed_approval_ref: ResearchArtifactRefV1;
    readonly plan: XArticlePublicationPlanV1;
    readonly approval: XArticleApprovalV1;
}
export interface InspectedSingleExecution {
    readonly snapshot: BrowserExecutionSnapshot;
    readonly installed_plan_ref: ResearchArtifactRefV1;
    readonly installed_approval_ref: ResearchArtifactRefV1;
    readonly plan: PublicationPlanV2 | PublicationPlanV2_1;
    readonly approval: ApprovalV2 | ApprovalV2_1;
    readonly latest_receipt_path: string | null;
}
export interface PublicationChildExecutionInspector {
    inspectArticle(executionId: string): Promise<InspectedArticleExecution>;
    inspectSingle(runId: string, executionId: string): Promise<InspectedSingleExecution>;
}
export declare class WorkspacePublicationChildExecutionInspector implements PublicationChildExecutionInspector {
    private readonly store;
    constructor(store: WorkspaceStore);
    inspectArticle(executionId: string): Promise<InspectedArticleExecution>;
    inspectSingle(runId: string, executionId: string): Promise<InspectedSingleExecution>;
    private readJson;
    private parse;
    private assertSafeId;
}
