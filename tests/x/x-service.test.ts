import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XService } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';
import { visualAssetFixture } from '../fixtures/publication-plan-v2-1.js';

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
  it.each(['single', 'thread', 'reply'] as const)('generates format-aware length guidance for %s', async (format) => {
    const x = await service(`x_guidance_${format}`);
    const run = await x.prepareX(frozenPackage, {
      contentType: format === 'reply' ? 'reply' : 'research_note', format,
      language: 'en', targetAccount: '@runtime_ai'
    });
    expect(run.generation_task.constraints).toContain(format === 'single'
      ? 'Write one complete Single post; no local character cap applies. Platform/account restrictions still apply.'
      : 'Keep every post within the 280-weighted-character limit.');
  });

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

  it('reviews a long Single and locks its full text in a browser plan', async () => {
    const x = await service('x_long_single');
    const run = await x.prepareX(frozenPackage, {
      contentType: 'research_note', format: 'single', language: 'en', targetAccount: '@runtime_ai'
    });
    const text = 'Persistent knowledge has an independent lifecycle. '.repeat(80);
    await x.acceptXDraft(run.run_id, {
      schema_version: '1.0', run_id: run.run_id, content_type: 'research_note',
      format: 'single', language: 'en',
      items: [{ ordinal: 1, text, claim_refs: ['claim_verified'] }]
    });
    expect((await x.reviewX(run.run_id)).passed).toBe(true);
    const plan = await x.planXBrowser(run.run_id);
    expect(plan.intent.mode).toBe('single');
    expect(plan.intent.action).toBe('publish_once');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]!.text).toBe(text);
    expect(plan.plan_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it.each([' \n\t ', `${'a'.repeat(500)}\uFFFE`])('rejects invalid Single text: %j', async (text) => {
    const x = await service('x_invalid_single');
    const run = await x.prepareX(frozenPackage, {
      contentType: 'research_note', format: 'single', language: 'en', targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(run.run_id, {
      schema_version: '1.0', run_id: run.run_id, content_type: 'research_note',
      format: 'single', language: 'en', items: [{ ordinal: 1, text, claim_refs: ['claim_verified'] }]
    });
    expect(await x.reviewX(run.run_id)).toMatchObject({
      passed: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'INVALID_POST_TEXT' })])
    });
    await expect(x.planXBrowser(run.run_id)).rejects.toMatchObject({ code: 'EVIDENCE_GATE_BLOCKED' });
  });

  it('keeps the Reply length limit', async () => {
    const x = await service('x_long_reply');
    const run = await x.prepareX(frozenPackage, {
      contentType: 'reply', format: 'reply', language: 'en', targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(run.run_id, {
      schema_version: '1.0', run_id: run.run_id, content_type: 'reply', format: 'reply', language: 'en',
      target_post: {
        id: '123', url: 'https://x.com/example/status/123', author: '@example',
        snapshot_digest: `sha256:${'a'.repeat(64)}`
      },
      items: [{ ordinal: 1, text: 'a'.repeat(281), claim_refs: ['claim_verified'] }]
    });
    expect(await x.reviewX(run.run_id)).toMatchObject({
      passed: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'CHARACTER_LIMIT_EXCEEDED' })])
    });
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

  it('uses the shared Claim Boundary language rule for exploring V1.2 claims', async () => {
    const x = await service('x_boundary_v12');
    const packageV1_2 = {
      ...frozenPackage, schema_version: '1.2' as const,
      thesis: { ...frozenPackage.thesis, claim_status: 'exploring' as const },
      claims: [{ ...frozenPackage.claims[0], claim_status: 'exploring' as const }],
      memory_context: { query_plan_digest: null, context_snapshot_digest: null, context_refs: [], status: 'not_configured' as const, reviewer: null, reviewed_at: null },
      research_program_binding: {
        roadmap_ref: { path: 'program/roadmaps/runtime/revisions/1.json', digest: `sha256:${'1'.repeat(64)}` as const },
        topic_ref: { path: 'program/backlog/topics/runtime/revisions/1.json', digest: `sha256:${'2'.repeat(64)}` as const },
        candidate_set_ref: { path: 'program/weeks/week_01/candidates.json', digest: `sha256:${'3'.repeat(64)}` as const },
        selection_ref: { path: 'program/weeks/week_01/selection.json', digest: `sha256:${'4'.repeat(64)}` as const }
      }
    };
    const run = await x.prepareX(packageV1_2, {
      contentType: 'research_note', format: 'single', language: 'en', targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(run.run_id, {
      schema_version: '1.0', run_id: run.run_id, content_type: 'research_note', format: 'single', language: 'en',
      items: [{ ordinal: 1, text: 'This runtime is production-ready.', claim_refs: ['claim_verified'] }]
    });
    await expect(x.reviewX(run.run_id)).resolves.toMatchObject({
      passed: false,
      findings: expect.arrayContaining([expect.objectContaining({ code: 'CLAIM_STATUS_LANGUAGE_MISMATCH' })])
    });
  });

  it('creates V2.1 only from an explicit Article asset handoff', async () => {
    const x = await service('x_visual_good');
    const run = await x.prepareX(frozenPackage, {
      contentType: 'research_note', format: 'single', language: 'en', targetAccount: '@runtime_ai'
    });
    await x.acceptXDraft(run.run_id, {
      schema_version: '1.0', run_id: run.run_id, content_type: 'research_note',
      format: 'single', language: 'en',
      items: [{ ordinal: 1, text: 'A visual keeps the boundary explicit.', claim_refs: ['claim_verified'] }]
    });
    await x.reviewX(run.run_id);
    const handoff = {
      schema_version: '1.1' as const, handoff_id: 'handoff_visual',
      article_run_id: 'article_visual', article_digest: `sha256:${'a'.repeat(64)}`,
      package_id: frozenPackage.package_id, package_version: frozenPackage.version,
      requested_at: '2026-08-20T03:00:00.000Z',
      article_package_root: 'articles/visual/article_visual',
      visual_asset: visualAssetFixture
    };
    const plan = await x.planXBrowser(run.run_id, handoff);
    expect(plan).toMatchObject({
      schema_version: '2.1',
      items: [{ ordinal: 1, attachments: [{ asset_id: 'asset_cover' }] }]
    });
  });
});
