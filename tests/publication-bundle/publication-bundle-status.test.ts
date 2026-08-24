import { describe, expect, it } from 'vitest';

import {
  installSingleReceipt,
  prepareBundleThroughSingleAuthorization,
  startBundleSingleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle status recovery', () => {
  it('rebuilds deleted Bundle and Weekly status projections', async () => {
    const fixture = await prepareBundleThroughSingleAuthorization();
    const { snapshot } = await startBundleSingleExecution(fixture);
    await fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:03:00.000Z'
    });
    const single = await installSingleReceipt(fixture, snapshot.execution_id);
    await fixture.service.attachSingleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: single.path,
      receipt_digest: single.digest
    });
    await fixture.store.removeFile(
      `runs/${fixture.plan.bundle_id}/publication-bundle/status.json`
    );
    await fixture.store.removeFile(`program/weeks/${fixture.plan.cycle_id}/status.json`);
    await expect(fixture.service.status(fixture.plan.bundle_id))
      .resolves.toMatchObject({ phase: 'completed' });
    await expect(fixture.weeks.status(fixture.plan.cycle_id))
      .resolves.toMatchObject({ phase: 'publication_planned' });
  });
});
