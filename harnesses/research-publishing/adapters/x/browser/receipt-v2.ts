import { randomUUID } from 'node:crypto';

import { HarnessError } from '../../../core/errors.js';
import type { PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import { validateContract } from '../../../core/schema-validator.js';
import type { VerifiedPost } from './public-verifier.js';

export type ReceiptStatusV2 =
  | 'finalized'
  | 'partial'
  | 'published_unverified'
  | 'outcome_unknown'
  | 'failed_after_submit'
  | 'verification_conflict';

export interface ApprovalEvidenceV2 {
  readonly plan_digest: string;
  readonly approval_digest: string;
  readonly approved_at: string;
  readonly expires_at: string;
}

export interface SubmissionEvidenceV2 {
  readonly armed_at: string;
  readonly attempted_at: string;
  readonly submit_command_count: 1;
  readonly page_contract_version: string;
  readonly executor_version: string;
}

export interface PublicResultV2 {
  readonly root_url: string;
  readonly published_at: string;
  readonly ordered_post_ids: readonly string[];
  readonly posts: readonly VerifiedPost[];
  readonly matched_ordinals: readonly number[];
  readonly missing_ordinals: readonly number[];
  readonly unexpected_post_ids: readonly string[];
}

export interface VerificationEvidenceV2 {
  readonly source: 'browser_public_page' | 'x_api_crosscheck' | 'user_report';
  readonly strength: 'public_browser_verified' | 'user_asserted' | 'unverified';
  readonly verified_at: string | null;
  readonly account_match: boolean;
  readonly count_match: boolean;
  readonly content_match: boolean;
  readonly order_match: boolean;
  readonly reply_chain_match: boolean;
  readonly links_match: boolean;
  readonly unique_post_ids: boolean;
  readonly evidence_digest: string;
}

export interface PublicationReceiptV2 {
  readonly schema_version: '2.0';
  readonly receipt_id: string;
  readonly supersedes_receipt_id: string | null;
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly run_id: string;
  readonly platform: 'x';
  readonly adapter: 'browser' | 'manual';
  readonly status: ReceiptStatusV2;
  readonly target_account: string;
  readonly observed_account: string | null;
  readonly approval: ApprovalEvidenceV2;
  readonly submission: SubmissionEvidenceV2;
  readonly public_result: PublicResultV2 | null;
  readonly verification: VerificationEvidenceV2;
  readonly created_at: string;
}

export type CreatePublicationReceiptV2Input = Omit<
  PublicationReceiptV2,
  'schema_version' | 'receipt_id' | 'created_at'
> & { readonly plan: PublicationPlanV2 };

export function createPublicationReceiptV2(
  input: CreatePublicationReceiptV2Input,
  receiptId: () => string = () => `receipt_${randomUUID()}`,
  now: () => Date = () => new Date()
): PublicationReceiptV2 {
  const { plan, ...receiptInput } = input;
  const receipt = validateContract<PublicationReceiptV2>('publish-receipt-v2', {
    ...receiptInput,
    schema_version: '2.0',
    receipt_id: receiptId(),
    created_at: now().toISOString()
  });
  if (receipt.status === 'finalized') assertFinalReceiptV2(receipt, plan);
  return receipt;
}

export function assertFinalReceiptV2(
  receipt: PublicationReceiptV2,
  plan: PublicationPlanV2
): void {
  validateContract<PublicationReceiptV2>('publish-receipt-v2', receipt);
  const publicResult = receipt.public_result;
  if (
    receipt.status !== 'finalized' ||
    receipt.adapter !== 'browser' ||
    publicResult === null ||
    receipt.target_account.toLowerCase() !== plan.intent.target_account.toLowerCase() ||
    receipt.observed_account?.toLowerCase() !== plan.intent.target_account.toLowerCase() ||
    receipt.approval.plan_digest !== plan.plan_digest ||
    receipt.submission.submit_command_count !== 1
  ) {
    throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Final Receipt identity or submission evidence is invalid');
  }
  const ids = publicResult.ordered_post_ids;
  const numericUniqueIds =
    ids.every((id) => /^\d+$/.test(id)) && new Set(ids).size === ids.length;
  const orderedPostsMatch =
    ids.length === plan.items.length &&
    publicResult.posts.length === plan.items.length &&
    publicResult.posts.every((post, index) =>
      post.ordinal === index + 1 &&
      post.post_id === ids[index] &&
      post.observed_digest === plan.items[index]?.digest &&
      (index === 0
        ? post.reply_to_id === (plan.intent.mode === 'reply' ? plan.intent.target_post?.id ?? null : null)
        : post.reply_to_id === ids[index - 1])
    );
  const complete =
    publicResult.root_url === publicResult.posts[0]?.canonical_url &&
    publicResult.matched_ordinals.join(',') === plan.items.map((item) => item.ordinal).join(',') &&
    publicResult.missing_ordinals.length === 0 &&
    publicResult.unexpected_post_ids.length === 0;
  const verification = receipt.verification;
  const strongVerification =
    verification.source === 'browser_public_page' &&
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
    verification.verified_at!,
    receipt.created_at
  ].map(Date.parse);
  const orderedTimes = times.every(
    (value, index) => Number.isFinite(value) && (index === 0 || value >= times[index - 1]!)
  );
  const approvalValidAtSubmit =
    Date.parse(receipt.submission.armed_at) < Date.parse(receipt.approval.expires_at) &&
    Date.parse(receipt.submission.attempted_at) < Date.parse(receipt.approval.expires_at);
  if (
    !numericUniqueIds ||
    !orderedPostsMatch ||
    !complete ||
    !strongVerification ||
    !orderedTimes ||
    !approvalValidAtSubmit
  ) {
    throw new HarnessError('PUBLIC_VERIFICATION_CONFLICT', 'Final Receipt public evidence is incomplete or inconsistent');
  }
}
