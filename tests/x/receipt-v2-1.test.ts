import { describe, expect, it } from 'vitest';

import { createPublicationReceiptV2_1, type CreatePublicationReceiptV2_1Input } from '../../harnesses/research-publishing/adapters/x/browser/receipt-v2-1.js';
import { approvePublicationV2_1 } from '../../harnesses/research-publishing/core/approval-v2-1.js';
import { createPublicationPlanV2_1 } from '../../harnesses/research-publishing/core/publication-plan-v2-1.js';
import { publicationPlanV2_1Fixture } from '../fixtures/publication-plan-v2-1.js';

function input(): CreatePublicationReceiptV2_1Input {
  const plan = publicationPlanV2_1Fixture();
  const approval = approvePublicationV2_1(plan, 'human', 600_000, new Date('2026-08-20T03:00:00.000Z'));
  const posts = plan.items.map((item, index) => ({
    ordinal: item.ordinal, post_id: String(800 + index),
    canonical_url: `https://x.com/runtime_ai/status/${800 + index}`,
    observed_digest: item.digest, reply_to_id: index === 0 ? null : String(799 + index)
  }));
  return {
    plan, supersedes_receipt_id: null, execution_id: 'exec_visual', attempt_id: 'attempt_visual',
    run_id: plan.run_id, platform: 'x', adapter: 'browser', status: 'finalized',
    target_account: '@runtime_ai', observed_account: '@runtime_ai', plan_digest: plan.plan_digest,
    approval: { plan_digest: plan.plan_digest, approval_digest: approval.approval_digest, approved_at: approval.approved_at, expires_at: approval.expires_at },
    submission: { armed_at: '2026-08-20T03:01:00.000Z', attempted_at: '2026-08-20T03:01:01.000Z', submit_command_count: 1, page_contract_version: '2026-08', executor_version: 'fake' },
    public_result: { root_url: posts[0]!.canonical_url, published_at: '2026-08-20T03:01:02.000Z', ordered_post_ids: posts.map((post) => post.post_id), posts, matched_ordinals: [1, 2], missing_ordinals: [], unexpected_post_ids: [] },
    verification: { source: 'browser_public_page', strength: 'public_browser_verified', verified_at: '2026-08-20T03:01:03.000Z', account_match: true, count_match: true, content_match: true, order_match: true, reply_chain_match: true, links_match: true, unique_post_ids: true, evidence_digest: `sha256:${'c'.repeat(64)}` },
    media_evidence: { asset_id: 'asset_cover', source_digest: plan.items[0]!.attachments[0]!.digest, source_asset_verified: true, composer_attachment_verified: true, public_media_verified: true, target_ordinal: 1, alt_text_verified: true, public_media_url: 'https://pbs.twimg.com/media/800', limitations: ['public bytes may be transcoded'] }
  };
}

describe('PublicationReceiptV2.1', () => {
  it('keeps Source, Composer, and Public evidence separate', () => {
    expect(createPublicationReceiptV2_1(input(), () => 'receipt_visual', () => new Date('2026-08-20T03:01:04.000Z'))).toMatchObject({
      status: 'finalized', media_evidence: { source_asset_verified: true, composer_attachment_verified: true, public_media_verified: true }
    });
  });

  it('rejects a finalized claim when any media evidence class is missing', () => {
    const value = input();
    expect(() => createPublicationReceiptV2_1({ ...value, media_evidence: { ...value.media_evidence!, public_media_verified: false } })).toThrowError(expect.objectContaining({ code: 'PUBLIC_MEDIA_UNVERIFIED' }));
  });

  it('rejects media evidence that does not identify the Plan attachment and target ordinal', () => {
    const value = input();
    expect(() => createPublicationReceiptV2_1({
      ...value,
      media_evidence: {
        ...value.media_evidence!,
        asset_id: 'asset_wrong',
        source_digest: `sha256:${'f'.repeat(64)}`,
        target_ordinal: 99
      }
    })).toThrowError(expect.objectContaining({ code: 'PUBLIC_MEDIA_UNVERIFIED' }));
  });

  it('allows an honest immutable media-unverified receipt', () => {
    const value = input();
    const receipt = createPublicationReceiptV2_1({
      ...value, status: 'published_media_unverified',
      media_evidence: { ...value.media_evidence!, public_media_verified: false, alt_text_verified: null, limitations: ['public page did not expose media fields'] }
    });
    expect(receipt.status).toBe('published_media_unverified');
  });

  it('supports a zero-attachment V2.1 Plan without inventing media evidence', () => {
    const visual = publicationPlanV2_1Fixture();
    const plan = createPublicationPlanV2_1({
      planId: 'plan_text_v2_1', runId: visual.run_id, targetAccount: visual.intent.target_account,
      mode: 'single', targetPost: null,
      items: [{ ordinal: 1, text: 'Text-only V2.1 item', attachments: [] }],
      articlePackage: null, authorizedAsset: null, plannedAt: visual.planned_at,
      provenance: { draft_digest: `sha256:${'d'.repeat(64)}` }
    });
    const approval = approvePublicationV2_1(plan, 'human', 600_000, new Date('2026-08-20T03:00:00.000Z'));
    const value = input();
    const receipt = createPublicationReceiptV2_1({
      ...value,
      plan,
      plan_digest: plan.plan_digest,
      approval: {
        plan_digest: plan.plan_digest,
        approval_digest: approval.approval_digest,
        approved_at: approval.approved_at,
        expires_at: approval.expires_at
      },
      public_result: {
        root_url: 'https://x.com/runtime_ai/status/900',
        published_at: '2026-08-20T03:01:02.000Z', ordered_post_ids: ['900'],
        posts: [{ ordinal: 1, post_id: '900', canonical_url: 'https://x.com/runtime_ai/status/900', observed_digest: plan.items[0]!.digest, reply_to_id: null }],
        matched_ordinals: [1], missing_ordinals: [], unexpected_post_ids: []
      },
      media_evidence: null
    });
    expect(receipt).toMatchObject({ status: 'finalized', media_evidence: null });
  });
});
