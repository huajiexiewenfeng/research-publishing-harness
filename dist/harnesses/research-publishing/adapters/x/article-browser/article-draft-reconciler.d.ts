import type { XArticleDocumentV1 } from '../../../branches/x-article-harness/article-document.js';
import type { XArticleMaterializationCheckpointV1, XArticleMaterializationPlanV1 } from '../../../core/x-article-materialization.js';
import { type XArticleBrowserObservation, type XArticleDraftReconciliationV1 } from './article-browser-protocol.js';
export interface ReconcileXArticleDraftInput {
    readonly plan: XArticleMaterializationPlanV1;
    readonly checkpoint: XArticleMaterializationCheckpointV1;
    readonly document: XArticleDocumentV1;
    readonly observation: XArticleBrowserObservation;
}
export declare function reconcileXArticleDraft(input: ReconcileXArticleDraftInput): XArticleDraftReconciliationV1;
