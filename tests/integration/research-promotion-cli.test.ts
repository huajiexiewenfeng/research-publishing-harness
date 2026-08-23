import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { MemoryPromotionService } from '../../harnesses/research-publishing/core/memory-promotion-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { createPromotionFixture, FakePromotionRuntime, promotionAssets } from '../memory/memory-promotion-fixture.js';

const cli = resolve('dist/harnesses/research-publishing/cli/index.js');
function run(args: readonly string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

describe('research Promotion CLI', () => {
  it('approves and reads a local Plan but refuses execution without explicit Runtime config', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-promotion-cli-'));
    const store = await WorkspaceStore.open(root);
    const { delta, review } = await createPromotionFixture(store);
    const plan = await new MemoryPromotionService(store, new FakePromotionRuntime(), promotionAssets, {
      planId: () => 'promotion_plan_cli', now: () => new Date('2026-08-23T05:00:00.000Z')
    }).plan(delta.delta_id, review.review_id);
    const approveInput = join(root, 'approve-input.json');
    await writeFile(approveInput, JSON.stringify({
      plan_id: plan.plan_id, confirmed_plan_digest: plan.plan_digest,
      approved_by: 'human-reviewer', ttl_ms: 60_000
    }));
    const approved = run(['memory', 'promotion', 'approve', '--workspace', root, '--input', approveInput, '--output', 'json']);
    expect(approved.status, approved.stderr).toBe(0);
    const approval = JSON.parse(approved.stdout).artifact;
    const statusInput = join(root, 'status-input.json');
    await writeFile(statusInput, JSON.stringify({ plan_id: plan.plan_id }));
    expect(JSON.parse(run(['memory', 'promotion', 'status', '--workspace', root, '--input', statusInput, '--output', 'json']).stdout))
      .toMatchObject({ ok: true, state: 'approved' });
    const executeInput = join(root, 'execute-input.json');
    await writeFile(executeInput, JSON.stringify({ plan_id: plan.plan_id, approval }));
    expect(JSON.parse(run(['memory', 'promotion', 'execute', '--workspace', root, '--input', executeInput, '--output', 'json']).stdout))
      .toMatchObject({ ok: false, error: { code: 'MEMORY_RUNTIME_INVALID_CONFIG' } });
  }, 20_000);
});
