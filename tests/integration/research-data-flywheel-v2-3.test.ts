import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryPromotionService } from '../../harnesses/research-publishing/core/memory-promotion-service.js';
import { ResearchFlywheelService } from '../../harnesses/research-publishing/core/research-flywheel-service.js';
import { ResearchImportService } from '../../harnesses/research-publishing/core/research-import-service.js';
import { SemanticDeltaService } from '../../harnesses/research-publishing/core/semantic-delta-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { firstIncrementImportFixture } from '../fixtures/first-increment-import.js';
import { FakePromotionRuntime, promotionAssets } from '../memory/memory-promotion-fixture.js';

describe('Research Data Flywheel V2.3', () => {
  it('turns one bounded historical expression into a reviewed but unapproved research increment', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-v23-loop-')));
    const manifest = await firstIncrementImportFixture(store);
    const imports = new ResearchImportService(store, {
      deltaId: () => 'delta_v23_import', lifecycleEventId: () => 'event_v23_import_accepted',
      now: () => new Date('2026-08-23T05:00:00.000Z')
    });
    const gaps = await imports.inspect(manifest);
    const evidence = await imports.capture(manifest);
    const delta = await imports.propose(manifest, evidence.evidence_snapshot_id);
    const reviews = new SemanticDeltaService(store);
    const mismatchedReview = await reviews.review(delta.delta_id, {
      review_id: 'review_wrong_import',
      accepted_operation_ids: delta.proposed_operations.map((operation) => operation.operation_id),
      rejected_operation_ids: [], rejection_reasons: [], operation_replacements: [],
      reviewer: 'human-reviewer', reviewed_at: '2026-08-23T05:00:30.000Z'
    });
    const review = await reviews.review(delta.delta_id, {
      review_id: 'review_import_first_runtime_boundary',
      accepted_operation_ids: delta.proposed_operations.map((operation) => operation.operation_id),
      rejected_operation_ids: [], rejection_reasons: [], operation_replacements: [],
      reviewer: 'human-reviewer', reviewed_at: '2026-08-23T05:01:00.000Z'
    });
    const promotion = new MemoryPromotionService(store, new FakePromotionRuntime(), promotionAssets, {
      planId: () => 'promotion_v23_import', now: () => new Date('2026-08-23T05:02:00.000Z')
    });
    await expect(promotion.plan(delta.delta_id, mismatchedReview.review_id)).rejects.toThrow(
      /bind the exact Human Review/
    );
    const plan = await promotion.plan(delta.delta_id, review.review_id);
    const questions = await new ResearchFlywheelService(store).proposeNextQuestions(
      'increment:enterprise-agent-runtime:increment_skill_runtime_boundary@1'
    );

    expect(gaps.item_order).toEqual([1, 2, 3, 4, 5, 6]);
    expect(gaps.unrecoverable_gaps.length).toBeGreaterThan(0);
    expect(delta.proposed_operations.map((operation) => operation.operation_type)).toEqual(
      expect.arrayContaining(['add_revision', 'attach_publication', 'change_lifecycle'])
    );
    expect(plan.review_digest).toBe(review.review_digest);
    await expect(store.exists(`memory/promotions/${plan.plan_id}/approval.json`)).resolves.toBe(false);
    expect(questions[0]).toMatchObject({ data_classification: 'data_only', evidence_strength: 'anecdotal' });
  });
});
