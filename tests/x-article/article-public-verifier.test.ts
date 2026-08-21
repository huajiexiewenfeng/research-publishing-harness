import { describe, expect, it } from 'vitest';

import { verifyPublicXArticle } from '../../harnesses/research-publishing/adapters/x/article-browser/article-public-verifier.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';

const image = {
  asset_id: 'architecture', relative_path: 'assets/architecture.png',
  digest: `sha256:${'b'.repeat(64)}` as const, mime_type: 'image/png' as const,
  alt_text: 'Skill and Runtime boundary', claim_refs: ['claim_boundary']
};
const plan = createXArticlePublicationPlan({
  planId: 'plan_public_1', runId: 'run_public_1', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_1', digest: `sha256:${'a'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: null,
    blocks: [
      { kind: 'paragraph', runs: [{ text: 'Read the source', marks: [], link: 'https://example.com/source' }] },
      { kind: 'image', asset_id: 'architecture', alt_text: image.alt_text }
    ]
  },
  visuals: [{ asset: image, placement: { kind: 'block', block_ordinal: 2 } }],
  plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});

function publicArticle(altText: string | null = image.alt_text) {
  return {
    article_id: '2091000000000000000',
    canonical_url: 'https://x.com/Glen56121/article/2091000000000000000',
    author_handle: '@Glen56121',
    title: plan.intent.document.title,
    blocks: plan.intent.document.blocks,
    visuals: [{
      ref: 'public_image_1', asset_id: null, kind: 'inline' as const,
      block_ordinal: 2, alt_text: altText, status: 'uploaded' as const,
      owned_by_execution: false
    }],
    published_at: '2026-08-21T09:05:00.000Z'
  };
}

describe('verifyPublicXArticle', () => {
  it('returns a full match for exact public content and observable media', () => {
    expect(verifyPublicXArticle(plan, publicArticle())).toMatchObject({
      kind: 'full_match', article_id: '2091000000000000000', content_match: true, media_match: true
    });
  });

  it('honestly degrades when public Alt Text is not observable', () => {
    expect(verifyPublicXArticle(plan, publicArticle(null))).toMatchObject({
      kind: 'media_unverified', content_match: true, media_match: null
    });
  });

  it('returns conflict for a changed title or body', () => {
    expect(verifyPublicXArticle(plan, { ...publicArticle(), title: 'Changed' }))
      .toMatchObject({ kind: 'conflict', content_match: false });
  });
});
