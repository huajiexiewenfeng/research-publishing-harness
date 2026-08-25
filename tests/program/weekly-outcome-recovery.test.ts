import { describe, expect, it } from 'vitest';

import { WeeklyOutcomeService } from '../../harnesses/research-publishing/core/weekly-outcome-service.js';
import { createCompletedPhase4BundleFixture } from '../fixtures/phase-4-research-loop.js';

describe('WeeklyOutcomeService recovery', () => {
  it('repairs a missing closure projection without creating a second Topic revision', async () => {
    const fixture = await createCompletedPhase4BundleFixture();
    const service = new WeeklyOutcomeService(
      fixture.store, fixture.roadmaps, fixture.backlog, fixture.weeks,
      { now: () => new Date('2026-08-25T08:00:00.000Z') }
    );
    await service.assemble({ cycle_id: fixture.cycle_id });
    const first = await service.status(fixture.cycle_id);
    const before = await fixture.store.list(
      `program/backlog/topics/${fixture.topic_id}/revisions`
    );

    await fixture.store.removeFile(`program/weeks/${fixture.cycle_id}/outcome-closure.json`);
    await fixture.store.removeFile(`program/weeks/${fixture.cycle_id}/outcome-status.json`);
    expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('publication_planned');
    const recovered = await service.resume({ cycle_id: fixture.cycle_id });
    const after = await fixture.store.list(
      `program/backlog/topics/${fixture.topic_id}/revisions`
    );

    expect(recovered.released_topic_ref).toEqual(first.released_topic_ref);
    expect(after).toHaveLength(before.length);
    expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('published');
  });
});
