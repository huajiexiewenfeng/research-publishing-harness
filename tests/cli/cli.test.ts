import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

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
});
