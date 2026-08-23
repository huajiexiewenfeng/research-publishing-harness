import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { MonthlyEditorialReviewService } from '../../harnesses/research-publishing/core/monthly-editorial-review-service.js';
import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import type { ResearchArtifactRefV1 } from '../../harnesses/research-publishing/core/research-program-types.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { monthlyReviewInput, roadmapInput } from '../fixtures/research-program.js';

describe('MonthlyEditorialReviewService', () => {
  let store: WorkspaceStore;
  let service: MonthlyEditorialReviewService;
  let roadmapRef: ResearchArtifactRefV1;

  beforeEach(async () => {
    store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-month-review-')));
    const roadmap = await new ResearchRoadmapService(store).create(roadmapInput);
    roadmapRef = {
      path: `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`,
      digest: roadmap.roadmap_digest
    };
    service = new MonthlyEditorialReviewService(store);
  });

  async function outcomeRefs(count: number): Promise<readonly ResearchArtifactRefV1[]> {
    const refs: ResearchArtifactRefV1[] = [];
    for (let index = 1; index <= count; index += 1) {
      const artifact = await store.writeNew(
        `program/weeks/week_${String(index).padStart(2, '0')}/outcome.json`,
        { cycle_id: `week_${String(index).padStart(2, '0')}` }
      );
      const contained = await store.resolveExistingArtifact(artifact.relative_path);
      refs.push({ path: contained.relative_path, digest: contained.digest });
    }
    return refs;
  }

  it('computes cadence from four contained completed Weekly Outcome refs', async () => {
    const review = await service.create({
      ...monthlyReviewInput,
      roadmap_ref: roadmapRef,
      completed_outcome_refs: await outcomeRefs(4)
    });
    expect(review.cadence_met).toBe(true);
    await expect(service.status('month_01')).resolves.toEqual(review);
    await expect(store.readJson(`program/months/month_01/reviews/${review.review_id}.json`))
      .resolves.toEqual(review);
  });

  it('does not count fewer than four Outcomes even with high engagement', async () => {
    const review = await service.create({
      ...monthlyReviewInput,
      roadmap_ref: roadmapRef,
      completed_outcome_refs: await outcomeRefs(3),
      secondary_signals: {
        impressions: 1_000_000,
        likes: 100_000,
        replies: 10_000,
        followers: 50_000,
        stars: 5_000,
        issues: 500,
        reproductions: 100
      }
    });
    expect(review.cadence_met).toBe(false);
  });

  it('rejects missing, stale, and external Outcome refs', async () => {
    const [contained] = await outcomeRefs(1);
    await expect(service.create({
      ...monthlyReviewInput,
      roadmap_ref: roadmapRef,
      completed_outcome_refs: [{ ...contained!, digest: `sha256:${'0'.repeat(64)}` }]
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    await expect(service.create({
      ...monthlyReviewInput,
      roadmap_ref: roadmapRef,
      review_id: 'review_missing',
      completed_outcome_refs: [{
        path: 'program/weeks/missing/outcome.json',
        digest: `sha256:${'0'.repeat(64)}`
      }]
    })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
    await expect(service.create({
      ...monthlyReviewInput,
      roadmap_ref: roadmapRef,
      review_id: 'review_external',
      completed_outcome_refs: [{ path: 'C:\\private\\outcome.json', digest: contained!.digest }]
    })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });

  it('returns null when a month has no review', async () => {
    await expect(service.status('month_01')).resolves.toBeNull();
  });
});
