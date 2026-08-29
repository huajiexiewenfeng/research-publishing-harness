import { describe, expect, it } from 'vitest';

import {
  createXArticlePublicationPreflight
} from '../../harnesses/research-publishing/branches/x-article-harness/article-publication-preflight.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import type { VisualAssetRef } from '../../harnesses/research-publishing/core/types.js';
import type { XArticlePublicationPlanV1 } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import type { XArticleDocumentV1 } from '../../harnesses/research-publishing/branches/x-article-harness/article-document.js';

type VisualBinding = XArticlePublicationPlanV1['intent']['visuals'][number];

function asset(assetId: string, altText = `Alt for ${assetId}`): VisualAssetRef {
  return {
    asset_id: assetId,
    relative_path: `assets/${assetId}.png`,
    digest: sha256({ asset_id: assetId }),
    mime_type: 'image/png',
    alt_text: altText,
    claim_refs: [`claim:${assetId}`]
  };
}

function paragraph(text: string, marks: readonly ('bold' | 'italic')[] = []) {
  return {
    kind: 'paragraph' as const,
    runs: [{ text, marks, link: null }]
  };
}

function fixture(inlineCount = 2): {
  document: XArticleDocumentV1;
  visuals: readonly VisualBinding[];
} {
  const cover = asset('cover');
  const blocks: XArticleDocumentV1['blocks'][number][] = [
    paragraph('Domain semantics belong in the Skill.'),
    paragraph(
      'Status: X Article Draft (v0.1) · Derived from a longer evidence note · Evidence review date: 2026-08-25',
      ['italic']
    )
  ];
  const inline: VisualBinding[] = [];
  for (let index = 0; index < inlineCount; index += 1) {
    const visual = asset(`inline_${index + 1}`);
    blocks.push({ kind: 'image', asset_id: visual.asset_id, alt_text: visual.alt_text });
    inline.push({ asset: visual, placement: { kind: 'block', block_ordinal: blocks.length } });
  }
  return {
    document: {
      schema_version: '1.0',
      title: 'From Skill Memory to Shared Agent Knowledge',
      cover_asset_id: cover.asset_id,
      blocks
    },
    visuals: [{ asset: cover, placement: { kind: 'cover' } }, ...inline]
  };
}

describe('X Article Publication Preflight', () => {
  it('removes a known standalone editorial paragraph and records its exact diff', () => {
    const input = fixture();
    const result = createXArticlePublicationPreflight(input);

    expect(result.removals).toEqual([{
      block_ordinal: 2,
      block_digest: sha256(input.document.blocks[1]),
      text: 'Status: X Article Draft (v0.1) · Derived from a longer evidence note · Evidence review date: 2026-08-25',
      reason: 'draft_status'
    }]);
    expect(result.sanitized_document.blocks).toHaveLength(3);
    expect(result.sanitized_document.blocks[0]).toEqual(input.document.blocks[0]);
    expect(result.inline_assets.map((entry) => entry.block_ordinal)).toEqual([2, 3]);
    expect(result.cover).toEqual({
      asset_id: 'cover',
      asset_digest: input.visuals[0]!.asset.digest,
      alt_text: 'Alt for cover'
    });
  });

  it('does not remove editorial words embedded in technical prose', () => {
    const input = fixture(0);
    const embedded = paragraph(
      'A runtime may preserve the Evidence review date as domain data, not as an editorial status.'
    );
    const document = { ...input.document, blocks: [input.document.blocks[0]!, embedded] };

    const result = createXArticlePublicationPreflight({ ...input, document });

    expect(result.removals).toEqual([]);
    expect(result.sanitized_document.blocks).toEqual(document.blocks);
  });

  it('blocks an unknown standalone editorial marker instead of deleting it', () => {
    const input = fixture(0);
    const document = { ...input.document, blocks: [paragraph('Internal note: replace this before publishing.')] };

    expect(() => createXArticlePublicationPreflight({ ...input, document }))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_PREFLIGHT_REVIEW_REQUIRED' }));
  });

  it('blocks a document with no publishable body after sanitization', () => {
    const input = fixture(0);
    const document = { ...input.document, blocks: [input.document.blocks[1]!] };

    expect(() => createXArticlePublicationPreflight({ ...input, document }))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_PREFLIGHT_REVIEW_REQUIRED' }));
  });

  it('requires exactly one bound cover', () => {
    const input = fixture(0);

    expect(() => createXArticlePublicationPreflight({
      document: { ...input.document, cover_asset_id: null },
      visuals: []
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
    expect(() => createXArticlePublicationPreflight({
      ...input,
      visuals: [...input.visuals, { asset: asset('cover_2'), placement: { kind: 'cover' } }]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('rejects more than ten inline images', () => {
    expect(() => createXArticlePublicationPreflight(fixture(11)))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('rejects empty Alt and asset identity drift', () => {
    const input = fixture(1);
    const inline = input.visuals[1]!;

    expect(() => createXArticlePublicationPreflight({
      ...input,
      visuals: [input.visuals[0]!, { ...inline, asset: { ...inline.asset, alt_text: '' } }]
    })).toThrowError();
    expect(() => createXArticlePublicationPreflight({
      ...input,
      visuals: [input.visuals[0]!, {
        ...inline,
        asset: { ...inline.asset, asset_id: 'foreign_asset' }
      }]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('rejects duplicate, reordered, or misplaced inline bindings', () => {
    const input = fixture(2);
    const first = input.visuals[1]!;
    const second = input.visuals[2]!;

    expect(() => createXArticlePublicationPreflight({
      ...input,
      visuals: [input.visuals[0]!, first, first]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
    expect(() => createXArticlePublicationPreflight({
      ...input,
      visuals: [input.visuals[0]!, second, first]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
    expect(() => createXArticlePublicationPreflight({
      ...input,
      visuals: [input.visuals[0]!, {
        ...first,
        placement: { kind: 'block', block_ordinal: 99 }
      }, second]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));

    const cover = input.visuals[0]!.asset;
    const duplicateCoverDocument = {
      ...input.document,
      blocks: input.document.blocks.map((block) =>
        block.kind === 'image' && block.asset_id === 'inline_1'
          ? { ...block, asset_id: cover.asset_id, alt_text: cover.alt_text }
          : block)
    };
    expect(() => createXArticlePublicationPreflight({
      document: duplicateCoverDocument,
      visuals: [input.visuals[0]!, {
        asset: cover,
        placement: { kind: 'block', block_ordinal: 3 }
      }, second]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('produces stable digests and binds document, image order, and Alt changes', () => {
    const input = fixture(2);
    const first = createXArticlePublicationPreflight(input);
    const repeated = createXArticlePublicationPreflight(structuredClone(input));
    const changedDocument = createXArticlePublicationPreflight({
      ...input,
      document: { ...input.document, title: 'Changed title' }
    });
    const changedAlt = createXArticlePublicationPreflight({
      ...input,
      document: {
        ...input.document,
        blocks: input.document.blocks.map((block) =>
          block.kind === 'image' && block.asset_id === 'inline_1'
            ? { ...block, alt_text: 'Changed Alt' }
            : block)
      },
      visuals: input.visuals.map((binding) =>
        binding.asset.asset_id === 'inline_1'
          ? { ...binding, asset: { ...binding.asset, alt_text: 'Changed Alt' } }
          : binding)
    });
    const changedDigest = createXArticlePublicationPreflight({
      ...input,
      visuals: input.visuals.map((binding) =>
        binding.asset.asset_id === 'inline_1'
          ? { ...binding, asset: { ...binding.asset, digest: `sha256:${'f'.repeat(64)}` } }
          : binding)
    });

    expect(repeated.preflight_digest).toBe(first.preflight_digest);
    expect(changedDocument.preflight_digest).not.toBe(first.preflight_digest);
    expect(changedAlt.preflight_digest).not.toBe(first.preflight_digest);
    expect(changedDigest.preflight_digest).not.toBe(first.preflight_digest);
  });
});
