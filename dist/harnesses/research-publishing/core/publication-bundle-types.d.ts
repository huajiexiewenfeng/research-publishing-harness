import type { ApprovalV2_1 } from './approval-v2-1.js';
import type { ApprovalV2 } from './approval-v2.js';
import type { PublicationPlanV2_1 } from './publication-plan-v2-1.js';
import type { PublicationPlanV2 } from './publication-plan-v2.js';
import type { ResearchArtifactRefV1 } from './research-program-types.js';
import type { VisualAssetRef } from './types.js';
import type { XArticleApprovalV1 } from './x-article-approval.js';
import type { XArticlePublicationPlanV1 } from './x-article-publication-plan.js';
export type BundleDigest = `sha256:${string}`;
export interface PublicationBundleSingleIntentV1 {
    readonly run_id: string;
    readonly target_account: string;
    readonly language: 'en';
    readonly content_type: 'anchor';
    readonly text_template: string;
    readonly claim_refs: readonly string[];
    readonly visual_asset: VisualAssetRef | null;
    readonly article_package: {
        readonly root: string;
        readonly digest: BundleDigest;
    };
}
export interface PublicationBundlePlanV1 {
    readonly schema_version: 'publication-bundle-plan/v1';
    readonly bundle_id: string;
    readonly cycle_id: string;
    readonly cycle_ref: ResearchArtifactRefV1;
    readonly selection_ref: ResearchArtifactRefV1;
    readonly research_content_package_ref: ResearchArtifactRefV1;
    readonly canonical_article_package: {
        readonly root: string;
        readonly package_digest: BundleDigest;
        readonly package_ref: ResearchArtifactRefV1;
    };
    readonly article_plan: XArticlePublicationPlanV1;
    readonly single_intent: PublicationBundleSingleIntentV1;
    readonly substitution: {
        readonly token: '{{X_ARTICLE_URL}}';
        readonly rule: 'verified-x-article-canonical-url/v1';
    };
    readonly execution_order: readonly ['x_article', 'x_single'];
    readonly authorization_ttl_ms: number;
    readonly action: 'publish_bundle_once';
    readonly policy_version: 'research-program-policy/v1';
    readonly planned_at: string;
    readonly bundle_digest: BundleDigest;
}
export interface PlanPublicationBundleInput {
    readonly bundle_id: string;
    readonly cycle_id: string;
    readonly cycle_ref: ResearchArtifactRefV1;
    readonly selection_ref: ResearchArtifactRefV1;
    readonly research_content_package_ref: ResearchArtifactRefV1;
    readonly canonical_article_package: PublicationBundlePlanV1['canonical_article_package'];
    readonly article_plan: XArticlePublicationPlanV1;
    readonly single_intent: PublicationBundleSingleIntentV1;
    readonly authorization_ttl_ms?: number;
    readonly planned_at: string;
}
export interface PublicationBundleApprovalV1 {
    readonly schema_version: 'publication-bundle-approval/v1';
    readonly approval_id: string;
    readonly bundle_id: string;
    readonly bundle_digest: BundleDigest;
    readonly target_account: string;
    readonly scope: 'publish_bundle_once';
    readonly approved_by: string;
    readonly approved_at: string;
    readonly expires_at: string;
    readonly approval_digest: BundleDigest;
}
export interface ApprovePublicationBundleInput {
    readonly bundle_id: string;
    readonly confirmed_bundle_digest: BundleDigest;
    readonly approved_by: string;
}
export type PublicationBundlePhase = 'planned' | 'approved' | 'article_authorized' | 'article_in_progress' | 'article_outcome_unknown' | 'article_verification_conflict' | 'article_terminal_failure' | 'article_verified' | 'single_materialized' | 'single_authorized' | 'single_in_progress' | 'single_outcome_unknown' | 'single_verification_conflict' | 'single_terminal_failure' | 'approval_expired' | 'completed';
export interface PublicationBundleStatusV1 {
    readonly schema_version: 'publication-bundle-status/v1';
    readonly bundle_id: string;
    readonly cycle_id: string;
    readonly bundle_plan_ref: ResearchArtifactRefV1;
    readonly phase: PublicationBundlePhase;
    readonly article_execution_binding_ref: ResearchArtifactRefV1 | null;
    readonly article_receipt_binding_ref: ResearchArtifactRefV1 | null;
    readonly single_execution_binding_ref: ResearchArtifactRefV1 | null;
    readonly single_receipt_binding_ref: ResearchArtifactRefV1 | null;
    readonly joint_receipt_ref: ResearchArtifactRefV1 | null;
    readonly limitations: readonly string[];
    readonly updated_at: string;
    readonly projection_digest: BundleDigest;
}
export interface PublicationBundleExecutionBindingV1 {
    readonly schema_version: 'publication-bundle-execution-binding/v1';
    readonly bundle_id: string;
    readonly child_kind: 'x_article' | 'x_single';
    readonly bundle_plan_ref: ResearchArtifactRefV1;
    readonly bundle_approval_ref: ResearchArtifactRefV1;
    readonly child_authorization_ref: ResearchArtifactRefV1;
    readonly execution_id: string;
    readonly run_id: string;
    readonly plan_id: string;
    readonly plan_digest: BundleDigest;
    readonly installed_plan_ref: ResearchArtifactRefV1;
    readonly installed_approval_ref: ResearchArtifactRefV1;
    readonly bound_at: string;
    readonly binding_digest: BundleDigest;
}
export type ArticleExecutionBindingV1 = PublicationBundleExecutionBindingV1 & {
    readonly child_kind: 'x_article';
};
export type SingleExecutionBindingV1 = PublicationBundleExecutionBindingV1 & {
    readonly child_kind: 'x_single';
};
export type ArticleReceiptStatus = 'published' | 'published_media_unverified' | 'verification_conflict';
export type SingleReceiptStatus = 'finalized' | 'published_media_unverified' | 'outcome_unknown' | 'verification_conflict' | 'partial' | 'failed_after_submit';
export interface PublicationBundleReceiptBindingV1 {
    readonly schema_version: 'publication-bundle-receipt-binding/v1';
    readonly bundle_id: string;
    readonly child_kind: 'x_article' | 'x_single';
    readonly execution_binding_ref: ResearchArtifactRefV1;
    readonly child_plan_ref: ResearchArtifactRefV1;
    readonly child_plan_digest: BundleDigest;
    readonly child_receipt_ref: ResearchArtifactRefV1;
    readonly child_receipt_digest: BundleDigest;
    readonly parsed_status: ArticleReceiptStatus | SingleReceiptStatus;
    readonly canonical_public_url: string | null;
    readonly limitations: readonly string[];
    readonly bound_at: string;
    readonly binding_digest: BundleDigest;
}
export type ArticleReceiptBindingV1 = PublicationBundleReceiptBindingV1 & {
    readonly child_kind: 'x_article';
    readonly parsed_status: ArticleReceiptStatus;
};
export type SingleReceiptBindingV1 = PublicationBundleReceiptBindingV1 & {
    readonly child_kind: 'x_single';
    readonly parsed_status: SingleReceiptStatus;
};
export interface DerivedArticleAuthorizationV1 {
    readonly schema_version: 'derived-article-authorization/v1';
    readonly bundle_id: string;
    readonly bundle_plan_ref: ResearchArtifactRefV1;
    readonly bundle_approval_ref: ResearchArtifactRefV1;
    readonly child_plan_digest: BundleDigest;
    readonly child_approval: XArticleApprovalV1;
    readonly issued_at: string;
    readonly authorization_digest: BundleDigest;
}
export interface MaterializedSinglePublicationV1 {
    readonly schema_version: 'materialized-single-publication/v1';
    readonly bundle_id: string;
    readonly bundle_plan_ref: ResearchArtifactRefV1;
    readonly article_receipt_binding_ref: ResearchArtifactRefV1;
    readonly canonical_article_url: string;
    readonly final_text: string;
    readonly child_plan: PublicationPlanV2 | PublicationPlanV2_1;
    readonly materialized_at: string;
    readonly materialization_digest: BundleDigest;
}
export interface DerivedSingleAuthorizationV1 {
    readonly schema_version: 'derived-single-authorization/v1';
    readonly bundle_id: string;
    readonly bundle_plan_ref: ResearchArtifactRefV1;
    readonly bundle_approval_ref: ResearchArtifactRefV1;
    readonly materialized_single_ref: ResearchArtifactRefV1;
    readonly child_plan_digest: BundleDigest;
    readonly child_approval: ApprovalV2 | ApprovalV2_1;
    readonly issued_at: string;
    readonly authorization_digest: BundleDigest;
}
export interface PublicationBundleReceiptChildV1 {
    readonly plan_ref: ResearchArtifactRefV1;
    readonly plan_digest: BundleDigest;
    readonly receipt_ref: ResearchArtifactRefV1;
    readonly receipt_digest: BundleDigest;
    readonly status: ArticleReceiptStatus | SingleReceiptStatus;
    readonly public_url: string;
}
export interface PublicationBundleReceiptV1 {
    readonly schema_version: 'publication-bundle-receipt/v1';
    readonly bundle_id: string;
    readonly status: 'completed';
    readonly cycle_ref: ResearchArtifactRefV1;
    readonly bundle_plan_ref: ResearchArtifactRefV1;
    readonly bundle_approval_ref: ResearchArtifactRefV1;
    readonly article: PublicationBundleReceiptChildV1;
    readonly single: PublicationBundleReceiptChildV1;
    readonly public_urls: readonly [string, string];
    readonly limitations: readonly string[];
    readonly issued_at: string;
    readonly receipt_digest: BundleDigest;
}
export type CreatePublicationBundleReceiptInput = Omit<PublicationBundleReceiptV1, 'schema_version' | 'status' | 'public_urls' | 'limitations' | 'receipt_digest'>;
export interface PublicationBundleAuditV1 {
    readonly target_account: string;
    readonly article_title: string;
    readonly article_plan_digest: BundleDigest;
    readonly article_package_digest: BundleDigest;
    readonly single_template: string;
    readonly final_single_bytes_known: false;
    readonly substitution_rule: 'verified-x-article-canonical-url/v1';
    readonly visual: {
        readonly asset_id: string;
        readonly digest: BundleDigest;
        readonly alt_text: string;
    } | null;
    readonly claim_refs: readonly string[];
    readonly execution_order: readonly ['x_article', 'x_single'];
    readonly authorization_ttl_ms: number;
    readonly bundle_digest: BundleDigest;
}
export interface BindArticleExecutionInput {
    readonly bundle_id: string;
    readonly execution_id: string;
    readonly bound_at: string;
}
export type BindSingleExecutionInput = BindArticleExecutionInput;
export interface AttachArticleReceiptInput {
    readonly bundle_id: string;
    readonly receipt_path: string;
    readonly receipt_digest: BundleDigest;
}
export type AttachSingleReceiptInput = AttachArticleReceiptInput;
