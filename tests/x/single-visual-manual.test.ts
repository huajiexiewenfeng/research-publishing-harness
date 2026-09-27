import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { XService } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { ManualAdapter } from '../../harnesses/research-publishing/adapters/x/manual/manual-adapter.js';
import { computePageRevision } from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { verifyPackageVisualAsset } from '../../harnesses/research-publishing/core/visual-assets.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { researchPackage } from '../fixtures/research-package.js';
import { emptyComposer } from '../fixtures/x-browser-observations.js';

async function setup(quote = false) {
  const root = await mkdtemp(join(tmpdir(), 'rph-single-unit-'));
  const store = await WorkspaceStore.open(root);
  const x = new XService(store, { runId: () => 'single', planId: () => 'single_plan' });
  await x.prepareX({ ...researchPackage, status: 'frozen' }, { contentType: 'research_note', format: 'single', language: 'en', targetAccount: '@runtime_ai' });
  await x.acceptXDraft('single', { schema_version: '1.0', run_id: 'single', content_type: 'research_note', format: 'single', language: 'en', items: [{ ordinal: 1, text: 'My research note.', claim_refs: ['claim_verified'] }],
    ...(quote ? { quote_post: { id: '123', url: 'https://x.com/runtime_ai/status/123', author: '@runtime_ai', snapshot_digest: sha256('article') } } : {}) });
  await x.reviewX('single');
  return { root, store, x };
}

it('plans an independent image without an Article Handoff', async () => {
  const { root, store, x } = await setup(true);
  const image = join(root, 'input.png');
  await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).png().toFile(image);
  const plan = await x.planXBrowser('single', undefined, { source_path: image, asset_id: 'team', alt_text: 'Team diagram', claim_refs: ['claim_verified'] });
  expect(plan.schema_version).toBe('2.1');
  expect(plan.items[0]).toHaveProperty('attachments.0.alt_text', 'Team diagram');
  expect(plan.provenance).toHaveProperty('visual_source', 'single_visual');
  expect(plan.intent.quote_post?.id).toBe('123');
  await expect(verifyPackageVisualAsset(store, plan.article_package!.root, plan.items[0]!.attachments[0]!)).resolves.toBeUndefined();
  const wrong = { ...plan.items[0]!.attachments[0]!, digest: sha256('wrong') };
  await expect(verifyPackageVisualAsset(store, plan.article_package!.root, wrong)).rejects.toThrow();
});

it('rejects Single image claims outside the research package', async () => {
  const { x } = await setup();
  await expect(x.planXBrowser('single', undefined, { source_path: 'not-opened.png', asset_id: 'team', alt_text: 'Team', claim_refs: ['unknown'] })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
});

it('records observed human publication without minting publish authority or a browser execution', async () => {
  const { store, x } = await setup();
  const plan = await x.planXBrowser('single');
  const post = { post_id: '999', canonical_url: 'https://x.com/runtime_ai/status/999', author_handle: '@runtime_ai', text: 'My research note.', links: [], published_at: '2026-09-27T10:00:00.000Z', reply_to_id: null };
  const input = { ...emptyComposer, nodes: [], canonical_url: post.canonical_url, public_posts: [post] };
  const observation = { ...input, page_revision: computePageRevision(input) };
  const adapter = new ManualAdapter(store);
  const receipt = await adapter.recordObserved(plan, observation);
  expect(receipt).toMatchObject({ publication_actor: 'human', status: 'manual_verified', root_url: post.canonical_url });
  expect(await adapter.recordObserved(plan, observation)).toEqual(receipt);
  const wrong = { ...observation, public_posts: [{ ...post, text: 'Different content' }] };
  await expect(adapter.recordObserved(plan, { ...wrong, page_revision: computePageRevision(wrong) })).rejects.toThrow();
});
