export type PublicationAdapterV2 = 'manual' | 'browser';
export type XPublicationMode = 'single' | 'thread' | 'reply';
export interface PublicationItemV2 {
    readonly ordinal: number;
    readonly text: string;
    readonly digest: string;
    readonly reply_to?: 'previous' | 'target';
}
export interface PublicationTargetPostV2 {
    readonly id: string;
    readonly url: string;
    readonly author: string;
    readonly snapshot_digest: string;
}
export interface PublicationMediaV2 {
    readonly kind: 'image' | 'video' | 'gif';
    readonly digest: string;
}
export interface PublicationIntentV2 {
    readonly schema_version: '2.0';
    readonly platform: 'x';
    readonly target_account: string;
    readonly adapter: PublicationAdapterV2;
    readonly mode: XPublicationMode;
    readonly target_post: PublicationTargetPostV2 | null;
    readonly media: readonly PublicationMediaV2[];
    readonly items: readonly PublicationItemV2[];
    readonly action: 'publish_once';
}
export interface PublicationPlanV2 {
    readonly schema_version: '2.0';
    readonly plan_id: string;
    readonly run_id: string;
    readonly intent: PublicationIntentV2;
    readonly items: readonly PublicationItemV2[];
    readonly plan_digest: string;
    readonly planned_at: string;
    readonly provenance: Readonly<Record<string, string>>;
}
export interface CreatePublicationPlanV2Input {
    readonly planId: string;
    readonly runId: string;
    readonly targetAccount: string;
    readonly adapter: PublicationAdapterV2;
    readonly mode: XPublicationMode;
    readonly targetPost: PublicationTargetPostV2 | null;
    readonly media: readonly PublicationMediaV2[];
    readonly items: ReadonlyArray<{
        readonly ordinal: number;
        readonly text: string;
        readonly reply_to?: 'previous' | 'target';
    }>;
    readonly plannedAt: string;
    readonly provenance: Readonly<Record<string, string>>;
}
export declare function normalizePublicationText(text: string): string;
export declare function createPublicationPlanV2(input: CreatePublicationPlanV2Input): PublicationPlanV2;
export declare function assertPublicationPlanV2(plan: PublicationPlanV2): void;
