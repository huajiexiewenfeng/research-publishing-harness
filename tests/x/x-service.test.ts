import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XService } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';

const frozenPackage = { ...researchPackage, status: 'frozen', version: 3 } as const;

async function service(runId = 'x_run_1'): Promise<XService> {
  const root = await mkdtemp(join(tmpdir(), 'rph-x-'));
  return new XService(await WorkspaceStore.open(root), {
    runId: () => runId,
    planId: () => 'plan_browser_1',
    now: () => new Date('2026-08-18T15:00:00.000Z')
  });
}

describe('XService', () => {
  it('requires a frozen package and creates one primary generation task', async () => {
    const x = await service();
    await expect(
      x.prepareX(
        { ...frozenPackage, status: 'reviewed' },
        {
          contentType: 'research_note',
          format: 'single',
          language: 'en',
          targetAccount: '@runtime_ai'
        }
      )
    ).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });

    const run = await x.prepareX(frozenPackage, {
      contentType: 'research_note',
      format: 'single',
      language: 'en',
      targetAccount: '@runtime_ai'
    });
    expect(run.generation_task.branch).toBe('x');
    expect(run.generation_task.claims).toHaveLength(2);
  });

  it('accepts Single and requires a complete Reply target snapshot', async () => {
    const x = await service('x_single_1');
    const run = await x.prepareX(frozenPackage, {
      contentType: 'research_note',
      format: 'single',
      language: 'en',
      targetAccount: '@runtime_ai'
    });
    await expect(
      x.acceptXDraft(run.run_id, {
        schema_version: '1.0',
        run_id: run.run_id,
        content_type: 'research_note',
        format: 'single',
        language: 'en',
        items: [{ ordinal: 1, text: 'Context needs evidence boundaries.', claim_refs: ['claim_verified'] }]
      })
    ).resolves.toMatchObject({ run_id: run.run_id });

    const replyX = await service('x_reply_1');
    const replyRun = await replyX.prepareX(frozenPackage, {
      contentType: 'reply',
      format: 'reply',
      language: 'en',
      targetAccount: '@runtime_ai'
    });
    await expect(
      replyX.acceptXDraft(replyRun.run_id, {
        schema_version: '1.0',
        run_id: replyRun.run_id,
        content_type: 'reply',
        format: 'reply',
        language: 'en',
        items: [{ ordinal: 1, text: 'A reply without a snapshot.', claim_refs: [] }]
      })
    ).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('blocks an over-limit Thread item independently', async () => {
    const x = await service('x_thread_bad');
    const run = await x.prepareX(frozenPackage, {
      contentType: 'anchor',
      format: 'thread',
      language: 'en',
      targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(run.run_id, {
      schema_version: '1.0',
      run_id: run.run_id,
      content_type: 'anchor',
      format: 'thread',
      language: 'en',
      items: [
        { ordinal: 1, text: 'A'.repeat(281), claim_refs: ['claim_verified'] },
        { ordinal: 2, text: 'Planned: trace adapters come later.', claim_refs: ['claim_planned'], reply_to: 'previous' }
      ]
    });

    const review = await x.reviewX(run.run_id);
    expect(review.passed).toBe(false);
    expect(review.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'CHARACTER_LIMIT_EXCEEDED', path: '/items/0/text' })])
    );
    await expect(x.planX(run.run_id)).rejects.toMatchObject({ code: 'CHARACTER_LIMIT_EXCEEDED' });
  });

  it('locks ordered content and item digests in a manual PublicationPlan', async () => {
    const x = await service('x_thread_good');
    const run = await x.prepareX(frozenPackage, {
      contentType: 'anchor',
      format: 'thread',
      language: 'en',
      targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(run.run_id, {
      schema_version: '1.0',
      run_id: run.run_id,
      content_type: 'anchor',
      format: 'thread',
      language: 'en',
      items: [
        { ordinal: 1, text: 'Reliable agents need governed runtime context.', claim_refs: ['claim_verified'] },
        { ordinal: 2, text: 'Trace adapters remain planned work.', claim_refs: ['claim_planned'], reply_to: 'previous' }
      ]
    });
    await x.reviewX(run.run_id);

    const plan = await x.planX(run.run_id);
    expect(plan.adapter).toBe('manual');
    expect(plan.items.map((item) => item.ordinal)).toEqual([1, 2]);
    expect(plan.items.every((item) => item.digest.startsWith('sha256:'))).toBe(true);
    expect(plan.publication_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(plan.article_handoff).toBeUndefined();
  });

  it('creates a stable browser PublicationPlanV2 without changing the manual plan', async () => {
    const x = await service('x_browser_good');
    const run = await x.prepareX(frozenPackage, {
      contentType: 'anchor',
      format: 'thread',
      language: 'en',
      targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(run.run_id, {
      schema_version: '1.0',
      run_id: run.run_id,
      content_type: 'anchor',
      format: 'thread',
      language: 'en',
      items: [
        { ordinal: 1, text: 'Reliable agents need governed runtime context.', claim_refs: ['claim_verified'] },
        { ordinal: 2, text: 'Trace adapters remain planned work.', claim_refs: ['claim_planned'], reply_to: 'previous' }
      ]
    });
    await x.reviewX(run.run_id);

    const plan = await x.planXBrowser(run.run_id);
    expect(plan).toMatchObject({
      schema_version: '2.0',
      plan_id: 'plan_browser_1',
      run_id: run.run_id,
      intent: {
        adapter: 'browser',
        mode: 'thread',
        action: 'publish_once'
      }
    });
    expect(plan.plan_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(plan.items).toEqual(plan.intent.items);
  });
});
