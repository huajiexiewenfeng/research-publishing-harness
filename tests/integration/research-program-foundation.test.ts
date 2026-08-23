import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MonthlyEditorialReviewService } from '../../harnesses/research-publishing/core/monthly-editorial-review-service.js';
import { ResearchBacklogService } from '../../harnesses/research-publishing/core/research-backlog-service.js';
import { ResearchProgramStatusService } from '../../harnesses/research-publishing/core/research-program-status-service.js';
import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { monthlyReviewInput, roadmapInput, topicInput } from '../fixtures/research-program.js';

describe('research program Phase 1 foundation', () => {
  it('connects Roadmap, available Backlog, Monthly Review, and read-only status', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-program-foundation-')));
    const roadmaps = new ResearchRoadmapService(store);
    const backlog = new ResearchBacklogService(store, roadmaps);
    const reviews = new MonthlyEditorialReviewService(store);
    const statusService = new ResearchProgramStatusService(store, roadmaps, backlog, reviews);
    const roadmap = await roadmaps.create(roadmapInput);
    await backlog.add(topicInput('topic_a', 'evidence_ready'));
    await backlog.add(topicInput('topic_b', 'evidence_ready'));

    const completedOutcomeRefs = [];
    for (let index = 1; index <= 4; index += 1) {
      const artifact = await store.writeNew(
        `program/weeks/week_${String(index).padStart(2, '0')}/outcome.json`,
        { cycle_id: `week_${String(index).padStart(2, '0')}` }
      );
      const contained = await store.resolveExistingArtifact(artifact.relative_path);
      completedOutcomeRefs.push({ path: contained.relative_path, digest: contained.digest });
    }
    const review = await reviews.create({
      ...monthlyReviewInput,
      roadmap_ref: {
        path: `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`,
        digest: roadmap.roadmap_digest
      },
      completed_outcome_refs: completedOutcomeRefs,
      implementation_evidence_refs: ['evidence:phase-1-foundation']
    });
    const status = await statusService.status(roadmap.roadmap_id);

    expect(review).toMatchObject({
      cadence_met: true,
      research_progress_met: true,
      secondary_signals: { replies: 0 }
    });
    expect(status).toMatchObject({
      roadmap_ref: { digest: roadmap.roadmap_digest },
      latest_review_ref: { digest: review.review_digest },
      warnings: [],
      next_action: 'open_next_weekly_cycle'
    });
    await expect(store.readJson('program/status.json')).resolves.toEqual(status);
  });

  it('prioritizes replenishing the Evidence Ready buffer', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-program-warning-')));
    const roadmaps = new ResearchRoadmapService(store);
    const backlog = new ResearchBacklogService(store, roadmaps);
    const reviews = new MonthlyEditorialReviewService(store);
    await roadmaps.create(roadmapInput);
    await backlog.add(topicInput('topic_a', 'evidence_ready'));
    const status = await new ResearchProgramStatusService(store, roadmaps, backlog, reviews)
      .status(roadmapInput.roadmap_id);
    expect(status.next_action).toBe('replenish_evidence_ready_backlog');
    expect(status.warnings).toContain('available Evidence Ready Topic buffer is below 2');
  });
});
