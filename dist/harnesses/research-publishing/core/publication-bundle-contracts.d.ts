import type { ApprovePublicationBundleInput, PlanPublicationBundleInput, PublicationBundleApprovalV1, PublicationBundlePlanV1, PublicationBundleReceiptV1, CreatePublicationBundleReceiptInput } from './publication-bundle-types.js';
export declare const PUBLICATION_BUNDLE_TTL: {
    readonly default_ms: 7200000;
    readonly minimum_ms: 600000;
    readonly maximum_ms: 86400000;
};
export declare function createPublicationBundlePlan(input: PlanPublicationBundleInput): PublicationBundlePlanV1;
export declare function assertPublicationBundlePlan(plan: PublicationBundlePlanV1): void;
export declare function createPublicationBundleApproval(plan: PublicationBundlePlanV1, input: ApprovePublicationBundleInput, now: Date, approvalId: string): PublicationBundleApprovalV1;
export declare function assertPublicationBundleApproval(plan: PublicationBundlePlanV1, approval: PublicationBundleApprovalV1, now?: Date): void;
export declare function createPublicationBundleReceipt(input: CreatePublicationBundleReceiptInput): PublicationBundleReceiptV1;
