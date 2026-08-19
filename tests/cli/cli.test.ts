import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { approvePublicationV2 } from '../../harnesses/research-publishing/core/approval-v2.js';
import { XService } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { publicationPlanV2Fixture } from '../fixtures/publication-plan-v2.js';
import { researchPackage } from '../fixtures/research-package.js';

const cli = resolve('dist/harnesses/research-publishing/cli/index.js');

function run(args: readonly string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

describe('research-publish CLI', () => {
  it('returns JSON-only doctor output', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'rph-cli-doctor-'));
    const result = run(['doctor', '--workspace', workspace, '--output', 'json']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, operation: 'doctor' });
  });

  it('captures a Candidate only below the selected workspace', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-candidate-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'candidate.json');
    await writeFile(
      input,
      JSON.stringify({
        schema_version: '1.0',
        candidate_id: 'candidate_cli',
        title: 'Synthetic context contract',
        source_type: 'design',
        research_track: 'enterprise-agent-runtime',
        thesis_hint: 'Context needs explicit evidence boundaries.',
        source_refs: ['https://example.com/synthetic'],
        privacy: 'public',
        status: 'idea',
        captured_at: '2026-08-18T12:00:00.000Z'
      })
    );

    const result = run([
      'candidate', 'capture', '--workspace', workspace, '--input', input, '--output', 'json'
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      operation: 'candidate capture',
      artifact: { candidate_id: 'candidate_cli' }
    });
    await expect(readFile(join(workspace, 'candidates', 'candidate_cli.json'), 'utf8')).resolves.toContain(
      'candidate_cli'
    );
  });

  it('uses stable contract and state exit codes', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-errors-'));
    const workspace = join(parent, 'workspace');
    const invalidInput = join(parent, 'invalid.json');
    await writeFile(invalidInput, JSON.stringify({ candidate_id: '../escape' }));

    const invalid = run([
      'candidate', 'capture', '--workspace', workspace, '--input', invalidInput, '--output', 'json'
    ]);
    expect(invalid.status).toBe(2);
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      ok: false,
      error: { code: 'CONTRACT_INVALID' }
    });

    const missing = run(['article', 'review', '--workspace', workspace, '--run-id', 'missing', '--output', 'json']);
    expect(missing.status).toBe(5);
    expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, error: { code: 'ARTIFACT_NOT_FOUND' } });
  });

  it('persists the Browser Host Bridge across CLI processes and reports full operation names', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-browser-'));
    const workspace = join(parent, 'workspace');
    const input = join(parent, 'start.json');
    const plan = publicationPlanV2Fixture();
    const approval = approvePublicationV2(plan, 'human', 600_000);
    await writeFile(input, JSON.stringify({
      execution_id: 'exec_cli_browser',
      plan,
      approval,
      capability_manifest: {
        executor: 'codex-chrome',
        executor_version: '26.814.41407',
        browser_family: 'chrome',
        capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'],
        observed_at: new Date().toISOString()
      }
    }));

    const started = run([
      'x', 'browser', 'start', '--workspace', workspace, '--input', input, '--output', 'json'
    ]);
    expect(started.status).toBe(0);
    const startJson = JSON.parse(started.stdout) as {
      artifact: { command: { command_id: string } };
    };
    const commandId = startJson.artifact.command.command_id;

    const next = run([
      'x', 'browser', 'next', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--output', 'json'
    ]);
    expect(next.status).toBe(0);
    expect(JSON.parse(next.stdout)).toMatchObject({
      operation: 'x browser next',
      artifact: { command_id: commandId, side_effect: 'read' }
    });

    const claimed = run([
      'x', 'browser', 'claim', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--command-id', commandId, '--output', 'json'
    ]);
    expect(claimed.status).toBe(0);
    const replay = run([
      'x', 'browser', 'claim', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--command-id', commandId, '--output', 'json'
    ]);
    expect(replay.status).toBe(4);
    expect(JSON.parse(replay.stdout)).toMatchObject({
      ok: false,
      operation: 'x browser claim',
      error: { code: 'COMMAND_REPLAY_REJECTED' }
    });

    const status = run([
      'x', 'browser', 'status', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--output', 'json'
    ]);
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      operation: 'x browser status',
      artifact: { snapshot: { state: 'preflight' } }
    });

    const wrongResult = join(parent, 'wrong-result.json');
    await writeFile(wrongResult, JSON.stringify({
      schema_version: '2.0', execution_id: 'exec_cli_browser', command_id: 'cmd_wrong',
      status: 'success', observation: null, error_code: null, reported_at: new Date().toISOString()
    }));
    const wrongReport = run([
      'x', 'browser', 'report', '--workspace', workspace,
      '--execution-id', 'exec_cli_browser', '--input', wrongResult, '--output', 'json'
    ]);
    expect(wrongReport.status).toBe(2);
    expect(JSON.parse(wrongReport.stdout)).toMatchObject({
      operation: 'x browser report', error: { code: 'CONTRACT_INVALID' }
    });
  });

  it('dispatches x plan and approve by exact contract version', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-cli-plan-v2-'));
    const workspace = join(parent, 'workspace');
    const store = await WorkspaceStore.open(workspace);
    const x = new XService(store, {
      runId: () => 'run_cli_plan_v2',
      planId: () => 'plan_cli_v2',
      now: () => new Date('2026-08-19T09:00:00.000Z')
    });
    const frozen = { ...researchPackage, status: 'frozen' as const, version: 3 };
    const prepared = await x.prepareX(frozen, {
      contentType: 'anchor', format: 'thread', language: 'en', targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(prepared.run_id, {
      schema_version: '1.0', run_id: prepared.run_id, content_type: 'anchor',
      format: 'thread', language: 'en',
      items: [
        { ordinal: 1, text: 'Runtime evidence is explicit.', claim_refs: ['claim_verified'] },
        { ordinal: 2, text: 'Trace remains planned.', claim_refs: ['claim_planned'], reply_to: 'previous' }
      ]
    });
    await x.reviewX(prepared.run_id);

    const planned = run([
      'x', 'plan', '--workspace', workspace, '--run-id', prepared.run_id,
      '--adapter', 'browser', '--output', 'json'
    ]);
    expect(planned.status).toBe(0);
    const planJson = JSON.parse(planned.stdout) as { artifact: ReturnType<typeof publicationPlanV2Fixture> };
    expect(planJson.artifact).toMatchObject({
      schema_version: '2.0', intent: { adapter: 'browser' }
    });
    expect(planJson.artifact.plan_id).toMatch(/^plan_/);

    const approveInput = join(parent, 'approve-v2.json');
    await writeFile(approveInput, JSON.stringify({
      plan: planJson.artifact, approved_by: 'human', ttl_ms: 600_000
    }));
    const approved = run([
      'x', 'approve', '--workspace', workspace, '--input', approveInput, '--output', 'json'
    ]);
    expect(approved.status).toBe(0);
    expect(JSON.parse(approved.stdout)).toMatchObject({
      operation: 'x approve', artifact: { schema_version: '2.0', scope: 'publish_once' }
    });
  });
});
