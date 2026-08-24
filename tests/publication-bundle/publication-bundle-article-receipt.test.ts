import { describe, expect, it } from 'vitest';

import {
  createApprovedPublicationBundleFixture,
  installArticleReceipt,
  startBundleArticleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle Article Receipt', () => {
  it('binds exact verified public evidence and projects article_verified', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    const { snapshot } = await startBundleArticleExecution(fixture);
    await fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    });
    const receipt = await installArticleReceipt(fixture, snapshot.execution_id);
    await expect(fixture.service.attachArticleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: receipt.path,
      receipt_digest: receipt.digest
    })).resolves.toMatchObject({ phase: 'article_verified' });
  });

  it('rejects a caller-supplied file digest that does not match Receipt bytes', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    const { snapshot } = await startBundleArticleExecution(fixture);
    await fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    });
    const receipt = await installArticleReceipt(fixture, snapshot.execution_id);
    await expect(fixture.service.attachArticleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: receipt.path,
      receipt_digest: `sha256:${'f'.repeat(64)}`
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
  });

  it('retains media uncertainty without converting it into full verification', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    const { snapshot } = await startBundleArticleExecution(fixture);
    await fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    });
    const receipt = await installArticleReceipt(fixture, snapshot.execution_id, {
      status: 'published_media_unverified'
    });
    await expect(fixture.service.attachArticleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: receipt.path,
      receipt_digest: receipt.digest
    })).resolves.toMatchObject({
      phase: 'article_verified',
      limitations: ['published_media_unverified']
    });
  });

  it('persists verification conflict as a terminal Bundle phase', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    const { snapshot } = await startBundleArticleExecution(fixture);
    await fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    });
    const receipt = await installArticleReceipt(fixture, snapshot.execution_id, {
      status: 'verification_conflict'
    });
    await expect(fixture.service.attachArticleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: receipt.path,
      receipt_digest: receipt.digest
    })).resolves.toMatchObject({
      phase: 'article_verification_conflict',
      limitations: ['verification_conflict']
    });
    await expect(fixture.service.materializeSingle(fixture.plan.bundle_id))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });
});
