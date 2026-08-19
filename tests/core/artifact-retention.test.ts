import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { pruneBrowserArtifacts } from '../../harnesses/research-publishing/core/artifact-retention.js';
import { ExecutionStore } from '../../harnesses/research-publishing/core/execution-store.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

describe('pruneBrowserArtifacts', () => {
  it('prunes only expired terminal Browser artifacts and never follows links', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-retention-'));
    const root = join(parent, 'workspace');
    const store = await WorkspaceStore.open(root);
    const executions = new ExecutionStore(store);
    await executions.create({
      execution_id: 'exec_terminal', run_id: 'run_retention', plan_id: 'plan_1',
      created_at: '2026-06-01T00:00:00.000Z'
    });
    await executions.transition('exec_terminal', 'cancelled_before_submit', {
      event_type: 'cancelled'
    });
    await executions.create({
      execution_id: 'exec_resumable', run_id: 'run_retention', plan_id: 'plan_2',
      created_at: '2026-06-01T00:00:00.000Z'
    });
    await executions.transition('exec_resumable', 'pre_submit_failed', {
      event_type: 'failed'
    });

    const base = 'runs/run_retention/x/browser/exec_terminal';
    const old = '2026-07-19T11:59:59.000Z';
    const boundary30 = '2026-07-20T12:00:00.000Z';
    const oldDiagnostic = '2026-08-12T11:59:59.000Z';
    const boundary7 = '2026-08-12T12:00:00.000Z';
    const artifacts = [
      [`${base}/commands/old.json`, { issued_at: old }],
      [`${base}/claims/old.json`, { claimed_at: old }],
      [`${base}/results/old.json`, { reported_at: old }],
      [`${base}/observations/old.json`, { observed_at: old }],
      [`${base}/commands/boundary.json`, { issued_at: boundary30 }],
      [`${base}/diagnostics/old.json`, {
        local_only: true, digest: `sha256:${'d'.repeat(64)}`,
        created_at: oldDiagnostic, expires_at: '2026-08-13T11:59:59.000Z'
      }],
      [`${base}/diagnostics/boundary.json`, {
        local_only: true, digest: `sha256:${'e'.repeat(64)}`,
        created_at: boundary7, expires_at: '2026-08-13T12:00:00.000Z'
      }],
      [`${base}/publication-plan-v2.json`, { planned_at: old }],
      [`${base}/approval-v2.json`, { approved_at: old }],
      [`${base}/verification-report-1.json`, { verified_at: old }]
    ] as const;
    for (const [path, value] of artifacts) await store.writeNew(path, value);

    const resumablePath = 'runs/run_retention/x/browser/exec_resumable/commands/old.json';
    await store.writeNew(resumablePath, { issued_at: old });

    const externalDirectory = join(parent, 'external-private');
    const external = join(externalDirectory, 'private.txt');
    await mkdir(externalDirectory);
    await writeFile(external, 'must remain', 'utf8');
    const linkPath = join(root, 'runs', 'run_retention', 'x', 'browser', 'exec_terminal', 'commands', 'external-link');
    await symlink(externalDirectory, linkPath, 'junction');

    const deletable = artifacts.slice(0, 4).map(([path]) => path).concat(`${base}/diagnostics/old.json`);
    let expectedBytes = 0;
    for (const path of deletable) expectedBytes += (await stat(join(root, ...path.split('/')))).size;

    const report = await pruneBrowserArtifacts(store, new Date('2026-08-19T12:00:00.000Z'));
    expect(report.deleted_paths).toEqual([...deletable].sort());
    expect(report.deleted_bytes).toBe(expectedBytes);
    expect(report.skipped_resumable_executions).toEqual(['exec_resumable']);
    expect(report.retained_audit_artifacts).toBeGreaterThanOrEqual(5);

    await expect(readFile(external, 'utf8')).resolves.toBe('must remain');
    await expect(store.exists(`${base}/commands/boundary.json`)).resolves.toBe(true);
    await expect(store.exists(`${base}/diagnostics/boundary.json`)).resolves.toBe(true);
    await expect(store.exists(`${base}/publication-plan-v2.json`)).resolves.toBe(true);
    await expect(store.exists(resumablePath)).resolves.toBe(true);
  });

  it('fails closed on malformed diagnostic metadata', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-retention-invalid-'));
    const store = await WorkspaceStore.open(root);
    const executions = new ExecutionStore(store);
    await executions.create({
      execution_id: 'exec_invalid_diagnostic',
      run_id: 'run_invalid_diagnostic',
      plan_id: 'plan_invalid_diagnostic',
      created_at: '2026-06-01T00:00:00.000Z'
    });
    await executions.transition('exec_invalid_diagnostic', 'cancelled_before_submit', {
      event_type: 'cancelled'
    });
    await store.writeNew(
      'runs/run_invalid_diagnostic/x/browser/exec_invalid_diagnostic/diagnostics/unsafe.json',
      {
        local_only: false,
        digest: 'raw-private-content',
        created_at: '2026-06-01T00:00:00.000Z',
        expires_at: '2026-06-02T00:00:00.000Z'
      }
    );

    await expect(
      pruneBrowserArtifacts(store, new Date('2026-08-19T12:00:00.000Z'))
    ).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
