import type { ErrorCode } from '../../../core/errors.js';
import type { XArticlePublicationPlanV1 } from '../../../core/x-article-publication-plan.js';
import type { XArticleMaterializationPlanV1 } from '../../../core/x-article-materialization.js';
import type { XArticleBrowserObservation, XArticleDraftReconciliationV1 } from './article-browser-protocol.js';
import type { IssueXArticleBrowserCommandInput } from './article-command-broker.js';
import type { XArticlePageContract } from './article-page-contract.js';
export type XArticleImportStrategy = 'bulk_document' | 'incremental_blocks';
export interface XArticleEditorContext {
    readonly plan: XArticlePublicationPlanV1;
    readonly draft_id: string;
    readonly import_strategy: XArticleImportStrategy;
    readonly bulk_import_issued: boolean;
}
export type XArticleEditorDecision = {
    readonly kind: 'command';
    readonly input: IssueXArticleBrowserCommandInput;
} | {
    readonly kind: 'complete';
} | {
    readonly kind: 'blocked';
    readonly code: ErrorCode;
    readonly message: string;
};
export interface XArticleMaterializationEditorContext {
    readonly plan: XArticlePublicationPlanV1;
    readonly materialization_plan: XArticleMaterializationPlanV1;
    readonly draft_id: string;
}
export declare function nextMaterializationEditorDecision(context: XArticleMaterializationEditorContext, observation: XArticleBrowserObservation, reconciliation: XArticleDraftReconciliationV1, contract: XArticlePageContract): XArticleEditorDecision;
export declare function nextArticleEditorDecision(context: XArticleEditorContext, observation: XArticleBrowserObservation, contract: XArticlePageContract): XArticleEditorDecision;
