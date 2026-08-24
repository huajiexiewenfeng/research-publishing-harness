import { describe, expect, it } from 'vitest';

import {
  prepareBundleThroughSingleAuthorization,
  startBundleSingleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle Single execution binding', () => {
  it('binds one exact execution before next and rejects rebinding', async () => {
    const fixture = await prepareBundleThroughSingleAuthorization();
    const first = await startBundleSingleExecution(fixture);
    await expect(fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: first.snapshot.execution_id,
      bound_at: '2026-08-24T12:03:00.000Z'
    })).resolves.toMatchObject({
      child_kind: 'x_single',
      execution_id: first.snapshot.execution_id,
      plan_digest: fixture.materialized.child_plan.plan_digest
    });
    const second = await startBundleSingleExecution(fixture, 'single_execution_bundle_2');
    await expect(fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: second.snapshot.execution_id,
      bound_at: '2026-08-24T12:03:01.000Z'
    })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });
});
