import { sha256 } from '../../../core/digest.js';
import type { XArticleBlockV1 } from '../../../branches/x-article-harness/article-document.js';

export type XArticlePageKind =
  | 'articles_index'
  | 'article_editor'
  | 'article_preview'
  | 'publish_review'
  | 'public_article'
  | 'login_required'
  | 'security_challenge';

export interface XArticleControlObservation {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly test_id: string | null;
  readonly disabled: boolean;
}

export interface XArticleVisualObservation {
  readonly ref: string;
  readonly asset_id: string | null;
  readonly kind: 'cover' | 'inline';
  readonly block_ordinal: number | null;
  readonly alt_text: string | null;
  readonly status: 'processing' | 'uploaded' | 'failed';
  readonly owned_by_execution: boolean;
}

export interface XArticleEditorObservation {
  readonly draft_id: string;
  readonly title: string;
  readonly blocks: readonly XArticleBlockV1[];
  readonly visuals: readonly XArticleVisualObservation[];
  readonly has_unknown_content: boolean;
  readonly autosave_state: 'saving' | 'saved' | 'failed';
}

export interface XArticlePreviewObservation {
  readonly draft_id: string;
  readonly title: string;
  readonly blocks: readonly XArticleBlockV1[];
  readonly visuals: readonly XArticleVisualObservation[];
}

export interface XArticlePublishReviewObservation {
  readonly draft_id: string;
  readonly audience: 'everyone' | 'subscribers' | null;
  readonly final_publish_ref: string | null;
}

export interface XArticlePublicObservation {
  readonly article_id: string;
  readonly canonical_url: string;
  readonly author_handle: string;
  readonly title: string;
  readonly blocks: readonly XArticleBlockV1[];
  readonly visuals: readonly XArticleVisualObservation[];
  readonly published_at: string;
}

export interface XArticleBrowserObservation {
  readonly schema_version: '1.0';
  readonly observation_id: string;
  readonly execution_id: string;
  readonly command_id: string;
  readonly origin: 'https://x.com';
  readonly canonical_url: string;
  readonly page_revision: string;
  readonly observed_at: string;
  readonly account_handle: string | null;
  readonly page_kind: XArticlePageKind;
  readonly controls: readonly XArticleControlObservation[];
  readonly editor: XArticleEditorObservation | null;
  readonly preview: XArticlePreviewObservation | null;
  readonly publish_review: XArticlePublishReviewObservation | null;
  readonly public_article: XArticlePublicObservation | null;
}

export type XArticleBrowserObservationInput = Omit<XArticleBrowserObservation, 'page_revision'>;

export function computeXArticlePageRevision(input: object): string {
  return sha256(input);
}
