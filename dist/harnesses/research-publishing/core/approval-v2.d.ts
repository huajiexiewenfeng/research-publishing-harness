import type { PublicationPlanV2 } from './publication-plan-v2.js';
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
export declare function computeApprovalDigestV2(plan: PublicationPlanV2): string;
export declare function approvePublicationV2(plan: PublicationPlanV2, approvedBy: string, ttlMs: number, now?: Date, approvalId?: () => string): ApprovalV2;
export declare function verifyApprovalV2(plan: PublicationPlanV2, approval: ApprovalV2, now?: Date): void;
