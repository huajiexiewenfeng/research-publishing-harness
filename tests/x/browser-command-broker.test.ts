import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  BROWSER_COMMAND_KINDS,
  type BrowserActionResultInput,
  type BrowserObservationInput
} from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { CommandBroker } from '../../harnesses/research-publishing/adapters/x/browser/command-broker.js';
import { ExecutionStore } from '../../harnesses/research-publishing/core/execution-store.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-broker-'));
  const workspace = await WorkspaceStore.open(root);
  const executions = new ExecutionStore(workspace);
  await executions.create({
    execution_id: 'exec_1',
    run_id: 'run_1',
    plan_id: 'plan_1',
    created_at: '2026-08-19T03:00:00.000Z'
  });
  let command = 0;
  const broker = new CommandBroker(
    workspace,
    executions,
    () => new Date('2026-08-19T03:01:00.000Z'),
    () => `cmd_${++command}`
  );
  return { broker };
}

function observation(commandId: string): BrowserObservationInput {
  return {
    schema_version: '2.0',
    observation_id: `obs_${commandId}`,
    execution_id: 'exec_1',
    command_id: commandId,
    origin: 'https://x.com',
    canonical_url: 'https://x.com/compose/post',
    observed_at: '2026-08-19T03:01:01.000Z',
    nodes: [
      {
        ref: 'submit_button',
        role: 'button',
        name: 'Post',
        text: 'Post',
        test_id: 'tweetButton',
        editable: false,
        disabled: false,
        parent_ref: null
      }
    ],
    public_posts: []
  };
}

function result(commandId: string, observed: BrowserObservationInput | null): BrowserActionResultInput {
  return {
    schema_version: '2.0',
    execution_id: 'exec_1',
    command_id: commandId,
    status: 'success',
    observation: observed,
    error_code: null,
    reported_at: '2026-08-19T03:01:02.000Z'
  };
}

describe('CommandBroker', () => {
  it('exposes only bounded semantic commands, without capture or script execution', () => {
    expect(BROWSER_COMMAND_KINDS).toEqual([
      'observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'
    ]);
    expect(BROWSER_COMMAND_KINDS).not.toContain('screenshot');
    expect(BROWSER_COMMAND_KINDS).not.toContain('capture_screen');
    expect(BROWSER_COMMAND_KINDS).not.toContain('javascript');
  });

  it('issues, revision-binds, and claims a command exactly once', async () => {
    const { broker } = await fixture();
    const observe = await broker.issue({
      execution_id: 'exec_1',
      run_id: 'run_1',
      kind: 'observe_page',
      purpose: 'composer_snapshot',
      expected_page_revision: null,
      allowed_origin: 'https://x.com',
      side_effect: 'read',
      payload: { kind: 'observe_page', scope: 'composer' }
    });
    await broker.claim('exec_1', observe.command_id);
    const observed = await broker.acceptResult('exec_1', result(observe.command_id, observation(observe.command_id)));

    const command = await broker.issue({
      execution_id: 'exec_1',
      run_id: 'run_1',
      kind: 'click',
      purpose: 'submit_once',
      expected_page_revision: observed.resulting_page_revision,
      allowed_origin: 'https://x.com',
      side_effect: 'submit',
      payload: { kind: 'click', target_ref: 'submit_button' }
    });

    await expect(broker.claim(command.execution_id, command.command_id)).resolves.toMatchObject({
      command_id: command.command_id,
      claimed: true
    });
    await expect(broker.claim(command.execution_id, command.command_id)).rejects.toMatchObject({
      code: 'COMMAND_REPLAY_REJECTED'
    });
    await expect(
      broker.issue({
        execution_id: 'exec_1',
        run_id: 'run_1',
        kind: 'click',
        purpose: 'submit_once_again',
        expected_page_revision: observed.resulting_page_revision,
        allowed_origin: 'https://x.com',
        side_effect: 'submit',
        payload: { kind: 'click', target_ref: 'submit_button' }
      })
    ).rejects.toMatchObject({ code: 'SUBMIT_ALREADY_ATTEMPTED' });
  });

  it('rejects a non-X origin and stale page revision', async () => {
    const { broker } = await fixture();
    await expect(
      broker.issue({
        execution_id: 'exec_1',
        run_id: 'run_1',
        kind: 'navigate',
        purpose: 'escape',
        expected_page_revision: null,
        allowed_origin: 'https://example.com',
        side_effect: 'write',
        payload: { kind: 'navigate', url: 'https://example.com' }
      } as never)
    ).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });

    const stale = await broker.issue({
      execution_id: 'exec_1',
      run_id: 'run_1',
      kind: 'click',
      purpose: 'stale_action',
      expected_page_revision: `sha256:${'f'.repeat(64)}`,
      allowed_origin: 'https://x.com',
      side_effect: 'write',
      payload: { kind: 'click', target_ref: 'button_1' }
    });
    await expect(broker.claim('exec_1', stale.command_id)).rejects.toMatchObject({
      code: 'STALE_PAGE_REVISION'
    });
  });

  it('rejects results for unclaimed commands and forbidden observation fields', async () => {
    const { broker } = await fixture();
    const command = await broker.issue({
      execution_id: 'exec_1',
      run_id: 'run_1',
      kind: 'observe_page',
      purpose: 'privacy_boundary',
      expected_page_revision: null,
      allowed_origin: 'https://x.com',
      side_effect: 'read',
      payload: { kind: 'observe_page', scope: 'x_page' }
    });
    await expect(
      broker.acceptResult('exec_1', result(command.command_id, observation(command.command_id)))
    ).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });

    await broker.claim('exec_1', command.command_id);
    for (const forbidden of [
      'cookie',
      'local_storage',
      'dom',
      'direct_messages',
      'notifications'
    ]) {
      const unsafe = { ...observation(command.command_id), [forbidden]: 'private' };
      await expect(
        broker.acceptResult('exec_1', result(command.command_id, unsafe as BrowserObservationInput))
      ).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    }
  });
});
