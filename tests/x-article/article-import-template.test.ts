import { describe, expect, it } from 'vitest';

import {
  createXArticleImportTemplate
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import type {
  XArticleBlockV1,
  XArticleDocumentV1
} from '../../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';

function paragraph(text: string): XArticleBlockV1 {
  return { kind: 'paragraph', runs: [{ text, marks: [], link: null }] };
}

function image(assetId: string, altText = assetId): XArticleBlockV1 {
  return { kind: 'image', asset_id: assetId, alt_text: altText };
}

function documentWithImages(
  images: readonly { readonly index: number; readonly asset_id: string }[]
): XArticleDocumentV1 {
  const blocks: XArticleBlockV1[] = Array.from({ length: 62 }, (_, index) => paragraph(`block ${index + 1}`));
  for (const item of images) blocks[item.index] = image(item.asset_id);
  return {
    schema_version: '1.0',
    title: 'Runtime boundaries',
    cover_asset_id: null,
    blocks
  };
}

const documentWithThreeImages = documentWithImages([
  { index: 18, asset_id: 'domain-runtime-boundary' },
  { index: 33, asset_id: 'bottom-up-extraction' },
  { index: 61, asset_id: 'runtime-research-boundaries' }
]);

const documentA: XArticleDocumentV1 = {
  schema_version: '1.0',
  title: 'Runtime boundaries',
  cover_asset_id: null,
  blocks: [
    {
      kind: 'paragraph',
      runs: [{ text: 'Stable text', marks: [], link: null }]
    },
    image('runtime-boundary')
  ]
};

describe('createXArticleImportTemplate', () => {
  it('replaces inline images with ordered deterministic anchors', () => {
    const template = createXArticleImportTemplate(documentWithThreeImages);

    expect(template.anchors).toEqual([
      {
        anchor_id: 'anchor_domain-runtime-boundary_19',
        asset_id: 'domain-runtime-boundary',
        block_ordinal: 19,
        marker: 'RPH_VISUAL_ANCHOR:domain-runtime-boundary:19'
      },
      {
        anchor_id: 'anchor_bottom-up-extraction_34',
        asset_id: 'bottom-up-extraction',
        block_ordinal: 34,
        marker: 'RPH_VISUAL_ANCHOR:bottom-up-extraction:34'
      },
      {
        anchor_id: 'anchor_runtime-research-boundaries_62',
        asset_id: 'runtime-research-boundaries',
        block_ordinal: 62,
        marker: 'RPH_VISUAL_ANCHOR:runtime-research-boundaries:62'
      }
    ]);
    expect(template.blocks[18]).toMatchObject({
      kind: 'visual_anchor', anchor_id: 'anchor_domain-runtime-boundary_19'
    });
    expect(template.blocks[18]).not.toHaveProperty('asset_id');
    expect(template.blocks[0]).toEqual(documentWithThreeImages.blocks[0]);
  });

  it('changes the template digest when text, marks, links, or anchor order changes', () => {
    const textChanged = {
      ...documentA,
      blocks: [{ kind: 'paragraph' as const, runs: [{ text: 'Changed text', marks: [], link: null }] }, documentA.blocks[1]!]
    };
    const marksChanged = {
      ...documentA,
      blocks: [{ kind: 'paragraph' as const, runs: [{ text: 'Stable text', marks: ['bold' as const], link: null }] }, documentA.blocks[1]!]
    };
    const linkChanged = {
      ...documentA,
      blocks: [{ kind: 'paragraph' as const, runs: [{ text: 'Stable text', marks: [], link: 'https://example.com' }] }, documentA.blocks[1]!]
    };
    const orderChanged = {
      ...documentWithThreeImages,
      blocks: documentWithThreeImages.blocks.map((block, index) => {
        if (index === 18) return documentWithThreeImages.blocks[33]!;
        if (index === 33) return documentWithThreeImages.blocks[18]!;
        return block;
      })
    };

    const baseline = createXArticleImportTemplate(documentA).template_digest;
    expect(createXArticleImportTemplate(textChanged).template_digest).not.toBe(baseline);
    expect(createXArticleImportTemplate(marksChanged).template_digest).not.toBe(baseline);
    expect(createXArticleImportTemplate(linkChanged).template_digest).not.toBe(baseline);
    expect(createXArticleImportTemplate(orderChanged).template_digest)
      .not.toBe(createXArticleImportTemplate(documentWithThreeImages).template_digest);
  });

  it('uses the source document digest as the source_document_digest', () => {
    const template = createXArticleImportTemplate(documentA);
    expect(template.source_document_digest).toBe(sha256(documentA));
    expect(template.template_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects unsafe or duplicate anchor identities', () => {
    expect(() => createXArticleImportTemplate(documentWithImages([
      { index: 0, asset_id: 'runtime.boundary' }
    ]))).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
    expect(() => createXArticleImportTemplate(documentWithImages([
      { index: 0, asset_id: 'runtime-boundary' },
      { index: 1, asset_id: 'runtime-boundary' }
    ]))).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });
});
