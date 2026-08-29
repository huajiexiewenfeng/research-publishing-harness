import { describe, expect, it } from 'vitest';

import type { XArticleBlockV1, XArticleDocumentV1 } from '../../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import {
  normalizeXArticleHostEditor,
  type XArticleHostEditorBlockV1
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-host-normalizer.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';

const document: XArticleDocumentV1 = {
  schema_version: '1.0',
  title: 'Shared Agent Knowledge',
  cover_asset_id: null,
  blocks: [
    { kind: 'paragraph', runs: [{ text: 'Before.', marks: [], link: null }] },
    { kind: 'image', asset_id: 'asset_alpha', alt_text: 'Alpha diagram' },
    { kind: 'heading', runs: [{ text: 'Middle', marks: [], link: null }] },
    { kind: 'image', asset_id: 'asset_beta', alt_text: 'Beta diagram' },
    { kind: 'paragraph', runs: [{ text: 'After.', marks: ['italic'], link: null }] }
  ]
};

function rawEditor(blocks: readonly XArticleHostEditorBlockV1[]) {
  return {
    draft_id: '2092824385736613888',
    title: document.title,
    blocks,
    visuals: [],
    has_unknown_content: false,
    autosave_state: 'saved' as const
  };
}

describe('X Article Browser Host normalizer', () => {
  it('removes exact import markers from canonical blocks and promotes ordered unresolved anchors', async () => {
    const template = createXArticleImportTemplate(document);

    const normalized = normalizeXArticleHostEditor({
      editor: rawEditor(template.blocks),
      template
    });

    expect(normalized.blocks).toEqual(document.blocks.filter((block) => block.kind !== 'image'));
    expect(normalized.import_state).toEqual({
      template_digest: template.template_digest,
      source_document_digest: template.source_document_digest,
      unresolved_anchors: template.anchors
    });
  });

  it('keeps a completed image block and rejects a remaining anchor outside its planned ordinal', async () => {
    const template = createXArticleImportTemplate(document);
    const firstImage = document.blocks[1] as XArticleBlockV1;
    const afterFirstReplacement = [
      template.blocks[0]!, firstImage, template.blocks[2]!, template.blocks[3]!, template.blocks[4]!
    ];

    expect(normalizeXArticleHostEditor({
      editor: rawEditor(afterFirstReplacement),
      template
    })).toMatchObject({
      blocks: [document.blocks[0], firstImage, document.blocks[2], document.blocks[4]],
      import_state: { unresolved_anchors: [template.anchors[1]] }
    });

    const misplaced = [
      template.blocks[0]!, firstImage, template.blocks[3]!, template.blocks[2]!, template.blocks[4]!
    ];
    expect(() => normalizeXArticleHostEditor({ editor: rawEditor(misplaced), template }))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_DRAFT_CONFLICT' }));
  });
});
