import { describe, expect, it } from 'vitest';

import {
  installSingleReceipt,
  prepareBundleThroughSingleAuthorization,
  startBundleSingleExecution
} from '../fixtures/publication-bundle.js';

class FakeBrowserHost {
  readonly submitKinds: string[] = [];
  readonly network = 'unused';

  submit(kind: 'publish_article_once' | 'submit_once'): void {
    this.submitKinds.push(kind);
  }
}

describe('Publication Bundle Browser acceptance', () => {
  it('completes two ordered simulated Host submits from one Bundle Approval', async () => {
    const host = new FakeBrowserHost();
    const fixture = await prepareBundleThroughSingleAuthorization();
    host.submit('publish_article_once');
    const { snapshot } = await startBundleSingleExecution(fixture);
    await fixture.service.bindSingleExecution({
      bundle_id: fixture.plan.bundle_id,
      execution_id: snapshot.execution_id,
      bound_at: '2026-08-24T12:03:00.000Z'
    });
    host.submit('submit_once');
    const single = await installSingleReceipt(fixture, snapshot.execution_id);
    const finalReceipt = await fixture.service.attachSingleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: single.path,
      receipt_digest: single.digest
    });
    expect(host.submitKinds).toEqual(['publish_article_once', 'submit_once']);
    expect(host.submitKinds).toHaveLength(2);
    await expect(fixture.store.exists(
      `runs/${fixture.plan.bundle_id}/publication-bundle/approval.json`
    )).resolves.toBe(true);
    expect(finalReceipt).toMatchObject({ status: 'completed' });
    if (!('public_urls' in finalReceipt)) throw new Error('expected joint Receipt');
    expect(finalReceipt.public_urls).toEqual([
      'https://x.com/Glen56121/article/2091000000000000000',
      single.publicUrl
    ]);
    await expect(fixture.store.exists('memory/promotions')).resolves.toBe(false);
    expect(host.network).toBe('unused');
  });
});
