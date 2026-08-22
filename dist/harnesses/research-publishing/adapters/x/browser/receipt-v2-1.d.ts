import type { PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import type { ApprovalEvidenceV2, PublicResultV2, SubmissionEvidenceV2, VerificationEvidenceV2 } from './receipt-v2.js';
export type ReceiptStatusV2_1 = 'finalized' | 'partial' | 'published_media_unverified' | 'outcome_unknown' | 'failed_after_submit' | 'verification_conflict';
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
export type CreatePublicationReceiptV2_1Input = Omit<PublicationReceiptV2_1, 'schema_version' | 'receipt_id' | 'created_at'> & {
    readonly plan: PublicationPlanV2_1;
};
export declare function createPublicationReceiptV2_1(input: CreatePublicationReceiptV2_1Input, receiptId?: () => string, now?: () => Date): PublicationReceiptV2_1;
