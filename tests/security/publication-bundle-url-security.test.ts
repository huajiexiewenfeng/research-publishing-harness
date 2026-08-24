import { describe, expect, it } from 'vitest';

import {
  createApprovedPublicationBundleFixture,
  installArticleReceipt,
  startBundleArticleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle URL security', () => {
  it.each([
    'https://evil.example/Glen56121/article/2091000000000000000',
    'https://x.com/OtherUser/article/2091000000000000000'
  ])('blocks Single materialization for %s', async (canonicalUrl) => {
    const fixture = await createApprovedPublicationBundleFixture();
    const { snapshot } = await startBundleArticleExecution(fixture);
    await fixture.service.bindArticleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:01:01.000Z'
    });
    const receipt = await installArticleReceipt(fixture, snapshot.execution_id, { canonicalUrl });
    await expect(fixture.service.attachArticleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: receipt.path,
      receipt_digest: receipt.digest
    })).rejects.toMatchObject({
      code: expect.stringMatching(/ARTICLE_PUBLICATION_CONFLICT|CONTRACT_INVALID/)
    });
  });
});
