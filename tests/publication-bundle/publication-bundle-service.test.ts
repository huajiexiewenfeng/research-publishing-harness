import { describe, expect, it } from 'vitest';

import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { createPublicationBundleFixture } from '../fixtures/publication-bundle.js';

describe('PublicationBundleService planning', () => {
  it('plans one exact Article plus one tokenized Single and installs the week binding', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks);
    const plan = await service.plan(fixture.planInput);
    expect(plan.execution_order).toEqual(['x_article', 'x_single']);
    expect(plan.authorization_ttl_ms).toBe(7_200_000);
    await expect(fixture.store.readJson(
      `program/weeks/${plan.cycle_id}/publication-bundle-binding.json`
    )).resolves.toMatchObject({ bundle_plan_ref: { digest: plan.bundle_digest } });
    expect((await fixture.weeks.status(plan.cycle_id)).phase).toBe('publication_planned');
  });

  it('accepts a byte-identical Plan retry and rejects a second Bundle for the Cycle', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks);
    const first = await service.plan(fixture.planInput);
    await expect(service.plan(fixture.planInput)).resolves.toEqual(first);
    await expect(service.plan({
      ...fixture.planInput,
      bundle_id: 'bundle_week_01_second'
    })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });
});
