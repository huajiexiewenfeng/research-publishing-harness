import { describe, expect, it } from 'vitest';

import {
  assertFinalReceiptV2,
  createPublicationReceiptV2,
  type CreatePublicationReceiptV2Input
} from '../../harnesses/research-publishing/adapters/x/browser/receipt-v2.js';
import { approvePublicationV2 } from '../../harnesses/research-publishing/core/approval-v2.js';
import { publicationPlanV2Fixture } from '../fixtures/publication-plan-v2.js';

function finalizedInput(): CreatePublicationReceiptV2Input {
  const plan = publicationPlanV2Fixture();
  const approval = approvePublicationV2(
    plan, 'human', 3_600_000, new Date('2026-08-19T06:00:00.000Z'), () => 'approval_receipt'
  );
  const posts = plan.items.map((item, index) => ({
    ordinal: item.ordinal,
    post_id: String(601 + index),
    canonical_url: `https://x.com/runtime_ai/status/${601 + index}`,
    observed_digest: item.digest,
    reply_to_id: index === 0 ? null : String(600 + index)
  }));
  return {
    plan,
    supersedes_receipt_id: null,
    execution_id: 'exec_receipt',
    attempt_id: 'attempt_1',
    run_id: plan.run_id,
    platform: 'x',
    adapter: 'browser',
    status: 'finalized',
    target_account: '@runtime_ai',
    observed_account: '@runtime_ai',
    approval: {
      plan_digest: plan.plan_digest,
      approval_digest: approval.approval_digest,
      approved_at: approval.approved_at,
      expires_at: approval.expires_at
    },
    submission: {
      armed_at: '2026-08-19T06:01:00.000Z',
      attempted_at: '2026-08-19T06:01:01.000Z',
      submit_command_count: 1,
      page_contract_version: '2026-08',
      executor_version: '26.814.41407'
    },
    public_result: {
      root_url: posts[0]!.canonical_url,
      published_at: '2026-08-19T06:01:02.000Z',
      ordered_post_ids: posts.map((post) => post.post_id),
      posts,
      matched_ordinals: [1, 2],
      missing_ordinals: [],
      unexpected_post_ids: []
    },
    verification: {
      source: 'browser_public_page',
      strength: 'public_browser_verified',
      verified_at: '2026-08-19T06:01:03.000Z',
      account_match: true,
      count_match: true,
      content_match: true,
      order_match: true,
      reply_chain_match: true,
      links_match: true,
      unique_post_ids: true,
      evidence_digest: `sha256:${'e'.repeat(64)}`
    }
  };
}

describe('PublicationReceiptV2', () => {
  it('accepts a fully public-browser-verified receipt', () => {
    const input = finalizedInput();
    const receipt = createPublicationReceiptV2(
      input,
      () => 'receipt_final_1',
      () => new Date('2026-08-19T06:01:04.000Z')
    );
    expect(() => assertFinalReceiptV2(receipt, input.plan)).not.toThrow();
  });

  it.each([
    ['wrong account', (input: CreatePublicationReceiptV2Input) => ({ ...input, observed_account: '@other' })],
    ['wrong count', (input: CreatePublicationReceiptV2Input) => ({
      ...input,
      public_result: { ...input.public_result!, ordered_post_ids: ['601'] }
    })],
    ['duplicate id', (input: CreatePublicationReceiptV2Input) => ({
      ...input,
      public_result: { ...input.public_result!, ordered_post_ids: ['601', '601'] }
    })],
    ['non-numeric id', (input: CreatePublicationReceiptV2Input) => ({
      ...input,
      public_result: { ...input.public_result!, ordered_post_ids: ['601', 'post-two'] }
    })],
    ['wrong digest', (input: CreatePublicationReceiptV2Input) => ({
      ...input,
      public_result: {
        ...input.public_result!,
        posts: input.public_result!.posts.map((post, index) =>
          index === 0 ? { ...post, observed_digest: `sha256:${'0'.repeat(64)}` } : post
        )
      }
    })],
    ['weak verification', (input: CreatePublicationReceiptV2Input) => ({
      ...input,
      verification: { ...input.verification, source: 'user_report' as const, strength: 'user_asserted' as const }
    })],
    ['multiple submit commands', (input: CreatePublicationReceiptV2Input) => ({
      ...input,
      submission: { ...input.submission, submit_command_count: 2 }
    })]
  ])('rejects finalized invariant: %s', (_label, mutate) => {
    const input = mutate(finalizedInput());
    expect(() => createPublicationReceiptV2(input as CreatePublicationReceiptV2Input)).toThrow();
  });

  it('creates a new immutable superseding receipt for later verification', () => {
    const base = finalizedInput();
    const stage = createPublicationReceiptV2(
      { ...base, status: 'published_unverified', public_result: null,
        verification: { ...base.verification, strength: 'unverified', verified_at: null } },
      () => 'receipt_stage',
      () => new Date('2026-08-19T06:01:03.000Z')
    );
    const final = createPublicationReceiptV2(
      { ...base, supersedes_receipt_id: stage.receipt_id },
      () => 'receipt_final_2',
      () => new Date('2026-08-19T06:01:04.000Z')
    );
    expect(final.receipt_id).not.toBe(stage.receipt_id);
    expect(final.supersedes_receipt_id).toBe(stage.receipt_id);
    expect(stage.status).toBe('published_unverified');
  });
});
