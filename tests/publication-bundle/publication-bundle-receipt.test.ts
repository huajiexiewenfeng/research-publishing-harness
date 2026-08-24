import { describe, expect, it } from 'vitest';

import {
  installSingleReceipt,
  prepareBundleThroughSingleAuthorization,
  startBundleSingleExecution
} from '../fixtures/publication-bundle.js';

describe('Publication Bundle joint Receipt', () => {
  it('completes only after exact Article and Single child evidence', async () => {
    const fixture = await prepareBundleThroughSingleAuthorization();
    const { snapshot } = await startBundleSingleExecution(fixture);
    await fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:03:00.000Z'
    });
    const single = await installSingleReceipt(fixture, snapshot.execution_id);
    const receipt = await fixture.service.attachSingleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: single.path,
      receipt_digest: single.digest
    });
    expect(receipt).toMatchObject({ status: 'completed' });
    if (!('public_urls' in receipt)) throw new Error('expected joint Receipt');
    expect(receipt.public_urls).toEqual([
      'https://x.com/Glen56121/article/2091000000000000000',
      single.publicUrl
    ]);
  });

  it('completes a Visual Bundle while retaining public media uncertainty', async () => {
    const fixture = await prepareBundleThroughSingleAuthorization({ withVisual: true });
    const { snapshot } = await startBundleSingleExecution(fixture);
    await fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:03:00.000Z'
    });
    const single = await installSingleReceipt(
      fixture,
      snapshot.execution_id,
      'published_media_unverified'
    );
    const receipt = await fixture.service.attachSingleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: single.path,
      receipt_digest: single.digest
    });
    expect(receipt).toMatchObject({
      status: 'completed',
      single: { status: 'published_media_unverified' },
      limitations: ['published_media_unverified']
    });
  });
});
