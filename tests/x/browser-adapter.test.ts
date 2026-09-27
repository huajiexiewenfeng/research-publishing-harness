import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BrowserAdapter } from '../../harnesses/research-publishing/adapters/x/browser/browser-adapter.js';
import type { PublicationReceiptV2_1 } from '../../harnesses/research-publishing/adapters/x/browser/receipt-v2-1.js';
import type {
  BrowserCapabilityManifest,
  BrowserCommand,
  BrowserNodeObservation,
  BrowserObservationInput
} from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { CommandBroker } from '../../harnesses/research-publishing/adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import { approvePublicationV2 } from '../../harnesses/research-publishing/core/approval-v2.js';
import { approvePublicationV2_1 } from '../../harnesses/research-publishing/core/approval-v2-1.js';
import { sha256, sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
import { ExecutionStore } from '../../harnesses/research-publishing/core/execution-store.js';
import { createPublicationPlanV2 } from '../../harnesses/research-publishing/core/publication-plan-v2.js';
import { createPublicationPlanV2_1 } from '../../harnesses/research-publishing/core/publication-plan-v2-1.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { publicationPlanFixture } from '../fixtures/publication-plan.js';

const manifest: BrowserCapabilityManifest = {
  executor: 'codex-chrome', executor_version: '26.814.41407', browser_family: 'chrome',
  capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'],
  observed_at: '2026-08-19T07:00:00.000Z'
};

it('walks the Quote entry and checks its identity again at the submit barrier', async () => {
  const { adapter } = await fixture();
  const article = { post_id: '123', canonical_url: 'https://x.com/runtime_ai/status/123', author_handle: '@runtime_ai', text: 'Article', links: [], published_at: '2026-08-19T06:00:00.000Z', reply_to_id: null };
  const base = singlePublication();
  const intent = { ...base.intent, quote_post: { id: article.post_id, url: article.canonical_url, author: article.author_handle, snapshot_digest: sha256(article) } };
  const plan = { ...base, intent, plan_digest: sha256(intent) };
  await adapter.start({ execution_id: 'quote_flow', plan, approval: approvePublicationV2(plan, 'human', 600_000, new Date('2026-08-19T07:00:00.000Z')), capability_manifest: manifest });
  let command = (await adapter.next('quote_flow'))!;
  await claimAndReport(adapter, command, page(command, 'https://x.com/home', [accountNode()]));
  command = (await adapter.next('quote_flow'))!;
  expect(command.purpose).toBe('navigate_quote_target');
  const repost = { ...accountNode(), ref: 'repost', name: '0 reposts. Repost', test_id: null, text: '' };
  await claimAndReport(adapter, command, { ...page(command, article.canonical_url, [accountNode(), repost]), public_posts: [article], quote_controls: { repost_ref: 'repost', quote_ref: null } });
  command = (await adapter.next('quote_flow'))!;
  expect(command.purpose).toBe('open_quote_menu');
  const quoteNode = { ...repost, ref: 'quote', role: 'menuitem', name: 'Quote' };
  await claimAndReport(adapter, command, { ...page(command, article.canonical_url, [accountNode(), quoteNode]), public_posts: [article], quote_controls: { repost_ref: null, quote_ref: 'quote' } });
  command = (await adapter.next('quote_flow'))!;
  expect(command.purpose).toBe('open_quote_composer');
  await claimAndReport(adapter, command, { ...page(command, 'https://x.com/compose/post', singleNodes('')), composer_quote_post_id: '123' });
  command = (await adapter.next('quote_flow'))!;
  expect(command.kind).toBe('set_text');
  await claimAndReport(adapter, command, { ...page(command, 'https://x.com/compose/post', singleNodes('Only locked item')), composer_quote_post_id: '123' });
  command = (await adapter.next('quote_flow'))!;
  expect(command.purpose).toBe('submit_barrier_observation');
  await claimAndReport(adapter, command, { ...page(command, 'https://x.com/compose/post', singleNodes('Only locked item')), composer_quote_post_id: '999' });
  await expect(adapter.next('quote_flow')).rejects.toMatchObject({ code: 'COMPOSER_CONTENT_MISMATCH' });
  expect((await adapter.status('quote_flow')).snapshot.submit_command_count).toBe(0);
});

describe('pre-submit observation recovery', () => {
  it('requires a fresh read and keeps owned text after an observation mismatch', async () => {
    const { adapter } = await fixture();
    const plan = singlePublication();
    await adapter.start({ execution_id: 'recover_text', plan,
      approval: approvePublicationV2(plan, 'human', 600_000, new Date('2026-08-19T07:00:00.000Z')),
      capability_manifest: manifest });
    let command = (await adapter.next('recover_text'))!;
    await claimAndReport(adapter, command, page(command, 'https://x.com/home', singleNodes('')));
    command = (await adapter.next('recover_text'))!;
    expect(command.kind).toBe('set_text');
    await claimAndReport(adapter, command, page(command, 'https://x.com/home', singleNodes('Only locked item\n')));
    await expect(adapter.next('recover_text')).rejects.toMatchObject({code:'COMPOSER_CONTENT_MISMATCH'});
    await adapter.resumePreSubmit('recover_text');
    command = (await adapter.next('recover_text'))!;
    expect(command).toMatchObject({kind:'observe_page',side_effect:'read'});
    await claimAndReport(adapter, command, page(command, 'https://x.com/home', singleNodes('Only locked item')));
    command = (await adapter.next('recover_text'))!;
    expect(command).toMatchObject({kind:'observe_page',purpose:'submit_barrier_observation'});
    expect((await adapter.status('recover_text')).snapshot.submit_command_count).toBe(0);
  });
  it('refuses recovery when a command is pending or execution is not failed', async () => {
    const {adapter}=await fixture(); const plan=singlePublication();
    await adapter.start({execution_id:'not_failed',plan,
      approval:approvePublicationV2(plan,'human',600_000,new Date('2026-08-19T07:00:00.000Z')),capability_manifest:manifest});
    await expect(adapter.resumePreSubmit('not_failed')).rejects.toMatchObject({code:'STATE_TRANSITION_INVALID'});
  });
});

function publication(media: readonly { kind: 'image'; digest: string }[] = []) {
  return createPublicationPlanV2({
    planId: 'plan_adapter', runId: 'run_adapter', targetAccount: '@runtime_ai',
    adapter: 'browser', mode: 'thread', targetPost: null, media,
    items: [
      { ordinal: 1, text: 'First locked item' },
      { ordinal: 2, text: 'Second locked item', reply_to: 'previous' },
      { ordinal: 3, text: 'Third locked item', reply_to: 'previous' }
    ],
    plannedAt: '2026-08-19T07:00:00.000Z',
    provenance: { draft_digest: `sha256:${'a'.repeat(64)}` }
  });
}

function singlePublication() {
  return createPublicationPlanV2({
    planId: 'plan_single_adapter', runId: 'run_adapter', targetAccount: '@runtime_ai',
    adapter: 'browser', mode: 'single', targetPost: null, media: [],
    items: [{ ordinal: 1, text: 'Only locked item' }],
    plannedAt: '2026-08-19T07:00:00.000Z',
    provenance: { draft_digest: `sha256:${'c'.repeat(64)}` }
  });
}

async function fixture(now = () => new Date('2026-08-19T07:01:00.000Z')) {
  const root = await mkdtemp(join(tmpdir(), 'rph-adapter-'));
  const workspace = await WorkspaceStore.open(root);
  let event = 0;
  let command = 0;
  let attempt = 0;
  const executions = new ExecutionStore(workspace, now, () => `evt_${++event}`);
  const broker = new CommandBroker(workspace, executions, now, () => `cmd_${++command}`);
  const adapter = new BrowserAdapter(
    workspace, executions, broker, new XWeb202608Contract(), now, () => `attempt_${++attempt}`
  );
  return { root, workspace, executions, adapter };
}

function accountNode(handle = '@runtime_ai'): BrowserNodeObservation {
  return {
    ref: 'account', role: 'button', name: 'Account menu', text: handle,
    test_id: 'SideNav_AccountSwitcher_Button', editable: false, disabled: false, parent_ref: null
  };
}

function page(command: BrowserCommand, url: string, nodes: readonly BrowserNodeObservation[]): BrowserObservationInput {
  return {
    schema_version: '2.0', observation_id: `obs_${command.command_id}`,
    execution_id: command.execution_id, command_id: command.command_id,
    origin: 'https://x.com', canonical_url: url,
    observed_at: '2026-08-19T07:01:01.000Z', nodes, public_posts: []
  };
}

function composerNodes(texts: readonly string[]): BrowserNodeObservation[] {
  return [
    accountNode(),
    ...texts.map((text, index) => ({
      ref: `item_${index + 1}`, role: 'textbox', name: 'Post text', text,
      test_id: `tweetTextarea_${index}`, editable: true, disabled: false, parent_ref: null
    })),
    {
      ref: 'add', role: 'button', name: 'Add post', text: 'Add post', test_id: 'addButton',
      editable: false, disabled: false, parent_ref: null
    },
    {
      ref: 'submit', role: 'button', name: 'Post all', text: 'Post all', test_id: 'tweetButton',
      editable: false, disabled: texts.some((text) => text.length === 0), parent_ref: null
    }
  ];
}

function singleNodes(text: string): BrowserNodeObservation[] {
  return [
    accountNode(),
    {
      ref: 'item_1', role: 'textbox', name: 'Post text', text, test_id: 'tweetTextarea_0',
      editable: true, disabled: false, parent_ref: null
    },
    {
      ref: 'submit_one', role: 'button', name: 'Post', text: 'Post', test_id: 'tweetButton',
      editable: false, disabled: text.length === 0, parent_ref: null
    }
  ];
}

async function claimAndReport(
  adapter: BrowserAdapter,
  command: BrowserCommand,
  observation: BrowserObservationInput
) {
  await adapter.claim(command.execution_id, command.command_id);
  return adapter.report(command.execution_id, {
    schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
    status: 'success', observation, error_code: null,
    reported_at: '2026-08-19T07:01:02.000Z'
  });
}

async function claimAndReportWithoutObservation(
  adapter: BrowserAdapter,
  command: BrowserCommand,
  status: 'success' | 'uncertain' = 'success'
) {
  await adapter.claim(command.execution_id, command.command_id);
  return adapter.report(command.execution_id, {
    schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
    status, observation: null, error_code: null,
    reported_at: '2026-08-19T07:01:02.000Z'
  });
}

async function visualFixture(executionId: string) {
  const { workspace, adapter } = await fixture();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await workspace.writeNewBytes('articles/visual/recovery/assets/asset_cover.png', png);
  const asset = {
    asset_id: 'asset_cover', relative_path: 'assets/asset_cover.png', digest: sha256Bytes(png),
    mime_type: 'image/png' as const, alt_text: 'A locked runtime boundary.', claim_refs: ['claim_verified']
  };
  const plan = createPublicationPlanV2_1({
    planId: `plan_${executionId}`, runId: 'run_adapter', targetAccount: '@runtime_ai',
    mode: 'single', targetPost: null,
    items: [{ ordinal: 1, text: 'Visual locked item', attachments: [asset] }],
    articlePackage: { root: 'articles/visual/recovery', digest: `sha256:${'a'.repeat(64)}` },
    authorizedAsset: asset, plannedAt: '2026-08-19T07:00:00.000Z', provenance: { handoff_id: 'handoff_recovery' }
  });
  await workspace.writeNew('articles/visual/recovery/package-ref.json', {
    root: plan.article_package!.root, digest: plan.article_package!.digest,
    artifacts: ['articles/visual/recovery/assets/asset_cover.png'], warnings: []
  });
  const approval = approvePublicationV2_1(plan, 'human', 600_000, new Date('2026-08-19T07:00:00.000Z'));
  await adapter.start({
    execution_id: executionId, plan, approval,
    capability_manifest: {
      ...manifest,
      capabilities: [...manifest.capabilities, 'file_upload', 'attachment_alt_text', 'upload_attachment', 'set_attachment_alt_text']
    }
  });
  let command = (await adapter.next(executionId))!;
  await claimAndReport(adapter, command, page(command, 'https://x.com/home', [accountNode()]));
  command = (await adapter.next(executionId))!;
  await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', singleNodes('')));
  command = (await adapter.next(executionId))!;
  await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', singleNodes('Visual locked item')));
  command = (await adapter.next(executionId))!;
  expect(command.kind).toBe('upload_attachment');
  return { adapter, command, asset };
}

describe('BrowserAdapter', () => {
  it('re-observes an uncertain upload and continues without re-upload when the attachment is present', async () => {
    const { adapter, command: upload, asset } = await visualFixture('exec_visual_uncertain_present');
    await claimAndReportWithoutObservation(adapter, upload, 'uncertain');
    const reobserve = (await adapter.next(upload.execution_id))!;
    expect(reobserve).toMatchObject({ kind: 'observe_page', purpose: 'attachment_outcome_observation' });
    await claimAndReport(adapter, reobserve, {
      ...page(reobserve, 'https://x.com/compose/post', singleNodes('Visual locked item')),
      composer_attachments: [{
        ref: 'attachment_recovered', ordinal: 1, kind: 'image', mime_type: 'image/png',
        alt_text: null, status: 'uploaded', owned_by_execution: true
      }]
    });
    const next = (await adapter.next(upload.execution_id))!;
    expect(next).toMatchObject({ kind: 'set_attachment_alt_text', payload: { alt_text: asset.alt_text } });
  });

  it('retries an uncertain upload only after explicit absence and blocks after the bounded retry', async () => {
    const { adapter, command: firstUpload } = await visualFixture('exec_visual_uncertain_absent');
    await claimAndReportWithoutObservation(adapter, firstUpload, 'uncertain');
    let reobserve = (await adapter.next(firstUpload.execution_id))!;
    await claimAndReport(adapter, reobserve, page(reobserve, 'https://x.com/compose/post', singleNodes('Visual locked item')));
    const retry = (await adapter.next(firstUpload.execution_id))!;
    expect(retry).toMatchObject({ kind: 'upload_attachment' });

    await claimAndReportWithoutObservation(adapter, retry, 'uncertain');
    reobserve = (await adapter.next(firstUpload.execution_id))!;
    await claimAndReport(adapter, reobserve, page(reobserve, 'https://x.com/compose/post', singleNodes('Visual locked item')));
    await expect(adapter.next(firstUpload.execution_id)).rejects.toMatchObject({ code: 'X_ATTACHMENT_OUTCOME_UNKNOWN' });
    await expect(adapter.status(firstUpload.execution_id)).resolves.toMatchObject({ snapshot: { state: 'pre_submit_failed' } });
  });

  it('uploads one locked V2.1 image, sets Alt Text, re-reads Composer, and reaches the existing Submit Barrier', async () => {
    const { workspace, adapter } = await fixture();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    await workspace.writeNewBytes('articles/visual/run_1/assets/asset_cover.png', png);
    const asset = {
      asset_id: 'asset_cover', relative_path: 'assets/asset_cover.png', digest: sha256Bytes(png),
      mime_type: 'image/png' as const, alt_text: 'A locked runtime boundary.', claim_refs: ['claim_verified']
    };
    const plan = createPublicationPlanV2_1({
      planId: 'plan_visual_adapter', runId: 'run_adapter', targetAccount: '@runtime_ai',
      mode: 'single', targetPost: null,
      items: [{ ordinal: 1, text: 'Visual locked item', attachments: [asset] }],
      articlePackage: { root: 'articles/visual/run_1', digest: `sha256:${'a'.repeat(64)}` },
      authorizedAsset: asset, plannedAt: '2026-08-19T07:00:00.000Z', provenance: { handoff_id: 'handoff_1' }
    });
    await workspace.writeNew('articles/visual/run_1/package-ref.json', {
      root: 'articles/visual/run_1', digest: plan.article_package!.digest,
      artifacts: ['articles/visual/run_1/assets/asset_cover.png'], warnings: []
    });
    const approval = approvePublicationV2_1(plan, 'human', 600_000, new Date('2026-08-19T07:00:00.000Z'));
    const visualManifest: BrowserCapabilityManifest = {
      ...manifest,
      capabilities: [...manifest.capabilities, 'file_upload', 'attachment_alt_text', 'upload_attachment', 'set_attachment_alt_text']
    };
    await expect(adapter.start({
      execution_id: 'exec_visual_missing_capability', plan, approval, capability_manifest: manifest
    })).rejects.toMatchObject({ code: 'BROWSER_FILE_UPLOAD_UNAVAILABLE' });
    await adapter.start({ execution_id: 'exec_visual', plan, approval, capability_manifest: visualManifest });

    let command = (await adapter.next('exec_visual'))!;
    await claimAndReport(adapter, command, page(command, 'https://x.com/home', [accountNode()]));
    command = (await adapter.next('exec_visual'))!;
    await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', singleNodes('')));
    command = (await adapter.next('exec_visual'))!;
    await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', singleNodes('Visual locked item')));

    command = (await adapter.next('exec_visual'))!;
    expect(command).toMatchObject({ kind: 'upload_attachment', payload: { asset: { asset_id: 'asset_cover' } } });
    await claimAndReport(adapter, command, {
      ...page(command, 'https://x.com/compose/post', singleNodes('Visual locked item')),
      composer_attachments: [{ ref: 'attachment_1', ordinal: 1, kind: 'image', mime_type: 'image/png', alt_text: null, status: 'uploaded', owned_by_execution: true }]
    });
    command = (await adapter.next('exec_visual'))!;
    expect(command).toMatchObject({ kind: 'set_attachment_alt_text', payload: { alt_text: asset.alt_text } });
    const verifiedPage = {
      ...page(command, 'https://x.com/compose/post', singleNodes('Visual locked item')),
      composer_attachments: [{ ref: 'attachment_1', ordinal: 1, kind: 'image' as const, mime_type: 'image/png' as const, alt_text: asset.alt_text, status: 'uploaded' as const, owned_by_execution: true }]
    };
    await claimAndReport(adapter, command, verifiedPage);
    command = (await adapter.next('exec_visual'))!;
    expect(command).toMatchObject({ kind: 'observe_page', purpose: 'submit_barrier_observation' });
    await claimAndReport(adapter, command, {
      ...page(command, 'https://x.com/compose/post', singleNodes('Visual locked item')),
      composer_attachments: verifiedPage.composer_attachments
    });
    const submit = (await adapter.next('exec_visual'))!;
    expect(submit).toMatchObject({ side_effect: 'submit', purpose: 'submit_once' });
    await claimAndReportWithoutObservation(adapter, submit, 'success');
    const publicObserve = (await adapter.next('exec_visual'))!;
    await claimAndReport(adapter, publicObserve, {
      ...page(publicObserve, 'https://x.com/runtime_ai/status/900', [accountNode()]),
      public_posts: [{
        post_id: '900', canonical_url: 'https://x.com/runtime_ai/status/900',
        author_handle: '@runtime_ai', text: 'Visual locked item', links: [],
        published_at: '2026-08-19T07:01:03.000Z', reply_to_id: null,
        media: [{ kind: 'image', alt_text: asset.alt_text, url: 'https://pbs.twimg.com/media/public-900' }]
      }]
    });
    const status = await adapter.status('exec_visual');
    expect(status).toMatchObject({ snapshot: { state: 'finalized' }, latest_receipt_path: expect.stringMatching(/^receipts\//) });
    const receipt = await workspace.readJson<PublicationReceiptV2_1>(status.latest_receipt_path!);
    expect(receipt).toMatchObject({
      schema_version: '2.1', status: 'finalized',
      media_evidence: {
        source_asset_verified: true,
        composer_attachment_verified: true,
        public_media_verified: true,
        alt_text_verified: true
      }
    });
  });

  it('rejects unsupported plans and incompatible executors before execution creation', async () => {
    const { workspace, adapter } = await fixture();
    const withMedia = publication([{ kind: 'image', digest: `sha256:${'b'.repeat(64)}` }]);
    const mediaApproval = approvePublicationV2(withMedia, 'human', 600_000);
    await expect(adapter.start({
      execution_id: 'exec_media', plan: withMedia, approval: mediaApproval, capability_manifest: manifest
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_PUBLICATION_FEATURE' });

    const plan = publication();
    const approval = approvePublicationV2(plan, 'human', 600_000);
    await expect(adapter.start({
      execution_id: 'exec_bad_manifest', plan, approval,
      capability_manifest: { ...manifest, capabilities: ['observe_page'] }
    })).rejects.toMatchObject({ code: 'BROWSER_EXECUTOR_INCOMPATIBLE' });
    await expect(workspace.exists('x/browser-executions/exec_bad_manifest.json')).resolves.toBe(false);
    const textOnlyV2_1 = createPublicationPlanV2_1({
      planId: 'plan_text_v2_1', runId: 'run_adapter', targetAccount: '@runtime_ai',
      mode: 'single', targetPost: null,
      items: [{ ordinal: 1, text: 'Text-only V2.1', attachments: [] }],
      articlePackage: null, authorizedAsset: null,
      plannedAt: '2026-08-19T07:00:00.000Z',
      provenance: { draft_digest: `sha256:${'e'.repeat(64)}` }
    });
    await expect(adapter.start({
      execution_id: 'exec_text_v2_1', plan: textOnlyV2_1,
      approval: approvePublicationV2_1(textOnlyV2_1, 'human', 600_000),
      capability_manifest: manifest
    })).resolves.toMatchObject({ state: 'preflight' });
    await expect(adapter.start({
      execution_id: 'exec_v1',
      plan: publicationPlanFixture() as never,
      approval: {} as never,
      capability_manifest: manifest
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('moves login, account, and draft failures to pre_submit_failed', async () => {
    for (const [suffix, url, nodes, code] of [
      ['login', 'https://x.com/i/flow/login', [{ ...accountNode(), test_id: 'loginButton' }], 'X_AUTH_REQUIRED'],
      ['security', 'https://x.com/account/access', [{
        ref: 'challenge', role: 'heading', name: 'Verify your account', text: 'Verify',
        test_id: 'securityChallenge', editable: false, disabled: false, parent_ref: null
      }], 'X_SECURITY_CHALLENGE'],
      ['account', 'https://x.com/home', [accountNode('@other_ai')], 'X_ACCOUNT_MISMATCH'],
      ['draft', 'https://x.com/compose/post', [
        accountNode(),
        { ref: 'draft', role: 'status', name: 'Unsent post', text: 'Draft', test_id: 'unsentTweet', editable: false, disabled: false, parent_ref: null },
        ...composerNodes(['Existing']).slice(1)
      ], 'DRAFT_CONFLICT'],
      ['unknown', 'https://x.com/settings', [{
        ref: 'settings', role: 'heading', name: 'Settings', text: 'Settings', test_id: null,
        editable: false, disabled: false, parent_ref: null
      }], 'PAGE_CONTRACT_UNSUPPORTED']
    ] as const) {
      const { adapter } = await fixture();
      const plan = publication();
      const approval = approvePublicationV2(plan, 'human', 600_000);
      await adapter.start({ execution_id: `exec_${suffix}`, plan, approval, capability_manifest: manifest });
      const command = (await adapter.next(`exec_${suffix}`))!;
      await adapter.claim(command.execution_id, command.command_id);
      await expect(adapter.report(command.execution_id, {
        schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
        status: 'success', observation: page(command, url, nodes), error_code: null,
        reported_at: '2026-08-19T07:01:02.000Z'
      })).rejects.toMatchObject({ code });
      await expect(adapter.status(command.execution_id)).resolves.toMatchObject({
        snapshot: { state: 'pre_submit_failed' }
      });
    }
  });

  it('prepares a three-item Thread and crosses the Submit Barrier exactly once', async () => {
    const { adapter } = await fixture();
    const plan = publication();
    const approval = approvePublicationV2(
      plan, 'human', 600_000, new Date('2026-08-19T07:00:00.000Z')
    );
    await adapter.start({ execution_id: 'exec_thread', plan, approval, capability_manifest: manifest });

    let command = (await adapter.next('exec_thread'))!;
    await claimAndReport(adapter, command, page(command, 'https://x.com/home', [accountNode()]));
    command = (await adapter.next('exec_thread'))!;
    expect(command.payload.kind).toBe('navigate');
    await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', composerNodes([''])));

    for (const texts of [
      ['First locked item'],
      ['First locked item', ''],
      ['First locked item', 'Second locked item'],
      ['First locked item', 'Second locked item', ''],
      ['First locked item', 'Second locked item', 'Third locked item']
    ]) {
      command = (await adapter.next('exec_thread'))!;
      expect(command.side_effect).not.toBe('submit');
      await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', composerNodes(texts)));
    }

    command = (await adapter.next('exec_thread'))!;
    expect(command).toMatchObject({ kind: 'observe_page', side_effect: 'read' });
    await expect(adapter.status('exec_thread')).resolves.toMatchObject({
      snapshot: { state: 'composer_verified' }
    });
    await claimAndReport(
      adapter,
      command,
      page(command, 'https://x.com/compose/post', composerNodes([
        'First locked item', 'Second locked item', 'Third locked item'
      ]))
    );

    const submit = (await adapter.next('exec_thread'))!;
    expect(submit).toMatchObject({ purpose: 'submit_once', side_effect: 'submit' });
    await expect(adapter.status('exec_thread')).resolves.toMatchObject({
      snapshot: { state: 'submit_attempted', submit_command_count: 1 }
    });
    await expect(adapter.next('exec_thread')).resolves.toEqual(submit);

    await claimAndReportWithoutObservation(adapter, submit, 'uncertain');
    await expect(adapter.status('exec_thread')).resolves.toMatchObject({
      snapshot: { state: 'outcome_resolving' }
    });
    for (let index = 0; index < 5; index += 1) {
      if (index > 0) {
        const wait = (await adapter.next('exec_thread'))!;
        expect(wait).toMatchObject({ kind: 'wait', side_effect: 'read' });
        await claimAndReportWithoutObservation(adapter, wait);
      }
      const observe = (await adapter.next('exec_thread'))!;
      expect(observe).toMatchObject({ kind: 'observe_page', side_effect: 'read' });
      await claimAndReport(adapter, observe, page(observe, 'https://x.com/home', [accountNode()]));
    }
    await expect(adapter.status('exec_thread')).resolves.toMatchObject({
      snapshot: { state: 'outcome_unknown' },
      resumable_verification: true,
      latest_receipt_path: expect.stringMatching(/^receipts\//)
    });
    await adapter.resumeVerification('exec_thread');
    const resumed = (await adapter.next('exec_thread'))!;
    expect(resumed.side_effect).toBe('read');
  });

  it('rechecks approval expiry at the fresh Submit Barrier without issuing Submit', async () => {
    let clock = new Date('2026-08-19T07:01:00.000Z');
    const { workspace, adapter } = await fixture(() => clock);
    const plan = singlePublication();
    const approval = approvePublicationV2(
      plan, 'human', 120_000, new Date('2026-08-19T07:00:00.000Z')
    );
    await adapter.start({ execution_id: 'exec_expiry', plan, approval, capability_manifest: manifest });
    let command = (await adapter.next('exec_expiry'))!;
    await claimAndReport(adapter, command, page(command, 'https://x.com/home', [accountNode()]));
    command = (await adapter.next('exec_expiry'))!;
    await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', singleNodes('')));
    command = (await adapter.next('exec_expiry'))!;
    await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', singleNodes('Only locked item')));
    command = (await adapter.next('exec_expiry'))!;
    expect(command.side_effect).toBe('read');
    await claimAndReport(adapter, command, page(command, 'https://x.com/compose/post', singleNodes('Only locked item')));

    clock = new Date('2026-08-19T07:03:00.000Z');
    await expect(adapter.next('exec_expiry')).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    await expect(
      workspace.exists('runs/run_adapter/x/browser/exec_expiry/submit-command.json')
    ).resolves.toBe(false);
  });
});
