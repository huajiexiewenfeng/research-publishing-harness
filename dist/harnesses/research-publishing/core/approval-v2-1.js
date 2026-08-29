import { randomUUID } from 'node:crypto';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { assertPublicationPlanV2_1 } from './publication-plan-v2-1.js';
import { validateContract } from './schema-validator.js';
export function computeApprovalDigestV2_1(plan) {
    return sha256({ plan_digest: plan.plan_digest, target_account: plan.intent.target_account, adapter: 'browser', mode: plan.intent.mode, action: 'publish_once' });
}
export function approvePublicationV2_1(plan, approvedBy, ttlMs, now = new Date(), approvalId = () => `approval_${randomUUID()}`) {
    assertPublicationPlanV2_1(plan);
    if (approvedBy.trim().length === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
        throw new HarnessError('CONTRACT_INVALID', 'V2.1 approval requires an approver and positive TTL');
    }
    return validateContract('approval-v2-1', {
        schema_version: '2.1', approval_id: approvalId(), plan_id: plan.plan_id,
        run_id: plan.run_id, plan_digest: plan.plan_digest,
        approval_digest: computeApprovalDigestV2_1(plan), target_account: plan.intent.target_account,
        adapter: 'browser', mode: plan.intent.mode, scope: 'publish_once', approved_by: approvedBy,
        approved_at: now.toISOString(), expires_at: new Date(now.getTime() + ttlMs).toISOString()
    });
}
export function verifyApprovalV2_1(plan, approval, now = new Date()) {
    validateContract('approval-v2-1', approval);
    assertPublicationPlanV2_1(plan);
    const matches = approval.plan_id === plan.plan_id && approval.run_id === plan.run_id &&
        approval.plan_digest === plan.plan_digest && approval.approval_digest === computeApprovalDigestV2_1(plan) &&
        approval.target_account === plan.intent.target_account && approval.adapter === 'browser' &&
        approval.mode === plan.intent.mode && approval.scope === 'publish_once';
    if (!matches || Date.parse(approval.expires_at) <= now.getTime()) {
        throw new HarnessError('APPROVAL_STALE', 'V2.1 approval is expired or does not match this publication');
    }
}
//# sourceMappingURL=approval-v2-1.js.map