import { randomUUID } from 'node:crypto';

import { HarnessError } from '../../../core/errors.js';
import type { PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import { validateContract } from '../../../core/schema-validator.js';
import type {
  ApprovalEvidenceV2,
  PublicResultV2,
  SubmissionEvidenceV2,
  VerificationEvidenceV2
} from './receipt-v2.js';

export type ReceiptStatusV2_1 =
  | 'finalized'
  | 'partial'
  | 'published_media_unverified'
  | 'outcome_unknown'
  | 'failed_after_submit'
  | 'verification_conflict';

export interface MediaEvidenceV2_1 {
  readonly asset_id: string;
  readonly source_digest: `sha256:${string}`;
  readonly source_asset_verified: boolean;
  readonly composer_attachment_verified: boolean;
  readonly public_media_verified: boolean;
  readonly target_ordinal: number;
  readonly alt_text_verified: boolean | null;
  readonly public_media_url: string | null;
  readonly limitations: readonly string[];
}

export interface PublicationReceiptV2_1 {
  readonly schema_version: '2.1';
  readonly receipt_id: string;
  readonly supersedes_receipt_id: string | null;
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly run_id: string;
  readonly platform: 'x';
  readonly adapter: 'browser';
  readonly status: ReceiptStatusV2_1;
  readonly target_account: string;
  readonly observed_account: string | null;
  readonly plan_digest: string;
  readonly approval: ApprovalEvidenceV2;
  readonly submission: SubmissionEvidenceV2;
  readonly public_result: PublicResultV2 | null;
  readonly verification: VerificationEvidenceV2;
  readonly media_evidence: MediaEvidenceV2_1 | null;
  readonly created_at: string;
}

export type CreatePublicationReceiptV2_1Input = Omit<PublicationReceiptV2_1, 'schema_version' | 'receipt_id' | 'created_at'> & { readonly plan: PublicationPlanV2_1 };

export function createPublicationReceiptV2_1(
  input: CreatePublicationReceiptV2_1Input,
  receiptId: () => string = () => `receipt_${randomUUID()}`,
  now: () => Date = () => new Date()
): PublicationReceiptV2_1 {
  const { plan, ...values } = input;
  const receipt = validateContract<PublicationReceiptV2_1>('publish-receipt-v2-1', {
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
    const planned = attachments[0]!;
    if (receipt.media_evidence.asset_id !== planned.asset.asset_id ||
      receipt.media_evidence.source_digest !== planned.asset.digest ||
      receipt.media_evidence.target_ordinal !== planned.ordinal) {
      throw new HarnessError('PUBLIC_MEDIA_UNVERIFIED', 'V2.1 Receipt media evidence does not match the locked Plan attachment');
    }
  }
  if (
    receipt.status === 'finalized' &&
    receipt.media_evidence !== null &&
    (!receipt.media_evidence.source_asset_verified ||
      !receipt.media_evidence.composer_attachment_verified ||
      !receipt.media_evidence.public_media_verified ||
      receipt.media_evidence.alt_text_verified !== true)
  ) {
    throw new HarnessError('PUBLIC_MEDIA_UNVERIFIED', 'a finalized V2.1 Receipt requires all three media evidence classes');
  }
  return receipt;
}
