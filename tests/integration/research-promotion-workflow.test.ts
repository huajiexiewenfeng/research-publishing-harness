import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { MemoryPromotionService } from '../../harnesses/research-publishing/core/memory-promotion-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { createPromotionFixture, FakePromotionRuntime, promotionAssets } from '../memory/memory-promotion-fixture.js';

describe('Evidence to promoted Catalog integration', () => {
  it('keeps the old Catalog invisible until every immutable write succeeds', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-promotion-flow-')));
    const { delta, review } = await createPromotionFixture(store);
    const runtime = new FakePromotionRuntime();
    const service = new MemoryPromotionService(store, runtime, promotionAssets);
    const plan = await service.plan(delta.delta_id, review.review_id);
    const approval = await service.approve(plan.plan_id, plan.plan_digest, 'human', 60_000);
    runtime.failOnceAt = 'find_catalog';
    const receipt = await service.execute(plan.plan_id, approval);
    expect(receipt.status).not.toBe('complete');
    expect(runtime.catalog).toBeNull();
  });
});
