import { describe, expect, it } from 'vitest';

import {
  installSingleReceipt,
  prepareBundleThroughSingleAuthorization,
  startBundleSingleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle Single terminal boundaries', () => {
  it.each([
    ['outcome_unknown', 'single_outcome_unknown'],
    ['verification_conflict', 'single_verification_conflict'],
    ['partial', 'single_terminal_failure'],
    ['failed_after_submit', 'single_terminal_failure']
  ] as const)('does not complete from %s', async (receiptStatus, expectedPhase) => {
    const fixture = await prepareBundleThroughSingleAuthorization();
    const { snapshot } = await startBundleSingleExecution(fixture);
    await fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:03:00.000Z'
    });
    const single = await installSingleReceipt(fixture, snapshot.execution_id, receiptStatus);
    await expect(fixture.service.attachSingleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: single.path,
      receipt_digest: single.digest
    })).resolves.toMatchObject({ phase: expectedPhase });
    await expect(fixture.service.singleAuthorization(fixture.plan.bundle_id))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });

  it('accepts a superseding verified Receipt after outcome_unknown without replacing old evidence', async () => {
    const fixture = await prepareBundleThroughSingleAuthorization();
    const { snapshot } = await startBundleSingleExecution(fixture);
    await fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:03:00.000Z'
    });
    const unknown = await installSingleReceipt(fixture, snapshot.execution_id, 'outcome_unknown');
    await fixture.service.attachSingleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: unknown.path,
      receipt_digest: unknown.digest
    });
    const verified = await installSingleReceipt(fixture, snapshot.execution_id, 'finalized');
    await expect(fixture.service.attachSingleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: verified.path,
      receipt_digest: verified.digest
    })).resolves.toMatchObject({ status: 'completed' });
    await expect(fixture.store.exists(
      `runs/${fixture.plan.bundle_id}/publication-bundle/single-receipt-bindings/` +
      'single_receipt_outcome_unknown.json'
    )).resolves.toBe(true);
  });
});
