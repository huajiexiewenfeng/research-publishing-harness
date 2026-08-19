import { randomUUID } from 'node:crypto';

import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import type { PublicationPlanV2 } from './publication-plan-v2.js';
import { assertPublicationPlanV2 } from './publication-plan-v2.js';
import { validateContract } from './schema-validator.js';

export interface ApprovalV2 {
  readonly schema_version: '2.0';
  readonly approval_id: string;
  readonly plan_id: string;
  readonly run_id: string;
  readonly plan_digest: string;
  readonly approval_digest: string;
  readonly target_account: string;
  readonly adapter: 'browser' | 'manual';
  readonly mode: 'single' | 'thread' | 'reply';
  readonly scope: 'publish_once';
  readonly approved_by: string;
  readonly approved_at: string;
  readonly expires_at: string;
}

export function computeApprovalDigestV2(plan: PublicationPlanV2): string {
  return sha256({
    plan_digest: plan.plan_digest,
    target_account: plan.intent.target_account,
    adapter: plan.intent.adapter,
    mode: plan.intent.mode,
    action: 'publish_once'
  });
}

export function approvePublicationV2(
  plan: PublicationPlanV2,
  approvedBy: string,
  ttlMs: number,
  now = new Date(),
  approvalId: () => string = () => `approval_${randomUUID()}`
): ApprovalV2 {
  assertPublicationPlanV2(plan);
  if (approvedBy.trim().length === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new HarnessError('CONTRACT_INVALID', 'V2 approval requires an approver and positive TTL');
  }
  return validateContract<ApprovalV2>('approval-v2', {
    schema_version: '2.0',
    approval_id: approvalId(),
    plan_id: plan.plan_id,
    run_id: plan.run_id,
    plan_digest: plan.plan_digest,
    approval_digest: computeApprovalDigestV2(plan),
    target_account: plan.intent.target_account,
    adapter: plan.intent.adapter,
    mode: plan.intent.mode,
    scope: 'publish_once',
    approved_by: approvedBy,
    approved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString()
  });
}

export function verifyApprovalV2(
  plan: PublicationPlanV2,
  approval: ApprovalV2,
  now = new Date()
): void {
  validateContract<ApprovalV2>('approval-v2', approval);
  assertPublicationPlanV2(plan);
  const matches =
    approval.plan_id === plan.plan_id &&
    approval.run_id === plan.run_id &&
    approval.plan_digest === plan.plan_digest &&
    approval.approval_digest === computeApprovalDigestV2(plan) &&
    approval.target_account === plan.intent.target_account &&
    approval.adapter === plan.intent.adapter &&
    approval.mode === plan.intent.mode &&
    approval.scope === 'publish_once';
  if (!matches || Date.parse(approval.expires_at) <= now.getTime()) {
    throw new HarnessError(
      'APPROVAL_STALE',
      'V2 approval is expired or does not match this publication'
    );
  }
}
