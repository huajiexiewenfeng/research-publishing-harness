import type { XArticleVisualBindingV1 } from '../../core/x-article-publication-plan.js';
import type { XArticleDocumentV1 } from './article-document.js';
export interface XArticleEditorialRemovalV1 {
    readonly block_ordinal: number;
    readonly block_digest: `sha256:${string}`;
    readonly text: string;
    readonly reason: 'draft_status' | 'evidence_review_date';
}
export interface XArticlePublicationPreflightV1 {
    readonly schema_version: 'x-article-publication-preflight/v1';
    readonly source_document_digest: `sha256:${string}`;
    readonly sanitized_document: XArticleDocumentV1;
    readonly sanitized_document_digest: `sha256:${string}`;
    readonly removals: readonly XArticleEditorialRemovalV1[];
    readonly cover: {
        readonly asset_id: string;
        readonly asset_digest: `sha256:${string}`;
        readonly alt_text: string;
    };
    readonly inline_assets: readonly {
        readonly asset_id: string;
        readonly block_ordinal: number;
        readonly asset_digest: `sha256:${string}`;
        readonly alt_text: string;
    }[];
    readonly preflight_digest: `sha256:${string}`;
}
export interface CreateXArticlePublicationPreflightInput {
    readonly document: XArticleDocumentV1;
    readonly visuals: readonly XArticleVisualBindingV1[];
}
export declare function createXArticlePublicationPreflight(input: CreateXArticlePublicationPreflightInput): XArticlePublicationPreflightV1;
export declare function assertXArticlePublicationPreflight(preflight: XArticlePublicationPreflightV1): void;
