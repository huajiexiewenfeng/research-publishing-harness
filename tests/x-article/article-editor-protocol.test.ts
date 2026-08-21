import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleCommandBroker } from '../../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import { computeXArticlePageRevision } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { nextArticleEditorDecision } from '../../harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.js';
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

function revise<T extends { readonly page_revision: string }>(value: T): T {
  const input = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'page_revision')
  );
  return { ...input, page_revision: computeXArticlePageRevision(input) } as T;
}

describe('nextArticleEditorDecision', () => {
  it('sets the title before inserting Article blocks', () => {
    expect(nextArticleEditorDecision({ plan, draft_id: '2090731994279755776' }, emptyArticleEditor, contract))
      .toMatchObject({ kind: 'command', input: { purpose: 'set_article_title', payload: { kind: 'set_article_title' } } });
  });

  it('resumes from an exact auto-saved prefix', () => {
    const titleOnly = revise({
      ...emptyArticleEditor,
      editor: { ...emptyArticleEditor.editor!, title: plan.intent.document.title }
    });
    expect(nextArticleEditorDecision({ plan, draft_id: '2090731994279755776' }, titleOnly, contract))
      .toMatchObject({ kind: 'command', input: { purpose: 'insert_article_block_1', payload: { kind: 'insert_article_block', block_ordinal: 1 } } });
  });

  it('opens Preview only after the full editor document is saved and verified', () => {
    expect(nextArticleEditorDecision({ plan, draft_id: '2090731994279755776' }, populatedArticleEditor, contract))
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
    expect(nextArticleEditorDecision({ plan, draft_id: '2090731994279755776' }, conflict, contract))
      .toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
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
