import type { VisualAssetRef } from './types.js';
import type { XArticleDocumentV1 } from '../branches/x-article-harness/article-document.js';
export interface XArticleVisualBindingV1 {
    readonly asset: VisualAssetRef;
    readonly placement: {
        readonly kind: 'cover';
    } | {
        readonly kind: 'block';
        readonly block_ordinal: number;
    };
}
export interface XArticlePublicationIntentV1 {
    readonly schema_version: '1.0';
    readonly platform: 'x';
    readonly target_account: string;
    readonly adapter: 'browser';
    readonly audience: 'everyone';
    readonly action: 'publish_once';
    readonly article_package: {
        readonly root: string;
        readonly digest: string;
    };
    readonly document: XArticleDocumentV1;
    readonly visuals: readonly XArticleVisualBindingV1[];
}
export interface XArticlePublicationPlanV1 {
    readonly schema_version: '1.0';
    readonly plan_id: string;
    readonly run_id: string;
    readonly intent: XArticlePublicationIntentV1;
    readonly plan_digest: string;
    readonly planned_at: string;
    readonly provenance: Readonly<Record<string, string>>;
}
export interface CreateXArticlePublicationPlanInput {
    readonly planId: string;
    readonly runId: string;
    readonly targetAccount: string;
    readonly articlePackage: {
        readonly root: string;
        readonly digest: string;
    };
    readonly document: XArticleDocumentV1;
    readonly visuals: readonly XArticleVisualBindingV1[];
    readonly plannedAt: string;
    readonly provenance: Readonly<Record<string, string>>;
}
export declare function assertXArticlePublicationPlan(plan: XArticlePublicationPlanV1): void;
export declare function createXArticlePublicationPlan(input: CreateXArticlePublicationPlanInput): XArticlePublicationPlanV1;
