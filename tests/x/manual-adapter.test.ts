import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ManualAdapter } from '../../harnesses/research-publishing/adapters/x/manual/manual-adapter.js';
import { approvePublication } from '../../harnesses/research-publishing/core/approval.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { publicationPlanFixture } from '../fixtures/publication-plan.js';

describe('offline ManualAdapter', () => {
  it('writes a preview/copy package and handed-off manual receipt', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-manual-'));
    const store = await WorkspaceStore.open(root);
    const adapter = new ManualAdapter(store, {
      receiptId: () => 'receipt_manual_1',
      now: () => new Date('2026-08-18T15:01:30.000Z')
    });
    const plan = publicationPlanFixture();
    const approval = approvePublication(
      plan,
      'human-reviewer',
      60_000,
      new Date('2026-08-18T15:01:00.000Z')
    );

    const receipt = await adapter.handoff(plan, approval);
    expect(receipt).toMatchObject({
      adapter: 'manual',
      status: 'handed_off',
      verification_source: 'manual'
    });
    await expect(store.readText(receipt.preview_path!)).resolves.toContain('Copy item 1');
    await expect(
      store.readJson(`x/${plan.run_id}/manual/${plan.publication_digest.slice(7, 19)}/copy-package.json`)
    ).resolves.toMatchObject({ plan, approval });
  });

  it('blocks a stale approval before creating a handoff', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-manual-stale-'));
    const adapter = new ManualAdapter(await WorkspaceStore.open(root));
    const plan = publicationPlanFixture();
    const approval = approvePublication(plan, 'human-reviewer', 60_000, new Date());

    await expect(
      adapter.handoff({ ...plan, target_account: '@changed' }, approval)
    ).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
  });

  it('records only user-supplied manual publication evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-manual-record-'));
    const store = await WorkspaceStore.open(root);
    const now = new Date('2026-08-18T15:01:30.000Z');
    const adapter = new ManualAdapter(store, {
      receiptId: () => 'receipt_manual_2',
      now: () => now
    });
    const plan = publicationPlanFixture();
    const approval = approvePublication(plan, 'human-reviewer', 60_000, new Date('2026-08-18T15:01:00.000Z'));
    const handedOff = await adapter.handoff(plan, approval);

    const recorded = await adapter.recordPublished(handedOff, {
      url: 'https://x.com/runtime_ai/status/2000000000000000000',
      postIds: ['2000000000000000000', '2000000000000000001'],
      publishedAt: '2026-08-18T15:05:00.000Z'
    });
    expect(recorded).toMatchObject({
      status: 'manual_recorded',
      verification_source: 'manual',
      public_result: {
        post_ids: ['2000000000000000000', '2000000000000000001']
      }
    });
    expect(JSON.stringify(recorded)).not.toMatch(/browser|api_verified/i);
  });
});
