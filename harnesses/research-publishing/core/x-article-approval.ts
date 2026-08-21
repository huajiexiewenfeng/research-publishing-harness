import { randomUUID } from 'node:crypto';

import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import {
  assertXArticlePublicationPlan,
  type XArticlePublicationPlanV1
} from './x-article-publication-plan.js';

export interface XArticleApprovalV1 {
  readonly schema_version: '1.0';
  readonly approval_id: string;
  readonly plan_id: string;
  readonly run_id: string;
  readonly plan_digest: string;
  readonly approval_digest: string;
  readonly target_account: string;
  readonly adapter: 'browser';
  readonly audience: 'everyone';
  readonly scope: 'publish_once';
  readonly approved_by: string;
  readonly approved_at: string;
  readonly expires_at: string;
}

export function computeXArticleApprovalDigest(plan: XArticlePublicationPlanV1): string {
  return sha256({
    plan_digest: plan.plan_digest,
    target_account: plan.intent.target_account,
    adapter: plan.intent.adapter,
    audience: plan.intent.audience,
    action: plan.intent.action
  });
}

export function approveXArticlePublication(
  plan: XArticlePublicationPlanV1,
  approvedBy: string,
  ttlMs: number,
  now = new Date(),
  approvalId: () => string = () => `x_article_approval_${randomUUID()}`
): XArticleApprovalV1 {
  assertXArticlePublicationPlan(plan);
  if (approvedBy.trim().length === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new HarnessError('CONTRACT_INVALID', 'X Article approval requires an approver and positive TTL');
  }
  return validateContract<XArticleApprovalV1>('x-article-approval', {
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

export function verifyXArticleApproval(
  plan: XArticlePublicationPlanV1,
  approval: XArticleApprovalV1,
  now = new Date()
): void {
  assertXArticlePublicationPlan(plan);
  validateContract<XArticleApprovalV1>('x-article-approval', approval);
  const matches =
    approval.plan_id === plan.plan_id && approval.run_id === plan.run_id &&
    approval.plan_digest === plan.plan_digest &&
    approval.approval_digest === computeXArticleApprovalDigest(plan) &&
    approval.target_account === plan.intent.target_account &&
    approval.adapter === 'browser' && approval.audience === 'everyone' &&
    approval.scope === 'publish_once';
  if (!matches || Date.parse(approval.expires_at) <= now.getTime()) {
    throw new HarnessError('APPROVAL_STALE', 'X Article approval is expired or does not match this publication');
  }
}
