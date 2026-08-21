import { describe, expect, it } from 'vitest';

import { createXArticleReceipt } from '../../harnesses/research-publishing/adapters/x/article-browser/article-receipt.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';

const plan = createXArticlePublicationPlan({
  planId: 'plan_receipt_1', runId: 'run_receipt_1', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_1', digest: `sha256:${'a'.repeat(64)}` },
  document: { schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: null, blocks: [] },
  visuals: [], plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});

describe('createXArticleReceipt', () => {
  it('separates source, editor/preview, and public evidence', () => {
    expect(createXArticleReceipt({
      receiptId: 'receipt_1', executionId: 'execution_1', plan,
      status: 'published_media_unverified', draftId: '2090731994279755776',
      editorRevision: `sha256:${'b'.repeat(64)}`, previewRevision: `sha256:${'c'.repeat(64)}`,
      publicVerification: {
        kind: 'media_unverified', article_id: '2091000000000000000',
        canonical_url: 'https://x.com/Glen56121/article/2091000000000000000',
        author_match: true, content_match: true, links_match: true, media_match: null,
        verified_at: '2026-08-21T09:06:00.000Z'
      },
      issuedAt: '2026-08-21T09:06:01.000Z', supersedesReceiptId: null
    })).toMatchObject({
      schema_version: '1.0', status: 'published_media_unverified',
      source_evidence: { article_package_digest: plan.intent.article_package.digest },
      editor_evidence: { draft_id: '2090731994279755776', content_match: true },
      public_evidence: { media_match: null }
    });
  });

  it('refuses to issue a successful Receipt for conflicting public content', () => {
    expect(() => createXArticleReceipt({
      receiptId: 'receipt_2', executionId: 'execution_1', plan,
      status: 'published', draftId: '2090731994279755776',
      editorRevision: `sha256:${'b'.repeat(64)}`, previewRevision: `sha256:${'c'.repeat(64)}`,
      publicVerification: {
        kind: 'conflict', article_id: '2091000000000000000', canonical_url: 'https://x.com/Glen56121/article/2091000000000000000',
        author_match: true, content_match: false, links_match: true, media_match: true,
        verified_at: '2026-08-21T09:06:00.000Z'
      },
      issuedAt: '2026-08-21T09:06:01.000Z', supersedesReceiptId: null
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_PUBLICATION_CONFLICT' }));
  });
});
