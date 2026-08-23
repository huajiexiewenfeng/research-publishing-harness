import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MemoryPromotionService } from '../../harnesses/research-publishing/core/memory-promotion-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { createPromotionFixture, FakePromotionRuntime, promotionAssets } from './memory-promotion-fixture.js';

async function setup() {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-promotion-service-')));
  const fixture = await createPromotionFixture(store);
  const runtime = new FakePromotionRuntime();
  const service = new MemoryPromotionService(store, runtime, promotionAssets, {
    planId: () => 'promotion_plan_001', approvalId: () => 'promotion_approval_001',
    receiptId: () => 'promotion_receipt_001', now: () => new Date('2026-08-23T04:05:00.000Z')
  });
  return { store, runtime, service, ...fixture };
}

describe('MemoryPromotionService', () => {
  it('binds one approval and commits Catalog last', async () => {
    const { service, runtime, delta, review } = await setup();
    const plan = await service.plan(delta.delta_id, review.review_id);
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human-reviewer', 60_000);
    const receipt = await service.execute(plan.plan_id, approval);
    expect(receipt).toMatchObject({ status: 'complete', reconciliation_required: false, final_catalog_digest: plan.expected_final_catalog_digest });
    expect(runtime.calls.filter((call) => call.startsWith('write_record:')).at(-1))
      .toBe('write_record:research_index_catalog');
    expect(runtime.calls.indexOf('find_catalog')).toBeLessThan(runtime.calls.lastIndexOf('find_catalog'));
  });

  it('fails closed when already_exists checksum differs from the Plan', async () => {
    const { service, runtime, delta, review } = await setup();
    const plan = await service.plan(delta.delta_id, review.review_id);
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human-reviewer', 60_000);
    runtime.mismatchAlreadyExistsType = 'claim_version';
    const receipt = await service.execute(plan.plan_id, approval);
    expect(receipt).toMatchObject({ status: 'partial', final_catalog_digest: null });
    expect(runtime.calls).not.toContain('write_record:research_index_catalog');
  });

  it('resumes after a safe shard failure without repeating confirmed mutations', async () => {
    const { service, runtime, delta, review } = await setup();
    const plan = await service.plan(delta.delta_id, review.review_id);
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human-reviewer', 60_000);
    runtime.failOnceAt = 'write_record:research_index_shard';
    await expect(service.execute(plan.plan_id, approval)).resolves.toMatchObject({ status: 'partial' });
    const copied = runtime.calls.filter((call) => call === 'copy_source').length;
    await expect(service.resume(plan.plan_id, approval)).resolves.toMatchObject({ status: 'complete' });
    expect(runtime.calls.filter((call) => call === 'copy_source')).toHaveLength(copied);
  });
});
