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
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { approveXArticlePublication } from '../../harnesses/research-publishing/core/x-article-approval.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

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
    const manifestBase = { schema_version: '1.0', article_run_id: 'article_e2e', bindings: [] };
    const files = {
      'article.md': '# Runtime boundary\n\nSkills own semantics.\n',
      'visual-manifest.json': { ...manifestBase, manifest_digest: sha256(manifestBase) },
      'draft-candidate.json': {
        schema_version: '1.0', run_id: 'article_e2e', title: 'Runtime boundary',
        summary: 'Skills own semantics.', language: 'en', sections: [{
          section_id: 'boundary', heading: 'Boundary', markdown: 'Skills own semantics.',
          claim_refs: [], source_refs: []
        }], visual_slots: [], open_questions: []
      }
    };
    const packageRef = {
      root,
      digest: sha256(Object.entries(files)
        .map(([path, value]) => ({ path, digest: sha256(value) }))
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
        'insert_article_block', 'open_article_preview', 'open_publish_review',
        'publish_article_once'
      ], observed_at: '2026-08-21T09:00:00.000Z'
    });
    const draftId = '2090731994279755776';

    let next = await adapter.next(execution.execution_id);
    await succeed(adapter, next.command!, {
      canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
      controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
    });
    next = await adapter.next(execution.execution_id);
    await succeed(adapter, next.command!, {
      canonical_url: `https://x.com/compose/articles/edit/${draftId}`, page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: true }
      ],
      editor: { draft_id: draftId, title: '', blocks: [], visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved' }
    });
    next = await adapter.next(execution.execution_id);
    await succeed(adapter, next.command!, {
      canonical_url: `https://x.com/compose/articles/edit/${draftId}`, page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: true }
      ],
      editor: { draft_id: draftId, title: plan.intent.document.title, blocks: [], visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved' }
    });
    next = await adapter.next(execution.execution_id);
    await succeed(adapter, next.command!, {
      canonical_url: `https://x.com/compose/articles/edit/${draftId}`, page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
      ],
      editor: { draft_id: draftId, title: plan.intent.document.title, blocks: plan.intent.document.blocks, visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved' }
    });
    next = await adapter.next(execution.execution_id);
    await succeed(adapter, next.command!, {
      canonical_url: `https://x.com/compose/articles/edit/${draftId}/preview`, page_kind: 'article_preview',
      controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
      preview: { draft_id: draftId, title: plan.intent.document.title, blocks: plan.intent.document.blocks, visuals: [] }
    });
    next = await adapter.next(execution.execution_id);
    await succeed(adapter, next.command!, {
      canonical_url: `https://x.com/compose/articles/edit/${draftId}/preview`, page_kind: 'publish_review',
      controls: [{ ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }],
      publish_review: { draft_id: draftId, audience: 'everyone', final_publish_ref: 'publish_final' }
    });
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('publish_article_once');
    await adapter.claim(next.command!);
    await adapter.report({ command: next.command!, status: 'uncertain', observation: null });
    expect(await adapter.status(execution.execution_id)).toMatchObject({
      state: 'outcome_unknown', publish_command_count: 1
    });

    await adapter.resumeVerification(execution.execution_id);
    next = await adapter.next(execution.execution_id);
    expect(next.command).toMatchObject({
      kind: 'observe_article_page', side_effect: 'read',
      payload: { kind: 'observe_article_page', scope: 'public_article' }
    });
    const articleId = '2091000000000000000';
    await succeed(adapter, next.command!, {
      canonical_url: `https://x.com/Glen56121/article/${articleId}`, page_kind: 'public_article',
      public_article: {
        article_id: articleId, canonical_url: `https://x.com/Glen56121/article/${articleId}`,
        author_handle: '@Glen56121', title: plan.intent.document.title,
        blocks: plan.intent.document.blocks, visuals: [], published_at: '2026-08-21T09:02:00.000Z'
      }
    });
    const finalized = await adapter.next(execution.execution_id);
    expect(finalized).toMatchObject({
      snapshot: {
        state: 'finalized', publish_command_count: 1,
        latest_receipt_path: 'receipts/receipt_x_article_e2e.json'
      }, command: null
    });
    await expect(store.readJson('receipts/receipt_x_article_e2e.json')).resolves.toMatchObject({
      schema_version: '1.0', execution_id: execution.execution_id,
      plan_digest: plan.plan_digest, status: 'published',
      public_evidence: { article_id: articleId, kind: 'full_match' }
    });
    const commands = await store.list(`runs/${execution.execution_id}/x-article/browser/commands`);
    const persisted = await Promise.all(commands
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => store.readJson<XArticleBrowserCommandV1>(`${entry.relative_path}/command.json`)));
    expect(persisted.filter((command) => command.kind === 'publish_article_once')).toHaveLength(1);
  });
});
