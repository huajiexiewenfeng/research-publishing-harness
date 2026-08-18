import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ManualAdapter } from '../../harnesses/research-publishing/adapters/x/manual/manual-adapter.js';
import { XService, type XDraft } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { approvePublication } from '../../harnesses/research-publishing/core/approval.js';
import type { ResearchContentPackage } from '../../harnesses/research-publishing/core/types.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const examples = resolve('harnesses/research-publishing/examples/synthetic');

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(examples, name), 'utf8')) as T;
}

describe('offline synthetic Manual X workflow', () => {
  it('runs Frozen Package to a user-recorded manual result', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-x-e2e-'));
    const store = await WorkspaceStore.open(root);
    const packageValue = {
      ...(await fixture<ResearchContentPackage>('package.json')),
      status: 'frozen' as const,
      version: 3
    };
    const x = new XService(store, {
      runId: () => 'synthetic_x',
      now: () => new Date('2026-08-18T15:00:00.000Z')
    });
    const run = await x.prepareX(packageValue, {
      contentType: 'anchor',
      format: 'thread',
      language: 'en',
      targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(run.run_id, await fixture<XDraft>('x-draft.json'));
    expect((await x.reviewX(run.run_id)).passed).toBe(true);
    const plan = await x.planX(run.run_id);
    const approval = approvePublication(
      plan,
      'human-reviewer',
      60_000,
      new Date('2026-08-18T15:00:10.000Z')
    );
    const manual = new ManualAdapter(store, {
      receiptId: () => 'receipt_synthetic_x',
      now: () => new Date('2026-08-18T15:00:20.000Z')
    });
    const handedOff = await manual.handoff(plan, approval);
    const recorded = await manual.recordPublished(handedOff, {
      url: 'https://x.com/runtime_ai/status/2000000000000000100',
      postIds: ['2000000000000000100', '2000000000000000101', '2000000000000000102'],
      publishedAt: '2026-08-18T15:10:00.000Z'
    });

    expect(recorded).toMatchObject({ status: 'manual_recorded', verification_source: 'manual' });
    expect(recorded.public_result?.post_ids).toHaveLength(3);
  });
});
