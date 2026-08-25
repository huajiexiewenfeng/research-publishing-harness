import { describe, expect, it } from 'vitest';

import { WeeklyResearchBridgeService } from '../../harnesses/research-publishing/core/weekly-research-bridge-service.js';
import { createClosedPhase4OutcomeFixture } from '../fixtures/phase-4-research-loop.js';

describe('Weekly Research Bridge integration', () => {
  it('connects a completed Outcome to local research evidence without semantic promotion', async () => {
    const fixture = await createClosedPhase4OutcomeFixture();
    const bridge = new WeeklyResearchBridgeService(fixture.store);

    const status = await bridge.assemble({
      cycle_id: fixture.cycle_id,
      workspace_identity_digest: fixture.workspace_identity_digest
    });

    expect(status.phase).toBe('complete');
    expect((await fixture.outcomes.status(fixture.cycle_id)).phase).toBe('complete');
    expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('published');
    expect(await fixture.store.list('memory/deltas')).toEqual([]);
    expect(await fixture.store.list('memory/promotions')).toEqual([]);
  });
});
