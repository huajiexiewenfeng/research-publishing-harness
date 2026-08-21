import { sha256 } from '../../../../core/digest.js';
import { HarnessError } from '../../../../core/errors.js';
import { validateContract } from '../../../../core/schema-validator.js';
import type { XArticleDocumentV1 } from '../../../../branches/x-article-harness/article-document.js';
import type {
  XArticleBrowserObservation,
  XArticleControlObservation,
  XArticleEditorObservation,
  XArticlePreviewObservation,
  XArticlePublicObservation,
  XArticlePublishReviewObservation
} from '../article-browser-protocol.js';
import type {
  XArticleControlPurpose,
  XArticleDetectedPage,
  XArticlePageContract
} from '../article-page-contract.js';
import { documentFromEditor } from '../article-page-contract.js';

const EDITOR_URL = /^https:\/\/x\.com\/compose\/articles\/edit\/(\d+)$/;
const PREVIEW_URL = /^https:\/\/x\.com\/compose\/articles\/edit\/(\d+)\/preview$/;

export class XArticleWeb2026_08Contract implements XArticlePageContract {
  readonly id = 'x-article-web';
  readonly version = '2026-08';

  detectPage(observation: XArticleBrowserObservation): XArticleDetectedPage {
    this.assertObservation(observation);
    if (observation.page_kind === 'login_required' || observation.page_kind === 'security_challenge') {
      return { kind: observation.page_kind };
    }
    if (observation.page_kind === 'articles_index') return { kind: 'articles_index' };
    if (observation.page_kind === 'article_editor') {
      const match = observation.canonical_url.match(EDITOR_URL);
      if (match === null || observation.editor?.draft_id !== match[1]) this.unsupported('editor URL and draft identity differ');
      return { kind: 'article_editor', draft_id: match[1]! };
    }
    if (observation.page_kind === 'article_preview') {
      const match = observation.canonical_url.match(PREVIEW_URL);
      if (match === null || observation.preview?.draft_id !== match[1]) this.unsupported('preview URL and draft identity differ');
      return { kind: 'article_preview', draft_id: match[1]! };
    }
    if (observation.page_kind === 'publish_review') {
      const draftId = observation.publish_review?.draft_id;
      if (draftId === undefined) this.unsupported('publish review is missing draft identity');
      return { kind: 'publish_review', draft_id: draftId };
    }
    if (observation.page_kind === 'public_article') {
      const articleId = observation.public_article?.article_id;
      if (articleId === undefined) this.unsupported('public Article is missing identity');
      return { kind: 'public_article', article_id: articleId };
    }
    return this.unsupported('unsupported X Article page');
  }

  detectAccount(observation: XArticleBrowserObservation): { readonly handle: string } {
    this.assertObservation(observation);
    if (observation.account_handle === null || !/^@[A-Za-z0-9_]{1,15}$/.test(observation.account_handle)) {
      this.unsupported('X Article account is unavailable');
    }
    return { handle: observation.account_handle };
  }

  detectEditor(observation: XArticleBrowserObservation): XArticleEditorObservation {
    const page = this.detectPage(observation);
    if (page.kind !== 'article_editor' || observation.editor === null) this.unsupported('Article editor is unavailable');
    if (observation.editor.has_unknown_content) {
      throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'Article editor contains unknown existing content');
    }
    return observation.editor;
  }

  readEditorDocument(observation: XArticleBrowserObservation): XArticleDocumentV1 {
    const document = documentFromEditor(this.detectEditor(observation));
    return validateContract<XArticleDocumentV1>('x-article-document', document);
  }

  detectPreview(observation: XArticleBrowserObservation): XArticlePreviewObservation {
    if (this.detectPage(observation).kind !== 'article_preview' || observation.preview === null) {
      return this.unsupported('Article Preview is unavailable');
    }
    return observation.preview;
  }

  detectPublishReview(observation: XArticleBrowserObservation): XArticlePublishReviewObservation {
    if (this.detectPage(observation).kind !== 'publish_review' || observation.publish_review === null) {
      return this.unsupported('Article publish review is unavailable');
    }
    return observation.publish_review;
  }

  detectPublicArticle(observation: XArticleBrowserObservation): XArticlePublicObservation {
    if (this.detectPage(observation).kind !== 'public_article' || observation.public_article === null) {
      return this.unsupported('public Article is unavailable');
    }
    return observation.public_article;
  }

  detectControl(
    observation: XArticleBrowserObservation,
    purpose: XArticleControlPurpose
  ): XArticleControlObservation {
    this.assertObservation(observation);
    const matches = observation.controls.filter((control) => {
      if (purpose === 'create') return control.role === 'button' && control.name === 'create';
      if (purpose === 'title') return control.role === 'textbox' && control.name === 'Add a title';
      if (purpose === 'body') return control.role === 'textbox' && control.test_id === 'composer';
      if (purpose === 'preview') return control.role === 'link' && control.name === 'Preview';
      if (purpose === 'publish') return control.role === 'button' && control.name === 'Publish';
      return observation.publish_review?.final_publish_ref === control.ref;
    });
    if (matches.length !== 1) this.unsupported(`expected one ${purpose} control, observed ${matches.length}`);
    return matches[0]!;
  }

  private assertObservation(observation: XArticleBrowserObservation): void {
    if ((observation as { origin: string }).origin !== 'https://x.com') this.unsupported('X Article origin is unsupported');
    validateContract<XArticleBrowserObservation>('x-article-browser-observation', observation);
    const { page_revision: _ignored, ...revisionInput } = observation;
    if (observation.page_revision !== sha256(revisionInput)) {
      throw new HarnessError('STALE_PAGE_REVISION', 'X Article observation revision is stale');
    }
  }

  private unsupported(message: string): never {
    throw new HarnessError('ARTICLE_PAGE_CONTRACT_UNSUPPORTED', message);
  }
}
