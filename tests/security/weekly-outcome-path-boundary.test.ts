import { describe, expect, it } from 'vitest';

import { WeeklyOutcomeService } from '../../harnesses/research-publishing/core/weekly-outcome-service.js';
import { createCompletedPhase4BundleFixture } from '../fixtures/phase-4-research-loop.js';

describe('Weekly Outcome path boundary', () => {
  it.each(['../week_01_2026', '/tmp/week_01_2026', 'C:/tmp/week_01_2026', 'week\\01'])
  ('rejects unsafe Cycle id %s before reading or writing', async (cycle_id) => {
    const fixture = await createCompletedPhase4BundleFixture();
    const outcomes = new WeeklyOutcomeService(
      fixture.store, fixture.roadmaps, fixture.backlog, fixture.weeks
    );

    await expect(outcomes.assemble({ cycle_id }))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(await fixture.store.exists(`program/weeks/${fixture.cycle_id}/outcome.json`)).toBe(false);
  });
});
