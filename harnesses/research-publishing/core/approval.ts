import { randomUUID } from 'node:crypto';

import type { PublicationPlan } from '../branches/x-harness/x-service.js';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';

export interface Approval {
  readonly schema_version: '1.0';
  readonly approval_id: string;
  readonly run_id: string;
  readonly publication_digest: string;
  readonly target_account: string;
  readonly adapter: 'manual';
  readonly target_post_id: string | null;
  readonly scope: 'single_publication';
  readonly approved_by: string;
  readonly approved_at: string;
  readonly expires_at: string;
}

type UnlockedPublicationPlan = Omit<PublicationPlan, 'publication_digest'>;

export function computePublicationDigest(
  plan: UnlockedPublicationPlan | Record<string, unknown>
): string {
  return sha256(plan);
}

function unlockedPlan(plan: PublicationPlan): UnlockedPublicationPlan {
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== 'publication_digest')
  ) as unknown as UnlockedPublicationPlan;
}

function assertPlanDigest(plan: PublicationPlan): void {
  if (computePublicationDigest(unlockedPlan(plan)) !== plan.publication_digest) {
    throw new HarnessError('APPROVAL_STALE', 'publication content no longer matches its locked digest');
  }
}

export function approvePublication(
  plan: PublicationPlan,
  approvedBy: string,
  ttlMs: number,
  now = new Date()
): Approval {
  assertPlanDigest(plan);
  if (approvedBy.trim().length === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new HarnessError('CONTRACT_INVALID', 'approval requires an approver and positive TTL');
  }
  return validateContract<Approval>('approval', {
    schema_version: '1.0',
    approval_id: `approval_${randomUUID()}`,
    run_id: plan.run_id,
    publication_digest: plan.publication_digest,
    target_account: plan.target_account,
    adapter: plan.adapter,
    target_post_id: plan.target_post_id,
    scope: 'single_publication',
    approved_by: approvedBy,
    approved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString()
  });
}

export function verifyApproval(plan: PublicationPlan, approval: Approval, now = new Date()): void {
  validateContract<Approval>('approval', approval);
  assertPlanDigest(plan);
  const stale =
    approval.run_id !== plan.run_id ||
    approval.publication_digest !== plan.publication_digest ||
    approval.target_account !== plan.target_account ||
    approval.adapter !== plan.adapter ||
    approval.target_post_id !== plan.target_post_id ||
    approval.scope !== 'single_publication';
  const expiry = Date.parse(approval.expires_at);
  if (stale || !Number.isFinite(expiry) || expiry <= now.getTime()) {
    throw new HarnessError('APPROVAL_STALE', 'approval is expired or does not match this publication');
  }
}
