import type { XArticlePublicationPlanV1 } from '../../../core/x-article-publication-plan.js';
import type { XArticlePublicVerification } from './article-public-verifier.js';
export type XArticleReceiptStatus = 'published' | 'published_media_unverified' | 'outcome_unknown' | 'verification_conflict';
export interface CreateXArticleReceiptInput {
    readonly receiptId: string;
    readonly executionId: string;
    readonly plan: XArticlePublicationPlanV1;
    readonly status: XArticleReceiptStatus;
    readonly draftId: string;
    readonly editorRevision: string;
    readonly previewRevision: string;
    readonly publicVerification: XArticlePublicVerification;
    readonly issuedAt: string;
    readonly supersedesReceiptId: string | null;
}
export interface XArticlePublishReceiptV1 {
    readonly schema_version: '1.0';
    readonly receipt_id: string;
    readonly execution_id: string;
    readonly plan_id: string;
    readonly plan_digest: string;
    readonly status: XArticleReceiptStatus;
    readonly source_evidence: {
        readonly article_package_digest: string;
        readonly document_digest: string;
        readonly asset_digests: readonly string[];
    };
    readonly editor_evidence: {
        readonly draft_id: string;
        readonly editor_revision: string;
        readonly preview_revision: string;
        readonly content_match: true;
    };
    readonly public_evidence: XArticlePublicVerification;
    readonly issued_at: string;
    readonly supersedes_receipt_id: string | null;
    readonly receipt_digest: string;
}
export declare function createXArticleReceipt(input: CreateXArticleReceiptInput): XArticlePublishReceiptV1;
