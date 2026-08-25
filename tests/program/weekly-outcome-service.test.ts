import { describe, expect, it } from 'vitest';

import { WeeklyOutcomeService } from '../../harnesses/research-publishing/core/weekly-outcome-service.js';
import { createCompletedPhase4BundleFixture } from '../fixtures/phase-4-research-loop.js';

describe('WeeklyOutcomeService', () => {
  it('closes only a completed exact Bundle and releases Topic without completing it', async () => {
    const fixture = await createCompletedPhase4BundleFixture();
    const service = new WeeklyOutcomeService(
      fixture.store,
      fixture.roadmaps,
      fixture.backlog,
      fixture.weeks,
      { now: () => new Date('2026-08-25T08:00:00.000Z') }
    );

    const outcome = await service.assemble({ cycle_id: fixture.cycle_id });
    const topic = (await fixture.backlog.catalog('enterprise_ai_agent_runtime_202608'))
      .entries.find((entry) => entry.topic_id === fixture.topic_id);

    expect(outcome.public_urls).toEqual(fixture.bundle_receipt.public_urls);
    expect((await service.status(fixture.cycle_id)).phase).toBe('complete');
    expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('published');
    expect(topic?.availability).toBe('available');
    expect(await fixture.store.exists(`program/weeks/${fixture.cycle_id}/outcome.json`)).toBe(true);
    expect(await fixture.store.exists(`program/weeks/${fixture.cycle_id}/outcome-closure.json`)).toBe(true);
  });

  it('is create-only when assemble is repeated with the same completed Bundle', async () => {
    const fixture = await createCompletedPhase4BundleFixture();
    const service = new WeeklyOutcomeService(
      fixture.store, fixture.roadmaps, fixture.backlog, fixture.weeks,
      { now: () => new Date('2026-08-25T08:00:00.000Z') }
    );

    const first = await service.assemble({ cycle_id: fixture.cycle_id });
    const second = await service.assemble({ cycle_id: fixture.cycle_id });

    expect(second).toEqual(first);
  });
});
