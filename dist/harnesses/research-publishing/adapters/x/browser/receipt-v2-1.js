import { randomUUID } from 'node:crypto';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
export function createPublicationReceiptV2_1(input, receiptId = () => `receipt_${randomUUID()}`, now = () => new Date()) {
    const { plan, ...values } = input;
    const receipt = validateContract('publish-receipt-v2-1', {
        ...values, schema_version: '2.1', receipt_id: receiptId(), created_at: now().toISOString()
    });
    if (receipt.plan_digest !== plan.plan_digest || receipt.approval.plan_digest !== plan.plan_digest) {
        throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'V2.1 Receipt does not reference its locked Plan');
    }
    const attachments = plan.items.flatMap((item) => item.attachments.map((asset) => ({ ordinal: item.ordinal, asset })));
    const hasAttachment = attachments.length > 0;
    if (hasAttachment !== (receipt.media_evidence !== null)) {
        throw new HarnessError('PUBLIC_MEDIA_UNVERIFIED', 'V2.1 Receipt media evidence must match Plan attachment presence');
    }
    if (receipt.media_evidence !== null) {
        const planned = attachments[0];
        if (receipt.media_evidence.asset_id !== planned.asset.asset_id ||
            receipt.media_evidence.source_digest !== planned.asset.digest ||
            receipt.media_evidence.target_ordinal !== planned.ordinal) {
            throw new HarnessError('PUBLIC_MEDIA_UNVERIFIED', 'V2.1 Receipt media evidence does not match the locked Plan attachment');
        }
    }
    if (receipt.status === 'finalized' &&
        receipt.media_evidence !== null &&
        (!receipt.media_evidence.source_asset_verified ||
            !receipt.media_evidence.composer_attachment_verified ||
            !receipt.media_evidence.public_media_verified ||
            receipt.media_evidence.alt_text_verified !== true)) {
        throw new HarnessError('PUBLIC_MEDIA_UNVERIFIED', 'a finalized V2.1 Receipt requires all three media evidence classes');
    }
    return receipt;
}
//# sourceMappingURL=receipt-v2-1.js.map