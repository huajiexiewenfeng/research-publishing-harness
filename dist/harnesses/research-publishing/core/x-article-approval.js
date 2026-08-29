import { randomUUID } from 'node:crypto';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import { assertXArticlePublicationPlan } from './x-article-publication-plan.js';
export function computeXArticleApprovalDigest(plan) {
    return sha256({
        plan_digest: plan.plan_digest,
        target_account: plan.intent.target_account,
        adapter: plan.intent.adapter,
        audience: plan.intent.audience,
        action: plan.intent.action
    });
}
export function approveXArticlePublication(plan, approvedBy, ttlMs, now = new Date(), approvalId = () => `x_article_approval_${randomUUID()}`) {
    assertXArticlePublicationPlan(plan);
    if (approvedBy.trim().length === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article approval requires an approver and positive TTL');
    }
    return validateContract('x-article-approval', {
        schema_version: '1.0',
        approval_id: approvalId(),
        plan_id: plan.plan_id,
        run_id: plan.run_id,
        plan_digest: plan.plan_digest,
        approval_digest: computeXArticleApprovalDigest(plan),
        target_account: plan.intent.target_account,
        adapter: 'browser',
        audience: 'everyone',
        scope: 'publish_once',
        approved_by: approvedBy,
        approved_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlMs).toISOString()
    });
}
export function verifyXArticleApproval(plan, approval, now = new Date()) {
    assertXArticlePublicationPlan(plan);
    validateContract('x-article-approval', approval);
    const matches = approval.plan_id === plan.plan_id && approval.run_id === plan.run_id &&
        approval.plan_digest === plan.plan_digest &&
        approval.approval_digest === computeXArticleApprovalDigest(plan) &&
        approval.target_account === plan.intent.target_account &&
        approval.adapter === 'browser' && approval.audience === 'everyone' &&
        approval.scope === 'publish_once';
    if (!matches || Date.parse(approval.expires_at) <= now.getTime()) {
        throw new HarnessError('APPROVAL_STALE', 'X Article approval is expired or does not match this publication');
    }
}
//# sourceMappingURL=x-article-approval.js.map