import { describe, expect, it } from 'vitest';

import {
  installSingleReceipt,
  prepareBundleThroughSingleAuthorization,
  startBundleSingleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle workflow', () => {
  it('keeps one Bundle Approval across ordered Article and Single evidence', async () => {
    const fixture = await prepareBundleThroughSingleAuthorization();
    const { snapshot } = await startBundleSingleExecution(fixture);
    await fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:03:00.000Z'
    });
    const single = await installSingleReceipt(fixture, snapshot.execution_id);
    await expect(fixture.service.attachSingleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: single.path,
      receipt_digest: single.digest
    })).resolves.toMatchObject({ status: 'completed' });
    await expect(fixture.store.exists(
      `runs/${fixture.plan.bundle_id}/publication-bundle/receipt.json`
    )).resolves.toBe(true);
  });
});
