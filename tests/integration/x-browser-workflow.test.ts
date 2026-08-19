import { mkdtemp, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BrowserAdapter } from '../../harnesses/research-publishing/adapters/x/browser/browser-adapter.js';
import type {
  BrowserCapabilityManifest,
  BrowserCommand,
  BrowserNodeObservation,
  BrowserObservationInput,
  BrowserPublicPostObservation
} from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { CommandBroker } from '../../harnesses/research-publishing/adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import { DeterministicOutcomeResolver } from '../../harnesses/research-publishing/adapters/x/browser/outcome-resolver.js';
import type { PublicationReceiptV2 } from '../../harnesses/research-publishing/adapters/x/browser/receipt-v2.js';
import { XService, type XDraft } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { approvePublicationV2, verifyApprovalV2 } from '../../harnesses/research-publishing/core/approval-v2.js';
import { ExecutionStore } from '../../harnesses/research-publishing/core/execution-store.js';
import { createPublicationPlanV2 } from '../../harnesses/research-publishing/core/publication-plan-v2.js';
import type { ResearchContentPackage } from '../../harnesses/research-publishing/core/types.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';

const at = '2026-08-19T09:00:00.000Z';
const manifest: BrowserCapabilityManifest = {
  executor: 'codex-chrome', executor_version: '26.814.41407', browser_family: 'chrome',
  capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'],
  observed_at: at
};
const texts = [
  '1/6 Context should be governed runtime input.',
  '2/6 The synthetic contract mechanics are verified.',
  '3/6 Production impact is not established.',
  '4/6 Trace integration remains planned work.',
  '5/6 Skills own domain meaning; runtimes own access.',
  '6/6 What evidence should survive between runs?'
] as const;

function account(): BrowserNodeObservation {
  return {
    ref: 'account', role: 'button', name: 'Account menu', text: '@runtime_ai',
    test_id: 'SideNav_AccountSwitcher_Button', editable: false, disabled: false, parent_ref: null
  };
}

function composer(values: readonly string[]): BrowserNodeObservation[] {
  return [
    account(),
    ...values.map((text, index) => ({
      ref: `item_${index + 1}`, role: 'textbox', name: 'Post text', text,
      test_id: `tweetTextarea_${index}`, editable: true, disabled: false, parent_ref: null
    })),
    {
      ref: 'add', role: 'button', name: 'Add post', text: 'Add post', test_id: 'addButton',
      editable: false, disabled: false, parent_ref: null
    },
    {
      ref: 'submit', role: 'button', name: 'Post all', text: 'Post all', test_id: 'tweetButton',
      editable: false, disabled: values.some((value) => value.length === 0), parent_ref: null
    }
  ];
}

function observation(
  command: BrowserCommand,
  url: string,
  nodes: readonly BrowserNodeObservation[],
  publicPosts: readonly BrowserPublicPostObservation[] = []
): BrowserObservationInput {
  return {
    schema_version: '2.0', observation_id: `obs_${command.command_id}`,
    execution_id: command.execution_id, command_id: command.command_id,
    origin: 'https://x.com', canonical_url: url, observed_at: at,
    nodes, public_posts: publicPosts
  };
}

async function report(
  adapter: BrowserAdapter,
  command: BrowserCommand,
  observed: BrowserObservationInput | null,
  status: 'success' | 'uncertain' = 'success'
) {
  await adapter.claim(command.execution_id, command.command_id);
  return adapter.report(command.execution_id, {
    schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
    status, observation: observed, error_code: null, reported_at: at
  });
}

describe('X Browser Adapter integration', () => {
  it('allows exactly two safe pre-submit read retries, then fails without issuing Submit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-browser-retry-'));
    const workspace = await WorkspaceStore.open(root);
    let event = 0;
    let commandSequence = 0;
    const executions = new ExecutionStore(workspace, () => new Date(at), () => `evt_r_${++event}`);
    const broker = new CommandBroker(
      workspace, executions, () => new Date(at), () => `cmd_r_${++commandSequence}`
    );
    const adapter = new BrowserAdapter(
      workspace, executions, broker, new XWeb202608Contract(), () => new Date(at)
    );
    const plan = createPublicationPlanV2({
      planId: 'plan_retry', runId: 'run_retry', targetAccount: '@runtime_ai',
      adapter: 'browser', mode: 'single', targetPost: null, media: [],
      items: [{ ordinal: 1, text: 'Retry-safe locked text' }], plannedAt: at,
      provenance: { draft_digest: `sha256:${'a'.repeat(64)}` }
    });
    await adapter.start({
      execution_id: 'exec_retry', plan,
      approval: approvePublicationV2(plan, 'human', 600_000, new Date(at)),
      capability_manifest: manifest
    });

    for (let retry = 0; retry < 3; retry += 1) {
      const command = (await adapter.next('exec_retry'))!;
      expect(command.side_effect).toBe('read');
      await adapter.claim(command.execution_id, command.command_id);
      const reported = adapter.report(command.execution_id, {
        schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
        status: 'transient_failure', observation: null,
        error_code: 'BROWSER_EXECUTOR_UNAVAILABLE', reported_at: at
      });
      if (retry < 2) await expect(reported).resolves.toMatchObject({ state: 'preflight' });
      else await expect(reported).rejects.toMatchObject({ code: 'BROWSER_EXECUTOR_UNAVAILABLE' });
    }
    await expect(adapter.status('exec_retry')).resolves.toMatchObject({
      snapshot: { state: 'pre_submit_failed', submit_command_count: 0 }
    });
    await expect(
      workspace.exists('runs/run_retry/x/browser/exec_retry/submit-command.json')
    ).resolves.toBe(false);
  });

  it('publishes a reviewed six-Post Browser Plan through one simulated Submit and Final Receipt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-browser-integration-'));
    const workspace = await WorkspaceStore.open(root);
    const x = new XService(workspace, {
      runId: () => 'run_browser_six', planId: () => 'plan_browser_six', now: () => new Date(at)
    });
    const frozen = { ...researchPackage, status: 'frozen' as const, version: 2 } as ResearchContentPackage;
    const run = await x.prepareX(frozen, {
      contentType: 'anchor', format: 'thread', language: 'en', targetAccount: '@runtime_ai'
    });
    const draft: XDraft = {
      schema_version: '1.0', run_id: run.run_id, content_type: 'anchor', format: 'thread', language: 'en',
      items: texts.map((text, index) => ({
        ordinal: index + 1,
        text,
        claim_refs: [index === 3 ? 'claim_planned' : 'claim_verified'],
        ...(index === 0 ? {} : { reply_to: 'previous' as const })
      }))
    };
    await x.acceptXDraft(run.run_id, draft);
    await expect(x.reviewX(run.run_id)).resolves.toMatchObject({ passed: true });
    const plan = await x.planXBrowser(run.run_id);
    const approval = approvePublicationV2(plan, 'acceptance-human', 600_000, new Date(at));

    let event = 0;
    let commandSequence = 0;
    let receiptSequence = 0;
    const executions = new ExecutionStore(workspace, () => new Date(at), () => `evt_i_${++event}`);
    const broker = new CommandBroker(
      workspace, executions, () => new Date(at), () => `cmd_i_${++commandSequence}`
    );
    const adapter = new BrowserAdapter(
      workspace, executions, broker, new XWeb202608Contract(), () => new Date(at),
      () => 'attempt_integration', () => `receipt_i_${++receiptSequence}`
    );
    await adapter.start({ execution_id: 'exec_browser_six', plan, approval, capability_manifest: manifest });

    let command = (await adapter.next('exec_browser_six'))!;
    await report(adapter, command, observation(command, 'https://x.com/home', [account()]));
    command = (await adapter.next('exec_browser_six'))!;
    await report(adapter, command, observation(command, 'https://x.com/compose/post', composer([''])));

    for (let index = 0; index < texts.length; index += 1) {
      command = (await adapter.next('exec_browser_six'))!;
      await report(
        adapter,
        command,
        observation(command, 'https://x.com/compose/post', composer(texts.slice(0, index + 1)))
      );
      if (index < texts.length - 1) {
        command = (await adapter.next('exec_browser_six'))!;
        await report(
          adapter,
          command,
          observation(command, 'https://x.com/compose/post', composer([...texts.slice(0, index + 1), '']))
        );
      }
    }

    command = (await adapter.next('exec_browser_six'))!;
    expect(command).toMatchObject({ purpose: 'submit_barrier_observation', side_effect: 'read' });
    await report(adapter, command, observation(command, 'https://x.com/compose/post', composer(texts)));

    const submit = (await adapter.next('exec_browser_six'))!;
    expect(submit).toMatchObject({ purpose: 'submit_once', side_effect: 'submit' });
    await adapter.claim(submit.execution_id, submit.command_id);
    await expect(adapter.claim(submit.execution_id, submit.command_id)).rejects.toMatchObject({
      code: 'COMMAND_REPLAY_REJECTED'
    });
    await adapter.report(submit.execution_id, {
      schema_version: '2.0', execution_id: submit.execution_id, command_id: submit.command_id,
      status: 'uncertain', observation: null, error_code: null, reported_at: at
    });

    const posts: BrowserPublicPostObservation[] = texts.map((text, index) => {
      const id = (900000000000000100n + BigInt(index)).toString();
      return {
        post_id: id,
        canonical_url: `https://x.com/runtime_ai/status/${id}`,
        author_handle: '@runtime_ai', text, links: [], published_at: at,
        reply_to_id: index === 0 ? null : (900000000000000100n + BigInt(index - 1)).toString()
      };
    });
    command = (await adapter.next('exec_browser_six'))!;
    expect(command.side_effect).toBe('read');
    await report(
      adapter,
      command,
      observation(command, posts[0]!.canonical_url, [account()], posts)
    );

    const status = await adapter.status('exec_browser_six');
    expect(status.snapshot).toMatchObject({ state: 'finalized', submit_command_count: 1 });
    const receipt = await workspace.readJson<PublicationReceiptV2>(status.latest_receipt_path!);
    expect(receipt).toMatchObject({
      status: 'finalized',
      adapter: 'browser',
      public_result: { root_url: posts[0]!.canonical_url, ordered_post_ids: posts.map((post) => post.post_id) },
      verification: { source: 'browser_public_page', strength: 'public_browser_verified' }
    });
    expect(new Set(receipt.public_result!.ordered_post_ids).size).toBe(6);
    expect(receipt.public_result!.ordered_post_ids.every((id) => /^\d+$/.test(id))).toBe(true);

    const prefix = 'runs/run_browser_six/x/browser/exec_browser_six';
    const submitCommands = [];
    for (const entry of await workspace.list(`${prefix}/commands`)) {
      if (entry.kind !== 'file') continue;
      const persisted = await workspace.readJson<BrowserCommand>(entry.relative_path);
      if (persisted.side_effect === 'submit') submitCommands.push(persisted);
    }
    expect(submitCommands).toHaveLength(1);
    expect((await workspace.list(`${prefix}/claims`)).filter(
      (entry) => entry.name === `${submit.command_id}.json`
    )).toHaveLength(1);

    await unlink(join(root, 'runs', 'run_browser_six', 'x', 'browser', 'exec_browser_six', 'state.json'));
    await expect(executions.rebuild('exec_browser_six')).resolves.toMatchObject({
      state: 'finalized', submit_command_count: 1
    });

    const manualPlan = createPublicationPlanV2({
      planId: 'plan_manual_fallback', runId: plan.run_id, targetAccount: '@runtime_ai',
      adapter: 'manual', mode: 'thread', targetPost: null, media: [],
      items: texts.map((text, index) => ({
        ordinal: index + 1, text, ...(index === 0 ? {} : { reply_to: 'previous' as const })
      })),
      plannedAt: at, provenance: { fallback_from: plan.plan_digest }
    });
    expect(() => verifyApprovalV2(manualPlan, approval, new Date(at))).toThrowError();
    const manualApproval = approvePublicationV2(manualPlan, 'acceptance-human', 600_000, new Date(at));
    expect(() => verifyApprovalV2(manualPlan, manualApproval, new Date(at))).not.toThrow();
  });

  it.each([
    ['partial three-of-six', { kind: 'partial', matched_ordinals: [1, 2, 3], missing_ordinals: [4, 5, 6], posts: [] }, true, 'partial'],
    ['no match after bounded retries', { kind: 'no_match', reason: 'absent' }, false, 'outcome_unknown'],
    ['positive but unverified after bounded retries', { kind: 'no_match', reason: 'absent' }, true, 'published_unverified'],
    ['conflicting public result', { kind: 'conflict', reason: 'unexpected', unexpected_post_ids: ['999'] }, true, 'verification_conflict']
  ] as const)('classifies the recovery matrix case: %s', (_name, verification, positive, expected) => {
    const resolver = new DeterministicOutcomeResolver();
    expect(resolver.classify({
      attempt_id: 'attempt_matrix', verification_index: 4,
      submit_result: {
        schema_version: '2.0', execution_id: 'exec_matrix', command_id: 'cmd_submit',
        status: 'uncertain', resulting_page_revision: null, observation: null,
        error_code: null, reported_at: at
      },
      public_verification: verification,
      positive_publish_signal: positive,
      platform_rejection: null
    })).toMatchObject({ kind: expected });
  });
});
