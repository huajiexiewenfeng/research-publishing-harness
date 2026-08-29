import type { XArticleBlockV1 } from '../../../branches/x-article-harness/article-document.js';
import type { XArticleMaterializationPlanV1 } from '../../../core/x-article-materialization.js';
import { type XArticlePublicationPlanV1 } from '../../../core/x-article-publication-plan.js';
import type { XArticleBrowserCommandV1 } from './article-command-broker.js';
import { type XArticleBrowserObservation, type XArticleBrowserObservationInput, type XArticleControlObservation } from './article-browser-protocol.js';
export interface XArticleHostMediaV1 {
    readonly ref: string;
    readonly alt_text: string | null;
    readonly status: 'processing' | 'uploaded' | 'failed';
}
export type XArticleHostPageBlockV1 = Exclude<XArticleBlockV1, {
    readonly kind: 'image';
}> | {
    readonly kind: 'visual_anchor';
    readonly marker: string;
} | {
    readonly kind: 'media';
    readonly ref: string;
    readonly block_ordinal: number;
    readonly alt_text: string | null;
    readonly status: 'processing' | 'uploaded' | 'failed';
};
export interface XArticleHostPageSnapshotV1 {
    readonly schema_version: 'x-article-host-page-snapshot/v1';
    readonly canonical_url: string;
    readonly account_handle: string | null;
    readonly page_kind: 'article_editor';
    readonly controls: readonly XArticleControlObservation[];
    readonly editor: {
        readonly draft_id: string;
        readonly title: string;
        readonly blocks: readonly XArticleHostPageBlockV1[];
        readonly cover: XArticleHostMediaV1 | null;
        readonly autosave_state: 'saving' | 'saved' | 'failed';
        readonly has_unknown_content: boolean;
    };
}
export interface XArticleHostObservationContextV1 {
    readonly publication_plan: XArticlePublicationPlanV1;
    readonly materialization_plan: XArticleMaterializationPlanV1;
}
export interface BuildXArticleHostObservationInputV1 {
    readonly command: XArticleBrowserCommandV1;
    readonly context: XArticleHostObservationContextV1;
    readonly page_snapshot: XArticleHostPageSnapshotV1;
    readonly previous_observation: XArticleBrowserObservation | null;
    readonly observation_id: string;
    readonly observed_at: string;
}
declare function pageStateBody(input: Pick<XArticleBrowserObservationInput, 'origin' | 'canonical_url' | 'account_handle' | 'page_kind' | 'controls' | 'editor' | 'preview' | 'publish_review' | 'public_article'>): object;
export declare function computeXArticlePageStateRevision(input: Parameters<typeof pageStateBody>[0]): `sha256:${string}`;
export declare function buildXArticleHostObservation(input: BuildXArticleHostObservationInputV1): XArticleBrowserObservation;
export {};
