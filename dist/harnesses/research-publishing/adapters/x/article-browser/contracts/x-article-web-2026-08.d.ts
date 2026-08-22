import type { XArticleDocumentV1 } from '../../../../branches/x-article-harness/article-document.js';
import type { XArticleBrowserObservation, XArticleControlObservation, XArticleEditorImportStateV1, XArticleEditorObservation, XArticlePreviewObservation, XArticlePublicObservation, XArticlePublishReviewObservation } from '../article-browser-protocol.js';
import type { XArticleControlPurpose, XArticleDetectedPage, XArticlePageContract } from '../article-page-contract.js';
export declare class XArticleWeb2026_08Contract implements XArticlePageContract {
    readonly id = "x-article-web";
    readonly version = "2026-08";
    detectPage(observation: XArticleBrowserObservation): XArticleDetectedPage;
    detectAccount(observation: XArticleBrowserObservation): {
        readonly handle: string;
    };
    detectEditor(observation: XArticleBrowserObservation): XArticleEditorObservation;
    readEditorImportState(observation: XArticleBrowserObservation): XArticleEditorImportStateV1 | null;
    readEditorDocument(observation: XArticleBrowserObservation): XArticleDocumentV1;
    detectPreview(observation: XArticleBrowserObservation): XArticlePreviewObservation;
    detectPublishReview(observation: XArticleBrowserObservation): XArticlePublishReviewObservation;
    detectPublicArticle(observation: XArticleBrowserObservation): XArticlePublicObservation;
    detectControl(observation: XArticleBrowserObservation, purpose: XArticleControlPurpose): XArticleControlObservation;
    private assertObservation;
    private unsupported;
}
