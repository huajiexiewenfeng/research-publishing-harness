import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleCommandBroker } from '../../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import { computeXArticlePageRevision } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { nextArticleEditorDecision } from '../../harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { emptyArticleEditor, populatedArticleEditor } from '../fixtures/x-article-browser-observations.js';

const contract = new XArticleWeb2026_08Contract();
const plan = createXArticlePublicationPlan({
  planId: 'plan_editor_1', runId: 'run_editor_1', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_1', digest: `sha256:${'a'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: null,
    blocks: [{ kind: 'paragraph', runs: [{ text: 'Skills own semantics.', marks: [], link: null }] }]
  },
  visuals: [], plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const bulkAssets = [
  {
    asset_id: 'domain-runtime-boundary', relative_path: 'assets/domain-runtime-boundary.png',
    digest: `sha256:${'b'.repeat(64)}` as const, mime_type: 'image/png' as const,
    alt_text: 'Domain and runtime boundary', claim_refs: ['claim_domain_runtime']
  },
  {
    asset_id: 'approval-gate', relative_path: 'assets/approval-gate.png',
    digest: `sha256:${'c'.repeat(64)}` as const, mime_type: 'image/png' as const,
    alt_text: 'Approval gate', claim_refs: ['claim_approval']
  },
  {
    asset_id: 'receipt-boundary', relative_path: 'assets/receipt-boundary.png',
    digest: `sha256:${'d'.repeat(64)}` as const, mime_type: 'image/png' as const,
    alt_text: 'Receipt boundary', claim_refs: ['claim_receipt']
  }
] as const;
const bulkPlan = createXArticlePublicationPlan({
  planId: 'plan_editor_bulk_1', runId: 'run_editor_bulk_1', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_bulk_1', digest: `sha256:${'e'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Bulk runtime boundary', cover_asset_id: null,
    blocks: [
      ...Array.from({ length: 18 }, (_, index) => ({
        kind: 'paragraph' as const,
        runs: [{ text: `Approved paragraph ${index + 1}`, marks: [] as const, link: null }]
      })),
      { kind: 'image', asset_id: bulkAssets[0].asset_id, alt_text: bulkAssets[0].alt_text },
      { kind: 'paragraph', runs: [{ text: 'Between visuals', marks: [], link: null }] },
      { kind: 'image', asset_id: bulkAssets[1].asset_id, alt_text: bulkAssets[1].alt_text },
      { kind: 'image', asset_id: bulkAssets[2].asset_id, alt_text: bulkAssets[2].alt_text }
    ]
  },
  visuals: [
    { asset: bulkAssets[0], placement: { kind: 'block', block_ordinal: 19 } },
    { asset: bulkAssets[1], placement: { kind: 'block', block_ordinal: 21 } },
    { asset: bulkAssets[2], placement: { kind: 'block', block_ordinal: 22 } }
  ],
  plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const bulkCoverAsset = {
  asset_id: 'bulk-cover', relative_path: 'assets/bulk-cover.png',
  digest: `sha256:${'6'.repeat(64)}` as const, mime_type: 'image/png' as const,
  alt_text: 'Bulk Article cover', claim_refs: ['claim_cover']
};
const bulkCoverPlan = createXArticlePublicationPlan({
  planId: 'plan_editor_bulk_cover_1', runId: 'run_editor_bulk_cover_1', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_bulk_cover_1', digest: `sha256:${'7'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Bulk cover boundary', cover_asset_id: bulkCoverAsset.asset_id,
    blocks: [{ kind: 'paragraph', runs: [{ text: 'Cover must finish uploading.', marks: [], link: null }] }]
  },
  visuals: [{ asset: bulkCoverAsset, placement: { kind: 'cover' } }],
  plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const zeroBlockBulkCoverPlan = createXArticlePublicationPlan({
  planId: 'plan_editor_zero_block_bulk_cover_1', runId: 'run_editor_zero_block_bulk_cover_1',
  targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_zero_block_bulk_cover_1', digest: `sha256:${'8'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Zero-block bulk cover boundary', cover_asset_id: bulkCoverAsset.asset_id,
    blocks: []
  },
  visuals: [{ asset: bulkCoverAsset, placement: { kind: 'cover' } }],
  plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const draftId = '2090731994279755776';

function revise<T extends { readonly page_revision: string }>(value: T): T {
  const input = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'page_revision')
  );
  return { ...input, page_revision: computeXArticlePageRevision(input) } as T;
}

describe('nextArticleEditorDecision', () => {
  it('sets the title before inserting Article blocks', () => {
    expect(nextArticleEditorDecision(
      { plan, draft_id: draftId, import_strategy: 'incremental_blocks', bulk_import_issued: false },
      emptyArticleEditor, contract
    ))
      .toMatchObject({ kind: 'command', input: { purpose: 'set_article_title', payload: { kind: 'set_article_title' } } });
  });

  it('keeps incremental block insertion operational', () => {
    const titleOnly = revise({
      ...emptyArticleEditor,
      editor: { ...emptyArticleEditor.editor!, title: plan.intent.document.title }
    });
    expect(nextArticleEditorDecision(
      { plan, draft_id: draftId, import_strategy: 'incremental_blocks', bulk_import_issued: false },
      titleOnly, contract
    ))
      .toMatchObject({ kind: 'command', input: { purpose: 'insert_article_block_1', payload: { kind: 'insert_article_block', block_ordinal: 1 } } });
  });

  it('opens Preview only after the full editor document is saved and verified', () => {
    expect(nextArticleEditorDecision(
      { plan, draft_id: draftId, import_strategy: 'incremental_blocks', bulk_import_issued: false },
      populatedArticleEditor, contract
    ))
      .toMatchObject({ kind: 'command', input: { purpose: 'open_article_preview', payload: { kind: 'open_article_preview' } } });
  });

  it('blocks rather than overwriting extra editor content', () => {
    const conflict = revise({
      ...populatedArticleEditor,
      editor: {
        ...populatedArticleEditor.editor!,
        blocks: [...populatedArticleEditor.editor!.blocks, {
          kind: 'paragraph' as const,
          runs: [{ text: 'Human content', marks: [] as const, link: null }]
        }]
      }
    });
    expect(nextArticleEditorDecision(
      { plan, draft_id: draftId, import_strategy: 'incremental_blocks', bulk_import_issued: false },
      conflict, contract
    ))
      .toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
  });

  it('imports once when a compatible titled draft is empty', () => {
    const titleOnly = revise({
      ...emptyArticleEditor,
      editor: { ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: false
      },
      titleOnly, contract
    )).toMatchObject({
      kind: 'command',
      input: {
        kind: 'import_article_document',
        payload: {
          kind: 'import_article_document',
          package_root: bulkPlan.intent.article_package.root,
          package_digest: bulkPlan.intent.article_package.digest,
          template: createXArticleImportTemplate(bulkPlan.intent.document)
        }
      }
    });
  });

  it('fails closed when a non-empty document is still empty after bulk import was issued', () => {
    const emptyAfterIssuedImport = revise({
      ...emptyArticleEditor,
      editor: { ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: true
      },
      emptyAfterIssuedImport,
      contract
    )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
  });

  it('blocks an exact imported state before bulk import issuance', () => {
    const template = createXArticleImportTemplate(bulkPlan.intent.document);
    const importedWithThreeAnchors = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
        blocks: bulkPlan.intent.document.blocks.filter((block) => block.kind !== 'image'),
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: template.anchors
        }
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: false
      },
      importedWithThreeAnchors,
      contract
    )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
  });

  it('blocks populated untitled content before bulk import issuance', () => {
    const populatedUntitledEditor = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!,
        blocks: [{
          kind: 'paragraph' as const,
          runs: [{ text: 'Unexpected content', marks: [] as const, link: null }]
        }]
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: false
      },
      populatedUntitledEditor,
      contract
    )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
  });

  it('blocks an exact nonzero final document before bulk import issuance', () => {
    const finalEditor = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
        blocks: bulkPlan.intent.document.blocks,
        visuals: bulkAssets.map((asset, index) => ({
          ref: `visual_${index + 1}`, asset_id: asset.asset_id, kind: 'inline' as const,
          block_ordinal: [19, 21, 22][index]!, alt_text: asset.alt_text,
          status: 'uploaded' as const, owned_by_execution: true
        })),
        import_state: null,
        autosave_state: 'saved' as const
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: false
      },
      finalEditor,
      contract
    )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
  });

  it('blocks an exact zero-block final document with cover before bulk import issuance', () => {
    const finalEditor = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: zeroBlockBulkCoverPlan.intent.document.title,
        blocks: [],
        visuals: [{
          ref: 'cover_1', asset_id: bulkCoverAsset.asset_id, kind: 'cover' as const,
          block_ordinal: null, alt_text: bulkCoverAsset.alt_text,
          status: 'uploaded' as const, owned_by_execution: true
        }],
        import_state: null,
        autosave_state: 'saved' as const
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: zeroBlockBulkCoverPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: false
      },
      finalEditor,
      contract
    )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
  });

  it.each([
    {
      name: 'body blocks',
      editor: { blocks: [{ kind: 'paragraph' as const, runs: [{ text: 'Existing', marks: [] as const, link: null }] }] }
    },
    {
      name: 'visuals',
      editor: {
        visuals: [{
          ref: 'human_visual', asset_id: null, kind: 'inline' as const, block_ordinal: 1,
          alt_text: null, status: 'uploaded' as const, owned_by_execution: false
        }]
      }
    },
    {
      name: 'an existing import state',
      editor: {
        import_state: {
          template_digest: `sha256:${'f'.repeat(64)}`,
          source_document_digest: `sha256:${'0'.repeat(64)}`,
          unresolved_anchors: []
        }
      }
    }
  ])('never imports over $name', ({ editor: editorOverride }) => {
    const observation = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
        ...editorOverride
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: false
      },
      observation, contract
    )).toMatchObject({ kind: 'blocked' });
  });

  it('resumes by replacing the first unresolved anchor without re-importing', () => {
    const template = createXArticleImportTemplate(bulkPlan.intent.document);
    const importedWithThreeAnchors = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
        blocks: bulkPlan.intent.document.blocks.filter((block) => block.kind !== 'image'),
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: template.anchors
        }
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: true
      },
      importedWithThreeAnchors,
      contract
    )).toMatchObject({
      kind: 'command',
      input: {
        kind: 'replace_article_visual_anchor',
        payload: {
          kind: 'replace_article_visual_anchor',
          anchor: { block_ordinal: 19 },
          asset: { asset_id: 'domain-runtime-boundary' }
        }
      }
    });
  });

  it('blocks an altered or reordered import template', () => {
    const template = createXArticleImportTemplate(bulkPlan.intent.document);
    const importedWithWrongAnchorOrder = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
        blocks: bulkPlan.intent.document.blocks,
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: template.anchors.map((anchor, index) => ({
            ...anchor,
            anchor_id: template.anchors[(index + 1) % template.anchors.length]!.anchor_id
          }))
        }
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: true
      },
      importedWithWrongAnchorOrder,
      contract
    )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
  });

  it.each(['template_digest', 'source_document_digest'] as const)(
    'blocks an imported state with the wrong %s',
    (digestField) => {
      const template = createXArticleImportTemplate(bulkPlan.intent.document);
      const importedWithWrongDigest = revise({
        ...emptyArticleEditor,
        editor: {
          ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
          blocks: bulkPlan.intent.document.blocks,
          import_state: {
            template_digest: template.template_digest,
            source_document_digest: template.source_document_digest,
            unresolved_anchors: template.anchors,
            [digestField]: `sha256:${'9'.repeat(64)}`
          }
        }
      });

      expect(nextArticleEditorDecision(
        {
          plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
          bulk_import_issued: true
        },
        importedWithWrongDigest,
        contract
      )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
    }
  );

  it('resumes an exact replacement prefix at the next unresolved anchor', () => {
    const template = createXArticleImportTemplate(bulkPlan.intent.document);
    const firstAnchor = template.anchors[0]!;
    const afterFirstReplacement = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
        blocks: bulkPlan.intent.document.blocks.filter((block, index) =>
          block.kind !== 'image' || index + 1 === firstAnchor.block_ordinal
        ),
        visuals: [{
          ref: 'visual_1', asset_id: bulkAssets[0].asset_id, kind: 'inline' as const,
          block_ordinal: firstAnchor.block_ordinal, alt_text: bulkAssets[0].alt_text,
          status: 'uploaded' as const, owned_by_execution: true
        }],
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: template.anchors.slice(1)
        }
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: true
      },
      afterFirstReplacement,
      contract
    )).toMatchObject({
      kind: 'command',
      input: {
        kind: 'replace_article_visual_anchor',
        payload: {
          anchor: { block_ordinal: 21 },
          asset: { asset_id: 'approval-gate' }
        }
      }
    });
  });

  it('never opens Preview while import state remains', () => {
    const template = createXArticleImportTemplate(bulkPlan.intent.document);
    const importedWithNoAnchors = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
        blocks: bulkPlan.intent.document.blocks,
        visuals: bulkAssets.map((asset, index) => ({
          ref: `visual_${index + 1}`, asset_id: asset.asset_id, kind: 'inline' as const,
          block_ordinal: [19, 21, 22][index]!, alt_text: asset.alt_text,
          status: 'uploaded' as const, owned_by_execution: true
        })),
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: []
        }
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: true
      },
      importedWithNoAnchors,
      contract
    )).not.toMatchObject({ input: { kind: 'open_article_preview' } });
  });

  it('opens Preview after exact final document verification and saved autosave state', () => {
    const finalEditor = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkPlan.intent.document.title,
        blocks: bulkPlan.intent.document.blocks,
        visuals: bulkAssets.map((asset, index) => ({
          ref: `visual_${index + 1}`, asset_id: asset.asset_id, kind: 'inline' as const,
          block_ordinal: [19, 21, 22][index]!, alt_text: asset.alt_text,
          status: 'uploaded' as const, owned_by_execution: true
        })),
        import_state: null,
        autosave_state: 'saved' as const
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: true
      },
      finalEditor, contract
    )).toMatchObject({
      kind: 'command', input: { kind: 'open_article_preview', payload: { kind: 'open_article_preview' } }
    });
  });

  it('waits while an exact planned bulk cover is still processing', () => {
    const processingCover = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkCoverPlan.intent.document.title,
        blocks: bulkCoverPlan.intent.document.blocks,
        visuals: [{
          ref: 'cover_1', asset_id: bulkCoverAsset.asset_id, kind: 'cover' as const,
          block_ordinal: null, alt_text: bulkCoverAsset.alt_text,
          status: 'processing' as const, owned_by_execution: true
        }],
        import_state: null,
        autosave_state: 'saved' as const
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkCoverPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: true
      },
      processingCover,
      contract
    )).toMatchObject({
      kind: 'command',
      input: { kind: 'observe_article_page', payload: { kind: 'observe_article_page', scope: 'editor' } }
    });
  });

  it('fails closed when an exact planned bulk cover upload has failed', () => {
    const failedCover = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!, title: bulkCoverPlan.intent.document.title,
        blocks: bulkCoverPlan.intent.document.blocks,
        visuals: [{
          ref: 'cover_1', asset_id: bulkCoverAsset.asset_id, kind: 'cover' as const,
          block_ordinal: null, alt_text: bulkCoverAsset.alt_text,
          status: 'failed' as const, owned_by_execution: true
        }],
        import_state: null,
        autosave_state: 'saved' as const
      }
    });

    expect(nextArticleEditorDecision(
      {
        plan: bulkCoverPlan, draft_id: draftId, import_strategy: 'bulk_document',
        bulk_import_issued: true
      },
      failedCover,
      contract
    )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_ASSET_MISMATCH' });
  });
});

describe('XArticleCommandBroker', () => {
  it('persists claims and rejects replay of the same command', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-x-article-command-'));
    const broker = new XArticleCommandBroker(await WorkspaceStore.open(root), {
      commandId: () => 'command_1', now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const command = await broker.issue({
      execution_id: 'execution_1', run_id: 'run_editor_1', draft_id: '2090731994279755776',
      kind: 'publish_article_once', purpose: 'publish_article_once', expected_page_revision: `sha256:${'a'.repeat(64)}`,
      allowed_origin: 'https://x.com', side_effect: 'submit', payload: { kind: 'publish_article_once', target_ref: 'publish_final' }
    });
    await expect(broker.claim(command)).resolves.toMatchObject({ claimed: true, command_id: 'command_1' });
    await expect(broker.claim(command)).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
  });
});

describe('X Article import observation contract', () => {
  it('accepts an editor import state with ordered unique anchors', () => {
    const observation = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!,
        import_state: {
          template_digest: `sha256:${'b'.repeat(64)}`,
          source_document_digest: `sha256:${'c'.repeat(64)}`,
          unresolved_anchors: [
            {
              anchor_id: 'anchor_asset_alpha_2', asset_id: 'asset_alpha', block_ordinal: 2,
              marker: 'RPH_VISUAL_ANCHOR:asset_alpha:2'
            },
            {
              anchor_id: 'anchor_asset_beta_4', asset_id: 'asset_beta', block_ordinal: 4,
              marker: 'RPH_VISUAL_ANCHOR:asset_beta:4'
            }
          ]
        }
      }
    });

    expect(validateContract('x-article-browser-observation', observation)).toEqual(observation);
  });

  it('rejects an editor import state with duplicate anchors', () => {
    const duplicateAnchor = {
      anchor_id: 'anchor_asset_alpha_2', asset_id: 'asset_alpha', block_ordinal: 2,
      marker: 'RPH_VISUAL_ANCHOR:asset_alpha:2'
    };
    const observation = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!,
        import_state: {
          template_digest: `sha256:${'b'.repeat(64)}`,
          source_document_digest: `sha256:${'c'.repeat(64)}`,
          unresolved_anchors: [duplicateAnchor, duplicateAnchor]
        }
      }
    });

    expect(() => validateContract('x-article-browser-observation', observation))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it.each([
    {
      name: 'non-increasing block ordinals',
      anchors: [
        {
          anchor_id: 'anchor_asset_beta_4', asset_id: 'asset_beta', block_ordinal: 4,
          marker: 'RPH_VISUAL_ANCHOR:asset_beta:4'
        },
        {
          anchor_id: 'anchor_asset_alpha_2', asset_id: 'asset_alpha', block_ordinal: 2,
          marker: 'RPH_VISUAL_ANCHOR:asset_alpha:2'
        }
      ]
    },
    {
      name: 'duplicate anchor IDs with otherwise different fields',
      anchors: [
        {
          anchor_id: 'anchor_shared', asset_id: 'asset_alpha', block_ordinal: 2,
          marker: 'RPH_VISUAL_ANCHOR:asset_alpha:2'
        },
        {
          anchor_id: 'anchor_shared', asset_id: 'asset_beta', block_ordinal: 4,
          marker: 'RPH_VISUAL_ANCHOR:asset_beta:4'
        }
      ]
    }
  ])('rejects editor import state with $name', ({ anchors }) => {
    const observation = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!,
        import_state: {
          template_digest: `sha256:${'b'.repeat(64)}`,
          source_document_digest: `sha256:${'c'.repeat(64)}`,
          unresolved_anchors: anchors
        }
      }
    });

    expect(() => validateContract('x-article-browser-observation', observation))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects an editor import state with a malformed template digest', () => {
    const observation = revise({
      ...emptyArticleEditor,
      editor: {
        ...emptyArticleEditor.editor!,
        import_state: {
          template_digest: 'not-a-digest',
          source_document_digest: `sha256:${'c'.repeat(64)}`,
          unresolved_anchors: []
        }
      }
    });

    expect(() => validateContract('x-article-browser-observation', observation))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});
