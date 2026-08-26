import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import type { XArticleBrowserCommandV1 } from '../../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  createXArticleMaterializationPlan,
  type XArticleMaterializationCheckpointV1
} from '../../harnesses/research-publishing/core/x-article-materialization.js';
import {
  createXArticlePublishConfirmation,
  verifyXArticlePublishConfirmation,
  type CreateXArticlePublishConfirmationInput,
  type XArticlePublishConfirmationBinding
} from '../../harnesses/research-publishing/core/x-article-publish-confirmation.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const DIGEST_A: `sha256:${string}` = `sha256:${'a'.repeat(64)}`;
const DIGEST_B: `sha256:${string}` = `sha256:${'b'.repeat(64)}`;
const DIGEST_C: `sha256:${string}` = `sha256:${'c'.repeat(64)}`;
const DIGEST_D: `sha256:${string}` = `sha256:${'d'.repeat(64)}`;

const input: CreateXArticlePublishConfirmationInput = {
  confirmation_id: 'confirmation_v32',
  execution_id: 'execution_v32',
  draft_id: '2092246293603373056',
  target_account: '@Glen56121',
  audience: 'everyone',
  plan_digest: DIGEST_A,
  document_digest: DIGEST_B,
  preview_revision: DIGEST_C,
  asset_digests: [DIGEST_D, DIGEST_A],
  confirmed_by: 'human',
  confirmed_at: '2026-08-26T00:10:00.000Z'
};

const binding: XArticlePublishConfirmationBinding = {
  execution_id: input.execution_id,
  draft_id: input.draft_id,
  target_account: input.target_account,
  audience: input.audience,
  plan_digest: input.plan_digest,
  document_digest: input.document_digest,
  preview_revision: input.preview_revision,
  asset_digests: input.asset_digests,
  confirmed_at_not_before: '2026-08-26T00:09:59.000Z',
  confirmed_at_not_after: '2026-08-26T00:10:01.000Z'
};

const adapterPlan = createXArticlePublicationPlan({
  planId: 'plan_confirmation', runId: 'run_confirmation', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/confirmation', digest: DIGEST_A },
  document: {
    schema_version: '1.0', title: 'Confirm from Preview', cover_asset_id: null,
    blocks: [{ kind: 'paragraph', runs: [{ text: 'One submit only.', marks: [], link: null }] }]
  },
  visuals: [], plannedAt: '2026-08-26T00:00:00.000Z', provenance: {}
});

const capabilities = {
  executor: 'codex-chrome', executor_version: 'test', browser_family: 'chrome',
  capabilities: [
    'observe_article_page', 'create_article_draft', 'open_article_preview',
    'open_publish_review', 'publish_article_once', 'import_article_document',
    'replace_article_visual_anchor'
  ],
  observed_at: '2026-08-26T00:00:00.000Z'
} as const;

function observed(executionId: string, commandId: string, value: Record<string, unknown>) {
  const body = {
    schema_version: '1.0', observation_id: `obs_${commandId}`, execution_id: executionId,
    command_id: commandId, origin: 'https://x.com', observed_at: '2026-08-26T00:10:00.000Z',
    account_handle: '@Glen56121', controls: [], editor: null, preview: null,
    publish_review: null, public_article: null, ...value
  } as const;
  const observation = { ...body, page_revision: computeXArticlePageRevision(body) };
  return observation as unknown as XArticleBrowserObservation;
}

async function claimAndReport(
  adapter: XArticleBrowserAdapter,
  command: NonNullable<Awaited<ReturnType<XArticleBrowserAdapter['next']>>['command']>,
  observation: XArticleBrowserObservation
): Promise<void> {
  await adapter.claim(command);
  await adapter.report({ command, status: 'success', observation });
}

async function preparedConfirmationFixture(executionId: string) {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-confirm-')));
  let eventNumber = 0;
  let commandNumber = 0;
  const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
    executionId: () => executionId,
    eventId: () => `${executionId}_event_${++eventNumber}`,
    commandId: () => `${executionId}_command_${++commandNumber}`,
    attemptId: () => `${executionId}_attempt`,
    now: () => new Date('2026-08-26T00:10:00.000Z')
  });
  const execution = await adapter.prepare(adapterPlan, capabilities);
  let next = await adapter.next(execution.execution_id);
  await claimAndReport(adapter, next.command!, observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
    controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
  }));
  next = await adapter.next(execution.execution_id);
  await claimAndReport(adapter, next.command!, observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
    page_kind: 'article_editor',
    controls: [
      { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
      { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false }
    ],
    editor: {
      draft_id: '2092246293603373056', title: '', blocks: [], visuals: [],
      import_state: null, has_unknown_content: false, autosave_state: 'saved'
    }
  }));
  next = await adapter.next(execution.execution_id);
  const template = createXArticleImportTemplate(adapterPlan.intent.document);
  await claimAndReport(adapter, next.command!, observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
    page_kind: 'article_editor',
    controls: [
      { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
      { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false }
    ],
    editor: {
      draft_id: '2092246293603373056', title: adapterPlan.intent.document.title,
      blocks: adapterPlan.intent.document.blocks, visuals: [], has_unknown_content: false,
      autosave_state: 'saved', import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: []
      }
    }
  }));
  next = await adapter.next(execution.execution_id);
  await claimAndReport(adapter, next.command!, observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
    page_kind: 'article_editor',
    controls: [
      { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
      { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false }
    ],
    editor: {
      draft_id: '2092246293603373056', title: adapterPlan.intent.document.title,
      blocks: adapterPlan.intent.document.blocks, visuals: [], import_state: null,
      has_unknown_content: false, autosave_state: 'saved'
    }
  }));
  next = await adapter.next(execution.execution_id);
  const preview = observed(execution.execution_id, next.command!.command_id, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056/preview',
    page_kind: 'article_preview', controls: [
      { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
    ],
    preview: {
      draft_id: '2092246293603373056', title: adapterPlan.intent.document.title,
      blocks: adapterPlan.intent.document.blocks, visuals: []
    }
  });
  await claimAndReport(adapter, next.command!, preview);
  expect(await adapter.status(execution.execution_id)).toMatchObject({
    state: 'confirmation_pending', publish_command_count: 0
  });
  return { store, adapter, executionId: execution.execution_id, preview };
}

async function pendingDraftClaimFixture(executionId: string) {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-claim-')));
  const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
    executionId: () => executionId,
    eventId: (() => { let n = 0; return () => `${executionId}_event_${++n}`; })(),
    commandId: (() => { let n = 0; return () => `${executionId}_command_${++n}`; })(),
    now: () => new Date('2026-08-26T00:10:00.000Z')
  });
  await adapter.prepare(adapterPlan, capabilities);
  const command = (await adapter.next(executionId)).command!;
  return { store, adapter, executionId, command };
}

async function expectCancellationClaimBarrier(
  store: WorkspaceStore,
  adapter: XArticleBrowserAdapter,
  executionId: string,
  command: XArticleBrowserCommandV1
): Promise<void> {
  const withLock = store.withLock.bind(store);
  let enteredResolve!: () => void;
  let releaseResolve!: () => void;
  const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
  const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
  let pauseFirstAdapterLock = true;
  store.withLock = (path, operation) => withLock(path, async () => {
    if (path.endsWith('/adapter-execution.lock') && pauseFirstAdapterLock) {
      pauseFirstAdapterLock = false;
      enteredResolve();
      await release;
    }
    return operation();
  });

  const cancelling = adapter.cancelBeforePublish(executionId);
  await entered;
  await expect(adapter.claim(command)).rejects.toMatchObject({ code: 'EXECUTION_BUSY' });
  releaseResolve();
  await expect(cancelling).resolves.toMatchObject({ state: 'cancelled_before_publish' });
  await expect(adapter.claim(command)).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
}

async function expectConcurrentClaimBarrier(
  store: WorkspaceStore,
  adapter: XArticleBrowserAdapter,
  command: XArticleBrowserCommandV1
): Promise<void> {
  const withLock = store.withLock.bind(store);
  let enteredResolve!: () => void;
  let releaseResolve!: () => void;
  const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
  const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
  let pauseFirstAdapterLock = true;
  let adapterLockCalls = 0;
  store.withLock = (path, operation) => {
    if (path.endsWith('/adapter-execution.lock')) {
      adapterLockCalls += 1;
    }
    return withLock(path, async () => {
      if (path.endsWith('/adapter-execution.lock') && pauseFirstAdapterLock) {
        pauseFirstAdapterLock = false;
        enteredResolve();
        await release;
      }
      return operation();
    });
  };

  const first = adapter.claim(command);
  const settledBeforeLock = Promise.allSettled([first]).then(() => 'settled' as const);
  const event = await Promise.race([entered.then(() => 'entered' as const), settledBeforeLock]);
  expect(event).toBe('entered');
  const second = adapter.claim(command);
  await expect(second).rejects.toMatchObject({ code: 'EXECUTION_BUSY' });
  releaseResolve();
  await expect(first).resolves.toMatchObject({ command_id: command.command_id, claimed: true });
  expect(adapterLockCalls).toBe(2);
}

function confirmationFor(executionId: string, previewRevision: `sha256:${string}`) {
  return createXArticlePublishConfirmation({
    confirmation_id: `confirmation_${executionId}`,
    execution_id: executionId,
    draft_id: '2092246293603373056',
    target_account: adapterPlan.intent.target_account,
    audience: 'everyone',
    plan_digest: adapterPlan.plan_digest as `sha256:${string}`,
    document_digest: sha256(adapterPlan.intent.document),
    preview_revision: previewRevision,
    asset_digests: adapterPlan.intent.visuals.map((item) => item.asset.digest),
    confirmed_by: 'human:Glen56121',
    confirmed_at: '2026-08-26T00:10:00.000Z'
  });
}

async function advanceToFinalCommand(
  adapter: XArticleBrowserAdapter,
  executionId: string,
  store: WorkspaceStore
) {
  let next = await adapter.next(executionId);
  expect(next.command?.kind).toBe('open_publish_review');
  const consumptionPath = `runs/${executionId}/x-article/browser/publish-confirmation-consumption.json`;
  await adapter.claim(next.command!);
  expect(await store.exists(consumptionPath)).toBe(false);
  await adapter.report({
    command: next.command!, status: 'success', observation: observed(executionId, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056/preview',
      page_kind: 'publish_review', controls: [
        { ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }
      ],
      publish_review: {
        draft_id: '2092246293603373056', audience: 'everyone', final_publish_ref: 'publish_final'
      }
    })
  });
  next = await adapter.next(executionId);
  expect(next.command?.kind).toBe('publish_article_once');
  return next.command!;
}

describe('X Article Publish confirmation', () => {
  it('creates an immutable canonical one-time confirmation bound to the verified Preview', () => {
    const confirmation = createXArticlePublishConfirmation(input);

    expect(confirmation).toMatchObject({
      schema_version: 'x-article-publish-confirmation/v1',
      ...input,
      scope: 'publish_article_once'
    });
    expect(confirmation.confirmation_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(Object.isFrozen(confirmation)).toBe(true);
    expect(Object.isFrozen(confirmation.asset_digests)).toBe(true);
    expect(verifyXArticlePublishConfirmation(confirmation, binding)).toEqual(confirmation);
  });

  it.each([
    ['execution_id', { execution_id: 'execution_foreign' }],
    ['draft_id', { draft_id: '2092246293603373999' }],
    ['target_account', { target_account: '@ForeignAccount' }],
    ['audience', { audience: 'followers' }],
    ['plan_digest', { plan_digest: DIGEST_D }],
    ['document_digest', { document_digest: DIGEST_C }],
    ['preview_revision', { preview_revision: DIGEST_B }],
    ['asset_digests ordering', { asset_digests: [DIGEST_A, DIGEST_D] }],
    ['asset_digests membership', { asset_digests: [DIGEST_D] }]
  ])('rejects a confirmation with stale %s binding', (_name, changed) => {
    const confirmation = createXArticlePublishConfirmation(input);

    expect(() => verifyXArticlePublishConfirmation(
      confirmation,
      { ...binding, ...changed } as XArticlePublishConfirmationBinding
    )).toThrowError(expect.objectContaining({ code: 'PUBLISH_GATE_BLOCKED' }));
  });

  it.each([
    ['confirmation_id', { confirmation_id: 'confirmation_changed' }],
    ['confirmed_by', { confirmed_by: 'attacker' }],
    ['confirmed_at', { confirmed_at: '2026-08-26T00:10:00.001Z' }],
    ['scope', { scope: 'publish_twice' }],
    ['confirmation_digest', { confirmation_digest: DIGEST_D }]
  ])('rejects tampering with canonical %s', (_name, changed) => {
    const confirmation = createXArticlePublishConfirmation(input);

    expect(() => verifyXArticlePublishConfirmation(
      { ...confirmation, ...changed } as typeof confirmation,
      binding
    )).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it.each([
    ['before the verified Preview', {
      confirmed_at_not_before: '2026-08-26T00:10:00.001Z',
      confirmed_at_not_after: binding.confirmed_at_not_after
    }],
    ['after the trusted clock', {
      confirmed_at_not_before: binding.confirmed_at_not_before,
      confirmed_at_not_after: '2026-08-26T00:09:59.999Z'
    }]
  ])('rejects confirmation time %s', (_name, bounds) => {
    const confirmation = createXArticlePublishConfirmation(input);

    expect(() => verifyXArticlePublishConfirmation(
      confirmation,
      { ...binding, ...bounds }
    )).toThrowError(expect.objectContaining({ code: 'PUBLISH_GATE_BLOCKED' }));
  });

  it('rejects a blank human confirmer identity', () => {
    expect(() => createXArticlePublishConfirmation({ ...input, confirmed_by: '   ' }))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});

describe('X Article Publish confirmation adapter gate', () => {
  it('detaches mutable confirmation input before asynchronous lock acquisition', async () => {
    const { store, adapter, executionId, preview } = await preparedConfirmationFixture(
      'execution_confirmation_toctou'
    );
    const confirmation = structuredClone(confirmationFor(executionId, preview.page_revision));
    const withLock = store.withLock.bind(store);
    let enteredResolve!: () => void;
    let releaseResolve!: () => void;
    const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
    const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
    store.withLock = async (path, operation) => {
      if (path.endsWith('/adapter-execution.lock')) {
        enteredResolve();
        await release;
      }
      return withLock(path, operation);
    };

    const confirming = adapter.confirmPublish(executionId, confirmation);
    await entered;
    (confirmation as { target_account: string }).target_account = '@OtherAccount';
    releaseResolve();

    await expect(confirming).resolves.toMatchObject({ state: 'publish_armed' });
    await expect(store.readJson(`runs/${executionId}/x-article/browser/publish-confirmation.json`))
      .resolves.toMatchObject({ target_account: '@Glen56121' });
  });

  it('persists confirmation, arms explicitly, and consumes only with the exact final claim', async () => {
    const { store, adapter, executionId, preview } = await preparedConfirmationFixture(
      'execution_confirm_happy'
    );
    expect((await adapter.next(executionId)).command).toBeNull();
    const confirmation = confirmationFor(executionId, preview.page_revision);

    await expect(adapter.confirmPublish(executionId, confirmation)).resolves.toMatchObject({
      state: 'publish_armed', publish_command_count: 0
    });
    await expect(adapter.confirmPublish(executionId, confirmation)).resolves.toMatchObject({
      state: 'publish_armed', publish_command_count: 0
    });
    await expect(store.readJson(`runs/${executionId}/x-article/browser/publish-confirmation.json`))
      .resolves.toEqual(confirmation);
    await expect(store.readJson(`runs/${executionId}/x-article/browser/materialization-checkpoint.json`))
      .resolves.toMatchObject({ phase: 'human_confirmed', publish_confirmation: 'armed' });

    const command = await advanceToFinalCommand(adapter, executionId, store);
    expect(await store.exists(
      `runs/${executionId}/x-article/browser/publish-confirmation-consumption.json`
    )).toBe(false);
    await expect(adapter.next(executionId)).resolves.toMatchObject({ command });
    await expect(adapter.claim({ ...command, draft_id: '2092246293603373999' }))
      .rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
    expect(await store.exists(
      `runs/${executionId}/x-article/browser/publish-confirmation-consumption.json`
    )).toBe(false);

    await expect(adapter.claim(command)).resolves.toMatchObject({
      execution_id: executionId, command_id: command.command_id, claimed: true
    });
    await expect(store.readJson(
      `runs/${executionId}/x-article/browser/publish-confirmation-consumption.json`
    )).resolves.toMatchObject({
      schema_version: 'x-article-publish-confirmation-consumption/v1',
      execution_id: executionId, draft_id: confirmation.draft_id,
      confirmation_id: confirmation.confirmation_id,
      confirmation_digest: confirmation.confirmation_digest,
      command_id: command.command_id,
      command_digest: sha256(command),
      consumed_at: '2026-08-26T00:10:00.000Z'
    });
    await expect(adapter.status(executionId)).resolves.toMatchObject({
      state: 'publish_attempted', publish_command_count: 1
    });
    await expect(adapter.claim(command)).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
    await expect(adapter.status(executionId)).resolves.toMatchObject({
      state: 'publish_attempted', publish_command_count: 1
    });
  });

  it('never recreates or returns a submit authorization after the final claim artifact is deleted', async () => {
    const { store, adapter, executionId, preview } = await preparedConfirmationFixture(
      'execution_deleted_final_claim'
    );
    await adapter.confirmPublish(executionId, confirmationFor(executionId, preview.page_revision));
    const command = await advanceToFinalCommand(adapter, executionId, store);
    await adapter.claim(command);
    const claimPath = `runs/${executionId}/x-article/browser/commands/${command.command_id}/claim.json`;
    await store.removeFile(claimPath);

    await expect(adapter.claim(command)).rejects.toMatchObject({ code: expect.any(String) });
    expect(await store.exists(claimPath)).toBe(false);
    await expect(adapter.status(executionId)).resolves.toMatchObject({
      state: 'publish_attempted', publish_command_count: 1
    });
  });

  it('never replaces or returns a submit authorization from a corrupt final claim artifact', async () => {
    const { store, adapter, executionId, preview } = await preparedConfirmationFixture(
      'execution_corrupt_final_claim'
    );
    await adapter.confirmPublish(executionId, confirmationFor(executionId, preview.page_revision));
    const command = await advanceToFinalCommand(adapter, executionId, store);
    await adapter.claim(command);
    const claimPath = `runs/${executionId}/x-article/browser/commands/${command.command_id}/claim.json`;
    await store.replaceAtomic(claimPath, { schema_version: 'tampered' });

    await expect(adapter.claim(command)).rejects.toMatchObject({ code: expect.any(String) });
    await expect(store.readJson(claimPath)).resolves.toEqual({ schema_version: 'tampered' });
    await expect(adapter.status(executionId)).resolves.toMatchObject({
      state: 'publish_attempted', publish_command_count: 1
    });
  });

  it.each(['deleted', 'corrupt'] as const)(
    'does not resurrect an %s armed confirmation artifact',
    async (mutation) => {
      const executionId = `execution_armed_confirmation_${mutation}`;
      const { store, adapter, preview } = await preparedConfirmationFixture(executionId);
      const confirmation = confirmationFor(executionId, preview.page_revision);
      await adapter.confirmPublish(executionId, confirmation);
      const path = `runs/${executionId}/x-article/browser/publish-confirmation.json`;
      if (mutation === 'deleted') await store.removeFile(path);
      else await store.replaceAtomic(path, { ...confirmation, confirmed_by: 'attacker' });

      await expect(adapter.confirmPublish(executionId, confirmation))
        .rejects.toMatchObject({ code: expect.any(String) });
      if (mutation === 'deleted') expect(await store.exists(path)).toBe(false);
      else await expect(store.readJson(path)).resolves.toMatchObject({ confirmed_by: 'attacker' });
    }
  );

  it.each([
    ['confirmation', 'deleted'], ['confirmation', 'corrupt'],
    ['consumption', 'deleted'], ['consumption', 'corrupt']
  ] as const)('does not resurrect a %s artifact after consumption when it is %s', async (artifact, mutation) => {
    const executionId = `execution_consumed_${artifact}_${mutation}`;
    const { store, adapter, preview } = await preparedConfirmationFixture(executionId);
    await adapter.confirmPublish(executionId, confirmationFor(executionId, preview.page_revision));
    const command = await advanceToFinalCommand(adapter, executionId, store);
    await adapter.claim(command);
    const name = artifact === 'confirmation'
      ? 'publish-confirmation.json'
      : 'publish-confirmation-consumption.json';
    const path = `runs/${executionId}/x-article/browser/${name}`;
    if (mutation === 'deleted') await store.removeFile(path);
    else await store.replaceAtomic(path, { schema_version: 'tampered' });

    await expect(adapter.claim(command)).rejects.toMatchObject({ code: expect.any(String) });
    if (mutation === 'deleted') expect(await store.exists(path)).toBe(false);
    else await expect(store.readJson(path)).resolves.toEqual({ schema_version: 'tampered' });
  });

  it.each(['missing', 'corrupt', 'tampered'] as const)(
    'fails confirmation when the immutable adapter plan is %s',
    async (mutation) => {
      const executionId = `execution_plan_${mutation}`;
      const { store, adapter, preview } = await preparedConfirmationFixture(executionId);
      const planPath = `runs/${executionId}/x-article/browser/plan.json`;
      if (mutation === 'missing') await store.removeFile(planPath);
      else if (mutation === 'corrupt') await store.replaceAtomic(planPath, 'not a plan');
      else await store.replaceAtomic(planPath, { ...adapterPlan, plan_id: 'plan_foreign' });

      await expect(adapter.confirmPublish(
        executionId,
        confirmationFor(executionId, preview.page_revision)
      )).rejects.toMatchObject({ code: expect.any(String) });
      expect(await store.exists(
        `runs/${executionId}/x-article/browser/publish-confirmation.json`
      )).toBe(false);
    }
  );

  it('rejects coordinated context and materialization replacement against immutable plan authority', async () => {
    const executionId = 'execution_coordinated_plan_replacement';
    const { store, adapter, preview } = await preparedConfirmationFixture(executionId);
    const alteredPlan = createXArticlePublicationPlan({
      planId: adapterPlan.plan_id,
      runId: adapterPlan.run_id,
      targetAccount: adapterPlan.intent.target_account,
      articlePackage: { ...adapterPlan.intent.article_package, digest: DIGEST_B },
      document: adapterPlan.intent.document,
      visuals: adapterPlan.intent.visuals,
      plannedAt: '2026-08-26T00:00:01.000Z',
      provenance: { coordinated: 'replacement' }
    });
    const alteredMaterialization = createXArticleMaterializationPlan({
      execution_id: executionId,
      publication_plan: alteredPlan,
      import_template: createXArticleImportTemplate(alteredPlan.intent.document),
      strategy: 'rich_text_anchor_import/v1'
    });
    const contextPath = `runs/${executionId}/x-article/browser/adapter-context.json`;
    const materializationPath = `runs/${executionId}/x-article/browser/materialization-plan.json`;
    const checkpointPath = `runs/${executionId}/x-article/browser/materialization-checkpoint.json`;
    const context = await store.readJson<Record<string, unknown>>(contextPath);
    const checkpoint = await store.readJson<XArticleMaterializationCheckpointV1>(checkpointPath);
    await store.replaceAtomic(contextPath, {
      ...context, plan: alteredPlan, materialization_plan: alteredMaterialization
    });
    await store.replaceAtomic(materializationPath, alteredMaterialization);
    await store.replaceAtomic(checkpointPath, {
      ...checkpoint, materialization_digest: alteredMaterialization.materialization_digest
    });
    const confirmationBody = Object.fromEntries(Object.entries(
      confirmationFor(executionId, preview.page_revision)
    ).filter(([key]) => !['schema_version', 'scope', 'confirmation_digest'].includes(key)));
    const alteredConfirmation = createXArticlePublishConfirmation({
      ...confirmationBody,
      plan_digest: alteredPlan.plan_digest as `sha256:${string}`
    } as CreateXArticlePublishConfirmationInput);

    await expect(adapter.confirmPublish(executionId, alteredConfirmation))
      .rejects.toMatchObject({ code: expect.any(String) });
  });

  it('revalidates immutable plan authority again during final consumption', async () => {
    const executionId = 'execution_claim_plan_missing';
    const { store, adapter, preview } = await preparedConfirmationFixture(executionId);
    await adapter.confirmPublish(executionId, confirmationFor(executionId, preview.page_revision));
    const command = await advanceToFinalCommand(adapter, executionId, store);
    await store.removeFile(`runs/${executionId}/x-article/browser/plan.json`);

    await expect(adapter.claim(command)).rejects.toMatchObject({ code: expect.any(String) });
    expect(await store.exists(
      `runs/${executionId}/x-article/browser/publish-confirmation-consumption.json`
    )).toBe(false);
  });

  it('serializes Draft claims with cancellation and rejects cancelled pending envelopes', async () => {
    const fixture = await pendingDraftClaimFixture('execution_draft_cancel_claim');
    await expectCancellationClaimBarrier(
      fixture.store, fixture.adapter, fixture.executionId, fixture.command
    );
  });

  it('serializes Publish review claims with cancellation and rejects cancelled pending envelopes', async () => {
    const fixture = await preparedConfirmationFixture('execution_review_cancel_claim');
    await fixture.adapter.confirmPublish(
      fixture.executionId,
      confirmationFor(fixture.executionId, fixture.preview.page_revision)
    );
    const command = (await fixture.adapter.next(fixture.executionId)).command!;
    expect(command.kind).toBe('open_publish_review');
    await expectCancellationClaimBarrier(
      fixture.store, fixture.adapter, fixture.executionId, command
    );
  });

  it('serializes concurrent Draft claims through the adapter execution lock', async () => {
    const fixture = await pendingDraftClaimFixture('execution_draft_concurrent_claim');
    await expectConcurrentClaimBarrier(fixture.store, fixture.adapter, fixture.command);
  });

  it('serializes concurrent Publish review claims through the adapter execution lock', async () => {
    const fixture = await preparedConfirmationFixture('execution_review_concurrent_claim');
    await fixture.adapter.confirmPublish(
      fixture.executionId,
      confirmationFor(fixture.executionId, fixture.preview.page_revision)
    );
    const command = (await fixture.adapter.next(fixture.executionId)).command!;
    expect(command.kind).toBe('open_publish_review');
    await expectConcurrentClaimBarrier(fixture.store, fixture.adapter, command);
  });

  it.each([
    ['execution', { execution_id: 'execution_foreign' }],
    ['draft', { draft_id: '2092246293603373999' }],
    ['account', { target_account: '@OtherAccount' }],
    ['Plan', { plan_digest: DIGEST_D }],
    ['Document', { document_digest: DIGEST_D }],
    ['Preview', { preview_revision: DIGEST_D }],
    ['assets', { asset_digests: [DIGEST_D] }],
    ['time', { confirmed_at: '2026-08-26T00:08:59.999Z' }]
  ])('fails closed on stale or foreign %s confirmation', async (_name, changed) => {
    const executionId = `execution_reject_${String(_name).toLowerCase()}`;
    const fixture = await preparedConfirmationFixture(executionId);
    const valid = confirmationFor(executionId, fixture.preview.page_revision);
    const changedBody = {
      ...valid,
      ...changed,
      confirmation_digest: undefined
    };
    const createInput = Object.fromEntries(
      Object.entries(changedBody).filter(([key]) =>
        !['schema_version', 'scope', 'confirmation_digest'].includes(key)
      )
    );
    const candidate = createXArticlePublishConfirmation(createInput as CreateXArticlePublishConfirmationInput);

    await expect(fixture.adapter.confirmPublish(executionId, candidate))
      .rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
    await expect(fixture.adapter.status(executionId)).resolves.toMatchObject({
      state: 'confirmation_pending', publish_command_count: 0
    });
    expect(await fixture.store.exists(
      `runs/${executionId}/x-article/browser/publish-confirmation.json`
    )).toBe(false);
  });

  it('revalidates durable Preview and checkpoint evidence before arming', async () => {
    const latestFixture = await preparedConfirmationFixture('execution_tamper_latest_preview');
    const contextPath = `runs/${latestFixture.executionId}/x-article/browser/adapter-context.json`;
    const context = await latestFixture.store.readJson<{
      latest_observation: unknown;
      snapshot: Record<string, unknown>;
    }>(contextPath);
    await latestFixture.store.replaceAtomic(contextPath, {
      ...context,
      latest_observation: null,
      snapshot: { ...context.snapshot, latest_observation_id: 'obs_foreign' }
    });
    await expect(latestFixture.adapter.confirmPublish(
      latestFixture.executionId,
      confirmationFor(latestFixture.executionId, latestFixture.preview.page_revision)
    )).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });

    const previewFixture = await preparedConfirmationFixture('execution_tamper_preview');
    const previewPath = `runs/${previewFixture.executionId}/x-article/browser/observations/${previewFixture.preview.observation_id}.json`;
    await previewFixture.store.replaceAtomic(previewPath, {
      ...previewFixture.preview,
      account_handle: '@OtherAccount'
    });
    await expect(previewFixture.adapter.confirmPublish(
      previewFixture.executionId,
      confirmationFor(previewFixture.executionId, previewFixture.preview.page_revision)
    )).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });

    const checkpointFixture = await preparedConfirmationFixture('execution_tamper_checkpoint');
    const checkpointPath = `runs/${checkpointFixture.executionId}/x-article/browser/materialization-checkpoint.json`;
    const checkpoint = await checkpointFixture.store.readJson<Record<string, unknown>>(checkpointPath);
    await checkpointFixture.store.replaceAtomic(checkpointPath, {
      ...checkpoint,
      last_editor_revision: DIGEST_D
    });
    await expect(checkpointFixture.adapter.confirmPublish(
      checkpointFixture.executionId,
      confirmationFor(checkpointFixture.executionId, checkpointFixture.preview.page_revision)
    )).rejects.toMatchObject({ code: expect.any(String) });
  });

  it('permits cancellation before consumption and rejects the orphaned submit claim', async () => {
    const { store, adapter, executionId, preview } = await preparedConfirmationFixture(
      'execution_cancel_unconsumed'
    );
    await adapter.confirmPublish(executionId, confirmationFor(executionId, preview.page_revision));
    const command = await advanceToFinalCommand(adapter, executionId, store);

    await expect(adapter.cancelBeforePublish(executionId)).resolves.toMatchObject({
      state: 'cancelled_before_publish', publish_command_count: 0
    });
    await expect(adapter.claim(command)).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
    expect(await store.exists(
      `runs/${executionId}/x-article/browser/publish-confirmation-consumption.json`
    )).toBe(false);
    await expect(adapter.next(executionId)).resolves.toMatchObject({ command: null });
  });

  it.each([
    ['consumption artifact write', 'armed'],
    ['checkpoint consumption update', 'consumed']
  ] as const)(
    'recovers exactly one final claim after a crash following %s',
    async (boundary, expectedCheckpointState) => {
      const executionId = `execution_preclaim_${expectedCheckpointState}`;
      const { store, adapter, preview } = await preparedConfirmationFixture(executionId);
      await adapter.confirmPublish(executionId, confirmationFor(executionId, preview.page_revision));
      const command = await advanceToFinalCommand(adapter, executionId, store);
      const claimPath = `runs/${executionId}/x-article/browser/commands/${command.command_id}/claim.json`;
      let failOnce = true;
      if (boundary === 'consumption artifact write') {
        const replaceAtomic = store.replaceAtomic.bind(store);
        store.replaceAtomic = async (path, value) => {
          const candidate = value as { publish_confirmation?: string };
          if (
            failOnce
            && path.endsWith('/materialization-checkpoint.json')
            && candidate.publish_confirmation === 'consumed'
          ) {
            failOnce = false;
            throw new Error('injected crash after consumption artifact write');
          }
          return replaceAtomic(path, value);
        };
      } else {
        const writeNew = store.writeNew.bind(store);
        store.writeNew = async (path, value) => {
          if (failOnce && path === claimPath) {
            failOnce = false;
            throw new Error('injected crash after checkpoint consumption update');
          }
          return writeNew(path, value);
        };
      }

      await expect(adapter.claim(command)).rejects.toThrow(`injected crash after ${boundary}`);
      await expect(adapter.status(executionId)).resolves.toMatchObject({
        state: 'publish_armed', publish_command_count: 0
      });
      await expect(store.readJson(
        `runs/${executionId}/x-article/browser/materialization-checkpoint.json`
      )).resolves.toMatchObject({ publish_confirmation: expectedCheckpointState });
      expect(await store.exists(
        `runs/${executionId}/x-article/browser/publish-confirmation-consumption.json`
      )).toBe(true);
      expect(await store.exists(claimPath)).toBe(false);

      await expect(adapter.claim(command)).resolves.toMatchObject({
        execution_id: executionId, command_id: command.command_id, claimed: true
      });
      await expect(adapter.claim(command)).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
      await expect(adapter.status(executionId)).resolves.toMatchObject({
        state: 'publish_attempted', publish_command_count: 1
      });
      expect((await store.list(
        `runs/${executionId}/x-article/browser/commands/${command.command_id}`
      )).filter((entry) => entry.name === 'claim.json')).toHaveLength(1);
    }
  );

  it('recovers a broker-persisted final claim without authorizing a second submit', async () => {
    const { store, adapter, executionId, preview } = await preparedConfirmationFixture(
      'execution_claim_recovery'
    );
    await adapter.confirmPublish(executionId, confirmationFor(executionId, preview.page_revision));
    const command = await advanceToFinalCommand(adapter, executionId, store);
    const replaceAtomic = store.replaceAtomic.bind(store);
    let failOnce = true;
    store.replaceAtomic = async (path, value) => {
      const candidate = value as { snapshot?: { state?: string } };
      if (failOnce && path.endsWith('/adapter-context.json') && candidate.snapshot?.state === 'publish_attempted') {
        failOnce = false;
        throw new Error('injected crash after durable broker claim');
      }
      return replaceAtomic(path, value);
    };

    await expect(adapter.claim(command)).rejects.toThrow('injected crash');
    await expect(adapter.claim(command)).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
    await expect(adapter.status(executionId)).resolves.toMatchObject({
      state: 'publish_attempted', publish_command_count: 1
    });
    expect((await store.list(
      `runs/${executionId}/x-article/browser/commands/${command.command_id}`
    )).filter((entry) => entry.name === 'claim.json')).toHaveLength(1);
  });

  it('rejects cancellation after durable confirmation consumption', async () => {
    const { store, adapter, executionId, preview } = await preparedConfirmationFixture(
      'execution_cancel_consumed'
    );
    await adapter.confirmPublish(executionId, confirmationFor(executionId, preview.page_revision));
    const command = await advanceToFinalCommand(adapter, executionId, store);
    await adapter.claim(command);

    await expect(adapter.cancelBeforePublish(executionId))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
    await expect(adapter.status(executionId)).resolves.toMatchObject({
      state: 'publish_attempted', publish_command_count: 1
    });
  });
});
