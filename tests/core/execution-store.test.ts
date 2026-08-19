import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { ExecutionStore } from '../../harnesses/research-publishing/core/execution-store.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-execution-'));
  const workspace = await WorkspaceStore.open(root);
  let event = 0;
  const store = new ExecutionStore(
    workspace,
    () => new Date('2026-08-19T03:00:00.000Z'),
    () => `evt_${++event}`
  );
  await store.create({
    execution_id: 'exec_1',
    run_id: 'run_1',
    plan_id: 'plan_1',
    created_at: '2026-08-19T02:59:00.000Z'
  });
  return { root, store };
}

describe('ExecutionStore', () => {
  it('rebuilds a missing or corrupt projection from the append-only ledger', async () => {
    const { root, store } = await fixture();
    await store.transition('exec_1', 'preflight', { event_type: 'preflight_started' });
    await store.transition('exec_1', 'account_verified', { event_type: 'account_verified' });
    const statePath = join(root, 'runs', 'run_1', 'x', 'browser', 'exec_1', 'state.json');

    await unlink(statePath);
    await expect(store.rebuild('exec_1')).resolves.toMatchObject({
      sequence: 2,
      state: 'account_verified'
    });
    await writeFile(statePath, '{broken', 'utf8');
    await expect(store.rebuild('exec_1')).resolves.toMatchObject({
      sequence: 2,
      state: 'account_verified'
    });
  });

  it('rejects a concurrent execution owner', async () => {
    const { store } = await fixture();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = store.withExecutionLock('exec_1', async () => held);
    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(store.withExecutionLock('exec_1', async () => undefined)).rejects.toMatchObject({
      code: 'EXECUTION_BUSY'
    });
    release();
    await first;
  });

  it('removes only a stale lock owned by a nonexistent process and retries once', async () => {
    const { root, store } = await fixture();
    const lockPath = join(root, 'runs', 'run_1', 'x', 'browser', 'exec_1', 'execution.lock');
    await mkdir(join(root, 'runs', 'run_1', 'x', 'browser', 'exec_1'), { recursive: true });
    await writeFile(
      lockPath,
      `${JSON.stringify({ pid: 99_999_999, created_at: '2026-08-19T02:00:00.000Z' })}\n`,
      'utf8'
    );

    await expect(store.withExecutionLock('exec_1', async () => 'acquired')).resolves.toBe('acquired');
  });
});
