import type { PublicationBundleApprovalV1, PublicationBundlePlanV1 } from './publication-bundle-types.js';
import type { GateResult } from './types.js';
export declare function runPublicationBundlePublishGate(plan: PublicationBundlePlanV1, approval: PublicationBundleApprovalV1 | undefined, now: Date): GateResult;
