import type { PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import type { VerifiedPost } from './public-verifier.js';
export type ReceiptStatusV2 = 'finalized' | 'partial' | 'published_unverified' | 'outcome_unknown' | 'failed_after_submit' | 'verification_conflict';
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
export type CreatePublicationReceiptV2Input = Omit<PublicationReceiptV2, 'schema_version' | 'receipt_id' | 'created_at'> & {
    readonly plan: PublicationPlanV2;
};
export declare function createPublicationReceiptV2(input: CreatePublicationReceiptV2Input, receiptId?: () => string, now?: () => Date): PublicationReceiptV2;
export declare function assertFinalReceiptV2(receipt: PublicationReceiptV2, plan: PublicationPlanV2): void;
