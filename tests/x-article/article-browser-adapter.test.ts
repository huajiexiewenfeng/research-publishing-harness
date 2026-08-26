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
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
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
const bulkCapabilities = {
  ...capabilities,
  capabilities: [
    ...capabilities.capabilities,
    'import_article_document',
    'replace_article_visual_anchor'
  ]
} as const;
const coverAsset = {
  asset_id: 'asset_cover_runtime', relative_path: 'assets/cover.png',
  digest: `sha256:${'b'.repeat(64)}` as `sha256:${string}`, mime_type: 'image/png' as const,
  alt_text: 'Skill knowledge passes through a governed Runtime boundary.', claim_refs: ['claim_runtime']
};
const coverPlan = createXArticlePublicationPlan({
  planId: 'plan_browser_cover', runId: 'run_browser_cover', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_cover', digest: `sha256:${'c'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: coverAsset.asset_id,
    blocks: plan.intent.document.blocks
  },
  visuals: [{ asset: coverAsset, placement: { kind: 'cover' } }],
  plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const coverApproval = approveXArticlePublication(
  coverPlan, 'human:Glen56121', 3_600_000,
  new Date('2026-08-21T09:00:00.000Z'), () => 'approval_browser_cover'
);
const inlineAsset = {
  ...coverAsset,
  asset_id: 'asset_inline_runtime', relative_path: 'assets/runtime.png',
  digest: `sha256:${'d'.repeat(64)}` as `sha256:${string}`, alt_text: 'A governed Runtime boundary.'
};
const inlinePlan = createXArticlePublicationPlan({
  planId: 'plan_browser_inline', runId: 'run_browser_inline', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_inline', digest: `sha256:${'e'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: null,
    blocks: [{ kind: 'image', asset_id: inlineAsset.asset_id, alt_text: inlineAsset.alt_text }]
  },
  visuals: [{ asset: inlineAsset, placement: { kind: 'block', block_ordinal: 1 } }],
  plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const inlineApproval = approveXArticlePublication(
  inlinePlan, 'human:Glen56121', 3_600_000,
  new Date('2026-08-21T09:00:00.000Z'), () => 'approval_browser_inline'
);

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

const editorControls = [
  { ref: 'body', role: 'textbox' as const, name: '', test_id: 'composer', disabled: false },
  { ref: 'preview', role: 'link' as const, name: 'Preview', test_id: null, disabled: false }
];

function editorObservation(
  executionId: string,
  commandId: string,
  editor: NonNullable<XArticleBrowserObservation['editor']>,
  overrides: Record<string, unknown> = {}
) {
  return observed(executionId, commandId, {
    canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776',
    page_kind: 'article_editor', controls: editorControls, editor, ...overrides
  });
}

async function advancePreparedToImport(
  adapter: XArticleBrowserAdapter,
  executionId: string
) {
  let next = await adapter.next(executionId);
  await reportSuccess(adapter, executionId, next.command, observed(executionId, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
    controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
  }));
  next = await adapter.next(executionId);
  await reportSuccess(adapter, executionId, next.command, editorObservation(
    executionId,
    next.command!.command_id,
    {
      draft_id: '2090731994279755776', title: '', blocks: [], visuals: [],
      import_state: null, has_unknown_content: false, autosave_state: 'saved'
    }
  ));
  return adapter.next(executionId);
}

describe('XArticleBrowserAdapter', () => {
  it('rejects prepared materialization when bulk import is unavailable', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-no-bulk-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract());

    await expect(adapter.prepare(plan, capabilities))
      .rejects.toMatchObject({ code: 'ARTICLE_BULK_IMPORT_REQUIRED' });
  });

  it('prepares checkpoint-backed materialization without Publish approval', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-prepare-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_prepare_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });

    const execution = await adapter.prepare(plan, bulkCapabilities);

    expect(execution).toMatchObject({ state: 'created', publish_command_count: 0 });
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({ execution_mode: 'materialization_v3_2', approval: null });
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/materialization-plan.json`))
      .resolves.toMatchObject({ execution_id: execution.execution_id, strategy: 'rich_text_anchor_import/v1' });
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toMatchObject({ execution_id: execution.execution_id, revision: 0, phase: 'preflight_pending' });
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/approval.json`))
      .resolves.toBe(false);
  });

  it('keeps start as the explicit legacy_preapproved compatibility mode', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-legacy-mode-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_legacy_mode_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });

    const execution = await adapter.start(plan, approval, capabilities);

    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({ execution_mode: 'legacy_preapproved', approval });
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-plan.json`))
      .resolves.toBe(false);
  });

  it('preserves the legacy approval notifier and does not announce prepare as approved', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-notifier-')));
    const notifications: string[] = [];
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: (() => { let n = 0; return () => `execution_notifier_${++n}`; })(),
      terminalNotifier: {
        async notify(input) {
          notifications.push(input.kind);
          return { status: 'complete' } as never;
        }
      },
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });

    await adapter.prepare(plan, bulkCapabilities);
    expect(notifications).toEqual([]);
    await adapter.start(plan, approval, capabilities);
    expect(notifications).toEqual(['publication_plan_approved']);
  });

  it('materializes only through bulk import and stops at confirmation_pending', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-materialize-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_materialize_1',
      eventId: (() => { let n = 0; return () => `event_materialize_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_materialize_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    let next = await advancePreparedToImport(adapter, execution.execution_id);
    expect(next.command?.payload.kind).toBe('import_article_document');

    const template = createXArticleImportTemplate(plan.intent.document);
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: plan.intent.document.title,
        blocks: plan.intent.document.blocks, visuals: [], has_unknown_content: false,
        autosave_state: 'saved',
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: []
        }
      }
    ));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.payload).toEqual({ kind: 'observe_article_page', scope: 'editor' });
    const reconciled = await adapter.report({
      command: next.command!, status: 'success', observation: editorObservation(
        execution.execution_id,
        next.command!.command_id,
        {
          draft_id: '2090731994279755776', title: plan.intent.document.title,
          blocks: plan.intent.document.blocks, visuals: [], import_state: null,
          has_unknown_content: false, autosave_state: 'saved'
        }
      )
    });
    expect(reconciled).toMatchObject({ state: 'materialization_reconciling', publish_command_count: 0 });
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('open_article_preview');
    await adapter.claim(next.command!);
    const completed = await adapter.report({
      command: next.command!, status: 'success', observation: observed(
        execution.execution_id,
        next.command!.command_id,
        {
          canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776/preview',
          page_kind: 'article_preview', controls: [],
          preview: {
            draft_id: '2090731994279755776', title: plan.intent.document.title,
            blocks: plan.intent.document.blocks, visuals: []
          }
        }
      )
    });
    expect(completed).toMatchObject({ state: 'confirmation_pending', publish_command_count: 0 });
    expect((await adapter.next(execution.execution_id)).command).toBeNull();
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toMatchObject({
        phase: 'preview_verified', body: { status: 'verified' },
        publish_confirmation: 'absent'
      });
  });

  it('observes an uncertain bulk import and never falls back or retries it', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-uncertain-import-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_uncertain_import_1',
      eventId: (() => { let n = 0; return () => `event_uncertain_import_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_uncertain_import_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const importing = await advancePreparedToImport(adapter, execution.execution_id);
    expect(importing.command?.kind).toBe('import_article_document');
    await adapter.claim(importing.command!);
    await expect(adapter.report({ command: importing.command!, status: 'uncertain', observation: null }))
      .resolves.toMatchObject({ state: 'materialization_reconciling' });

    const observing = await adapter.next(execution.execution_id);
    expect(observing.command?.kind).toBe('observe_article_page');
    expect(observing.command?.kind).not.toBe('insert_article_block');
    expect((await adapter.next(execution.execution_id)).command?.command_id)
      .toBe(observing.command?.command_id);
  });

  it('resumes an issued body by observing instead of re-importing', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-body-crash-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_body_crash_1',
      eventId: (() => { let n = 0; return () => `event_body_crash_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_body_crash_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const importing = await advancePreparedToImport(adapter, execution.execution_id);
    await adapter.claim(importing.command!);

    const resumed = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      eventId: (() => { let n = 20; return () => `event_body_crash_${++n}`; })(),
      commandId: (() => { let n = 20; return () => `command_body_crash_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    await expect(resumed.resumeEditor(execution.execution_id))
      .resolves.toMatchObject({ state: 'materialization_reconciling' });
    expect((await resumed.next(execution.execution_id)).command?.kind).toBe('observe_article_page');
  });

  it('resumes an issued anchor from the observed prefix without replacing it twice', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-anchor-crash-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_anchor_crash_1',
      eventId: (() => { let n = 0; return () => `event_anchor_crash_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_anchor_crash_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(inlinePlan, bulkCapabilities);
    let next = await advancePreparedToImport(adapter, execution.execution_id);
    const template = createXArticleImportTemplate(inlinePlan.intent.document);
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: inlinePlan.intent.document.title,
        blocks: [], visuals: [], has_unknown_content: false, autosave_state: 'saved',
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: template.anchors
        }
      }
    ));
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('replace_article_visual_anchor');
    await adapter.claim(next.command!);

    const resumed = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      eventId: (() => { let n = 20; return () => `event_anchor_crash_${++n}`; })(),
      commandId: (() => { let n = 20; return () => `command_anchor_crash_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    await resumed.resumeEditor(execution.execution_id);
    next = await resumed.next(execution.execution_id);
    expect(next.command?.kind).toBe('observe_article_page');
    await reportSuccess(resumed, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: inlinePlan.intent.document.title,
        blocks: inlinePlan.intent.document.blocks,
        visuals: [{
          ref: 'inline_ref_1', asset_id: inlineAsset.asset_id, kind: 'inline',
          block_ordinal: 1, alt_text: inlineAsset.alt_text, status: 'uploaded',
          owned_by_execution: true
        }],
        has_unknown_content: false, autosave_state: 'saved',
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: []
        }
      }
    ));
    next = await resumed.next(execution.execution_id);
    expect(next.command?.kind).toBe('observe_article_page');
    expect(next.command?.kind).not.toBe('replace_article_visual_anchor');
    await reportSuccess(resumed, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: inlinePlan.intent.document.title,
        blocks: inlinePlan.intent.document.blocks,
        visuals: [{
          ref: 'inline_ref_1', asset_id: inlineAsset.asset_id, kind: 'inline',
          block_ordinal: 1, alt_text: inlineAsset.alt_text, status: 'uploaded',
          owned_by_execution: true
        }],
        import_state: null, has_unknown_content: false, autosave_state: 'saved'
      }
    ));
    next = await resumed.next(execution.execution_id);
    expect(next.command?.kind).toBe('open_article_preview');
    await reportSuccess(resumed, execution.execution_id, next.command, observed(
      execution.execution_id,
      next.command!.command_id,
      {
        canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776/preview',
        page_kind: 'article_preview', controls: [],
        preview: {
          draft_id: '2090731994279755776', title: inlinePlan.intent.document.title,
          blocks: inlinePlan.intent.document.blocks,
          visuals: [{
            ref: 'inline_ref_1', asset_id: inlineAsset.asset_id, kind: 'inline',
            block_ordinal: 1, alt_text: inlineAsset.alt_text, status: 'uploaded',
            owned_by_execution: true
          }]
        }
      }
    ));
    expect(await resumed.status(execution.execution_id)).toMatchObject({ state: 'confirmation_pending' });
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toMatchObject({
        phase: 'preview_verified',
        media: [{
          status: 'completed', observed_media_ref: 'inline_ref_1',
          observed_context_digest: expect.stringMatching(/^sha256:/)
        }]
      });
  });

  it('reconciles an observation attached to an uncertain import report', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-uncertain-observed-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_uncertain_observed_1',
      eventId: (() => { let n = 0; return () => `event_uncertain_observed_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_uncertain_observed_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const importing = await advancePreparedToImport(adapter, execution.execution_id);
    const template = createXArticleImportTemplate(plan.intent.document);
    await adapter.claim(importing.command!);
    await adapter.report({
      command: importing.command!, status: 'uncertain', observation: editorObservation(
        execution.execution_id,
        importing.command!.command_id,
        {
          draft_id: '2090731994279755776', title: plan.intent.document.title,
          blocks: plan.intent.document.blocks, visuals: [], has_unknown_content: false,
          autosave_state: 'saved', import_state: {
            template_digest: template.template_digest,
            source_document_digest: template.source_document_digest,
            unresolved_anchors: []
          }
        }
      )
    });
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toMatchObject({ body: { status: 'verified' }, phase: 'body_imported' });
  });

  it('resumeEditor validates the latest durable observation against its checkpoint', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-resume-identity-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_resume_identity_1',
      eventId: (() => { let n = 0; return () => `event_resume_identity_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_resume_identity_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    let next = await advancePreparedToImport(adapter, execution.execution_id);
    const template = createXArticleImportTemplate(plan.intent.document);
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: plan.intent.document.title,
        blocks: plan.intent.document.blocks, visuals: [], has_unknown_content: false,
        autosave_state: 'saved', import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: []
        }
      }
    ));
    next = await adapter.next(execution.execution_id);
    await adapter.claim(next.command!);
    await expect(adapter.report({ command: next.command!, status: 'rejected', observation: null }))
      .resolves.toMatchObject({ state: 'pre_publish_failed' });

    const contextPath = `runs/${execution.execution_id}/x-article/browser/adapter-context.json`;
    const context = await store.readJson<Record<string, unknown>>(contextPath);
    const latest = context.latest_observation as XArticleBrowserObservation;
    await store.replaceAtomic(contextPath, {
      ...context,
      latest_observation: { ...latest, account_handle: '@ForeignAccount' }
    });

    await expect(adapter.resumeEditor(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_MATERIALIZATION_DRIFT' });
    await expect(adapter.status(execution.execution_id))
      .resolves.toMatchObject({ state: 'materialization_blocked' });
  });

  it('accepts an exact duplicate browser report idempotently', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-report-replay-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_report_replay_1',
      eventId: (() => { let n = 0; return () => `event_report_replay_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_report_replay_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const next = await adapter.next(execution.execution_id);
    const observation = observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
      controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
    });
    await adapter.claim(next.command!);
    const first = await adapter.report({ command: next.command!, status: 'success', observation });
    const duplicate = await adapter.report({ command: next.command!, status: 'success', observation });
    expect(duplicate).toEqual(first);
    await expect(adapter.report({
      command: { ...next.command!, purpose: 'forged_replay' },
      status: 'success', observation
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it.each([
    ['stale revision', (value: XArticleBrowserObservation) => ({
      ...value, page_revision: `sha256:${'0'.repeat(64)}`
    } as XArticleBrowserObservation)],
    ['foreign account', (value: XArticleBrowserObservation) => editorObservation(
      value.execution_id, value.command_id, value.editor!, { account_handle: '@OtherAccount' }
    )],
    ['ambiguous editor', (value: XArticleBrowserObservation) => editorObservation(
      value.execution_id, value.command_id, { ...value.editor!, has_unknown_content: true }
    )],
    ['content drift', (value: XArticleBrowserObservation) => editorObservation(
      value.execution_id, value.command_id, {
        ...value.editor!,
        blocks: [{ kind: 'paragraph', runs: [{ text: 'Changed content', marks: [], link: null }] }]
      }
    )]
  ])('blocks materialization on a %s observation', async (_name, mutate) => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-blocked-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => `execution_blocked_${_name.replace(/\W/g, '_')}`,
      eventId: (() => { let n = 0; return () => `event_blocked_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_blocked_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const importing = await advancePreparedToImport(adapter, execution.execution_id);
    const template = createXArticleImportTemplate(plan.intent.document);
    const valid = editorObservation(execution.execution_id, importing.command!.command_id, {
      draft_id: '2090731994279755776', title: plan.intent.document.title,
      blocks: plan.intent.document.blocks, visuals: [], has_unknown_content: false,
      autosave_state: 'saved', import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: []
      }
    });
    await adapter.claim(importing.command!);
    await expect(adapter.report({
      command: importing.command!, status: 'success', observation: mutate(valid)
    })).resolves.toMatchObject({ state: 'materialization_blocked' });
    expect((await adapter.next(execution.execution_id)).command).toBeNull();
    await expect(adapter.resumeEditor(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_MATERIALIZATION_DRIFT' });
  });

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

  it('does not require a cover Alt command when the versioned contract marks it unobservable', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cover-cap-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_cover_cap_1', eventId: () => 'event_cover_cap_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    await expect(adapter.start(coverPlan, coverApproval, {
      ...capabilities,
      capabilities: [...capabilities.capabilities, 'upload_article_cover']
    })).resolves.toMatchObject({ state: 'created' });
  });

  it('keeps the inline-image Alt capability fail-closed', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-inline-cap-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_inline_cap_1', eventId: () => 'event_inline_cap_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    await expect(adapter.start(inlinePlan, inlineApproval, {
      ...capabilities,
      capabilities: [...capabilities.capabilities, 'insert_article_image']
    })).rejects.toMatchObject({ code: 'BROWSER_EXECUTOR_INCOMPATIBLE' });
  });

  it('resumes the exact saved editor after a pre-Publish command failure without creating another draft', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-editor-resume-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_editor_resume_1',
      eventId: (() => { let n = 0; return () => `event_resume_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_resume_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.start(plan, approval, capabilities);

    let next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
      controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
    }));
    next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776', page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: true }
      ],
      editor: {
        draft_id: '2090731994279755776', title: '', blocks: [], visuals: [],
        import_state: null, has_unknown_content: false, autosave_state: 'saved'
      }
    }));
    next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776', page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: true }
      ],
      editor: {
        draft_id: '2090731994279755776', title: plan.intent.document.title, blocks: [], visuals: [],
        import_state: null, has_unknown_content: false, autosave_state: 'saved'
      }
    }));
    next = await adapter.next(execution.execution_id);
    await adapter.claim(next.command!);
    await expect(adapter.report({ command: next.command!, status: 'rejected', observation: null }))
      .resolves.toMatchObject({ state: 'pre_publish_failed', publish_command_count: 0 });

    await expect(adapter.resumeEditor(execution.execution_id))
      .resolves.toMatchObject({ state: 'content_filling', draft_id: '2090731994279755776' });
    next = await adapter.next(execution.execution_id);
    expect(next.command).toMatchObject({
      kind: 'insert_article_block', draft_id: '2090731994279755776',
      payload: { kind: 'insert_article_block', block_ordinal: 1 }
    });
  });

  it('installs a fresh same-Plan Approval immutably before Publish', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-approval-refresh-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_approval_refresh_1', eventId: () => 'event_approval_refresh_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.start(plan, approval, capabilities);
    const refreshed = approveXArticlePublication(
      plan, 'human:Glen56121', 3_600_000,
      new Date('2026-08-21T09:00:30.000Z'), () => 'approval_browser_refreshed'
    );

    await expect(adapter.refreshApproval(execution.execution_id, refreshed))
      .resolves.toMatchObject({ state: 'created', publish_command_count: 0 });
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/approval-refreshes/${refreshed.approval_id}.json`
    )).resolves.toEqual(refreshed);

    const stale = approveXArticlePublication(
      plan, 'human:Glen56121', 1_000,
      new Date('2026-08-21T08:00:00.000Z'), () => 'approval_browser_stale'
    );
    await expect(adapter.refreshApproval(execution.execution_id, stale))
      .rejects.toMatchObject({ code: 'APPROVAL_STALE' });
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
