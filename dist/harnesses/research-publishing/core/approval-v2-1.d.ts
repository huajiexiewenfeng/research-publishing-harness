import { type PublicationPlanV2_1 } from './publication-plan-v2-1.js';
export interface ApprovalV2_1 {
    readonly schema_version: '2.1';
    readonly approval_id: string;
    readonly plan_id: string;
    readonly run_id: string;
    readonly plan_digest: string;
    readonly approval_digest: string;
    readonly target_account: string;
    readonly adapter: 'browser';
    readonly mode: 'single' | 'thread' | 'reply';
    readonly scope: 'publish_once';
    readonly approved_by: string;
    readonly approved_at: string;
    readonly expires_at: string;
}
export declare function computeApprovalDigestV2_1(plan: PublicationPlanV2_1): string;
export declare function approvePublicationV2_1(plan: PublicationPlanV2_1, approvedBy: string, ttlMs: number, now?: Date, approvalId?: () => string): ApprovalV2_1;
export declare function verifyApprovalV2_1(plan: PublicationPlanV2_1, approval: ApprovalV2_1, now?: Date): void;
