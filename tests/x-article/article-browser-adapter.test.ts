import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { approveXArticlePublication } from '../../harnesses/research-publishing/core/x-article-approval.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const plan = createXArticlePublicationPlan({
  planId: 'plan_browser_1', runId: 'run_browser_1', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_1', digest: `sha256:${'a'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: null,
    blocks: [{ kind: 'paragraph', runs: [{ text: 'Skills own semantics.', marks: [], link: null }] }]
  },
  visuals: [], plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const approval = approveXArticlePublication(
  plan, 'human:Glen56121', 3_600_000, new Date('2026-08-21T09:00:00.000Z'), () => 'approval_browser_1'
);
const capabilities = {
  executor: 'codex-chrome', executor_version: '26.818.31338', browser_family: 'chrome',
  capabilities: ['observe_article_page', 'create_article_draft', 'set_article_title', 'insert_article_block', 'open_article_preview', 'open_publish_review', 'publish_article_once'],
  observed_at: '2026-08-21T09:00:00.000Z'
} as const;

function observed(executionId: string, commandId: string, value: Record<string, unknown>) {
  const input = {
    schema_version: '1.0', observation_id: `obs_${commandId}`, execution_id: executionId,
    command_id: commandId, origin: 'https://x.com', observed_at: '2026-08-21T09:00:01.000Z',
    account_handle: '@Glen56121', controls: [], editor: null, preview: null,
    publish_review: null, public_article: null, ...value
  } as const;
  return { ...input, page_revision: computeXArticlePageRevision(input) } as unknown as XArticleBrowserObservation;
}

async function reportSuccess(
  adapter: XArticleBrowserAdapter,
  _executionId: string,
  command: Awaited<ReturnType<XArticleBrowserAdapter['next']>>['command'],
  observation: ReturnType<typeof observed>
): Promise<void> {
  if (command === null) throw new Error('expected command');
  await adapter.claim(command);
  await adapter.report({ command, status: 'success', observation });
}

describe('XArticleBrowserAdapter', () => {
  it('persists bulk import strategy only when both capabilities are advertised', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-capabilities-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_capabilities_1', eventId: () => 'event_capabilities_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const bulkCapabilities = {
      ...capabilities,
      capabilities: [
        ...capabilities.capabilities,
        'import_article_document',
        'replace_article_visual_anchor'
      ]
    } as const;

    const execution = await adapter.start(plan, approval, bulkCapabilities);

    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({ import_strategy: 'bulk_document' });
  });

  it.each(['import_article_document', 'replace_article_visual_anchor'] as const)(
    'rejects a manifest advertising only %s as incompatible',
    async (capability) => {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-partial-capability-')));
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => 'execution_partial_capability_1', eventId: () => 'event_partial_capability_1',
        now: () => new Date('2026-08-21T09:01:00.000Z')
      });

      await expect(adapter.start(plan, approval, {
        ...capabilities,
        capabilities: [...capabilities.capabilities, capability]
      })).rejects.toMatchObject({ code: 'BROWSER_EXECUTOR_INCOMPATIBLE' });
    }
  );

  it('persists bulk import issuance and never re-imports a completed zero-block document after resumption', async () => {
    const zeroBlockPlan = createXArticlePublicationPlan({
      planId: 'plan_zero_block_1', runId: 'run_zero_block_1', targetAccount: '@Glen56121',
      articlePackage: { root: 'articles/runtime/article_zero_block_1', digest: `sha256:${'8'.repeat(64)}` },
      document: {
        schema_version: '1.0', title: 'Title-only Article', cover_asset_id: null, blocks: []
      },
      visuals: [], plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
    });
    const zeroBlockApproval = approveXArticlePublication(
      zeroBlockPlan, 'human:Glen56121', 3_600_000,
      new Date('2026-08-21T09:00:00.000Z'), () => 'approval_zero_block_1'
    );
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-zero-block-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_zero_block_1',
      eventId: (() => { let n = 0; return () => `event_zero_block_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_zero_block_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const bulkCapabilities = {
      ...capabilities,
      capabilities: [
        ...capabilities.capabilities,
        'import_article_document',
        'replace_article_visual_anchor'
      ]
    } as const;
    const execution = await adapter.start(zeroBlockPlan, zeroBlockApproval, bulkCapabilities);
    const editorControls = [
      { ref: 'title', role: 'textbox' as const, name: 'Add a title', test_id: null, disabled: false },
      { ref: 'body', role: 'textbox' as const, name: '', test_id: 'composer', disabled: false },
      { ref: 'preview', role: 'link' as const, name: 'Preview', test_id: null, disabled: false },
      { ref: 'publish', role: 'button' as const, name: 'Publish', test_id: null, disabled: true }
    ];

    let next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id,
      next.command!.command_id,
      {
        canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
        controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
      }
    ));

    next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id,
      next.command!.command_id,
      {
        canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776', page_kind: 'article_editor',
        controls: editorControls,
        editor: {
          draft_id: '2090731994279755776', title: '', blocks: [], visuals: [],
          import_state: null, has_unknown_content: false, autosave_state: 'saved'
        }
      }
    ));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload.kind).toBe('set_article_title');
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id,
      next.command!.command_id,
      {
        canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776', page_kind: 'article_editor',
        controls: editorControls,
        editor: {
          draft_id: '2090731994279755776', title: zeroBlockPlan.intent.document.title,
          blocks: [], visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved'
        }
      }
    ));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload.kind).toBe('import_article_document');
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({ bulk_import_issued: true });
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id,
      next.command!.command_id,
      {
        canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776', page_kind: 'article_editor',
        controls: editorControls,
        editor: {
          draft_id: '2090731994279755776', title: zeroBlockPlan.intent.document.title,
          blocks: [], visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved'
        }
      }
    ));

    const resumed = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    next = await resumed.next(execution.execution_id);

    expect(next.command?.payload.kind).toBe('open_article_preview');
    expect(next.command?.payload.kind).not.toBe('import_article_document');
  });

  it('cancels only before Publish and does not expose verification recovery from a preflight state', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cancel-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_cancel_1', eventId: () => 'event_cancel_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.start(plan, approval, capabilities);

    await expect(adapter.resumeVerification(execution.execution_id))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
    await expect(adapter.cancelBeforePublish(execution.execution_id))
      .resolves.toMatchObject({ state: 'cancelled_before_publish', publish_command_count: 0 });
  });

  it('drives a verified draft to exactly one final Publish command', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-adapter-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_browser_1', eventId: (() => { let n = 0; return () => `event_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_${++n}`; })(),
      attemptId: () => 'attempt_1', now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.start(plan, approval, capabilities);

    let next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
      controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
    }));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload.kind).toBe('create_article_draft');
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776', page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: true }
      ],
      editor: { draft_id: '2090731994279755776', title: '', blocks: [], visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved' }
    }));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload.kind).toBe('set_article_title');
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776', page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: true }
      ],
      editor: { draft_id: '2090731994279755776', title: plan.intent.document.title, blocks: [], visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved' }
    }));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload.kind).toBe('insert_article_block');
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776', page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
      ],
      editor: { draft_id: '2090731994279755776', title: plan.intent.document.title, blocks: plan.intent.document.blocks, visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved' }
    }));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload.kind).toBe('open_article_preview');
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776/preview', page_kind: 'article_preview',
      controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
      preview: { draft_id: '2090731994279755776', title: plan.intent.document.title, blocks: plan.intent.document.blocks, visuals: [] }
    }));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload.kind).toBe('open_publish_review');
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776/preview', page_kind: 'publish_review',
      controls: [{ ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }],
      publish_review: { draft_id: '2090731994279755776', audience: 'everyone', final_publish_ref: 'publish_final' }
    }));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload.kind).toBe('publish_article_once');
    expect(next.snapshot).toMatchObject({ state: 'publish_attempted', publish_command_count: 1 });
    expect((await adapter.next(execution.execution_id)).command).toBeNull();
    expect((await adapter.status(execution.execution_id)).publish_command_count).toBe(1);
  });
});
