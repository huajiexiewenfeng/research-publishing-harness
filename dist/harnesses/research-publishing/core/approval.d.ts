import type { PublicationPlan } from '../branches/x-harness/x-service.js';
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
export declare function computePublicationDigest(plan: UnlockedPublicationPlan | Record<string, unknown>): string;
export declare function approvePublication(plan: PublicationPlan, approvedBy: string, ttlMs: number, now?: Date): Approval;
export declare function verifyApproval(plan: PublicationPlan, approval: Approval, now?: Date): void;
export {};
