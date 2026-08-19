import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BrowserAdapter } from '../../harnesses/research-publishing/adapters/x/browser/browser-adapter.js';
import type {
  BrowserActionResultInput,
  BrowserCommand,
  BrowserObservationInput
} from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { CommandBroker } from '../../harnesses/research-publishing/adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import { approvePublicationV2 } from '../../harnesses/research-publishing/core/approval-v2.js';
import { ExecutionStore } from '../../harnesses/research-publishing/core/execution-store.js';
import { createPublicationPlanV2 } from '../../harnesses/research-publishing/core/publication-plan-v2.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const at = '2026-08-19T10:00:00.000Z';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-browser-security-'));
  const workspace = await WorkspaceStore.open(root);
  const executions = new ExecutionStore(workspace, () => new Date(at), () => 'evt_security');
  await executions.create({
    execution_id: 'exec_security', run_id: 'run_security', plan_id: 'plan_security', created_at: at
  });
  let sequence = 0;
  const broker = new CommandBroker(
    workspace, executions, () => new Date(at), () => `cmd_security_${++sequence}`
  );
  return { root, workspace, executions, broker };
}

async function issueObservation(broker: CommandBroker): Promise<BrowserCommand> {
  return broker.issue({
    execution_id: 'exec_security', run_id: 'run_security', kind: 'observe_page',
    purpose: 'security_observation', expected_page_revision: null,
    allowed_origin: 'https://x.com', side_effect: 'read',
    payload: { kind: 'observe_page', scope: 'x_page' }
  });
}

function observation(command: BrowserCommand): BrowserObservationInput {
  return {
    schema_version: '2.0', observation_id: `obs_${command.command_id}`,
    execution_id: command.execution_id, command_id: command.command_id,
    origin: 'https://x.com', canonical_url: 'https://x.com/home', observed_at: at,
    nodes: [{
      ref: 'account', role: 'button', name: 'Account menu', text: '@runtime_ai',
      test_id: 'SideNav_AccountSwitcher_Button', editable: false, disabled: false, parent_ref: null
    }],
    public_posts: []
  };
}

function result(command: BrowserCommand, observed: BrowserObservationInput): BrowserActionResultInput {
  return {
    schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
    status: 'success', observation: observed, error_code: null, reported_at: at
  };
}

async function allJsonText(root: string): Promise<string> {
  const output: string[] = [];
  async function walk(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && entry.name.endsWith('.json')) output.push(await readFile(child, 'utf8'));
    }
  }
  await walk(root);
  return output.join('\n');
}

describe('Browser Adapter adversarial boundary', () => {
  it.each(['https://twitter.com/home', 'https://example.com', 'javascript:alert(1)', '/relative'])
  ('rejects cross-origin or non-absolute navigation: %s', async (url) => {
    const { broker } = await fixture();
    await expect(broker.issue({
      execution_id: 'exec_security', run_id: 'run_security', kind: 'navigate',
      purpose: 'forbidden_navigation', expected_page_revision: null,
      allowed_origin: 'https://x.com', side_effect: 'write',
      payload: { kind: 'navigate', url }
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('rejects private timeline semantics and sensitive or full-DOM fields before persistence', async () => {
    const { root, broker } = await fixture();
    const forbiddenFields = ['cookie', 'local_storage', 'dom', 'credentials', 'password_field'] as const;
    for (const field of forbiddenFields) {
      const command = await issueObservation(broker);
      await broker.claim(command.execution_id, command.command_id);
      await expect(broker.acceptResult(command.execution_id, result(command, {
        ...observation(command), [field]: 'PRIVATE_TIMELINE_SENTINEL'
      } as BrowserObservationInput))).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    }

    const timeline = await issueObservation(broker);
    await broker.claim(timeline.execution_id, timeline.command_id);
    await expect(broker.acceptResult(timeline.execution_id, result(timeline, {
      ...observation(timeline),
      nodes: [{
        ref: 'private_post', role: 'article', name: 'Timeline post',
        text: 'PRIVATE_TIMELINE_SENTINEL', test_id: 'tweet', editable: false,
        disabled: false, parent_ref: null
      }]
    }))).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });

    const persisted = await allJsonText(root);
    expect(persisted).not.toMatch(/Bearer\s|Cookie:|password_field|PRIVATE_TIMELINE_SENTINEL/i);
  });

  it('rejects command mutation, stale revision, mismatched IDs, and duplicate claims/results', async () => {
    const { workspace, broker } = await fixture();
    const command = await issueObservation(broker);
    await broker.claim(command.execution_id, command.command_id);
    await expect(broker.claim(command.execution_id, command.command_id)).rejects.toMatchObject({
      code: 'COMMAND_REPLAY_REJECTED'
    });
    await expect(broker.acceptResult(command.execution_id, {
      ...result(command, observation(command)), command_id: 'cmd_different'
    })).rejects.toBeDefined();
    await broker.acceptResult(command.execution_id, result(command, observation(command)));
    await expect(
      broker.acceptResult(command.execution_id, result(command, observation(command)))
    ).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });

    const mutable = await issueObservation(broker);
    await workspace.replaceAtomic(
      `runs/run_security/x/browser/exec_security/commands/${mutable.command_id}.json`,
      { ...mutable, payload: { kind: 'observe_page', scope: 'public_thread' } }
    );
    await expect(broker.read(mutable.execution_id, mutable.command_id)).rejects.toMatchObject({
      code: 'CONTRACT_INVALID'
    });

    const stale = await broker.issue({
      execution_id: 'exec_security', run_id: 'run_security', kind: 'click',
      purpose: 'stale', expected_page_revision: `sha256:${'f'.repeat(64)}`,
      allowed_origin: 'https://x.com', side_effect: 'write',
      payload: { kind: 'click', target_ref: 'button' }
    });
    await expect(broker.claim(stale.execution_id, stale.command_id)).rejects.toMatchObject({
      code: 'STALE_PAGE_REVISION'
    });
  });

  it('rejects unsupported media and any Browser-family switch', async () => {
    const { workspace, executions, broker } = await fixture();
    const adapter = new BrowserAdapter(
      workspace, executions, broker, new XWeb202608Contract(), () => new Date(at)
    );
    const createPlan = (media: readonly { kind: 'image'; digest: string }[]) => createPublicationPlanV2({
      planId: `plan_${media.length}`, runId: 'run_security', targetAccount: '@runtime_ai',
      adapter: 'browser', mode: 'single', targetPost: null, media,
      items: [{ ordinal: 1, text: 'Locked text' }], plannedAt: at,
      provenance: { draft_digest: `sha256:${'a'.repeat(64)}` }
    });
    const mediaPlan = createPlan([{ kind: 'image', digest: `sha256:${'b'.repeat(64)}` }]);
    await expect(adapter.start({
      execution_id: 'exec_media_security', plan: mediaPlan,
      approval: approvePublicationV2(mediaPlan, 'human', 60_000, new Date(at)),
      capability_manifest: {
        executor: 'codex-chrome', executor_version: '1', browser_family: 'chrome',
        capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'], observed_at: at
      }
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_PUBLICATION_FEATURE' });

    const plan = createPlan([]);
    await expect(adapter.start({
      execution_id: 'exec_family_security', plan,
      approval: approvePublicationV2(plan, 'human', 60_000, new Date(at)),
      capability_manifest: {
        executor: 'codex-chrome', executor_version: '1', browser_family: 'firefox',
        capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'], observed_at: at
      } as never
    })).rejects.toMatchObject({ code: 'BROWSER_EXECUTOR_INCOMPATIBLE' });
  });
});
