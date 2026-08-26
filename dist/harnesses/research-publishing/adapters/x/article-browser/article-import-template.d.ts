import type { XArticleBlockV1, XArticleDocumentV1 } from '../../../branches/x-article-harness/article-document.js';
export type XArticleImportTemplateBlockV1 = Exclude<XArticleBlockV1, {
    readonly kind: 'image';
}> | {
    readonly kind: 'visual_anchor';
    readonly anchor_id: string;
    readonly marker: string;
};
export interface XArticleVisualAnchorV1 {
    readonly anchor_id: string;
    readonly asset_id: string;
    readonly block_ordinal: number;
    readonly marker: string;
}
export interface XArticleImportTemplateV1 {
    readonly schema_version: '1.0';
    readonly source_document_digest: string;
    readonly blocks: readonly XArticleImportTemplateBlockV1[];
    readonly anchors: readonly XArticleVisualAnchorV1[];
    readonly template_digest: string;
}
export declare function createXArticleImportTemplate(document: XArticleDocumentV1): XArticleImportTemplateV1;
