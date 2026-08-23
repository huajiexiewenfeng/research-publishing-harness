import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { createPromotionFixture } from './memory-promotion-fixture.js';

describe('SemanticDeltaService', () => {
  it('persists immutable proposed and Human-reviewed artifacts', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-delta-service-')));
    const { delta, review } = await createPromotionFixture(store);
    await expect(store.readJson(`memory/deltas/${delta.delta_id}/delta.json`)).resolves.toEqual(delta);
    await expect(store.readJson(`memory/reviews/${review.review_id}/review.json`)).resolves.toEqual(review);
    await expect(store.writeNew(`memory/deltas/${delta.delta_id}/delta.json`, delta))
      .rejects.toMatchObject({ code: 'ARTIFACT_EXISTS' });
  });
});
