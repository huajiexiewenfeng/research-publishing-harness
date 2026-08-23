import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MemoryPromotionService } from '../../harnesses/research-publishing/core/memory-promotion-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { createPromotionFixture, FakePromotionRuntime, promotionAssets } from '../memory/memory-promotion-fixture.js';

describe('Memory Promotion security', () => {
  it('requires exact digest confirmation and makes register uncertainty terminal', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-promotion-security-')));
    const { delta, review } = await createPromotionFixture(store);
    const runtime = new FakePromotionRuntime();
    const service = new MemoryPromotionService(store, runtime, promotionAssets);
    const plan = await service.plan(delta.delta_id, review.review_id);
    await expect(service.approve(plan.plan_id, `sha256:${'0'.repeat(64)}`, 'human', 60_000))
      .rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human', 60_000);
    runtime.failOnceAt = 'register_artifact';
    const receipt = await service.execute(plan.plan_id, approval);
    expect(receipt).toMatchObject({ status: 'reconciliation_required', reconciliation_required: true });
    await expect(service.resume(plan.plan_id, approval))
      .rejects.toMatchObject({ code: 'MEMORY_PROMOTION_RECONCILIATION_REQUIRED' });
    expect(runtime.calls).not.toContain('write_record:research_index_catalog');
  });

  it('invalidates approval when any staged byte changes', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-promotion-stale-')));
    const { delta, review } = await createPromotionFixture(store);
    const runtime = new FakePromotionRuntime();
    const service = new MemoryPromotionService(store, runtime, promotionAssets);
    const plan = await service.plan(delta.delta_id, review.review_id);
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human', 60_000);
    await store.replaceAtomic(plan.source_artifact.relative_path, '{"changed":true}\n');
    await expect(service.execute(plan.plan_id, approval)).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    expect(runtime.calls).not.toContain('copy_source');
  });
});
