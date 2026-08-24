import { describe, expect, it } from 'vitest';

import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { createPublicationBundleFixture } from '../fixtures/publication-bundle.js';

describe('Weekly Publication Bundle binding', () => {
  it('rebuilds publication_planned without trusting status.json', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks);
    const plan = await service.plan(fixture.planInput);
    await fixture.store.removeFile(`program/weeks/${plan.cycle_id}/status.json`);
    const rebuilt = await fixture.weeks.status(plan.cycle_id);
    expect(rebuilt.phase).toBe('publication_planned');
    expect(rebuilt.bundle_ref).toEqual({
      path: `program/weeks/${plan.cycle_id}/publication-bundle-binding.json`,
      digest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/)
    });
    await expect(fixture.store.readJson(rebuilt.bundle_ref!.path)).resolves.toMatchObject({
      binding_digest: rebuilt.bundle_ref!.digest,
      bundle_plan_ref: {
        path: `runs/${plan.bundle_id}/publication-bundle/plan.json`,
        digest: plan.bundle_digest
      }
    });
  });
});
