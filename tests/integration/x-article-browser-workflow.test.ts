import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import type { XArticleBrowserCommandV1 } from '../../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { XArticleService } from '../../harnesses/research-publishing/branches/x-article-harness/x-article-service.js';
import { sha256, sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
import { approveXArticlePublication } from '../../harnesses/research-publishing/core/x-article-approval.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import {
  bulkArticleMarkdown,
  bulkArticleVisualFixtures
} from '../fixtures/x-article-browser-observations.js';

function observation(
  executionId: string,
  commandId: string,
  value: Record<string, unknown>
): XArticleBrowserObservation {
  const input = {
    schema_version: '1.0', observation_id: `obs_${commandId}`, execution_id: executionId,
    command_id: commandId, origin: 'https://x.com', observed_at: '2026-08-21T09:01:00.000Z',
    account_handle: '@Glen56121', controls: [], editor: null, preview: null,
    publish_review: null, public_article: null, ...value
  } as const;
  return { ...input, page_revision: computeXArticlePageRevision(input) } as unknown as XArticleBrowserObservation;
}

async function succeed(
  adapter: XArticleBrowserAdapter,
  command: XArticleBrowserCommandV1,
  value: Record<string, unknown>
): Promise<void> {
  await adapter.claim(command);
  await adapter.report({
    command, status: 'success', observation: observation(command.execution_id, command.command_id, value)
  });
}

describe('X Article Browser workflow', () => {
  it('recovers an uncertain Publish read-only and finalizes one immutable Receipt', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-e2e-')));
    const root = 'articles/runtime-boundary/article_e2e';
    const manifestBase = {
      schema_version: '1.0', article_run_id: 'article_e2e',
      bindings: bulkArticleVisualFixtures.map((fixture, index) => ({
        slot_id: fixture.slot_id, asset: fixture.asset, placement_ordinal: index + 1,
        width: 1, height: 1, byte_size: fixture.bytes.byteLength,
        normalization_version: 'acceptance-v1',
        provenance: { method: 'deterministic', tool: 'integration-fixture', source_digest: null },
        editable_source: null
      }))
    };
    const files = {
      'article.md': bulkArticleMarkdown,
      'visual-manifest.json': { ...manifestBase, manifest_digest: sha256(manifestBase) },
      'draft-candidate.json': {
        schema_version: '1.0', run_id: 'article_e2e', title: 'Runtime boundary',
        summary: 'Skills own semantics.', language: 'en', sections: [{
          section_id: 'boundary', heading: 'Boundary', markdown: 'Skills own semantics.',
          claim_refs: [], source_refs: []
        }],
        visual_slots: bulkArticleVisualFixtures.map((fixture) => ({
          slot_id: fixture.slot_id, placement: { kind: 'after_section', section_id: 'boundary' },
          purpose: 'explanation', required: true, brief: fixture.asset.alt_text,
          claim_refs: fixture.asset.claim_refs
        })),
        open_questions: []
      },
      ...Object.fromEntries(bulkArticleVisualFixtures.map((fixture) => [
        fixture.asset.relative_path, fixture.bytes
      ]))
    };
    const packageRef = {
      root,
      digest: sha256(Object.entries(files)
        .map(([path, value]) => ({
          path, digest: value instanceof Uint8Array ? sha256Bytes(value) : sha256(value)
        }))
        .sort((left, right) => left.path.localeCompare(right.path))),
      artifacts: Object.keys(files).map((path) => `${root}/${path}`), warnings: []
    };
    await store.writeNewDirectory(root, { ...files, 'package-ref.json': packageRef });
    const service = new XArticleService(store, {
      runId: () => 'run_x_article_e2e', planId: () => 'plan_x_article_e2e',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const plan = await service.plan(packageRef, '@Glen56121');
    const approval = approveXArticlePublication(
      plan, 'human:Glen56121', 3_600_000, new Date('2026-08-21T09:00:00.000Z'),
      () => 'approval_x_article_e2e'
    );
    let commandNumber = 0;
    let eventNumber = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_x_article_e2e',
      commandId: () => `command_e2e_${++commandNumber}`,
      eventId: () => `event_e2e_${++eventNumber}`,
      attemptId: () => 'attempt_x_article_e2e',
      receiptId: () => 'receipt_x_article_e2e',
      now: () => new Date('2026-08-21T09:02:00.000Z')
    });
    const execution = await adapter.start(plan, approval, {
      executor: 'codex-chrome', executor_version: 'fake-host', browser_family: 'chrome',
      capabilities: [
        'observe_article_page', 'create_article_draft', 'set_article_title',
        'import_article_document', 'replace_article_visual_anchor',
        'insert_article_block', 'open_article_preview', 'open_publish_review',
        'insert_article_image', 'set_article_image_alt', 'publish_article_once'
      ], observed_at: '2026-08-21T09:00:00.000Z'
    });
    const draftId = '2090731994279755776';
    const articleId = '2091000000000000000';
    const editorControls = [
      { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
      { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
      { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
      { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
    ];
    let title = '';
    let projectedBlocks: typeof plan.intent.document.blocks = [];
    let visuals: NonNullable<XArticleBrowserObservation['editor']>['visuals'] = [];
    let importState: NonNullable<XArticleBrowserObservation['editor']>['import_state'] = null;
    let finalized: Awaited<ReturnType<typeof adapter.next>> | null = null;

    const editorValue = () => ({
      canonical_url: `https://x.com/compose/articles/edit/${draftId}`, page_kind: 'article_editor',
      controls: editorControls,
      editor: {
        draft_id: draftId, title, blocks: projectedBlocks, visuals, import_state: importState,
        has_unknown_content: false, autosave_state: 'saved'
      }
    });

    while (finalized === null) {
      const step = await adapter.next(execution.execution_id);
      if (step.command === null) {
        finalized = step;
        break;
      }
      const command = step.command;
      if (command.kind === 'observe_article_page' && command.payload.kind === 'observe_article_page') {
        if (command.payload.scope === 'index') {
          await succeed(adapter, command, {
            canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
            controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
          });
          continue;
        }
        expect(command).toMatchObject({
          side_effect: 'read', payload: { scope: 'public_article' }
        });
        await succeed(adapter, command, {
          canonical_url: `https://x.com/Glen56121/article/${articleId}`, page_kind: 'public_article',
          public_article: {
            article_id: articleId, canonical_url: `https://x.com/Glen56121/article/${articleId}`,
            author_handle: '@Glen56121', title, blocks: projectedBlocks,
            visuals: visuals.map((visual) => ({ ...visual, owned_by_execution: false })),
            published_at: '2026-08-21T09:02:00.000Z'
          }
        });
        continue;
      }
      if (command.kind === 'create_article_draft') {
        await succeed(adapter, command, editorValue());
        continue;
      }
      if (command.kind === 'set_article_title' && command.payload.kind === 'set_article_title') {
        title = command.payload.title;
        await succeed(adapter, command, editorValue());
        continue;
      }
      if (command.kind === 'import_article_document' && command.payload.kind === 'import_article_document') {
        importState = {
          template_digest: command.payload.template.template_digest,
          source_document_digest: command.payload.template.source_document_digest,
          unresolved_anchors: command.payload.template.anchors
        };
        projectedBlocks = plan.intent.document.blocks.filter((block) => block.kind !== 'image');
        await succeed(adapter, command, editorValue());
        continue;
      }
      if (
        command.kind === 'replace_article_visual_anchor' &&
        command.payload.kind === 'replace_article_visual_anchor'
      ) {
        expect(importState?.unresolved_anchors[0]).toEqual(command.payload.anchor);
        const unresolvedAnchors = importState!.unresolved_anchors.slice(1);
        visuals = [...visuals, {
          ref: `visual_${command.payload.anchor.block_ordinal}`,
          asset_id: command.payload.asset.asset_id, kind: 'inline',
          block_ordinal: command.payload.anchor.block_ordinal,
          alt_text: command.payload.asset.alt_text, status: 'uploaded', owned_by_execution: true
        }];
        if (unresolvedAnchors.length === 0) {
          importState = null;
          projectedBlocks = plan.intent.document.blocks;
        } else {
          importState = { ...importState!, unresolved_anchors: unresolvedAnchors };
          const unresolvedOrdinals = new Set(unresolvedAnchors.map((anchor) => anchor.block_ordinal));
          projectedBlocks = plan.intent.document.blocks.filter((block, index) =>
            block.kind !== 'image' || !unresolvedOrdinals.has(index + 1)
          );
        }
        await succeed(adapter, command, editorValue());
        continue;
      }
      if (command.kind === 'open_article_preview') {
        expect(importState).toBeNull();
        await succeed(adapter, command, {
          canonical_url: `https://x.com/compose/articles/edit/${draftId}/preview`, page_kind: 'article_preview',
          controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
          preview: { draft_id: draftId, title, blocks: projectedBlocks, visuals }
        });
        continue;
      }
      if (command.kind === 'open_publish_review') {
        await succeed(adapter, command, {
          canonical_url: `https://x.com/compose/articles/edit/${draftId}/preview`, page_kind: 'publish_review',
          controls: [{ ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }],
          publish_review: { draft_id: draftId, audience: 'everyone', final_publish_ref: 'publish_final' }
        });
        continue;
      }
      if (command.kind === 'publish_article_once') {
        await adapter.claim(command);
        await adapter.report({ command, status: 'uncertain', observation: null });
        expect(await adapter.status(execution.execution_id)).toMatchObject({
          state: 'outcome_unknown', publish_command_count: 1
        });
        await adapter.resumeVerification(execution.execution_id);
        continue;
      }
      throw new Error(`unexpected X Article command ${command.kind}`);
    }

    expect(finalized).toMatchObject({
      snapshot: {
        state: 'finalized', publish_command_count: 1,
        latest_receipt_path: 'receipts/receipt_x_article_e2e.json'
      }, command: null
    });
    const receipt = await store.readJson<{ status: string }>('receipts/receipt_x_article_e2e.json');
    expect(receipt).toMatchObject({
      schema_version: '1.0', execution_id: execution.execution_id,
      plan_digest: plan.plan_digest, status: 'published',
      public_evidence: { article_id: articleId, kind: 'full_match' }
    });
    const commands = await store.list(`runs/${execution.execution_id}/x-article/browser/commands`);
    const persisted = await Promise.all(commands
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => store.readJson<XArticleBrowserCommandV1>(`${entry.relative_path}/command.json`)));
    const commandKinds = persisted.map((command) => command.kind);
    const replacementOrdinals = persisted.flatMap((command) =>
      command.payload.kind === 'replace_article_visual_anchor'
        ? [command.payload.anchor.block_ordinal]
        : []
    );
    expect(commandKinds.filter((kind) => kind === 'import_article_document')).toHaveLength(1);
    expect(commandKinds.filter((kind) => kind === 'replace_article_visual_anchor')).toHaveLength(3);
    expect(replacementOrdinals).toEqual(plan.intent.visuals.flatMap((visual) =>
      visual.placement.kind === 'block' ? [visual.placement.block_ordinal] : []
    ));
    expect(commandKinds.filter((kind) => kind === 'insert_article_block')).toHaveLength(0);
    expect(commandKinds.filter((kind) => kind === 'open_article_preview')).toHaveLength(1);
    expect(commandKinds.filter((kind) => kind === 'publish_article_once')).toHaveLength(1);
    expect(finalized.snapshot.publish_command_count).toBe(1);
    expect(receipt.status).toBe('published');
    expect(projectedBlocks).toEqual(plan.intent.document.blocks);
    expect(importState).toBeNull();
    expect(JSON.stringify({ blocks: projectedBlocks, visuals })).not.toContain('RPH_VISUAL_ANCHOR:');
    await expect(store.writeNew('receipts/receipt_x_article_e2e.json', { status: 'changed' }))
      .rejects.toMatchObject({ code: 'ARTIFACT_EXISTS' });
  });
});
