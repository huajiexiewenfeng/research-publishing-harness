import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import type { XArticleBlockV1 } from '../../../branches/x-article-harness/article-document.js';
import type { XArticleVisualAnchorV1 } from './article-import-template.js';

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

export interface XArticleEditorImportStateV1 {
  readonly template_digest: string;
  readonly source_document_digest: string;
  readonly unresolved_anchors: readonly XArticleVisualAnchorV1[];
}

export interface XArticleEditorObservation {
  readonly draft_id: string;
  readonly title: string;
  readonly blocks: readonly XArticleBlockV1[];
  readonly visuals: readonly XArticleVisualObservation[];
  readonly import_state: XArticleEditorImportStateV1 | null;
  readonly has_unknown_content: boolean;
  readonly autosave_state: 'saving' | 'saved' | 'failed';
}

export interface XArticleSemanticDifferenceV1 {
  readonly path: string;
  readonly expected_digest: `sha256:${string}` | null;
  readonly observed_digest: `sha256:${string}` | null;
  readonly reason: 'missing' | 'extra' | 'changed' | 'reordered' | 'ambiguous';
}

export type XArticleDraftReconciliationV1 =
  | { readonly kind: 'empty'; readonly next_action: 'import_body' }
  | {
      readonly kind: 'recoverable_partial';
      readonly completed_anchor_ids: readonly string[];
      readonly next_anchor_id: string | null;
      readonly next_action: 'replace_anchor' | 'reconcile_final';
    }
  | { readonly kind: 'exact' | 'semantically_equivalent'; readonly next_action: 'open_preview' }
  | { readonly kind: 'content_drift'; readonly differences: readonly XArticleSemanticDifferenceV1[] }
  | { readonly kind: 'unverifiable'; readonly reasons: readonly string[] };

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
  readonly page_revision: `sha256:${string}`;
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

export function computeXArticlePageRevision(input: object): `sha256:${string}` {
  return sha256(input);
}

export function computeXArticleElapsedSeconds(startedAt: string, endedAt: string): number {
  const start = Date.parse(startedAt);
  const end = Date.parse(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'X Article browser timing evidence is invalid or reversed'
    );
  }
  return (end - start) / 1000;
}
