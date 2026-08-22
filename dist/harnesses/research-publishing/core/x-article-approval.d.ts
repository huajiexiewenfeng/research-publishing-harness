import { type XArticlePublicationPlanV1 } from './x-article-publication-plan.js';
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
export declare function computeXArticleApprovalDigest(plan: XArticlePublicationPlanV1): string;
export declare function approveXArticlePublication(plan: XArticlePublicationPlanV1, approvedBy: string, ttlMs: number, now?: Date, approvalId?: () => string): XArticleApprovalV1;
export declare function verifyXArticleApproval(plan: XArticlePublicationPlanV1, approval: XArticleApprovalV1, now?: Date): void;
