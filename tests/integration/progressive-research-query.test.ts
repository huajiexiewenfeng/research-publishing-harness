import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ProgressiveResearchQueryService } from '../../harnesses/research-publishing/core/progressive-research-query-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';
import { progressiveQueryFixture } from '../memory/progressive-query-fixture.js';

describe('progressive Query workflow', () => {
  it('binds only Human-reviewed V2 Snapshot refs to a draft Package', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-progressive-flow-')));
    const fixture = progressiveQueryFixture();
    const service = new ProgressiveResearchQueryService(store, fixture.runtime, {
      snapshotId: () => 'snapshot_progressive_flow', reviewId: () => 'review_progressive_flow',
      now: () => new Date('2026-08-23T02:30:00.000Z')
    });
    await service.plan(fixture.input);
    const snapshot = await service.execute(fixture.input.query_id);
    await service.review(fixture.input.query_id, {
      selected_context_refs: [snapshot.context_items[0]!.context_ref],
      reviewer: 'human-reviewer', reviewed_at: '2026-08-23T02:31:00.000Z'
    });
    const draft = {
      ...researchPackage, schema_version: '1.1' as const, status: 'draft' as const,
      memory_context: { query_plan_digest: null, context_snapshot_digest: null, context_refs: [], status: 'not_configured' as const, reviewer: null, reviewed_at: null }
    };
    const bound = await service.bindPackage(fixture.input.query_id, draft);
    expect(bound.memory_context).toMatchObject({
      schema_version: 'memory-context/v2', status: 'applied',
      research_query_plan_digest: expect.stringMatching(/^sha256:/),
      research_context_snapshot_digest: snapshot.snapshot_digest
    });
  });
});
