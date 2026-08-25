import { describe, expect, it } from 'vitest';

import { WeeklyOutcomeService } from '../../harnesses/research-publishing/core/weekly-outcome-service.js';
import { createCompletedPhase4BundleFixture } from '../fixtures/phase-4-research-loop.js';

describe('Weekly Outcome closure integration', () => {
  it('closes a completed local Bundle without external or semantic-promotion effects', async () => {
    const fixture = await createCompletedPhase4BundleFixture();
    const outcomes = new WeeklyOutcomeService(
      fixture.store, fixture.roadmaps, fixture.backlog, fixture.weeks,
      { now: () => new Date('2026-08-25T08:00:00.000Z') }
    );

    await outcomes.assemble({ cycle_id: fixture.cycle_id });
    const topicRevisions = await fixture.store.list(
      `program/backlog/topics/${fixture.topic_id}/revisions`
    );

    expect((await outcomes.status(fixture.cycle_id)).phase).toBe('complete');
    expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('published');
    expect(topicRevisions.filter((entry) => entry.kind === 'file')).toHaveLength(3);
    expect(await fixture.store.exists('memory/promotions')).toBe(false);
  });
});
