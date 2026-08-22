import { randomUUID } from 'node:crypto';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
export function createPublicationReceiptV2(input, receiptId = () => `receipt_${randomUUID()}`, now = () => new Date()) {
    const { plan, ...receiptInput } = input;
    const receipt = validateContract('publish-receipt-v2', {
        ...receiptInput,
        schema_version: '2.0',
        receipt_id: receiptId(),
        created_at: now().toISOString()
    });
    if (receipt.status === 'finalized')
        assertFinalReceiptV2(receipt, plan);
    return receipt;
}
export function assertFinalReceiptV2(receipt, plan) {
    validateContract('publish-receipt-v2', receipt);
    const publicResult = receipt.public_result;
    if (receipt.status !== 'finalized' ||
        receipt.adapter !== 'browser' ||
        publicResult === null ||
        receipt.target_account.toLowerCase() !== plan.intent.target_account.toLowerCase() ||
        receipt.observed_account?.toLowerCase() !== plan.intent.target_account.toLowerCase() ||
        receipt.approval.plan_digest !== plan.plan_digest ||
        receipt.submission.submit_command_count !== 1) {
        throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Final Receipt identity or submission evidence is invalid');
    }
    const ids = publicResult.ordered_post_ids;
    const numericUniqueIds = ids.every((id) => /^\d+$/.test(id)) && new Set(ids).size === ids.length;
    const orderedPostsMatch = ids.length === plan.items.length &&
        publicResult.posts.length === plan.items.length &&
        publicResult.posts.every((post, index) => post.ordinal === index + 1 &&
            post.post_id === ids[index] &&
            post.observed_digest === plan.items[index]?.digest &&
            (index === 0
                ? post.reply_to_id === (plan.intent.mode === 'reply' ? plan.intent.target_post?.id ?? null : null)
                : post.reply_to_id === ids[index - 1]));
    const complete = publicResult.root_url === publicResult.posts[0]?.canonical_url &&
        publicResult.matched_ordinals.join(',') === plan.items.map((item) => item.ordinal).join(',') &&
        publicResult.missing_ordinals.length === 0 &&
        publicResult.unexpected_post_ids.length === 0;
    const verification = receipt.verification;
    const strongVerification = verification.source === 'browser_public_page' &&
        verification.strength === 'public_browser_verified' &&
        verification.verified_at !== null &&
        verification.account_match &&
        verification.count_match &&
        verification.content_match &&
        verification.order_match &&
        verification.reply_chain_match &&
        verification.links_match &&
        verification.unique_post_ids;
    const times = [
        receipt.approval.approved_at,
        receipt.submission.armed_at,
        receipt.submission.attempted_at,
        publicResult.published_at,
        verification.verified_at,
        receipt.created_at
    ].map(Date.parse);
    const orderedTimes = times.every((value, index) => Number.isFinite(value) && (index === 0 || value >= times[index - 1]));
    const approvalValidAtSubmit = Date.parse(receipt.submission.armed_at) < Date.parse(receipt.approval.expires_at) &&
        Date.parse(receipt.submission.attempted_at) < Date.parse(receipt.approval.expires_at);
    if (!numericUniqueIds ||
        !orderedPostsMatch ||
        !complete ||
        !strongVerification ||
        !orderedTimes ||
        !approvalValidAtSubmit) {
        throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Final Receipt public evidence is incomplete or inconsistent');
    }
}
//# sourceMappingURL=receipt-v2.js.map