import type { VisualAssetRef } from '../../core/types.js';
export type XArticleInlineMarkV1 = 'bold' | 'italic';
export interface XArticleInlineRunV1 {
    readonly text: string;
    readonly marks: readonly XArticleInlineMarkV1[];
    readonly link: string | null;
}
export type XArticleBlockV1 = {
    readonly kind: 'heading' | 'subheading' | 'paragraph' | 'quote';
    readonly runs: readonly XArticleInlineRunV1[];
} | {
    readonly kind: 'bullet_list' | 'ordered_list';
    readonly items: readonly (readonly XArticleInlineRunV1[])[];
} | {
    readonly kind: 'image';
    readonly asset_id: string;
    readonly alt_text: string;
};
export interface XArticleDocumentV1 {
    readonly schema_version: '1.0';
    readonly title: string;
    readonly cover_asset_id: string | null;
    readonly blocks: readonly XArticleBlockV1[];
}
export interface XArticleCompilerVisual {
    readonly asset: VisualAssetRef;
    readonly placement: {
        readonly kind: 'cover';
    } | {
        readonly kind: 'after_section';
        readonly section_id: string;
    };
}
export interface CompileXArticleDocumentInput {
    readonly markdown: string;
    readonly visuals: readonly XArticleCompilerVisual[];
}
