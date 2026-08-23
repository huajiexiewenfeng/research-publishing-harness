import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryPromotionService } from '../../harnesses/research-publishing/core/memory-promotion-service.js';
import { ResearchImportService } from '../../harnesses/research-publishing/core/research-import-service.js';
import { SemanticDeltaService } from '../../harnesses/research-publishing/core/semantic-delta-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { firstIncrementImportFixture } from '../fixtures/first-increment-import.js';
import { FakePromotionRuntime, promotionAssets } from '../memory/memory-promotion-fixture.js';

describe('first Increment import promotion', () => {
  it('uses the ordinary Review and approval-required Promotion Plan path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-first-import-promotion-'));
    const store = await WorkspaceStore.open(root);
    const manifest = await firstIncrementImportFixture(store);
    const imports = new ResearchImportService(store, {
      deltaId: () => 'delta_first_import', lifecycleEventId: () => 'event_first_import_accepted'
    });
    const snapshot = await imports.capture(manifest);
    const delta = await imports.propose(manifest, snapshot.evidence_snapshot_id);
    const review = await new SemanticDeltaService(store).review(delta.delta_id, {
      review_id: 'review_first_import',
      accepted_operation_ids: delta.proposed_operations.map((operation) => operation.operation_id),
      rejected_operation_ids: [], rejection_reasons: [], operation_replacements: [],
      reviewer: 'human-reviewer', reviewed_at: '2026-08-23T04:10:00.000Z'
    });
    const promotion = new MemoryPromotionService(store, new FakePromotionRuntime(), promotionAssets, {
      planId: () => 'promotion_first_import', now: () => new Date('2026-08-23T04:11:00.000Z')
    });
    const plan = await promotion.plan(delta.delta_id, review.review_id);
    expect(plan).toMatchObject({
      kind: 'research_increment_promotion', delta_digest: delta.delta_digest,
      review_digest: review.review_digest
    });
    expect(await promotion.status(plan.plan_id)).toMatchObject({ phase: 'planned', approval_digest: null });
  });
});

