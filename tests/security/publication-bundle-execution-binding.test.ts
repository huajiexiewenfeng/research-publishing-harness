import { describe, expect, it } from 'vitest';

import {
  createApprovedPublicationBundleFixture,
  startBundleArticleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle execution binding security', () => {
  it('rejects binding after any Article Publish command was issued', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    const { snapshot } = await startBundleArticleExecution(fixture);
    const path = `runs/${snapshot.execution_id}/x-article/browser/adapter-context.json`;
    const context = await fixture.store.readJson<Record<string, unknown>>(path);
    await fixture.store.replaceAtomic(path, {
      ...context,
      snapshot: {
        ...(context.snapshot as Record<string, unknown>),
        state: 'publish_attempted', publish_command_count: 1
      }
    });
    await expect(fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });
});
