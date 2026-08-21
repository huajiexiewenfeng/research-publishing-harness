import type { XArticleDocumentV1 } from '../../../branches/x-article-harness/article-document.js';
import type {
  XArticleBrowserObservation,
  XArticleControlObservation,
  XArticleEditorObservation,
  XArticlePageKind,
  XArticlePreviewObservation,
  XArticlePublicObservation,
  XArticlePublishReviewObservation
} from './article-browser-protocol.js';

export type XArticleDetectedPage =
  | { readonly kind: 'articles_index' }
  | { readonly kind: 'article_editor' | 'article_preview' | 'publish_review'; readonly draft_id: string }
  | { readonly kind: 'public_article'; readonly article_id: string }
  | { readonly kind: 'login_required' | 'security_challenge' };

export type XArticleControlPurpose =
  | 'create'
  | 'title'
  | 'body'
  | 'preview'
  | 'publish'
  | 'final_publish';

export interface XArticlePageContract {
  readonly id: string;
  readonly version: string;
  detectPage(observation: XArticleBrowserObservation): XArticleDetectedPage;
  detectAccount(observation: XArticleBrowserObservation): { readonly handle: string };
  detectEditor(observation: XArticleBrowserObservation): XArticleEditorObservation;
  readEditorDocument(observation: XArticleBrowserObservation): XArticleDocumentV1;
  detectPreview(observation: XArticleBrowserObservation): XArticlePreviewObservation;
  detectPublishReview(observation: XArticleBrowserObservation): XArticlePublishReviewObservation;
  detectPublicArticle(observation: XArticleBrowserObservation): XArticlePublicObservation;
  detectControl(observation: XArticleBrowserObservation, purpose: XArticleControlPurpose): XArticleControlObservation;
}

export function documentFromEditor(editor: XArticleEditorObservation): XArticleDocumentV1 {
  const covers = editor.visuals.filter((visual) => visual.kind === 'cover');
  return {
    schema_version: '1.0',
    title: editor.title,
    cover_asset_id: covers.length === 1 ? covers[0]!.asset_id : null,
    blocks: editor.blocks
  };
}

export function pageKindNeedsDraft(kind: XArticlePageKind): boolean {
  return kind === 'article_editor' || kind === 'article_preview' || kind === 'publish_review';
}
