import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { researchPackage } from '../fixtures/research-package.js';

const cli = resolve('dist/harnesses/research-publishing/cli/index.js');
function run(args: readonly string[]) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); }

describe('progressive Query CLI', () => {
  it('plans V2, records unavailable execution, reviews and binds without changing V2.2 routes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-progressive-cli-'));
    const planInput = join(root, 'plan.json');
    await writeFile(planInput, JSON.stringify({
      query_id: 'query_cli_v2', track_id: 'enterprise-agent-runtime',
      query_intent: 'Find the current Runtime boundary.', view: 'mainline', include_working: false,
      selection_terms: ['runtime'], selection_rationale: 'No matching Runtime is configured in this CLI test.',
      document_mode: 'none', catalog_ref: {
        path: 'domains/research-publishing/tracks/enterprise-agent-runtime/indexes/catalog.md',
        digest: `sha256:${'a'.repeat(64)}`, generation: 'g_cli'
      },
      selected_shard_refs: [], selected_record_refs: [], selected_manifest_refs: [], selected_chunk_refs: [],
      created_at: '2026-08-23T04:00:00.000Z'
    }));
    const planned = run(['memory', 'query', 'plan', '--workspace', root, '--input', planInput, '--output', 'json']);
    expect(JSON.parse(planned.stdout)).toMatchObject({ ok: true, artifact: { schema_version: 'research-query-plan/v2' } });
    const idInput = join(root, 'id.json');
    await writeFile(idInput, JSON.stringify({ query_id: 'query_cli_v2' }));
    expect(JSON.parse(run(['memory', 'query', 'execute', '--workspace', root, '--input', idInput, '--output', 'json']).stdout))
      .toMatchObject({ ok: true, artifact: { query_status: 'runtime_unavailable' } });
    const reviewInput = join(root, 'review.json');
    await writeFile(reviewInput, JSON.stringify({
      query_id: 'query_cli_v2', selected_context_refs: [], reviewer: 'human-reviewer',
      reviewed_at: '2026-08-23T04:01:00.000Z'
    }));
    expect(JSON.parse(run(['memory', 'query', 'review', '--workspace', root, '--input', reviewInput, '--output', 'json']).stdout))
      .toMatchObject({ ok: true, state: 'reviewed' });
    const bindInput = join(root, 'bind.json');
    await writeFile(bindInput, JSON.stringify({
      query_id: 'query_cli_v2', package: {
        ...researchPackage, schema_version: '1.1', status: 'draft',
        memory_context: { query_plan_digest: null, context_snapshot_digest: null, context_refs: [], status: 'not_configured', reviewer: null, reviewed_at: null }
      }
    }));
    expect(JSON.parse(run(['memory', 'query', 'bind-package', '--workspace', root, '--input', bindInput, '--output', 'json']).stdout))
      .toMatchObject({ ok: true, artifact: { memory_context: { schema_version: 'memory-context/v2', status: 'reviewed_not_applied' } } });
  }, 20_000);
});
