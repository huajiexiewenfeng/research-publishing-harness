import { describe, expect, it } from 'vitest';

import {
  createApprovedPublicationBundleFixture,
  installArticleReceipt,
  startBundleArticleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle Single materialization', () => {
  it('creates no Single Plan before Article verification, then materializes exact text and authorization', async () => {
    const fixture = await createApprovedPublicationBundleFixture();
    await expect(fixture.service.materializeSingle(fixture.plan.bundle_id))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });

    const { snapshot } = await startBundleArticleExecution(fixture);
    await fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    });
    const receipt = await installArticleReceipt(fixture, snapshot.execution_id);
    await fixture.service.attachArticleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: receipt.path,
      receipt_digest: receipt.digest
    });
    const materialized = await fixture.service.materializeSingle(fixture.plan.bundle_id);
    expect(materialized.final_text).toContain(receipt.receipt.public_evidence.canonical_url);
    expect(materialized.child_plan).toMatchObject({
      schema_version: '2.0',
      intent: { adapter: 'browser', mode: 'single', media: [] }
    });
    await expect(fixture.service.singleAuthorization(fixture.plan.bundle_id))
      .resolves.toMatchObject({
        child_plan_digest: materialized.child_plan.plan_digest,
        child_approval: { approved_by: 'human:Glen56121' }
      });
  });

  it('uses V2.1 only for the exact locked Visual on ordinal one', async () => {
    const fixture = await createApprovedPublicationBundleFixture({ withVisual: true });
    const { snapshot } = await startBundleArticleExecution(fixture);
    await fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    });
    const receipt = await installArticleReceipt(fixture, snapshot.execution_id);
    await fixture.service.attachArticleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: receipt.path,
      receipt_digest: receipt.digest
    });
    const materialized = await fixture.service.materializeSingle(fixture.plan.bundle_id);
    expect(materialized.child_plan).toMatchObject({
      schema_version: '2.1',
      article_package: fixture.plan.single_intent.article_package,
      items: [{
        ordinal: 1,
        attachments: [fixture.plan.single_intent.visual_asset]
      }]
    });
  });
});
