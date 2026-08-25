import { describe, expect, it } from 'vitest';

import { WeeklyOutcomeService } from '../../harnesses/research-publishing/core/weekly-outcome-service.js';
import { createCompletedPhase4BundleFixture } from '../fixtures/phase-4-research-loop.js';

describe('Weekly Outcome security', () => {
  it('rejects stale completed Bundle bytes without writing Outcome or releasing Topic', async () => {
    const fixture = await createCompletedPhase4BundleFixture();
    const receiptPath = `runs/${fixture.bundle_id}/publication-bundle/receipt.json`;
    const receipt = await fixture.store.readJson<Record<string, unknown>>(receiptPath);
    await fixture.store.replaceAtomic(receiptPath, {
      ...receipt,
      public_urls: ['https://x.com/attacker/status/1', fixture.bundle_receipt.public_urls[1]]
    });
    const service = new WeeklyOutcomeService(
      fixture.store, fixture.roadmaps, fixture.backlog, fixture.weeks
    );

    await expect(service.assemble({ cycle_id: fixture.cycle_id }))
      .rejects.toMatchObject({
        code: expect.stringMatching(/APPROVAL_STALE|CONTRACT_INVALID|STATE_TRANSITION_INVALID/)
      });
    expect(await fixture.store.exists(`program/weeks/${fixture.cycle_id}/outcome.json`)).toBe(false);
    const topic = (await fixture.backlog.catalog('enterprise_ai_agent_runtime_202608'))
      .entries.find((entry) => entry.topic_id === fixture.topic_id);
    expect(topic?.availability).toBe('reserved');
  });

  it('accepts only cycle_id as the public assembly input', async () => {
    const fixture = await createCompletedPhase4BundleFixture();
    const service = new WeeklyOutcomeService(
      fixture.store, fixture.roadmaps, fixture.backlog, fixture.weeks
    );

    await expect(service.assemble({
      cycle_id: fixture.cycle_id,
      public_url: 'https://x.com/attacker/status/1'
    } as never)).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
