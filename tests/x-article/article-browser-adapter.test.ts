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
import type { XArticlePageContract } from '../../harnesses/research-publishing/adapters/x/article-browser/article-page-contract.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { approveXArticlePublication } from '../../harnesses/research-publishing/core/x-article-approval.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  confirmXArticleFastPath,
  createXArticleFastPathAudit
} from '../../harnesses/research-publishing/core/x-article-fast-path.js';
import type { XArticleFastPathReleaseSetV1 } from '../../harnesses/research-publishing/core/x-article-fast-path-release.js';
import { createXArticlePublishConfirmation } from '../../harnesses/research-publishing/core/x-article-publish-confirmation.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { computeXArticleExistingDraftRevision } from '../../harnesses/research-publishing/core/x-article-existing-draft-binding.js';
import { createXArticlePublicationPreflight } from '../../harnesses/research-publishing/branches/x-article-harness/article-publication-preflight.js';
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
const coverBulkCapabilities = {
  ...bulkCapabilities,
  capabilities: [...bulkCapabilities.capabilities, 'upload_article_cover']
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
const coverOnlyPlan = createXArticlePublicationPlan({
  planId: 'plan_browser_cover_only', runId: 'run_browser_cover_only', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_cover_only', digest: `sha256:${'f'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Cover only', cover_asset_id: coverAsset.asset_id, blocks: []
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
const coverInlinePlan = createXArticlePublicationPlan({
  planId: 'plan_browser_cover_inline', runId: 'run_browser_cover_inline', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/article_cover_inline', digest: `sha256:${'9'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: coverAsset.asset_id,
    blocks: [
      ...plan.intent.document.blocks,
      { kind: 'image', asset_id: inlineAsset.asset_id, alt_text: inlineAsset.alt_text }
    ]
  },
  visuals: [
    { asset: coverAsset, placement: { kind: 'cover' } },
    { asset: inlineAsset, placement: { kind: 'block', block_ordinal: 2 } }
  ],
  plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});

const fastPathReleaseSet: XArticleFastPathReleaseSetV1 = {
  harness_protocol: 'x-article-materialization/v3.4',
  registry_protocol: 'x-article-materialization/v3.4',
  skill_protocol: 'x-article-materialization/v3.4',
  browser_host_protocol: 'x-article-materialization/v3.4'
};

function fastPathInput(draftTarget: { kind: 'new' } | { kind: 'existing'; draft_id: string }) {
  const audit = createXArticleFastPathAudit({
    preflight: createXArticlePublicationPreflight({
      document: coverInlinePlan.intent.document,
      visuals: coverInlinePlan.intent.visuals
    }),
    publication_plan: coverInlinePlan,
    draft_target: draftTarget
  });
  return {
    audit,
    confirmation: confirmXArticleFastPath(
      audit,
      'human:Glen56121',
      3_600_000,
      new Date('2026-08-21T09:00:00.000Z')
    ),
    capabilities: coverBulkCapabilities,
    release_set: fastPathReleaseSet
  };
}

function observed(executionId: string, commandId: string, value: Record<string, unknown>) {
  const input = {
    schema_version: '1.0', observation_id: `obs_${commandId}`, execution_id: executionId,
    command_id: commandId, origin: 'https://x.com', observed_at: '2026-08-21T09:01:00.000Z',
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
  { ref: 'title', role: 'textbox' as const, name: 'Add a title', test_id: null, disabled: false },
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

function existingBodyCompleteObservation(
  executionId: string,
  commandId: string,
  observedAt = '2026-08-21T09:01:00.000Z'
) {
  const template = createXArticleImportTemplate(coverInlinePlan.intent.document);
  return observed(executionId, commandId, {
    canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
    page_kind: 'article_editor', controls: editorControls, observed_at: observedAt,
    editor: {
      draft_id: '2092851979932647424', title: coverInlinePlan.intent.document.title,
      blocks: coverInlinePlan.intent.document.blocks.filter((block) => block.kind !== 'image'),
      visuals: [], has_unknown_content: false, autosave_state: 'saved',
      import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: template.anchors
      }
    }
  });
}

function freshBodyCompleteObservation(
  executionId: string,
  commandId: string,
  observedAt = '2026-08-21T09:02:00.000Z'
) {
  return existingBodyCompleteObservation(executionId, commandId, observedAt);
}

type InlineRecoveryImage = 'matching' | 'unknown' | null;

function inlineBodyCompleteObservation(
  executionId: string,
  commandId: string,
  options: {
    readonly anchor: boolean;
    readonly image: InlineRecoveryImage;
    readonly observedAt?: string;
  }
) {
  const template = createXArticleImportTemplate(inlinePlan.intent.document);
  const matchingVisual = {
    ref: 'inline_recovery_ref', asset_id: inlineAsset.asset_id, kind: 'inline' as const,
    block_ordinal: 1, alt_text: inlineAsset.alt_text, status: 'uploaded' as const,
    owned_by_execution: true
  };
  return editorObservation(executionId, commandId, {
    draft_id: '2092851979932647424', title: inlinePlan.intent.document.title,
    blocks: options.anchor ? [] : inlinePlan.intent.document.blocks,
    visuals: options.image === 'matching' ? [matchingVisual] : [],
    import_state: options.anchor ? {
      template_digest: template.template_digest,
      source_document_digest: template.source_document_digest,
      unresolved_anchors: template.anchors
    } : null,
    has_unknown_content: options.image === 'unknown', autosave_state: 'saved'
  }, {
    canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
    observed_at: options.observedAt ?? '2026-08-21T09:01:00.000Z'
  });
}

async function createAdoptedInlineRecoveryFixture(suffix: string) {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-existing-inline-recovery-${suffix}-`)));
  const executionId = `execution_existing_inline_recovery_${suffix}`;
  let commandNumber = 0;
  let eventNumber = 0;
  const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
    executionId: () => executionId,
    commandId: () => `command_existing_inline_recovery_${suffix}_${++commandNumber}`,
    eventId: () => `event_existing_inline_recovery_${suffix}_${++eventNumber}`,
    now: () => new Date('2026-08-21T09:01:00.000Z')
  });
  const template = createXArticleImportTemplate(inlinePlan.intent.document);
  const source = editorObservation('source_inline_recovery', `source_command_${suffix}`, {
    draft_id: '2092851979932647424', title: inlinePlan.intent.document.title,
    blocks: [], visuals: [], import_state: {
      template_digest: template.template_digest,
      source_document_digest: template.source_document_digest,
      unresolved_anchors: template.anchors
    }, has_unknown_content: false, autosave_state: 'saved'
  }, {
    canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
    observed_at: '2026-08-21T09:00:00.000Z'
  });
  const execution = await adapter.prepareExistingDraftMedia(inlinePlan, source, bulkCapabilities);
  const navigating = await adapter.next(execution.execution_id);
  await reportSuccess(adapter, execution.execution_id, navigating.command, inlineBodyCompleteObservation(
    execution.execution_id, navigating.command!.command_id,
    { anchor: true, image: null, observedAt: '2026-08-21T09:01:00.000Z' }
  ));
  const pending = await adapter.next(execution.execution_id);
  expect(pending.command?.kind).toBe('replace_article_visual_anchor');
  return { store, adapter, executionId, pendingCommand: pending.command! };
}

async function mediaCommandCount(store: WorkspaceStore, executionId: string, kind: string): Promise<number> {
  const entries = await store.list(`runs/${executionId}/x-article/browser/commands`);
  const commands = await Promise.all(entries
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => store.readJson<{ kind: string }>(`${entry.relative_path}/command.json`)));
  return commands.filter((command) => command.kind === kind).length;
}

async function createFastPathCoverAttemptFixture(suffix: string) {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-fast-path-cover-attempt-${suffix}-`)));
  const executionId = `execution_fast_path_cover_attempt_${suffix}`;
  let commandNumber = 0;
  let current = '2026-08-21T09:02:00.000Z';
  const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
    executionId: () => executionId,
    commandId: () => `command_fast_path_cover_attempt_${suffix}_${++commandNumber}`,
    now: () => new Date(current)
  });
  const input = fastPathInput({ kind: 'existing', draft_id: '2092851979932647424' });
  const execution = await adapter.prepareFastPath({
    ...input,
    source_observation: existingBodyCompleteObservation(
      `source_cover_attempt_${suffix}`,
      `source_cover_attempt_command_${suffix}`,
      '2026-08-21T09:01:00.000Z'
    )
  });
  const navigate = await adapter.next(execution.execution_id);
  await reportSuccess(
    adapter,
    execution.execution_id,
    navigate.command,
    freshBodyCompleteObservation(
      execution.execution_id,
      navigate.command!.command_id,
      '2026-08-21T09:02:00.000Z'
    )
  );
  const cover = await adapter.next(execution.execution_id);
  expect(cover.command?.kind).toBe('upload_article_cover');
  return {
    store, adapter, executionId, cover: cover.command!,
    setNow(value: string) { current = value; }
  };
}

async function advancePreparedToImport(
  adapter: XArticleBrowserAdapter,
  executionId: string,
  plannedTitle = plan.intent.document.title
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
  next = await adapter.next(executionId);
  await reportSuccess(adapter, executionId, next.command, editorObservation(
    executionId,
    next.command!.command_id,
    {
      draft_id: '2090731994279755776', title: plannedTitle,
      blocks: [], visuals: [], import_state: null,
      has_unknown_content: false, autosave_state: 'saved'
    }
  ));
  return adapter.next(executionId);
}

async function advancePreparedToPreviewCommand(
  adapter: XArticleBrowserAdapter,
  executionId: string
) {
  let next = await advancePreparedToImport(adapter, executionId);
  const template = createXArticleImportTemplate(plan.intent.document);
  await reportSuccess(adapter, executionId, next.command, editorObservation(
    executionId,
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
  next = await adapter.next(executionId);
  await reportSuccess(adapter, executionId, next.command, editorObservation(
    executionId,
    next.command!.command_id,
    {
      draft_id: '2090731994279755776', title: plan.intent.document.title,
      blocks: plan.intent.document.blocks, visuals: [], import_state: null,
      has_unknown_content: false, autosave_state: 'saved'
    }
  ));
  next = await adapter.next(executionId);
  const preview = observed(executionId, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776/preview',
    page_kind: 'article_preview',
    controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
    preview: {
      draft_id: '2090731994279755776', title: plan.intent.document.title,
      blocks: plan.intent.document.blocks, visuals: []
    }
  });
  return { command: next.command!, preview };
}

async function advancePreparedToPreview(
  adapter: XArticleBrowserAdapter,
  executionId: string
) {
  const pending = await advancePreparedToPreviewCommand(adapter, executionId);
  await reportSuccess(adapter, executionId, pending.command, pending.preview);
  return pending.preview;
}

async function advancePreparedToPublicObservation(
  adapter: XArticleBrowserAdapter,
  executionId: string,
  preview: XArticleBrowserObservation,
  confirmedAt = '2026-08-21T09:01:00.000Z',
  publicObservedAt = '2026-08-21T09:01:00.000Z'
) {
  await adapter.confirmPublish(executionId, createXArticlePublishConfirmation({
    confirmation_id: `confirmation_${executionId}`,
    execution_id: executionId,
    draft_id: '2090731994279755776',
    target_account: plan.intent.target_account,
    audience: 'everyone',
    plan_digest: plan.plan_digest as `sha256:${string}`,
    document_digest: sha256(plan.intent.document),
    preview_revision: preview.page_revision,
    asset_digests: [],
    confirmed_by: 'human:Glen56121',
    confirmed_at: confirmedAt
  }));
  let next = await adapter.next(executionId);
  await reportSuccess(adapter, executionId, next.command, observed(executionId, next.command!.command_id, {
    observed_at: publicObservedAt,
    canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776/preview',
    page_kind: 'publish_review',
    controls: [{ ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }],
    publish_review: {
      draft_id: '2090731994279755776', audience: 'everyone', final_publish_ref: 'publish_final'
    }
  }));
  next = await adapter.next(executionId);
  await adapter.claim(next.command!);
  await adapter.report({
    command: next.command!,
    status: 'success',
    observation: observed(executionId, next.command!.command_id, {
      observed_at: publicObservedAt,
      canonical_url: 'https://x.com/Glen56121/article/2090731994279755777',
      page_kind: 'public_article', controls: [],
      public_article: {
        article_id: '2090731994279755777',
        canonical_url: 'https://x.com/Glen56121/article/2090731994279755777',
        author_handle: '@Glen56121',
        title: plan.intent.document.title,
        blocks: plan.intent.document.blocks,
        visuals: [],
        published_at: '2026-08-21T09:01:00.000Z'
      }
    })
  });
}

function resignPersistedReport(
  artifact: Record<string, unknown>,
  report: Record<string, unknown>
): Record<string, unknown> {
  if (artifact.schema_version !== 'x-article-materialization-report/v1') return report;
  const body = {
    schema_version: artifact.schema_version,
    execution_id: artifact.execution_id,
    command_id: artifact.command_id,
    report,
    report_digest: sha256(report),
    reported_at: artifact.reported_at
  };
  return { ...body, evidence_digest: sha256(body) };
}

function resignReportProjection(
  projection: Record<string, unknown>,
  changed: Record<string, unknown>
): Record<string, unknown> {
  const body = Object.fromEntries(
    Object.entries({ ...projection, ...changed }).filter(([key]) => key !== 'projection_digest')
  );
  return { ...body, projection_digest: sha256(body) };
}

async function coordinatedConcurrentNext(
  adapter: XArticleBrowserAdapter,
  executionId: string,
  store: WorkspaceStore
) {
  const withLock = store.withLock.bind(store);
  let adapterLockCalls = 0;
  store.withLock = async (path, operation) => {
    if (path.endsWith('/adapter-execution.lock')) adapterLockCalls += 1;
    return withLock(path, operation);
  };
  const results = await Promise.allSettled([
    adapter.next(executionId),
    adapter.next(executionId)
  ]);
  store.withLock = withLock;
  const fulfilled = results.filter(
    (result): result is PromiseFulfilledResult<Awaited<ReturnType<XArticleBrowserAdapter['next']>>> =>
      result.status === 'fulfilled'
  );
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  );
  expect(fulfilled.length).toBeGreaterThan(0);
  expect(rejected.every((result) => (result.reason as { code?: string }).code === 'EXECUTION_BUSY'))
    .toBe(true);
  expect(new Set(fulfilled.map((result) => result.value.command?.command_id)).size).toBe(1);
  expect(adapterLockCalls).toBe(2);
  return fulfilled[0]!.value;
}

describe('XArticleBrowserAdapter', () => {
  it('writes and verifies the approved title before importing a newly created empty Draft', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-created-shell-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_created_shell_1',
      eventId: (() => { let n = 0; return () => `event_created_shell_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_created_shell_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);

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
    const createdDraft = editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: '',
        blocks: [], visuals: [], import_state: null,
        has_unknown_content: false, autosave_state: 'saved'
      }
    );
    await reportSuccess(adapter, execution.execution_id, next.command, createdDraft);

    const title = await adapter.next(execution.execution_id);
    expect(title.command).toMatchObject({
      kind: 'set_article_title',
      expected_page_revision: createdDraft.page_revision,
      payload: { kind: 'set_article_title', title: plan.intent.document.title }
    });
    const titledDraft = editorObservation(
      execution.execution_id,
      title.command!.command_id,
      {
        draft_id: '2090731994279755776', title: plan.intent.document.title,
        blocks: [], visuals: [], import_state: null,
        has_unknown_content: false, autosave_state: 'saved'
      }
    );
    await reportSuccess(adapter, execution.execution_id, title.command, titledDraft);

    const importing = await adapter.next(execution.execution_id);
    expect(importing.command).toMatchObject({
      kind: 'import_article_document',
      expected_page_revision: titledDraft.page_revision
    });
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`
    )).resolves.toMatchObject({
      draft_id: '2090731994279755776',
      phase: 'article_shell_ready',
      body: { status: 'issued', observed_digest: null },
      last_editor_revision: titledDraft.page_revision
    });
  });

  it('persists a deterministic Preview receipt from durable commands, observations, and progress', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-receipt-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_receipt_1',
      eventId: (() => { let n = 0; return () => `event_receipt_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_receipt_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const preview = await advancePreparedToPreview(adapter, execution.execution_id);

    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/materialization-receipt.json`
    )).resolves.toMatchObject({
      schema_version: 'x-article-materialization-receipt/v1',
      execution_id: execution.execution_id,
      draft_id: '2090731994279755776',
      body_block_count: 1,
      inline_image_count: 0,
      command_count: 6,
      observation_count: 6,
      human_wait_seconds: 0,
      within_budget: true,
      preview_revision: preview.page_revision,
      supersedes_receipt_digest: null,
      receipt_digest: expect.stringMatching(/^sha256:/)
    });
    const progress = await store.readText(
      `runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`
    );
    expect(progress.trim().split('\n')).toHaveLength(6);
    expect(progress).toContain('"observed_effect":"complete"');
    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({
      state: 'confirmation_pending', publish_command_count: 0
    });
  });

  it('binds Preview timing to canonical write-once materialization-start evidence', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-start-evidence-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_start_evidence_1',
      eventId: (() => { let n = 0; return () => `event_start_evidence_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_start_evidence_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const startPath = `runs/${execution.execution_id}/x-article/browser/materialization-start.json`;
    const start = await store.readJson<Record<string, unknown>>(startPath);
    expect(start).toMatchObject({
      schema_version: 'x-article-materialization-start/v1',
      execution_id: execution.execution_id,
      started_at: '2026-08-21T09:01:00.000Z',
      start_digest: expect.stringMatching(/^sha256:/)
    });
    const changedBody = { ...start, started_at: '2026-08-21T09:00:59.000Z' };
    const changed = {
      ...changedBody,
      start_digest: sha256(Object.fromEntries(
        Object.entries(changedBody).filter(([key]) => key !== 'start_digest')
      ))
    };
    await store.replaceAtomic(startPath, changed);
    const pending = await advancePreparedToPreviewCommand(adapter, execution.execution_id);
    await adapter.claim(pending.command);
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
  });

  it('rejects a valid progress ledger whose fields no longer match its exact report', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-progress-tamper-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_progress_tamper_1',
      eventId: (() => { let n = 0; return () => `event_progress_tamper_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_progress_tamper_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const pending = await advancePreparedToPreviewCommand(adapter, execution.execution_id);
    const progressPath = `runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`;
    const progress = (await store.readText(progressPath)).trim().split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    progress[0] = { ...progress[0], elapsed_seconds: 1 };
    await store.replaceAtomic(progressPath, `${progress.map((entry) => JSON.stringify(entry)).join('\n')}\n`);
    await adapter.claim(pending.command);
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('rejects duplicate progress that masks a missing command projection', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-progress-duplicate-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_progress_duplicate_1',
      eventId: (() => { let n = 0; return () => `event_progress_duplicate_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_progress_duplicate_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const pending = await advancePreparedToPreviewCommand(adapter, execution.execution_id);
    const progressPath = `runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`;
    const progress = (await store.readText(progressPath)).trim().split('\n');
    progress[0] = progress[1]!;
    await store.replaceAtomic(progressPath, `${progress.join('\n')}\n`);
    await adapter.claim(pending.command);
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('rejects an extraneous valid command without a durable claim or report', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-command-extra-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_command_extra_1',
      eventId: (() => { let n = 0; return () => `event_command_extra_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_command_extra_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const pending = await advancePreparedToPreviewCommand(adapter, execution.execution_id);
    const commandRoot = `runs/${execution.execution_id}/x-article/browser/commands`;
    const source = await store.readJson<Record<string, unknown>>(
      `${commandRoot}/command_command_extra_1/command.json`
    );
    await store.writeNew(`${commandRoot}/extraneous_command/command.json`, {
      ...source,
      command_id: 'extraneous_command'
    });
    await adapter.claim(pending.command);
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('rejects a re-signed observation that reverses command time', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-observation-time-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_observation_time_1',
      eventId: (() => { let n = 0; return () => `event_observation_time_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_observation_time_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const pending = await advancePreparedToPreviewCommand(adapter, execution.execution_id);
    const observationPath = `runs/${execution.execution_id}/x-article/browser/observations/obs_command_observation_time_1.json`;
    const observation = await store.readJson<XArticleBrowserObservation>(observationPath);
    const changedBody = {
      ...Object.fromEntries(Object.entries(observation).filter(([key]) => key !== 'page_revision')),
      observed_at: '2026-08-21T09:00:59.000Z'
    };
    const changedObservation = {
      ...changedBody,
      page_revision: computeXArticlePageRevision(changedBody)
    } as XArticleBrowserObservation;
    await store.replaceAtomic(observationPath, changedObservation);
    const reportPath = `runs/${execution.execution_id}/x-article/browser/reports/command_observation_time_1.json`;
    const artifact = await store.readJson<Record<string, unknown>>(reportPath);
    const report = (artifact.report ?? artifact) as Record<string, unknown>;
    await store.replaceAtomic(reportPath, resignPersistedReport(artifact, {
      ...report,
      observation: changedObservation
    }));
    await adapter.claim(pending.command);
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('rejects a fresh report whose observation precedes its command', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-fresh-time-reversal-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_fresh_time_reversal_1',
      commandId: () => 'command_fresh_time_reversal_1',
      now: () => new Date('2026-08-21T09:02:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const next = await adapter.next(execution.execution_id);
    await adapter.claim(next.command!);
    const observation = observed(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
      controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
    });

    await expect(adapter.report({
      command: next.command!, status: 'success', observation
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(store.exists(
      `runs/${execution.execution_id}/x-article/browser/reports/${next.command!.command_id}.json`
    )).resolves.toBe(false);
  });

  it('rejects a re-digested report status that disagrees with progress', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-report-status-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_report_status_1',
      eventId: (() => { let n = 0; return () => `event_report_status_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_report_status_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const pending = await advancePreparedToPreviewCommand(adapter, execution.execution_id);
    const reportPath = `runs/${execution.execution_id}/x-article/browser/reports/command_report_status_1.json`;
    const artifact = await store.readJson<Record<string, unknown>>(reportPath);
    const report = (artifact.report ?? artifact) as Record<string, unknown>;
    await store.replaceAtomic(reportPath, resignPersistedReport(artifact, {
      ...report,
      status: 'uncertain'
    }));
    await adapter.claim(pending.command);
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('repairs an exact Preview receipt after a crash and rejects a mismatched prior receipt', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-receipt-crash-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_receipt_crash_1',
      eventId: (() => { let n = 0; return () => `event_receipt_crash_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_receipt_crash_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const pending = await advancePreparedToPreviewCommand(adapter, execution.execution_id);
    await adapter.claim(pending.command);
    const writeNew = store.writeNew.bind(store);
    let failOnce = true;
    store.writeNew = async (path, value) => {
      if (failOnce && path.endsWith('/materialization-receipt.json')) {
        failOnce = false;
        throw new Error('injected Preview receipt crash');
      }
      return writeNew(path, value);
    };

    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
    const receiptPath = `runs/${execution.execution_id}/x-article/browser/materialization-receipt.json`;
    await store.writeNew(receiptPath, { corrupt: true });
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
    await store.removeFile(receiptPath);
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).resolves.toMatchObject({ state: 'confirmation_pending' });
    const receipt = await store.readJson<Record<string, unknown>>(receiptPath);
    await expect(adapter.report({
      command: pending.command, status: 'success', observation: pending.preview
    })).resolves.toMatchObject({ state: 'confirmation_pending' });
    await expect(store.readJson(receiptPath)).resolves.toEqual(receipt);
  });

  it('keeps Preview evidence immutable and writes a digest-linked public supersession', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-receipt-public-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_receipt_public_1',
      eventId: (() => { let n = 0; return () => `event_receipt_public_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_receipt_public_${++n}`; })(),
      attemptId: () => 'attempt_receipt_public_1',
      receiptId: () => 'publication_receipt_public_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const preview = await advancePreparedToPreview(adapter, execution.execution_id);
    const previewPath = `runs/${execution.execution_id}/x-article/browser/materialization-receipt.json`;
    const previewReceipt = await store.readJson<Record<string, unknown>>(previewPath);
    await advancePreparedToPublicObservation(adapter, execution.execution_id, preview);

    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'finalized', publish_command_count: 1 }, command: null
    });
    await expect(store.readJson(previewPath)).resolves.toEqual(previewReceipt);
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/materialization-receipt-public.json`
    )).resolves.toMatchObject({
      supersedes_receipt_digest: previewReceipt.receipt_digest,
      human_wait_seconds: 0,
      receipt_digest: expect.stringMatching(/^sha256:/)
    });
  });

  it('measures human wait from the verified Preview observation rather than later receipt issuance', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-human-wait-')));
    let clock = '2026-08-21T09:01:00.000Z';
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_human_wait_1',
      eventId: (() => { let n = 0; return () => `event_human_wait_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_human_wait_${++n}`; })(),
      attemptId: () => 'attempt_human_wait_1',
      receiptId: () => 'publication_human_wait_1',
      now: () => new Date(clock)
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const pending = await advancePreparedToPreviewCommand(adapter, execution.execution_id);
    clock = '2026-08-21T09:03:00.000Z';
    await reportSuccess(adapter, execution.execution_id, pending.command, pending.preview);
    const previewReceipt = await store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/materialization-receipt.json`
    );
    expect(previewReceipt.issued_at).toBe('2026-08-21T09:03:00.000Z');
    await advancePreparedToPublicObservation(
      adapter,
      execution.execution_id,
      pending.preview,
      '2026-08-21T09:02:00.000Z',
      '2026-08-21T09:03:00.000Z'
    );

    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'finalized' }
    });
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/materialization-receipt-public.json`
    )).resolves.toMatchObject({ human_wait_seconds: 60 });
  });

  it.each([
    ['execution', { execution_id: 'foreign_execution' }],
    ['command', { command_id: 'foreign_command' }],
    ['report digest', { report_digest: `sha256:${'3'.repeat(64)}` }]
  ])('rejects a validly re-digested Preview projection with changed %s identity', async (_name, changed) => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-projection-redigest-')));
    const executionId = `execution_projection_redigest_${_name.replace(' ', '_')}`;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      eventId: (() => { let n = 0; return () => `${executionId}_event_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `${executionId}_command_${++n}`; })(),
      attemptId: () => `${executionId}_attempt`,
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const preview = await advancePreparedToPreview(adapter, execution.execution_id);
    await advancePreparedToPublicObservation(adapter, execution.execution_id, preview);
    const projectionPath = `runs/${execution.execution_id}/x-article/browser/report-projections/${preview.command_id}.json`;
    const projection = await store.readJson<Record<string, unknown>>(projectionPath);
    await store.replaceAtomic(projectionPath, resignReportProjection(projection, changed));

    await expect(adapter.next(execution.execution_id))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('revalidates the current public report before trusting its progress timestamp', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-public-report-time-')));
    const executionId = 'execution_public_report_time_1';
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      eventId: (() => { let n = 0; return () => `event_public_report_time_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_public_report_time_${++n}`; })(),
      attemptId: () => 'attempt_public_report_time_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const preview = await advancePreparedToPreview(adapter, execution.execution_id);
    await advancePreparedToPublicObservation(adapter, execution.execution_id, preview);
    const publicCommandId = (await adapter.status(execution.execution_id)).latest_command_id!;
    const reportPath = `runs/${execution.execution_id}/x-article/browser/reports/${publicCommandId}.json`;
    const artifact = await store.readJson<Record<string, unknown>>(reportPath);
    const changedBody = {
      ...Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== 'evidence_digest')),
      reported_at: '2026-08-21T09:00:59.000Z'
    };
    await store.replaceAtomic(reportPath, {
      ...changedBody,
      evidence_digest: sha256(changedBody)
    });

    await expect(adapter.next(execution.execution_id))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('fails public verification closed when the immutable Preview receipt is missing', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-receipt-missing-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_receipt_missing_1',
      eventId: (() => { let n = 0; return () => `event_receipt_missing_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_receipt_missing_${++n}`; })(),
      attemptId: () => 'attempt_receipt_missing_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const preview = await advancePreparedToPreview(adapter, execution.execution_id);
    await advancePreparedToPublicObservation(adapter, execution.execution_id, preview);
    await store.removeFile(
      `runs/${execution.execution_id}/x-article/browser/materialization-receipt.json`
    );

    await expect(adapter.next(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
    await expect(store.exists(
      `runs/${execution.execution_id}/x-article/browser/materialization-receipt-public.json`
    )).resolves.toBe(false);
  });

  it.each([
    ['execution', { execution_id: 'foreign_execution' }],
    ['draft', { draft_id: 'foreign_draft' }],
    ['revision', { preview_revision: `sha256:${'1'.repeat(64)}` }],
    ['materialization', { materialization_digest: `sha256:${'2'.repeat(64)}` }],
    ['count', { command_count: 0 }],
    ['timing', { automation_seconds: 1 }]
  ])('rejects a validly re-digested Preview receipt with changed %s binding', async (_name, changed) => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-receipt-redigest-')));
    const executionId = `execution_receipt_redigest_${_name}`;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      eventId: (() => { let n = 0; return () => `${executionId}_event_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `${executionId}_command_${++n}`; })(),
      attemptId: () => `${executionId}_attempt`,
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const preview = await advancePreparedToPreview(adapter, execution.execution_id);
    await advancePreparedToPublicObservation(adapter, execution.execution_id, preview);
    const receiptPath = `runs/${execution.execution_id}/x-article/browser/materialization-receipt.json`;
    const receipt = await store.readJson<Record<string, unknown>>(receiptPath);
    const changedBody = { ...receipt, ...changed };
    await store.replaceAtomic(receiptPath, {
      ...changedBody,
      receipt_digest: sha256(Object.fromEntries(
        Object.entries(changedBody).filter(([key]) => key !== 'receipt_digest')
      ))
    });

    await expect(adapter.next(execution.execution_id))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

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

  it('prepares a new-Draft Fast Path and durably binds its one-time confirmation', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-fast-path-new-')));
    let executionIds = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => `execution_fast_path_new_${++executionIds}`,
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const input = fastPathInput({ kind: 'new' });

    const first = await adapter.prepareFastPath(input);
    const retry = await adapter.prepareFastPath(input);

    expect(retry).toEqual(first);
    expect(executionIds).toBe(1);
    await expect(adapter.prepareFastPath({
      ...input,
      capabilities: { ...input.capabilities, observed_at: '2026-08-21T09:00:01.000Z' }
    })).rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
    expect(executionIds).toBe(1);
    await expect(store.readJson(`runs/${first.execution_id}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({
        execution_mode: 'materialization_v3_2',
        fast_path: {
          audit_digest: input.audit.audit_digest,
          preflight_digest: input.audit.preflight.preflight_digest,
          confirmation_digest: input.confirmation.confirmation_digest,
          time_budget_seconds: 900,
          recovery_budget_seconds: 120,
          recovery_count: 0
        }
      });
  });

  it('blocks a stale Fast Path release before allocating an execution', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-fast-path-stale-')));
    let executionIds = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => { executionIds += 1; return 'must_not_be_allocated'; },
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const input = fastPathInput({ kind: 'new' });

    await expect(adapter.prepareFastPath({
      ...input,
      release_set: {
        ...fastPathReleaseSet,
        skill_protocol: 'x-article-materialization/v3.3'
      } as unknown as XArticleFastPathReleaseSetV1
    })).rejects.toMatchObject({ code: 'ARTICLE_RUNTIME_VERSION_MISMATCH' });
    expect(executionIds).toBe(0);
  });

  it('blocks expired confirmation and a new-Draft source observation before allocation', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-fast-path-gates-')));
    let executionIds = 0;
    const expiredAdapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => { executionIds += 1; return 'must_not_be_allocated'; },
      now: () => new Date('2026-08-21T11:00:00.000Z')
    });
    const input = fastPathInput({ kind: 'new' });

    await expect(expiredAdapter.prepareFastPath(input)).rejects.toMatchObject({ code: 'APPROVAL_STALE' });

    const currentAdapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => { executionIds += 1; return 'must_not_be_allocated'; },
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    await expect(currentAdapter.prepareFastPath({
      ...input,
      source_observation: existingBodyCompleteObservation('source_new', 'command_new')
    })).rejects.toMatchObject({ code: 'ARTICLE_DRAFT_CONFLICT' });
    expect(executionIds).toBe(0);
  });

  it('adopts only the existing Draft named by the Fast Path Audit', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-fast-path-existing-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_fast_path_existing_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const input = fastPathInput({ kind: 'existing', draft_id: '2092851979932647424' });
    const source = existingBodyCompleteObservation('source_existing', 'command_existing');

    const execution = await adapter.prepareFastPath({ ...input, source_observation: source });

    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({
      fast_path_status: { stage: 'Draft ready', cover: '0/1', inline_images: '0/1', result_path: null }
    });
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({ execution_mode: 'media_completion_v3_3' });

    const mismatched = fastPathInput({ kind: 'existing', draft_id: '9999999999999999999' });
    await expect(adapter.prepareFastPath({ ...mismatched, source_observation: source }))
      .rejects.toMatchObject({ code: 'ARTICLE_DRAFT_CONFLICT' });
  });

  it('blocks a duplicate cover write after an uncertain effect', async () => {
    const fixture = await createFastPathCoverAttemptFixture('uncertain');
    await fixture.adapter.claim(fixture.cover);
    fixture.setNow('2026-08-21T09:02:02.000Z');
    await fixture.adapter.report({
      command: fixture.cover,
      status: 'uncertain',
      observation: freshBodyCompleteObservation(
        fixture.executionId,
        fixture.cover.command_id,
        '2026-08-21T09:02:01.000Z'
      )
    });

    await expect(fixture.adapter.next(fixture.executionId)).resolves.toMatchObject({
      snapshot: { state: 'materialization_blocked' },
      command: null
    });
    expect(await mediaCommandCount(
      fixture.store, fixture.executionId, 'upload_article_cover'
    )).toBe(1);
  });

  it('allows one proven no-effect cover retry and blocks a third write', async () => {
    const fixture = await createFastPathCoverAttemptFixture('two_no_effects');
    await fixture.adapter.claim(fixture.cover);
    fixture.setNow('2026-08-21T09:02:02.000Z');
    await fixture.adapter.report({
      command: fixture.cover,
      status: 'transient_failure',
      observation: freshBodyCompleteObservation(
        fixture.executionId,
        fixture.cover.command_id,
        '2026-08-21T09:02:01.000Z'
      )
    });
    const retry = await fixture.adapter.next(fixture.executionId);
    expect(retry.command?.kind).toBe('upload_article_cover');
    expect(await mediaCommandCount(
      fixture.store, fixture.executionId, 'upload_article_cover'
    )).toBe(2);
    await fixture.adapter.claim(retry.command!);
    fixture.setNow('2026-08-21T09:02:04.000Z');
    await fixture.adapter.report({
      command: retry.command!,
      status: 'transient_failure',
      observation: freshBodyCompleteObservation(
        fixture.executionId,
        retry.command!.command_id,
        '2026-08-21T09:02:02.000Z'
      )
    });

    await expect(fixture.adapter.next(fixture.executionId)).resolves.toMatchObject({
      snapshot: { state: 'materialization_blocked' },
      command: null
    });
    expect(await mediaCommandCount(
      fixture.store, fixture.executionId, 'upload_article_cover'
    )).toBe(2);
  });

  it('projects and enforces the Fast Path deadline before returning another command', async () => {
    const fixture = await createFastPathCoverAttemptFixture('deadline_next');
    fixture.setNow('2026-08-21T09:17:00.000Z');

    await expect(fixture.adapter.status(fixture.executionId)).resolves.toMatchObject({
      fast_path_status: { stage: 'Timed out', timed_out: true }
    });
    await expect(fixture.adapter.next(fixture.executionId)).resolves.toMatchObject({
      snapshot: { state: 'materialization_blocked' }, command: null
    });
  });

  it('does not allow an unclaimed Fast Path write to be claimed at the deadline', async () => {
    const fixture = await createFastPathCoverAttemptFixture('deadline_claim');
    fixture.setNow('2026-08-21T09:17:00.000Z');

    await expect(fixture.adapter.claim(fixture.cover))
      .rejects.toMatchObject({ code: 'ARTICLE_MATERIALIZATION_TIMEOUT' });
  });

  it('still records a report after the deadline when its write was claimed before it', async () => {
    const fixture = await createFastPathCoverAttemptFixture('deadline_report');
    await fixture.adapter.claim(fixture.cover);
    fixture.setNow('2026-08-21T09:17:01.000Z');

    await expect(fixture.adapter.report({
      command: fixture.cover,
      status: 'transient_failure',
      observation: freshBodyCompleteObservation(
        fixture.executionId,
        fixture.cover.command_id,
        '2026-08-21T09:17:00.000Z'
      )
    })).resolves.toMatchObject({ execution_id: fixture.executionId });
  });

  it('rejects Fast Path recovery after the main deadline', async () => {
    const fixture = await createFastPathCoverAttemptFixture('deadline_recovery');
    await fixture.adapter.claim(fixture.cover);
    await fixture.adapter.report({ command: fixture.cover, status: 'uncertain', observation: null });
    fixture.setNow('2026-08-21T09:17:00.000Z');

    await expect(fixture.adapter.recoverFastPath(fixture.executionId))
      .rejects.toMatchObject({ code: 'ARTICLE_MATERIALIZATION_TIMEOUT' });
  });

  it('allows one Fast Path read-only recovery without re-uploading media', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-fast-path-recovery-')));
    let commandNumber = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_fast_path_recovery_1',
      commandId: () => `command_fast_path_recovery_${++commandNumber}`,
      now: () => new Date('2026-08-21T09:02:00.000Z')
    });
    const input = fastPathInput({ kind: 'existing', draft_id: '2092851979932647424' });
    const execution = await adapter.prepareFastPath({
      ...input,
      source_observation: existingBodyCompleteObservation('source_recovery', 'source_recovery_command')
    });
    let next = await adapter.next(execution.execution_id);
    await reportSuccess(
      adapter,
      execution.execution_id,
      next.command,
      freshBodyCompleteObservation(
        execution.execution_id,
        next.command!.command_id,
        '2026-08-21T09:02:00.000Z'
      )
    );
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('upload_article_cover');
    await adapter.claim(next.command!);
    await adapter.report({ command: next.command!, status: 'uncertain', observation: null });
    const mediaBefore = await mediaCommandCount(store, execution.execution_id, 'upload_article_cover');

    const recovery = await adapter.recoverFastPath(execution.execution_id);

    expect(recovery.command).toMatchObject({ kind: 'observe_article_page', side_effect: 'read' });
    expect(await mediaCommandCount(store, execution.execution_id, 'upload_article_cover')).toBe(mediaBefore);
    const template = createXArticleImportTemplate(coverInlinePlan.intent.document);
    await reportSuccess(adapter, execution.execution_id, recovery.command, observed(
      execution.execution_id, recovery.command.command_id, {
        observed_at: '2026-08-21T09:02:00.000Z',
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        page_kind: 'article_editor', controls: editorControls,
        editor: {
          draft_id: '2092851979932647424', title: coverInlinePlan.intent.document.title,
          blocks: coverInlinePlan.intent.document.blocks.filter((block) => block.kind !== 'image'),
          visuals: [{
            ref: 'cover_recovered', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
            alt_text: null, status: 'uploaded', owned_by_execution: true
          }], has_unknown_content: false, autosave_state: 'saved',
          import_state: {
            template_digest: template.template_digest,
            source_document_digest: template.source_document_digest,
            unresolved_anchors: template.anchors
          }
        }
      }
    ));
    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      command: { kind: 'replace_article_visual_anchor' }
    });
    expect(await mediaCommandCount(store, execution.execution_id, 'upload_article_cover')).toBe(mediaBefore);
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({ fast_path: { recovery_count: 1 } });
    await expect(adapter.recoverFastPath(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_MATERIALIZATION_NO_PROGRESS' });
  });

  it('blocks Fast Path recovery after its 120-second recovery budget', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-fast-path-recovery-timeout-')));
    let current = '2026-08-21T09:01:00.000Z';
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_fast_path_recovery_timeout_1',
      now: () => new Date(current)
    });
    const input = fastPathInput({ kind: 'existing', draft_id: '2092851979932647424' });
    const execution = await adapter.prepareFastPath({
      ...input,
      source_observation: existingBodyCompleteObservation('source_timeout', 'source_timeout_command')
    });
    current = '2026-08-21T09:03:01.000Z';

    await expect(adapter.recoverFastPath(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_MATERIALIZATION_TIMEOUT' });
    await expect(store.readJson(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({ fast_path: { recovery_count: 0 } });
  });

  it('persists final Fast Path Draft evidence without Preview or Publish commands', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-fast-path-result-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_fast_path_result_1',
      now: () => new Date('2026-08-21T09:02:00.000Z')
    });
    const input = fastPathInput({ kind: 'existing', draft_id: '2092851979932647424' });
    const execution = await adapter.prepareFastPath({
      ...input,
      source_observation: existingBodyCompleteObservation(
        'source_fast_result',
        'source_fast_result_command',
        '2026-08-21T09:01:00.000Z'
      )
    });
    let next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command,
      freshBodyCompleteObservation(execution.execution_id, next.command!.command_id));

    next = await adapter.next(execution.execution_id);
    const template = createXArticleImportTemplate(coverInlinePlan.intent.document);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id, next.command!.command_id, {
        observed_at: '2026-08-21T09:02:00.000Z',
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        page_kind: 'article_editor', controls: editorControls,
        editor: {
          draft_id: '2092851979932647424', title: coverInlinePlan.intent.document.title,
          blocks: coverInlinePlan.intent.document.blocks.filter((block) => block.kind !== 'image'),
          visuals: [{
            ref: 'cover_fast_result', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
            alt_text: null, status: 'uploaded', owned_by_execution: true
          }], has_unknown_content: false, autosave_state: 'saved',
          import_state: {
            template_digest: template.template_digest,
            source_document_digest: template.source_document_digest,
            unresolved_anchors: template.anchors
          }
        }
      }
    ));

    next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id, next.command!.command_id, {
        observed_at: '2026-08-21T09:02:00.000Z',
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        page_kind: 'article_editor', controls: editorControls,
        editor: {
          draft_id: '2092851979932647424', title: coverInlinePlan.intent.document.title,
          blocks: coverInlinePlan.intent.document.blocks,
          visuals: [
            {
              ref: 'cover_fast_result', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
              alt_text: null, status: 'uploaded', owned_by_execution: true
            },
            {
              ref: 'inline_fast_result', asset_id: inlineAsset.asset_id, kind: 'inline', block_ordinal: 2,
              alt_text: inlineAsset.alt_text, status: 'uploaded', owned_by_execution: true
            }
          ], has_unknown_content: false, autosave_state: 'saved', import_state: null
        }
      }
    ));

    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'draft_reconciled', publish_command_count: 0 }, command: null
    });
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/fast-path-result-v1.json`
    )).resolves.toMatchObject({
      state: 'draft_reconciled', audit_digest: input.audit.audit_digest,
      cover: { expected: 1, completed: 1, alt: 'unobservable' },
      inline_images: { expected: 1, completed: 1 },
      preview_command_count: 0, publish_command_count: 0
    });
    const progress = await store.readText(
      `runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`
    );
    expect(progress).toContain('Fast Path: Draft ready');
    expect(progress).toContain('Fast Path: Cover 1/1');
    expect(progress).toContain('Fast Path: Inline images 1/1');
    expect(progress).toContain('Fast Path: Final check');
    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({
      fast_path_status: {
        stage: 'Final check', cover: '1/1', inline_images: '1/1',
        result_path: `runs/${execution.execution_id}/x-article/browser/fast-path-result-v1.json`
      }
    });
  });

  it('adopts a body-complete Draft and issues the first media command without rewriting content', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-')));
    let tick = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_existing_media',
      now: () => new Date([
        '2026-08-21T09:00:00.000Z', '2026-08-21T09:00:30.000Z',
        '2026-08-21T09:01:30.000Z', '2026-08-21T09:02:30.000Z'
      ][Math.min(tick++, 3)]!)
    });
    const source = existingBodyCompleteObservation('execution_source_media', 'command_source_media');
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan, source, coverBulkCapabilities
    );
    const issued: string[] = [];

    let next = await adapter.next(execution.execution_id);
    issued.push(next.command!.kind);
    expect(next.command).toMatchObject({
      kind: 'navigate', draft_id: '2092851979932647424', side_effect: 'read',
      payload: { kind: 'navigate', url: 'https://x.com/compose/articles/edit/2092851979932647424' }
    });
    const fresh = freshBodyCompleteObservation(execution.execution_id, next.command!.command_id);
    expect(computeXArticleExistingDraftRevision(fresh)).toBe(computeXArticleExistingDraftRevision(source));
    expect(fresh.page_revision).not.toBe(source.page_revision);
    await reportSuccess(adapter, execution.execution_id, next.command, fresh);

    next = await adapter.next(execution.execution_id);
    issued.push(next.command!.kind);
    expect(next.command?.kind).toBe('upload_article_cover');
    expect(issued).not.toEqual(expect.arrayContaining([
      'create_article_draft', 'set_article_title', 'import_article_document',
      'insert_article_block', 'open_article_preview', 'open_publish_review', 'publish_article_once'
    ]));
  });

  it('persists adopted draft_bound evidence before body promotion and resumes across that boundary', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-draft-bound-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_existing_media_draft_bound',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation('source_draft_bound', 'source_command_draft_bound', '2026-08-21T08:59:00.000Z'),
      coverBulkCapabilities
    );
    const navigating = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, navigating.command,
      freshBodyCompleteObservation(execution.execution_id, navigating.command!.command_id, '2026-08-21T09:00:00.000Z'));
    const checkpointPath = `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`;
    const replaceAtomic = store.replaceAtomic.bind(store);
    let failPromotion = true;
    store.replaceAtomic = async (path, value) => {
      if (failPromotion && path === checkpointPath && (value as { phase?: string }).phase === 'body_verified') {
        failPromotion = false;
        throw new Error('injected body promotion crash');
      }
      return replaceAtomic(path, value);
    };

    await expect(adapter.next(execution.execution_id)).rejects.toThrow('injected body promotion crash');
    await expect(store.readJson<Record<string, unknown>>(checkpointPath)).resolves.toMatchObject({
      revision: 0, phase: 'draft_bound', body: { status: 'adopted_verified' }
    });
    await expect(store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/events/000002.json`
    )).resolves.toMatchObject({ event_type: 'article_adoption_verified' });
    await expect(store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/events/000003.json`
    )).resolves.toMatchObject({ event_type: 'article_draft_bound' });
    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({ state: 'draft_created' });

    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'materialization_reconciling' }, command: { kind: 'upload_article_cover' }
    });
    await expect(store.readJson<Record<string, unknown>>(checkpointPath)).resolves.toMatchObject({
      revision: 1, phase: 'body_verified', body: { status: 'adopted_verified' }
    });
  });

  it('terminalizes and replays a V3.3 preflight success report without an observation', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-empty-preflight-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_existing_media_empty_preflight',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation('source_empty_preflight', 'source_command_empty_preflight', '2026-08-21T08:59:00.000Z'),
      coverBulkCapabilities
    );
    const next = await adapter.next(execution.execution_id);
    const input = { command: next.command!, status: 'success' as const, observation: null };
    await adapter.claim(input.command);

    const first = await adapter.report(input);
    await expect(adapter.report(input)).resolves.toEqual(first);
    expect(first).toMatchObject({ state: 'materialization_blocked' });
    await expect(store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/events/000002.json`
    )).resolves.toMatchObject({ event_type: 'article_adoption_rejected' });
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/report-projections/${input.command.command_id}.json`))
      .resolves.toBe(true);
  });

  it('repairs a crashed null-observation adoption rejection projection without checkpoint side effects', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-empty-projection-crash-')));
    const executionId = 'execution_existing_media_empty_projection_crash';
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation('source_empty_projection_crash', 'source_command_empty_projection_crash', '2026-08-21T08:59:00.000Z'),
      coverBulkCapabilities
    );
    const next = await adapter.next(execution.execution_id);
    const input = { command: next.command!, status: 'success' as const, observation: null };
    await adapter.claim(input.command);
    const projectionPath = `runs/${execution.execution_id}/x-article/browser/report-projections/${input.command.command_id}.json`;
    const reportPath = `runs/${execution.execution_id}/x-article/browser/reports/${input.command.command_id}.json`;
    const writeNew = store.writeNew.bind(store);
    let failProjection = true;
    store.writeNew = async (path, value) => {
      if (failProjection && path === projectionPath) {
        failProjection = false;
        throw new Error('injected adoption rejection projection crash');
      }
      return writeNew(path, value);
    };

    await expect(adapter.report(input)).rejects.toThrow('injected adoption rejection projection crash');
    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({ state: 'materialization_blocked' });
    await expect(store.exists(reportPath)).resolves.toBe(true);
    await expect(store.exists(projectionPath)).resolves.toBe(false);
    await expect(store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/events/000002.json`
    )).resolves.toMatchObject({ event_type: 'article_adoption_rejected' });
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toBe(false);
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`))
      .resolves.toBe(false);

    const replay = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    await expect(replay.report(input)).resolves.toMatchObject({ state: 'materialization_blocked' });
    await expect(store.exists(projectionPath)).resolves.toBe(true);
    await expect(store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/events/000003.json`
    )).rejects.toThrow();
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toBe(false);
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`))
      .resolves.toBe(false);
  });

  it('terminalizes and replays a foreign pre-binding observation without checkpoint side effects', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-foreign-preflight-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_existing_media_foreign_preflight',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation('source_foreign_preflight', 'source_command_foreign_preflight', '2026-08-21T08:59:00.000Z'),
      coverBulkCapabilities
    );
    const next = await adapter.next(execution.execution_id);
    const input = {
      command: next.command!, status: 'success' as const,
      observation: {
        ...freshBodyCompleteObservation(execution.execution_id, next.command!.command_id, '2026-08-21T09:00:00.000Z'),
        execution_id: 'foreign_execution'
      }
    };
    await adapter.claim(input.command);

    const first = await adapter.report(input);
    await expect(adapter.report(input)).resolves.toEqual(first);
    expect(first).toMatchObject({ state: 'materialization_blocked' });
    await expect(store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/events/000002.json`
    )).resolves.toMatchObject({ event_type: 'article_adoption_rejected' });
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toBe(false);
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`))
      .resolves.toBe(false);
  });

  it('replays an identical adopted-Draft preflight report without duplicate projection side effects', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-preflight-replay-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_existing_media_preflight_replay',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation('source_preflight_replay', 'source_command_preflight_replay', '2026-08-21T08:59:00.000Z'),
      coverBulkCapabilities
    );
    const next = await adapter.next(execution.execution_id);
    const input = {
      command: next.command!, status: 'success' as const,
      observation: freshBodyCompleteObservation(execution.execution_id, next.command!.command_id, '2026-08-21T09:00:00.000Z')
    };
    await adapter.claim(input.command);
    const first = await adapter.report(input);
    const projectionPath = `runs/${execution.execution_id}/x-article/browser/report-projections/${input.command.command_id}.json`;
    const firstProjection = await store.readJson<Record<string, unknown>>(projectionPath);

    await expect(adapter.report(input)).resolves.toEqual(first);
    await expect(store.readJson<Record<string, unknown>>(projectionPath)).resolves.toEqual(firstProjection);
    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'materialization_reconciling' }, command: { kind: 'upload_article_cover' }
    });
  });

  it('rethrows a non-Harness preflight page error without persisting report side effects', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-preflight-sentinel-')));
    const base = new XArticleWeb2026_08Contract();
    const sentinel = new Error('sentinel detectPage failure');
    const contract: XArticlePageContract = {
      id: base.id, version: base.version, media_alt_capabilities: base.media_alt_capabilities,
      detectPage: () => { throw sentinel; },
      detectAccount: base.detectAccount.bind(base),
      detectEditor: base.detectEditor.bind(base),
      readEditorImportState: base.readEditorImportState.bind(base),
      readEditorDocument: base.readEditorDocument.bind(base),
      detectPreview: base.detectPreview.bind(base),
      detectPublishReview: base.detectPublishReview.bind(base),
      detectPublicArticle: base.detectPublicArticle.bind(base),
      detectControl: base.detectControl.bind(base)
    };
    const adapter = new XArticleBrowserAdapter(store, contract, {
      executionId: () => 'execution_existing_media_preflight_sentinel',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation('source_preflight_sentinel', 'source_command_preflight_sentinel', '2026-08-21T08:59:00.000Z'),
      coverBulkCapabilities
    );
    const next = await adapter.next(execution.execution_id);
    const input = {
      command: next.command!, status: 'success' as const,
      observation: freshBodyCompleteObservation(execution.execution_id, next.command!.command_id, '2026-08-21T09:00:00.000Z')
    };
    await adapter.claim(input.command);

    await expect(adapter.report(input)).rejects.toBe(sentinel);
    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({
      state: 'preflight', sequence: 1, latest_observation_id: null
    });
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/reports/${input.command.command_id}.json`))
      .resolves.toBe(false);
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/observations/${input.observation.observation_id}.json`))
      .resolves.toBe(false);
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/events/000002.json`)).resolves.toBe(false);
  });

  it.each(['body_verified', 'media_materializing'] as const)(
    'resumes an adopted body-complete Draft through %s without treating it as drift',
    async (phase) => {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-existing-media-resume-${phase}-`)));
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => `execution_existing_media_resume_${phase}`,
        now: () => new Date('2026-08-21T09:00:00.000Z')
      });
      const execution = await adapter.prepareExistingDraftMedia(
        coverInlinePlan,
        existingBodyCompleteObservation(
          `source_resume_${phase}`, `source_command_resume_${phase}`, '2026-08-21T08:59:00.000Z'
        ),
        coverBulkCapabilities
      );
      let next = await adapter.next(execution.execution_id);
      await reportSuccess(adapter, execution.execution_id, next.command,
        freshBodyCompleteObservation(execution.execution_id, next.command!.command_id, '2026-08-21T09:00:00.000Z'));
      next = await adapter.next(execution.execution_id);
      expect(next.command?.kind).toBe('upload_article_cover');
      if (phase === 'media_materializing') {
        const checkpointPath = `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`;
        const checkpoint = await store.readJson<Record<string, unknown>>(checkpointPath);
        await store.replaceAtomic(checkpointPath, { ...checkpoint, phase });
      }

      await expect(adapter.resumeEditor(execution.execution_id)).resolves.toMatchObject({
        state: 'materialization_reconciling', publish_command_count: 0
      });
      await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
        command: { kind: 'observe_article_page' }, snapshot: { state: 'materialization_reconciling' }
      });
    }
  );

  it.each(['account', 'body', 'draft'] as const)(
    'records adopted Draft %s verification rejection as terminal materialization evidence',
    async (mismatch) => {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-existing-media-reject-${mismatch}-`)));
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => `execution_existing_media_reject_${mismatch}`,
        now: () => new Date('2026-08-21T09:00:00.000Z')
      });
      const execution = await adapter.prepareExistingDraftMedia(
        coverInlinePlan,
        existingBodyCompleteObservation(`source_${mismatch}`, `source_command_${mismatch}`, '2026-08-21T08:59:00.000Z'),
        coverBulkCapabilities
      );
      const next = await adapter.next(execution.execution_id);
      const fresh = freshBodyCompleteObservation(execution.execution_id, next.command!.command_id, '2026-08-21T09:00:00.000Z');
      const invalid = mismatch === 'account'
        ? observed(execution.execution_id, next.command!.command_id, { ...fresh, account_handle: '@ForeignAccount' })
        : mismatch === 'body'
          ? observed(execution.execution_id, next.command!.command_id, {
            ...fresh, editor: { ...fresh.editor!, title: 'Human edited title' }
          })
          : observed(execution.execution_id, next.command!.command_id, {
            ...fresh,
            canonical_url: 'https://x.com/compose/articles/edit/2092851979932647425',
            editor: { ...fresh.editor!, draft_id: '2092851979932647425' }
          });

      await expect(reportSuccess(adapter, execution.execution_id, next.command, invalid))
        .resolves.toBeUndefined();
      await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
        snapshot: { state: 'materialization_blocked' }, command: null
      });
      await expect(store.readJson<Record<string, unknown>>(
        `runs/${execution.execution_id}/x-article/browser/events/000002.json`
      )).resolves.toMatchObject({ event_type: 'article_adoption_rejected' });
    }
  );

  it('repairs a persisted account-rejection event when its blocked context write crashes before projection replay', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-account-rejection-context-crash-')));
    const executionId = 'execution_existing_media_account_rejection_context_crash';
    const base = new XArticleWeb2026_08Contract();
    const contract: XArticlePageContract = {
      id: base.id, version: base.version, media_alt_capabilities: base.media_alt_capabilities,
      detectPage: base.detectPage.bind(base),
      detectAccount: () => ({ handle: '@ForeignAccount' }),
      detectEditor: base.detectEditor.bind(base),
      readEditorImportState: base.readEditorImportState.bind(base),
      readEditorDocument: base.readEditorDocument.bind(base),
      detectPreview: base.detectPreview.bind(base),
      detectPublishReview: base.detectPublishReview.bind(base),
      detectPublicArticle: base.detectPublicArticle.bind(base),
      detectControl: base.detectControl.bind(base)
    };
    const adapter = new XArticleBrowserAdapter(store, contract, {
      executionId: () => executionId,
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation('source_account_context_crash', 'source_command_account_context_crash', '2026-08-21T08:59:00.000Z'),
      coverBulkCapabilities
    );
    const navigating = await adapter.next(execution.execution_id);
    const input = {
      command: navigating.command!, status: 'success' as const,
      observation: freshBodyCompleteObservation(execution.execution_id, navigating.command!.command_id, '2026-08-21T09:00:00.000Z')
    };
    await adapter.claim(input.command);
    await adapter.report(input);
    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({ state: 'preflight', sequence: 1 });
    const replaceAtomic = store.replaceAtomic.bind(store);
    let failBlockedContext = true;
    store.replaceAtomic = async (path, value) => {
      if (failBlockedContext) {
        failBlockedContext = false;
        throw new Error('injected adoption rejection context crash');
      }
      return replaceAtomic(path, value);
    };

    await expect(adapter.next(execution.execution_id)).rejects.toThrow('injected adoption rejection context crash');
    await expect(store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/events/000002.json`
    )).resolves.toMatchObject({ event_type: 'article_adoption_rejected' });
    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({ state: 'preflight', sequence: 1 });

    const replay = new XArticleBrowserAdapter(store, contract, {
      executionId: () => executionId,
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const rejectionEventPath = `runs/${execution.execution_id}/x-article/browser/events/000002.json`;
    const rejectionEvent = await store.readJson<Record<string, unknown>>(rejectionEventPath);
    await store.replaceAtomic(rejectionEventPath, { ...rejectionEvent, execution_id: 'foreign_execution' });
    await expect(replay.report(input)).rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
    await store.replaceAtomic(rejectionEventPath, rejectionEvent);
    await expect(replay.report(input)).resolves.toMatchObject({ state: 'materialization_blocked', sequence: 2 });
    await expect(replay.status(execution.execution_id)).resolves.toMatchObject({ state: 'materialization_blocked', sequence: 2 });
    await expect(store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/events/000003.json`
    )).rejects.toThrow();
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toBe(false);
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`))
      .resolves.toBe(false);
  });

  it('reconciles adopted cover and inline media without opening Preview or publishing', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-complete-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_existing_media_complete',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation(
        'execution_source_media_complete', 'command_source_media_complete', '2026-08-21T08:59:00.000Z'
      ),
      coverBulkCapabilities
    );
    let next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command,
      freshBodyCompleteObservation(execution.execution_id, next.command!.command_id, '2026-08-21T09:00:00.000Z'));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('upload_article_cover');
    const template = createXArticleImportTemplate(coverInlinePlan.intent.document);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id, next.command!.command_id, {
        observed_at: '2026-08-21T09:00:00.000Z',
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        page_kind: 'article_editor', controls: editorControls,
        editor: {
          draft_id: '2092851979932647424', title: coverInlinePlan.intent.document.title,
          blocks: coverInlinePlan.intent.document.blocks.filter((block) => block.kind !== 'image'),
          visuals: [{
            ref: 'cover_existing_media', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
            alt_text: null, status: 'uploaded', owned_by_execution: true
          }], has_unknown_content: false, autosave_state: 'saved',
          import_state: {
            template_digest: template.template_digest, source_document_digest: template.source_document_digest,
            unresolved_anchors: template.anchors
          }
        }
      }
    ));

    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('replace_article_visual_anchor');
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id, next.command!.command_id, {
        observed_at: '2026-08-21T09:00:00.000Z',
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        page_kind: 'article_editor', controls: editorControls,
        editor: {
          draft_id: '2092851979932647424', title: coverInlinePlan.intent.document.title,
          blocks: coverInlinePlan.intent.document.blocks,
          visuals: [
            {
              ref: 'cover_existing_media', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
              alt_text: null, status: 'uploaded', owned_by_execution: true
            },
            {
              ref: 'inline_existing_media', asset_id: inlineAsset.asset_id, kind: 'inline', block_ordinal: 2,
              alt_text: inlineAsset.alt_text, status: 'uploaded', owned_by_execution: true
            }
          ], has_unknown_content: false, autosave_state: 'saved', import_state: null
        }
      }
    ));

    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'draft_reconciled', publish_command_count: 0 }, command: null
    });
  });

  it('reconciles a body-empty adopted Draft after its only cover upload', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-cover-only-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_existing_cover_only',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const source = observed('source_cover_only', 'source_command_cover_only', {
      observed_at: '2026-08-21T08:59:00.000Z',
      canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
      page_kind: 'article_editor', controls: editorControls,
      editor: {
        draft_id: '2092851979932647424', title: coverOnlyPlan.intent.document.title,
        blocks: [], visuals: [], import_state: {
          template_digest: createXArticleImportTemplate(coverOnlyPlan.intent.document).template_digest,
          source_document_digest: createXArticleImportTemplate(coverOnlyPlan.intent.document).source_document_digest,
          unresolved_anchors: []
        }, has_unknown_content: false, autosave_state: 'saved'
      }
    });
    const execution = await adapter.prepareExistingDraftMedia(coverOnlyPlan, source, coverBulkCapabilities);
    let next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id, next.command!.command_id, {
        observed_at: '2026-08-21T09:00:00.000Z',
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        page_kind: 'article_editor', controls: editorControls,
        editor: { ...source.editor!, draft_id: '2092851979932647424' }
      }
    ));
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('upload_article_cover');
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id, next.command!.command_id, {
        observed_at: '2026-08-21T09:00:00.000Z',
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        page_kind: 'article_editor', controls: editorControls,
        editor: {
          ...source.editor!, draft_id: '2092851979932647424', import_state: null,
          visuals: [{
            ref: 'cover_only_existing', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
            alt_text: null, status: 'uploaded', owned_by_execution: true
          }]
        }
      }
    ));
    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'draft_reconciled', publish_command_count: 0 }, command: null
    });
  });

  it.each([
    { name: 'anchor present / image absent', anchor: true, image: null, expected: 'replace_article_visual_anchor' },
    { name: 'anchor present / matching image present', anchor: true, image: 'matching', expected: 'observe_article_page' },
    { name: 'anchor absent / matching image present', anchor: false, image: 'matching', expected: 'next_media' },
    { name: 'anchor absent / image unknown', anchor: false, image: 'unknown', expected: 'materialization_blocked' }
  ] as const)('recovers $name without duplicate upload', async (testCase) => {
    const fixture = await createAdoptedInlineRecoveryFixture(testCase.name.replace(/\W/g, '_'));
    const before = await mediaCommandCount(fixture.store, fixture.executionId, 'replace_article_visual_anchor');
    await fixture.adapter.claim(fixture.pendingCommand);
    const snapshot = await fixture.adapter.report({
      command: fixture.pendingCommand,
      status: 'success',
      observation: inlineBodyCompleteObservation(
        fixture.executionId,
        fixture.pendingCommand.command_id,
        { anchor: testCase.anchor, image: testCase.image }
      )
    });
    const next = await fixture.adapter.next(fixture.executionId);
    const outcome = snapshot.state === 'materialization_blocked'
      ? 'materialization_blocked'
      : next.command?.kind ?? 'next_media';
    const additionalAssetCommands = (
      await mediaCommandCount(fixture.store, fixture.executionId, 'replace_article_visual_anchor')
    ) - before;

    expect(outcome).toBe(testCase.expected);
    expect(additionalAssetCommands).toBe(testCase.expected === 'replace_article_visual_anchor' ? 1 : 0);
    if (testCase.expected === 'materialization_blocked') {
      await expect(fixture.store.readJson(
        `runs/${fixture.executionId}/x-article/browser/materialization-checkpoint.json`
      )).resolves.toMatchObject({ phase: 'blocked', media: [{ status: 'ambiguous' }] });
    }
  });

  it('observes a V3.3 media effect before deciding after effect-before-report restart', async () => {
    const fixture = await createAdoptedInlineRecoveryFixture('effect_before_report');
    await fixture.adapter.claim(fixture.pendingCommand);
    const restarted = new XArticleBrowserAdapter(
      fixture.store,
      new XArticleWeb2026_08Contract(),
      {
        commandId: (() => { let number = 20; return () => `command_effect_before_report_${++number}`; })(),
        eventId: (() => { let number = 20; return () => `event_effect_before_report_${++number}`; })(),
        now: () => new Date('2026-08-21T09:03:00.000Z')
      }
    );

    const next = await restarted.next(fixture.executionId);
    expect(next.command).toMatchObject({ kind: 'observe_article_page', side_effect: 'read' });
    expect(next.command?.command_id).not.toBe(fixture.pendingCommand.command_id);
    expect(await mediaCommandCount(
      fixture.store, fixture.executionId, 'replace_article_visual_anchor'
    )).toBe(1);
  });

  it('reconciles cover and inline recovery independently', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-cover-inline-independent-')));
    const executionId = 'execution_existing_cover_inline_independent';
    let commandNumber = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      commandId: () => `command_existing_cover_inline_independent_${++commandNumber}`,
      eventId: () => `event_existing_cover_inline_independent_${commandNumber}`,
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const source = existingBodyCompleteObservation(
      'source_cover_inline_independent', 'source_command_cover_inline_independent', '2026-08-21T09:00:00.000Z'
    );
    const execution = await adapter.prepareExistingDraftMedia(coverInlinePlan, source, coverBulkCapabilities);
    let next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, freshBodyCompleteObservation(
      execution.execution_id, next.command!.command_id, '2026-08-21T09:01:00.000Z'
    ));
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('upload_article_cover');
    const template = createXArticleImportTemplate(coverInlinePlan.intent.document);
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id, next.command!.command_id, {
        draft_id: '2092851979932647424', title: coverInlinePlan.intent.document.title,
        blocks: coverInlinePlan.intent.document.blocks.filter((block) => block.kind !== 'image'),
        visuals: [{
          ref: 'cover_independent', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
          alt_text: null, status: 'uploaded', owned_by_execution: true
        }],
        import_state: {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: template.anchors
        }, has_unknown_content: false, autosave_state: 'saved'
      }, {
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        observed_at: '2026-08-21T09:01:00.000Z'
      }
    ));
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('replace_article_visual_anchor');
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id, next.command!.command_id, {
        draft_id: '2092851979932647424', title: coverInlinePlan.intent.document.title,
        blocks: coverInlinePlan.intent.document.blocks,
        visuals: [
          {
            ref: 'cover_independent', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
            alt_text: null, status: 'uploaded', owned_by_execution: true
          },
          {
            ref: 'inline_independent', asset_id: inlineAsset.asset_id, kind: 'inline', block_ordinal: 2,
            alt_text: inlineAsset.alt_text, status: 'uploaded', owned_by_execution: true
          }
        ], import_state: null, has_unknown_content: false, autosave_state: 'saved'
      }, {
        canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
        observed_at: '2026-08-21T09:01:00.000Z'
      }
    ));

    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'draft_reconciled' }, command: null
    });
    expect(await mediaCommandCount(store, executionId, 'upload_article_cover')).toBe(1);
    expect(await mediaCommandCount(store, executionId, 'replace_article_visual_anchor')).toBe(1);
  });

  it.each(['observation', 'checkpoint', 'context'] as const)(
    'replays one V3.3 media report across the %s persistence boundary',
    async (boundary) => {
      const fixture = await createAdoptedInlineRecoveryFixture(`report_${boundary}`);
      await fixture.adapter.claim(fixture.pendingCommand);
      const report = {
        command: fixture.pendingCommand,
        status: 'success' as const,
        observation: inlineBodyCompleteObservation(
          fixture.executionId,
          fixture.pendingCommand.command_id,
          { anchor: false, image: 'matching' }
        )
      };
      const writeNew = fixture.store.writeNew.bind(fixture.store);
      const replaceAtomic = fixture.store.replaceAtomic.bind(fixture.store);
      let failOnce = true;
      fixture.store.writeNew = async (path, value) => {
        const result = await writeNew(path, value);
        if (failOnce && boundary === 'observation' && path.includes('/observations/')) {
          failOnce = false;
          throw new Error('injected persisted observation crash');
        }
        return result;
      };
      fixture.store.replaceAtomic = async (path, value) => {
        const result = await replaceAtomic(path, value);
        const projected = value as {
          media?: readonly { status?: string }[];
          pending_command?: unknown;
          last_projected_report?: unknown;
        };
        if (
          failOnce
          && boundary === 'checkpoint'
          && path.endsWith('/materialization-checkpoint.json')
          && projected.media?.[0]?.status === 'completed'
        ) {
          failOnce = false;
          throw new Error('injected persisted checkpoint crash');
        }
        if (
          failOnce
          && boundary === 'context'
          && path.endsWith('/adapter-context.json')
          && projected.pending_command === null
          && projected.last_projected_report !== null
        ) {
          failOnce = false;
          throw new Error('injected persisted context crash');
        }
        return result;
      };

      await expect(fixture.adapter.report(report)).rejects.toThrow('injected persisted');
      await expect(fixture.adapter.report(report)).resolves.toMatchObject({
        state: 'materialization_reconciling'
      });
      await expect(fixture.store.readJson(
        `runs/${fixture.executionId}/x-article/browser/materialization-checkpoint.json`
      )).resolves.toMatchObject({
        revision: 3, phase: 'draft_reconciled', media: [{ status: 'completed' }]
      });
      expect(await mediaCommandCount(
        fixture.store, fixture.executionId, 'replace_article_visual_anchor'
      )).toBe(1);
      expect((await fixture.store.list(
        `runs/${fixture.executionId}/x-article/browser/commands`
      )).filter((entry) => entry.kind === 'directory')).toHaveLength(2);
    }
  );

  it('repairs exact prepare retries after context-first and store-first crashes', async () => {
    for (const boundary of ['materialization_store', 'adapter_context'] as const) {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-x-article-prepare-repair-${boundary}-`)));
      const executionId = `execution_prepare_repair_${boundary}`;
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => executionId,
        now: () => new Date('2026-08-21T09:01:00.000Z')
      });
      const writeNew = store.writeNew.bind(store);
      let failOnce = true;
      store.writeNew = async (path, value) => {
        if (boundary === 'materialization_store' && failOnce && path.endsWith('/materialization-plan.json')) {
          failOnce = false;
          throw new Error('injected materialization store crash');
        }
        if (boundary === 'adapter_context' && failOnce && path.endsWith('/adapter-context.json')) {
          failOnce = false;
          throw new Error('injected adapter context crash');
        }
        return writeNew(path, value);
      };

      await expect(adapter.prepare(plan, bulkCapabilities)).rejects.toThrow(/injected/);
      if (boundary === 'adapter_context') {
        await expect(store.exists(`runs/${executionId}/x-article/browser/materialization-plan.json`))
          .resolves.toBe(true);
      }
      await expect(adapter.prepare(plan, bulkCapabilities))
        .resolves.toMatchObject({ execution_id: executionId, state: 'created' });
      await expect(adapter.prepare(plan, bulkCapabilities))
        .resolves.toMatchObject({ execution_id: executionId, state: 'created' });
    }
  });

  it.each([
    ['before start write', 'materialization-start.json', false],
    ['after start write', 'materialization-start.json', true],
    ['materialization store', 'materialization-plan.json', false],
    ['adapter context', 'adapter-context.json', false]
  ])('reuses immutable start evidence across an advancing-clock crash at %s', async (_name, suffix, persistBeforeFailure) => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-start-repair-')));
    const executionId = `execution_start_repair_${suffix.replace(/[^a-z]/g, '_')}`;
    let tick = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      now: () => new Date(`2026-08-21T09:01:0${tick++}.000Z`)
    });
    const writeNew = store.writeNew.bind(store);
    let failOnce = true;
    store.writeNew = async (path, value) => {
      if (failOnce && path.endsWith(`/${suffix}`)) {
        failOnce = false;
        if (persistBeforeFailure) await writeNew(path, value);
        throw new Error(`injected ${_name} crash`);
      }
      return writeNew(path, value);
    };

    await expect(adapter.prepare(plan, bulkCapabilities)).rejects.toThrow(`injected ${_name} crash`);
    const persistedStart = await store.readJson<{ started_at: string }>(
      `runs/${executionId}/x-article/browser/materialization-start.json`
    );
    await expect(adapter.prepare(plan, bulkCapabilities)).resolves.toMatchObject({
      execution_id: executionId,
      updated_at: persistedStart.started_at
    });
    await expect(store.readJson(`runs/${executionId}/x-article/browser/adapter-context.json`))
      .resolves.toMatchObject({ automation_started_at: persistedStart.started_at });
  });

  it('repairs a missing legacy start only from an untouched initial checkpoint', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-start-legacy-repair-')));
    const executionId = 'execution_start_legacy_repair_1';
    let clock = '2026-08-21T09:01:00.000Z';
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      commandId: (() => { let n = 0; return () => `command_start_legacy_${++n}`; })(),
      now: () => new Date(clock)
    });
    await adapter.prepare(plan, bulkCapabilities);
    const startPath = `runs/${executionId}/x-article/browser/materialization-start.json`;
    await store.removeFile(startPath);
    clock = '2026-08-21T09:02:00.000Z';
    await expect(adapter.prepare(plan, bulkCapabilities)).resolves.toMatchObject({
      updated_at: '2026-08-21T09:01:00.000Z'
    });
    await expect(store.readJson(startPath)).resolves.toMatchObject({
      started_at: '2026-08-21T09:01:00.000Z'
    });

    await adapter.next(executionId);
    await store.removeFile(startPath);
    await expect(adapter.prepare(plan, bulkCapabilities))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
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

  it('persists prepared command intent before broker issue and repairs the same command id', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-issue-intent-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_issue_intent_1',
      commandId: (() => { let n = 0; return () => `command_issue_intent_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const writeNew = store.writeNew.bind(store);
    let failOnce = true;
    store.writeNew = async (path, value) => {
      if (failOnce && path.endsWith('/command.json')) {
        failOnce = false;
        throw new Error('injected broker issue crash');
      }
      return writeNew(path, value);
    };

    await expect(adapter.next(execution.execution_id)).rejects.toThrow('injected broker issue crash');
    const context = await store.readJson<{
      pending_issue: { command_id: string } | null;
      pending_command: unknown;
    }>(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`);
    expect(context).toMatchObject({
      pending_issue: { command_id: 'command_issue_intent_1' },
      pending_command: null
    });

    const repaired = await adapter.next(execution.execution_id);
    expect(repaired.command?.command_id).toBe('command_issue_intent_1');
    await expect(store.exists(
      `runs/${execution.execution_id}/x-article/browser/commands/command_issue_intent_2/command.json`
    )).resolves.toBe(false);
  });

  it('repairs body checkpoint projection after intent-before-broker crash without re-deciding', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-body-intent-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_body_intent_1',
      eventId: (() => { let n = 0; return () => `event_body_intent_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_body_intent_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
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
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: '', blocks: [], visuals: [],
        import_state: null, has_unknown_content: false, autosave_state: 'saved'
      }
    ));
    next = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: plan.intent.document.title,
        blocks: [], visuals: [], import_state: null,
        has_unknown_content: false, autosave_state: 'saved'
      }
    ));
    const writeNew = store.writeNew.bind(store);
    let failOnce = true;
    store.writeNew = async (path, value) => {
      if (failOnce && path.endsWith('/command.json')) {
        failOnce = false;
        throw new Error('injected import broker crash');
      }
      return writeNew(path, value);
    };

    await expect(adapter.next(execution.execution_id)).rejects.toThrow('injected import broker crash');
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`
    )).resolves.toMatchObject({ body: { status: 'issued' } });
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/adapter-context.json`
    )).resolves.toMatchObject({
      pending_command: null,
      pending_issue: { command_id: 'command_body_intent_4', input: { kind: 'import_article_document' } }
    });
    const repaired = await adapter.next(execution.execution_id);
    expect(repaired.command).toMatchObject({
      command_id: 'command_body_intent_4', kind: 'import_article_document'
    });
  });

  it('accepts a direct report after broker persistence but before pending-command context projection', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-broker-context-gap-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_broker_context_gap_1',
      eventId: (() => { let n = 0; return () => `event_broker_context_gap_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_broker_context_gap_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
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
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: '', blocks: [], visuals: [],
        import_state: null, has_unknown_content: false, autosave_state: 'saved'
      }
    ));
    const replaceAtomic = store.replaceAtomic.bind(store);
    let failOnce = true;
    store.replaceAtomic = async (path, value) => {
      const projected = value as { pending_command?: unknown };
      if (failOnce && path.endsWith('/adapter-context.json') && projected.pending_command != null) {
        failOnce = false;
        throw new Error('injected broker-context crash');
      }
      return replaceAtomic(path, value);
    };
    await expect(adapter.next(execution.execution_id)).rejects.toThrow('injected broker-context crash');
    const context = await store.readJson<{
      pending_issue: { command_id: string };
      pending_command: null;
    }>(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`);
    expect(context.pending_command).toBeNull();
    const command = await store.readJson<NonNullable<typeof next.command>>(
      `runs/${execution.execution_id}/x-article/browser/commands/${context.pending_issue.command_id}/command.json`
    );
    await adapter.claim(command);
    await expect(adapter.report({
      command,
      status: 'success',
      observation: editorObservation(execution.execution_id, command.command_id, {
        draft_id: '2090731994279755776', title: plan.intent.document.title,
        blocks: plan.intent.document.blocks, visuals: [], import_state: null,
        has_unknown_content: false, autosave_state: 'saved'
      })
    })).resolves.toMatchObject({ state: 'materialization_reconciling' });
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
    next = await coordinatedConcurrentNext(adapter, execution.execution_id, store);
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

  it('blocks Preview when the durable reconciliation checkpoint is partial or tampered', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-preview-gate-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_preview_gate_1',
      eventId: (() => { let n = 0; return () => `event_preview_gate_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_preview_gate_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    let next = await advancePreparedToImport(adapter, execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: plan.intent.document.title,
        blocks: plan.intent.document.blocks, visuals: [], import_state: null,
        has_unknown_content: false, autosave_state: 'saved'
      }
    ));
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('open_article_preview');
    await adapter.claim(next.command!);
    const checkpointPath = `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`;
    const checkpoint = await store.readJson<Record<string, unknown>>(checkpointPath);
    await store.replaceAtomic(checkpointPath, { ...checkpoint, phase: 'body_verified' });

    await expect(adapter.report({
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
    })).resolves.toMatchObject({ state: 'materialization_blocked' });
    await expect(store.readJson(checkpointPath)).resolves.toMatchObject({ phase: 'blocked' });
  });

  it.each(['content', 'revision'] as const)(
    'blocks Preview when durable Editor %s is tampered',
    async (tamper) => {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-x-article-preview-editor-${tamper}-`)));
      const executionId = `execution_preview_editor_${tamper}`;
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => executionId,
        eventId: (() => { let n = 0; return () => `event_preview_editor_${tamper}_${++n}`; })(),
        commandId: (() => { let n = 0; return () => `command_preview_editor_${tamper}_${++n}`; })(),
        now: () => new Date('2026-08-21T09:01:00.000Z')
      });
      const execution = await adapter.prepare(plan, bulkCapabilities);
      let next = await advancePreparedToImport(adapter, execution.execution_id);
      await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
        execution.execution_id,
        next.command!.command_id,
        {
          draft_id: '2090731994279755776', title: plan.intent.document.title,
          blocks: plan.intent.document.blocks, visuals: [], import_state: null,
          has_unknown_content: false, autosave_state: 'saved'
        }
      ));
      next = await adapter.next(execution.execution_id);
      await adapter.claim(next.command!);
      const context = await store.readJson<{ latest_editor_observation_id: string }>(
        `runs/${execution.execution_id}/x-article/browser/adapter-context.json`
      );
      const editorPath = `runs/${execution.execution_id}/x-article/browser/observations/${context.latest_editor_observation_id}.json`;
      const durable = await store.readJson<XArticleBrowserObservation>(editorPath);
      await store.replaceAtomic(editorPath, tamper === 'content'
        ? { ...durable, editor: { ...durable.editor!, title: 'Tampered durable content' } }
        : { ...durable, page_revision: `sha256:${'9'.repeat(64)}` });

      await expect(adapter.report({
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
      })).resolves.toMatchObject({ state: 'materialization_blocked' });
    }
  );

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

  it('uploads a prepared cover once, reconciles uncertainty, and emits a truthful Preview receipt', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cover-materialize-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_cover_materialize_1',
      eventId: (() => { let n = 0; return () => `event_cover_materialize_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_cover_materialize_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(coverPlan, coverBulkCapabilities);
    let next = await advancePreparedToImport(adapter, execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: coverPlan.intent.document.title,
        blocks: coverPlan.intent.document.blocks, visuals: [], has_unknown_content: false,
        autosave_state: 'saved', import_state: null
      }
    ));

    next = await adapter.next(execution.execution_id);
    expect(next.command).toMatchObject({
      kind: 'upload_article_cover',
      payload: { kind: 'upload_article_cover', asset: coverAsset }
    });
    const coverCommandId = next.command!.command_id;
    await adapter.claim(next.command!);
    await expect(adapter.report({ command: next.command!, status: 'uncertain', observation: null }))
      .resolves.toMatchObject({ state: 'materialization_reconciling' });

    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('observe_article_page');
    await reportSuccess(adapter, execution.execution_id, next.command, editorObservation(
      execution.execution_id,
      next.command!.command_id,
      {
        draft_id: '2090731994279755776', title: coverPlan.intent.document.title,
        blocks: coverPlan.intent.document.blocks,
        visuals: [{
          ref: 'cover_ref_1', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
          alt_text: null, status: 'uploaded', owned_by_execution: true
        }],
        has_unknown_content: false, autosave_state: 'saved', import_state: null
      }
    ));
    next = await adapter.next(execution.execution_id);
    expect(next.command?.kind).toBe('open_article_preview');
    expect(next.command?.command_id).not.toBe(coverCommandId);
    await reportSuccess(adapter, execution.execution_id, next.command, observed(
      execution.execution_id,
      next.command!.command_id,
      {
        canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776/preview',
        page_kind: 'article_preview', controls: [],
        preview: {
          draft_id: '2090731994279755776', title: coverPlan.intent.document.title,
          blocks: coverPlan.intent.document.blocks,
          visuals: [{
            ref: 'cover_ref_1', asset_id: coverAsset.asset_id, kind: 'cover', block_ordinal: null,
            alt_text: null, status: 'uploaded', owned_by_execution: true
          }]
        }
      }
    ));
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/materialization-receipt.json`
    )).resolves.toMatchObject({
      body_block_count: 1,
      inline_image_count: 0,
      command_count: 7,
      observation_count: 6,
      recovery_count: 1
    });
    await expect(adapter.status(execution.execution_id)).resolves.toMatchObject({
      state: 'confirmation_pending'
    });
  });

  it.each([
    ['body and cover', coverPlan],
    ['cover only', coverOnlyPlan]
  ] as const)('resumes %s after body reconciliation before cover issue', async (_name, preparedPlan) => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cover-resume-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => `execution_cover_resume_${preparedPlan.plan_id}`,
      eventId: (() => { let n = 0; return () => `event_cover_resume_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_cover_resume_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(preparedPlan, coverBulkCapabilities);
    const importing = await advancePreparedToImport(
      adapter,
      execution.execution_id,
      preparedPlan.intent.document.title
    );
    await reportSuccess(adapter, execution.execution_id, importing.command, editorObservation(
      execution.execution_id,
      importing.command!.command_id,
      {
        draft_id: '2090731994279755776', title: preparedPlan.intent.document.title,
        blocks: preparedPlan.intent.document.blocks, visuals: [], import_state: null,
        has_unknown_content: false, autosave_state: 'saved'
      }
    ));

    const resumed = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      eventId: (() => { let n = 20; return () => `event_cover_resume_${++n}`; })(),
      commandId: (() => { let n = 20; return () => `command_cover_resume_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    await expect(resumed.resumeEditor(execution.execution_id))
      .resolves.toMatchObject({ state: 'materialization_reconciling' });
    await expect(resumed.next(execution.execution_id)).resolves.toMatchObject({
      command: { kind: 'upload_article_cover', payload: { asset: coverAsset } }
    });
  });

  it('replays an identical accepted report across observation, checkpoint, and context crashes', async () => {
    for (const boundary of ['observation', 'checkpoint', 'context'] as const) {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-x-article-report-${boundary}-`)));
      const executionId = `execution_report_${boundary}`;
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => executionId,
        eventId: (() => { let n = 0; return () => `event_report_${boundary}_${++n}`; })(),
        commandId: (() => { let n = 0; return () => `command_report_${boundary}_${++n}`; })(),
        now: () => new Date('2026-08-21T09:01:00.000Z')
      });
      const execution = await adapter.prepare(plan, bulkCapabilities);
      const importing = await advancePreparedToImport(adapter, execution.execution_id);
      await adapter.claim(importing.command!);
      const observation = editorObservation(
        execution.execution_id,
        importing.command!.command_id,
        {
          draft_id: '2090731994279755776', title: plan.intent.document.title,
          blocks: plan.intent.document.blocks, visuals: [], import_state: null,
          has_unknown_content: false, autosave_state: 'saved'
        }
      );
      const report = { command: importing.command!, status: 'success' as const, observation };
      const writeNew = store.writeNew.bind(store);
      const replaceAtomic = store.replaceAtomic.bind(store);
      let failOnce = true;
      store.writeNew = async (path, value) => {
        if (boundary === 'observation' && failOnce && path.includes('/observations/')) {
          failOnce = false;
          throw new Error('injected observation projection crash');
        }
        return writeNew(path, value);
      };
      store.replaceAtomic = async (path, value) => {
        if (
          failOnce
          && ((boundary === 'checkpoint' && path.endsWith('/materialization-checkpoint.json'))
            || (boundary === 'context' && path.endsWith('/adapter-context.json')))
        ) {
          failOnce = false;
          throw new Error(`injected ${boundary} projection crash`);
        }
        return replaceAtomic(path, value);
      };

      await expect(adapter.report(report)).rejects.toThrow('injected');
      await expect(adapter.report(report)).resolves.toMatchObject({ state: 'materialization_reconciling' });
      const context = await store.readJson<{
        pending_command: unknown;
        pending_issue: unknown;
        last_projected_report: { command_id: string } | null;
      }>(`runs/${execution.execution_id}/x-article/browser/adapter-context.json`);
      expect(context).toMatchObject({
        pending_command: null,
        pending_issue: null,
        last_projected_report: { command_id: importing.command!.command_id }
      });
      await expect(store.readJson(
        `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`
      )).resolves.toMatchObject({ phase: 'draft_reconciled', body: { status: 'verified' } });
    }
  });

  it('fails malformed prepared reports closed from each externally active setup stage', async () => {
    for (const stage of ['preflight', 'draft_create_armed', 'materialization_reconciling'] as const) {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-x-article-malformed-${stage}-`)));
      const executionId = `execution_malformed_${stage}`;
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => executionId,
        eventId: (() => { let n = 0; return () => `event_malformed_${stage}_${++n}`; })(),
        commandId: (() => { let n = 0; return () => `command_malformed_${stage}_${++n}`; })(),
        now: () => new Date('2026-08-21T09:01:00.000Z')
      });
      const execution = await adapter.prepare(plan, bulkCapabilities);
      let pending = await adapter.next(execution.execution_id);
      if (stage !== 'preflight') {
        await reportSuccess(adapter, execution.execution_id, pending.command, observed(
          execution.execution_id,
          pending.command!.command_id,
          {
            canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
            controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
          }
        ));
        pending = await adapter.next(execution.execution_id);
      }
      if (stage === 'materialization_reconciling') {
        await reportSuccess(adapter, execution.execution_id, pending.command, editorObservation(
          execution.execution_id,
          pending.command!.command_id,
          {
            draft_id: '2090731994279755776', title: '', blocks: [], visuals: [],
            import_state: null, has_unknown_content: false, autosave_state: 'saved'
          }
        ));
        pending = await adapter.next(execution.execution_id);
      }
      await adapter.claim(pending.command!);
      await expect(adapter.report({ command: pending.command!, status: 'success', observation: null }))
        .resolves.toMatchObject({ state: 'materialization_blocked' });
      await expect(store.readJson(
        `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`
      )).resolves.toMatchObject({ phase: 'blocked' });
    }
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
    next = await coordinatedConcurrentNext(adapter, execution.execution_id, store);
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
      command: next.command!, status: 'rejected', observation
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(adapter.report({
      command: { ...next.command!, purpose: 'forged_replay' },
      status: 'success', observation
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });

    const newer = await adapter.next(execution.execution_id);
    await reportSuccess(adapter, execution.execution_id, newer.command, editorObservation(
      execution.execution_id,
      newer.command!.command_id,
      {
        draft_id: '2090731994279755776', title: '', blocks: [], visuals: [],
        import_state: null, has_unknown_content: false, autosave_state: 'saved'
      }
    ));
    const current = await adapter.status(execution.execution_id);
    await expect(adapter.report({ command: next.command!, status: 'success', observation }))
      .resolves.toEqual(current);
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
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`
    )).resolves.toMatchObject({
      phase: 'blocked', body: { status: 'issued', observed_digest: null },
      last_editor_revision: importing.command!.expected_page_revision
    });
    expect((await adapter.next(execution.execution_id)).command).toBeNull();
    await expect(adapter.resumeEditor(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_MATERIALIZATION_DRIFT' });
  });

  it('rejects a malformed editor observation before persisting report artifacts', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-report-preflight-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_report_preflight_1',
      eventId: (() => { let n = 0; return () => `event_report_preflight_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_report_preflight_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const importing = await advancePreparedToImport(adapter, execution.execution_id);
    const command = importing.command!;
    const template = createXArticleImportTemplate(plan.intent.document);
    const malformed = editorObservation(execution.execution_id, command.command_id, {
      draft_id: '2090731994279755776', title: plan.intent.document.title,
      blocks: [{
        kind: 'visual_anchor', anchor_id: 'anchor_asset_alpha_2',
        marker: 'RPH_VISUAL_ANCHOR:asset_alpha:2'
      }] as unknown as typeof plan.intent.document.blocks,
      visuals: [], has_unknown_content: false, autosave_state: 'saved',
      import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: []
      }
    });
    await adapter.claim(command);
    const contextPath = `runs/${execution.execution_id}/x-article/browser/adapter-context.json`;
    const contextBefore = await store.readJson(contextPath);

    await expect(adapter.report({ command, status: 'success', observation: malformed }))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });

    await expect(store.exists(
      `runs/${execution.execution_id}/x-article/browser/reports/${command.command_id}.json`
    )).resolves.toBe(false);
    await expect(store.exists(
      `runs/${execution.execution_id}/x-article/browser/observations/${malformed.observation_id}.json`
    )).resolves.toBe(false);
    await expect(store.exists(
      `runs/${execution.execution_id}/x-article/browser/report-projections/${command.command_id}.json`
    )).resolves.toBe(false);
    await expect(store.readJson(contextPath)).resolves.toEqual(contextBefore);
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

  it('rejects legacy Approval refresh for prepared materialization', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-prepared-approval-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_prepared_approval_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);

    await expect(adapter.refreshApproval(execution.execution_id, approval))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
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

  it.each(['created', 'preflight'] as const)(
    'cancels a V3.3 adopted Draft without a checkpoint from %s',
    async (stage) => {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-existing-media-cancel-${stage}-`)));
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => `execution_existing_media_cancel_${stage}`,
        now: () => new Date('2026-08-21T09:00:00.000Z')
      });
      const execution = await adapter.prepareExistingDraftMedia(
        coverInlinePlan,
        existingBodyCompleteObservation(`source_cancel_${stage}`, `source_command_cancel_${stage}`, '2026-08-21T08:59:00.000Z'),
        coverBulkCapabilities
      );
      if (stage === 'preflight') await adapter.next(execution.execution_id);

      await expect(adapter.cancelBeforePublish(execution.execution_id)).resolves.toMatchObject({
        state: 'cancelled_before_publish', publish_command_count: 0
      });
      await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
        .resolves.toBe(false);
    }
  );

  it('cancels a rejected V3.3 adoption without a checkpoint', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-cancel-rejected-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_existing_media_cancel_rejected',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepareExistingDraftMedia(
      coverInlinePlan,
      existingBodyCompleteObservation('source_cancel_rejected', 'source_command_cancel_rejected', '2026-08-21T08:59:00.000Z'),
      coverBulkCapabilities
    );
    const next = await adapter.next(execution.execution_id);
    const foreign = observed(execution.execution_id, next.command!.command_id, {
      ...freshBodyCompleteObservation(execution.execution_id, next.command!.command_id, '2026-08-21T09:00:00.000Z'),
      account_handle: '@ForeignAccount'
    });
    await reportSuccess(adapter, execution.execution_id, next.command, foreign);
    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'materialization_blocked' }, command: null
    });

    await expect(adapter.cancelBeforePublish(execution.execution_id)).resolves.toMatchObject({
      state: 'cancelled_before_publish', publish_command_count: 0
    });
    await expect(store.exists(`runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toBe(false);
  });

  it('fails closed when cancellation finds a malformed prepared checkpoint', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cancel-malformed-checkpoint-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_cancel_malformed_checkpoint',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    await store.replaceAtomic(
      `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`, {}
    );

    await expect(adapter.cancelBeforePublish(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
  });

  it('fails closed when cancellation finds a plan-only prepared persistence gap', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cancel-plan-only-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_cancel_plan_only',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const checkpointPath = `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`;
    const exists = store.exists.bind(store);
    store.exists = async (path) => path === checkpointPath ? false : exists(path);

    await expect(adapter.cancelBeforePublish(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
  });

  it('fails closed when a V3.2 prepared cancellation has neither plan nor checkpoint', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cancel-v32-missing-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_cancel_v32_missing',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const prefix = `runs/${execution.execution_id}/x-article/browser/`;
    const exists = store.exists.bind(store);
    store.exists = async (path) => (
      path === `${prefix}materialization-plan.json` || path === `${prefix}materialization-checkpoint.json`
    ) ? false : exists(path);

    await expect(adapter.cancelBeforePublish(execution.execution_id))
      .rejects.toMatchObject({ code: 'ARTICLE_CHECKPOINT_CONFLICT' });
  });

  it('coordinates prepared cancellation through the adapter execution lock', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cancel-lock-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_cancel_lock_1',
      eventId: () => 'event_cancel_lock_1',
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    const execution = await adapter.prepare(plan, bulkCapabilities);
    const withLock = store.withLock.bind(store);
    let adapterLockCalls = 0;
    store.withLock = async (path, operation) => {
      if (path.endsWith('/adapter-execution.lock')) adapterLockCalls += 1;
      return withLock(path, operation);
    };

    await expect(adapter.cancelBeforePublish(execution.execution_id))
      .resolves.toMatchObject({ state: 'cancelled_before_publish' });
    expect(adapterLockCalls).toBe(1);
    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({ command: null });
  });

  it.each(['next', 'report'] as const)(
    'makes prepared cancel win deterministic contention against %s',
    async (competitor) => {
      const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-x-article-cancel-${competitor}-`)));
      const executionId = `execution_cancel_${competitor}_1`;
      const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
        executionId: () => executionId,
        eventId: (() => { let n = 0; return () => `event_cancel_${competitor}_${++n}`; })(),
        commandId: (() => { let n = 0; return () => `command_cancel_${competitor}_${++n}`; })(),
        now: () => new Date('2026-08-21T09:01:00.000Z')
      });
      const execution = await adapter.prepare(plan, bulkCapabilities);
      let pending: Awaited<ReturnType<XArticleBrowserAdapter['next']>> | null = null;
      let observation: XArticleBrowserObservation | null = null;
      if (competitor === 'report') {
        pending = await adapter.next(execution.execution_id);
        await adapter.claim(pending.command!);
        observation = observed(execution.execution_id, pending.command!.command_id, {
          canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
          controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
        });
      }
      const withLock = store.withLock.bind(store);
      let releaseLock!: () => void;
      let enteredLock!: () => void;
      const release = new Promise<void>((resolve) => { releaseLock = resolve; });
      const entered = new Promise<void>((resolve) => { enteredLock = resolve; });
      let holdFirst = true;
      store.withLock = async (path, operation) => {
        if (holdFirst && path.endsWith('/adapter-execution.lock')) {
          holdFirst = false;
          return withLock(path, async () => {
            enteredLock();
            await release;
            return operation();
          });
        }
        return withLock(path, operation);
      };

      const cancelling = adapter.cancelBeforePublish(execution.execution_id);
      await entered;
      if (competitor === 'next') {
        await expect(adapter.next(execution.execution_id))
          .rejects.toMatchObject({ code: 'EXECUTION_BUSY' });
      } else {
        await expect(adapter.report({
          command: pending!.command!, status: 'success', observation
        })).rejects.toMatchObject({ code: 'EXECUTION_BUSY' });
      }
      releaseLock();
      await expect(cancelling).resolves.toMatchObject({ state: 'cancelled_before_publish' });
      await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({ command: null });
      if (observation !== null) {
        await expect(adapter.report({
          command: pending!.command!, status: 'success', observation
        })).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
        await expect(store.exists(
          `runs/${execution.execution_id}/x-article/browser/observations/${observation.observation_id}.json`
        )).resolves.toBe(false);
      }
    }
  );

  it('cancels intent-only issue recovery before broker persistence', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cancel-intent-only-')));
    const executionId = 'execution_cancel_intent_only_1';
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      eventId: (() => { let n = 0; return () => `event_cancel_intent_only_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_cancel_intent_only_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    await adapter.prepare(plan, bulkCapabilities);
    const writeNew = store.writeNew.bind(store);
    let failOnce = true;
    store.writeNew = async (path, value) => {
      if (failOnce && path.endsWith('/command.json')) {
        failOnce = false;
        throw new Error('injected pre-broker cancellation crash');
      }
      return writeNew(path, value);
    };
    await expect(adapter.next(executionId)).rejects.toThrow('injected pre-broker cancellation crash');
    await expect(adapter.cancelBeforePublish(executionId))
      .resolves.toMatchObject({ state: 'cancelled_before_publish' });
    await expect(adapter.next(executionId)).resolves.toMatchObject({
      snapshot: { state: 'cancelled_before_publish' }, command: null
    });
    await expect(store.exists(
      `runs/${executionId}/x-article/browser/commands/command_cancel_intent_only_1/command.json`
    )).resolves.toBe(false);
  });

  it('cancels broker-persisted context-gap recovery before direct report projection', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-cancel-broker-gap-')));
    const executionId = 'execution_cancel_broker_gap_1';
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => executionId,
      eventId: (() => { let n = 0; return () => `event_cancel_broker_gap_${++n}`; })(),
      commandId: (() => { let n = 0; return () => `command_cancel_broker_gap_${++n}`; })(),
      now: () => new Date('2026-08-21T09:01:00.000Z')
    });
    await adapter.prepare(plan, bulkCapabilities);
    const replaceAtomic = store.replaceAtomic.bind(store);
    let failOnce = true;
    store.replaceAtomic = async (path, value) => {
      const projected = value as { pending_command?: unknown };
      if (failOnce && path.endsWith('/adapter-context.json') && projected.pending_command != null) {
        failOnce = false;
        throw new Error('injected broker-persisted cancellation crash');
      }
      return replaceAtomic(path, value);
    };
    await expect(adapter.next(executionId)).rejects.toThrow('injected broker-persisted cancellation crash');
    const command = await store.readJson<NonNullable<Awaited<ReturnType<XArticleBrowserAdapter['next']>>['command']>>(
      `runs/${executionId}/x-article/browser/commands/command_cancel_broker_gap_1/command.json`
    );
    await expect(adapter.cancelBeforePublish(executionId))
      .resolves.toMatchObject({ state: 'cancelled_before_publish' });
    const observation = observed(executionId, command.command_id, {
      canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
      controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
    });
    await expect(adapter.report({ command, status: 'success', observation }))
      .rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
    await expect(adapter.status(executionId))
      .resolves.toMatchObject({ state: 'cancelled_before_publish' });
    await expect(store.exists(
      `runs/${executionId}/x-article/browser/observations/${observation.observation_id}.json`
    )).resolves.toBe(false);
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
