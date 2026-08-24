import { describe, expect, it } from 'vitest';

import {
  createApprovedPublicationBundleFixture,
  startBundleArticleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle Article execution binding', () => {
  it('binds the exact started execution before any Host command and rejects rebinding', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    const first = await startBundleArticleExecution(fixture);
    await expect(fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: first.snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    })).resolves.toMatchObject({
      child_kind: 'x_article',
      execution_id: first.snapshot.execution_id,
      plan_digest: fixture.authorization.child_plan_digest
    });

    const second = await startBundleArticleExecution(fixture, 'article_execution_bundle_2');
    await expect(fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: second.snapshot.execution_id,
      bound_at: '2026-08-24T12:01:02.000Z'
    })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });

  it('projects outcome_unknown from the bound snapshot without inventing a Receipt', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    const { snapshot } = await startBundleArticleExecution(fixture);
    await fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    });
    const path = `runs/${snapshot.execution_id}/x-article/browser/adapter-context.json`;
    const context = await fixture.store.readJson<Record<string, unknown>>(path);
    await fixture.store.replaceAtomic(path, {
      ...context,
      snapshot: {
        ...(context.snapshot as Record<string, unknown>),
        state: 'outcome_unknown', publish_command_count: 1,
        latest_receipt_path: null, updated_at: '2026-08-24T12:02:00.000Z'
      }
    });
    await expect(fixture.service.status(fixture.plan.bundle_id)).resolves.toMatchObject({
      phase: 'article_outcome_unknown', article_receipt_binding_ref: null
    });
  });
});
