import { type PublicationTargetPostV2, type XPublicationMode } from './publication-plan-v2.js';
import type { VisualAssetRef } from './types.js';
export interface PublicationItemV2_1 {
    readonly ordinal: number;
    readonly text: string;
    readonly digest: string;
    readonly reply_to?: 'previous' | 'target';
    readonly attachments: readonly VisualAssetRef[];
}
export interface PublicationIntentV2_1 {
    readonly schema_version: '2.1';
    readonly platform: 'x';
    readonly target_account: string;
    readonly adapter: 'browser';
    readonly mode: XPublicationMode;
    readonly target_post: PublicationTargetPostV2 | null;
    readonly quote_post?: PublicationTargetPostV2;
    readonly items: readonly PublicationItemV2_1[];
    readonly action: 'publish_once';
}
export interface PublicationPlanV2_1 {
    readonly schema_version: '2.1';
    readonly plan_id: string;
    readonly run_id: string;
    readonly intent: PublicationIntentV2_1;
    readonly items: readonly PublicationItemV2_1[];
    readonly plan_digest: string;
    readonly planned_at: string;
    readonly provenance: Readonly<Record<string, string>>;
    readonly article_package: {
        readonly root: string;
        readonly digest: string;
    } | null;
}
export interface CreatePublicationPlanV2_1Input {
    readonly planId: string;
    readonly runId: string;
    readonly targetAccount: string;
    readonly mode: XPublicationMode;
    readonly targetPost: PublicationTargetPostV2 | null;
    readonly quotePost?: PublicationTargetPostV2;
    readonly items: ReadonlyArray<{
        readonly ordinal: number;
        readonly text: string;
        readonly reply_to?: 'previous' | 'target';
        readonly attachments: readonly VisualAssetRef[];
    }>;
    readonly articlePackage: {
        readonly root: string;
        readonly digest: string;
    } | null;
    readonly authorizedAsset: VisualAssetRef | null;
    readonly plannedAt: string;
    readonly provenance: Readonly<Record<string, string>>;
}
export declare function createPublicationPlanV2_1(input: CreatePublicationPlanV2_1Input): PublicationPlanV2_1;
export declare function assertPublicationPlanV2_1(plan: PublicationPlanV2_1): void;
