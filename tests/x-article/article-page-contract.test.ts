import { describe, expect, it } from 'vitest';

import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import {
  emptyArticleEditor,
  plannedArticleDocument,
  populatedArticleEditor,
  unknownArticleDraft
} from '../fixtures/x-article-browser-observations.js';

const contract = new XArticleWeb2026_08Contract();

describe('XArticleWeb2026_08Contract', () => {
  it('detects the Premium Article editor and immutable draft identity', () => {
    expect(contract.detectPage(emptyArticleEditor)).toEqual({
      kind: 'article_editor', draft_id: '2090731994279755776'
    });
    expect(contract.detectAccount(emptyArticleEditor)).toEqual({ handle: '@Glen56121' });
    expect(contract.detectEditor(emptyArticleEditor)).toMatchObject({
      draft_id: '2090731994279755776', title: '', blocks: [], has_unknown_content: false
    });
  });

  it('reads the exact normalized editor document and unique controls', () => {
    expect(contract.readEditorDocument(populatedArticleEditor)).toEqual(plannedArticleDocument);
    expect(contract.detectControl(populatedArticleEditor, 'preview')).toMatchObject({ ref: 'preview' });
    expect(contract.detectControl(populatedArticleEditor, 'publish')).toMatchObject({
      ref: 'publish', disabled: false
    });
  });

  it('fails closed for unknown existing draft content', () => {
    expect(() => contract.detectEditor(unknownArticleDraft))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_DRAFT_CONFLICT' }));
  });

  it('fails closed for a stale page revision or unsupported origin', () => {
    expect(() => contract.detectPage({ ...emptyArticleEditor, page_revision: `sha256:${'0'.repeat(64)}` }))
      .toThrowError(expect.objectContaining({ code: 'STALE_PAGE_REVISION' }));
    expect(() => contract.detectPage({
      ...emptyArticleEditor,
      origin: 'https://example.com'
    } as unknown as typeof emptyArticleEditor))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_PAGE_CONTRACT_UNSUPPORTED' }));
  });
});
