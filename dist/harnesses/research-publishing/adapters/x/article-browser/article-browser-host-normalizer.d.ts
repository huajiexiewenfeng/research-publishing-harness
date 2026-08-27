import type { XArticleBlockV1 } from '../../../branches/x-article-harness/article-document.js';
import type { XArticleEditorObservation, XArticleVisualObservation } from './article-browser-protocol.js';
import type { XArticleImportTemplateV1 } from './article-import-template.js';
export type XArticleHostEditorBlockV1 = XArticleBlockV1 | {
    readonly kind: 'visual_anchor';
    readonly anchor_id: string;
    readonly marker: string;
};
export interface XArticleHostEditorSnapshotV1 {
    readonly draft_id: string;
    readonly title: string;
    readonly blocks: readonly XArticleHostEditorBlockV1[];
    readonly visuals: readonly XArticleVisualObservation[];
    readonly has_unknown_content: boolean;
    readonly autosave_state: XArticleEditorObservation['autosave_state'];
}
export declare function normalizeXArticleHostEditor(input: {
    readonly editor: XArticleHostEditorSnapshotV1;
    readonly template: XArticleImportTemplateV1;
}): XArticleEditorObservation;
