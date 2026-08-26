import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
export function createXArticleReceipt(input) {
    const requiredStatus = input.publicVerification.kind === 'full_match'
        ? 'published'
        : input.publicVerification.kind === 'media_unverified'
            ? 'published_media_unverified'
            : 'verification_conflict';
    if (input.status !== requiredStatus) {
        throw new HarnessError('ARTICLE_PUBLICATION_CONFLICT', 'X Article Receipt status cannot exceed public verification evidence');
    }
    const base = {
        schema_version: '1.0',
        receipt_id: input.receiptId,
        execution_id: input.executionId,
        plan_id: input.plan.plan_id,
        plan_digest: input.plan.plan_digest,
        status: input.status,
        source_evidence: {
            article_package_digest: input.plan.intent.article_package.digest,
            document_digest: sha256(input.plan.intent.document),
            asset_digests: input.plan.intent.visuals.map((binding) => binding.asset.digest)
        },
        editor_evidence: {
            draft_id: input.draftId,
            editor_revision: input.editorRevision,
            preview_revision: input.previewRevision,
            content_match: true
        },
        public_evidence: input.publicVerification,
        issued_at: input.issuedAt,
        supersedes_receipt_id: input.supersedesReceiptId
    };
    return validateContract('x-article-publish-receipt', {
        ...base,
        receipt_digest: sha256(base)
    });
}
//# sourceMappingURL=article-receipt.js.map