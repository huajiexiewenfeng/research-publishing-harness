import { describe, expect, it } from 'vitest';

import type { XArticleBrowserCommandV1 } from '../../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import {
  installArticleReceipt,
  installSingleReceipt,
  prepareBundleThroughSingleAuthorization,
  startBundleSingleExecution
} from '../fixtures/publication-bundle.js';
import { createPreparedPublicationBundleFixture } from '../publication-bundle/prepared-article-fixture.js';

class FakeBrowserHost {
  readonly submitKinds: string[] = [];
  readonly network = 'unused';

  submit(kind: 'publish_article_once' | 'submit_once'): void {
    this.submitKinds.push(kind);
  }
}

async function articleCommandKinds(
  fixture: Awaited<ReturnType<typeof createPreparedPublicationBundleFixture>>
): Promise<readonly XArticleBrowserCommandV1['kind'][]> {
  const entries = await fixture.store.list(
    `runs/${fixture.execution.execution_id}/x-article/browser/commands`
  );
  const commands = await Promise.all(entries
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => fixture.store.readJson<XArticleBrowserCommandV1>(
      `${entry.relative_path}/command.json`
    )));
  return commands.map((command) => command.kind);
}

describe('Publication Bundle Browser acceptance', () => {
  it('arms the prepared Article from the one Bundle confirmation without issuing Publish', async () => {
    const fixture = await createPreparedPublicationBundleFixture();
    const binding = await fixture.service.bindPreparedArticle({
      bundle_id: fixture.plan.bundle_id,
      execution_id: fixture.execution.execution_id,
      preview_revision: fixture.preview.page_revision,
      materialization_receipt_ref: fixture.receiptRef,
      bound_at: '2026-08-26T00:10:00.000Z'
    });
    await fixture.service.approve({
      bundle_id: fixture.plan.bundle_id,
      confirmed_bundle_digest: fixture.plan.bundle_digest,
      confirmed_preview_revision: binding.preview_revision,
      approved_by: 'human:Glen56121'
    });
    expect(await articleCommandKinds(fixture)).not.toContain('publish_article_once');
    const confirmation = await fixture.service.articlePublishConfirmation(fixture.plan.bundle_id);
    await expect(fixture.adapter.confirmPublish(fixture.execution.execution_id, confirmation))
      .resolves.toMatchObject({ state: 'publish_armed', publish_command_count: 0 });
    expect(await articleCommandKinds(fixture)).not.toContain('publish_article_once');
    await expect(fixture.store.exists(
      `runs/${fixture.execution.execution_id}/x-article/browser/materialization-receipt-public.json`
    )).resolves.toBe(false);
    const approvalPath = `runs/${fixture.plan.bundle_id}/publication-bundle/approval.json`;
    const approvalBytes = await fixture.store.readBytes(approvalPath);
    const receipt = await installArticleReceipt(
      fixture as unknown as Parameters<typeof installArticleReceipt>[0],
      fixture.execution.execution_id
    );
    await fixture.service.attachArticleReceipt({
      bundle_id: fixture.plan.bundle_id,
      receipt_path: receipt.path,
      receipt_digest: receipt.digest
    });
    await fixture.service.materializeSingle(fixture.plan.bundle_id);
    const single = await fixture.service.singleAuthorization(fixture.plan.bundle_id);
    expect(single.child_approval.approved_by).toBe('human:Glen56121');
    expect(await fixture.store.readBytes(approvalPath)).toEqual(approvalBytes);
  });

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
