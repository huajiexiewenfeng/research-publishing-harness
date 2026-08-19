import { describe, expect, it } from 'vitest';

import type { BrowserPublicPostObservation } from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { verifyPublicThread } from '../../harnesses/research-publishing/adapters/x/browser/public-verifier.js';
import { createPublicationPlanV2 } from '../../harnesses/research-publishing/core/publication-plan-v2.js';

function plan() {
  return createPublicationPlanV2({
    planId: 'plan_verify', runId: 'run_verify', targetAccount: '@runtime_ai',
    adapter: 'browser', mode: 'thread', targetPost: null, media: [],
    items: [
      { ordinal: 1, text: 'Read https://example.com/research — exactly.' },
      { ordinal: 2, text: '“Runtime boundaries” stay exact.', reply_to: 'previous' },
      { ordinal: 3, text: 'What would you test next?', reply_to: 'previous' }
    ],
    plannedAt: '2026-08-19T06:00:00.000Z',
    provenance: { draft_digest: `sha256:${'d'.repeat(64)}` }
  });
}

function posts(): BrowserPublicPostObservation[] {
  return [
    {
      post_id: '501', canonical_url: 'https://x.com/runtime_ai/status/501',
      author_handle: '@runtime_ai', text: 'Read https://t.co/abc — exactly.',
      links: [{ display_url: 'example.com/research', expanded_url: 'https://example.com/research' }],
      published_at: '2026-08-19T06:01:00.000Z', reply_to_id: null
    },
    {
      post_id: '502', canonical_url: 'https://x.com/runtime_ai/status/502',
      author_handle: '@runtime_ai', text: '“Runtime boundaries” stay exact.', links: [],
      published_at: '2026-08-19T06:01:01.000Z', reply_to_id: '501'
    },
    {
      post_id: '503', canonical_url: 'https://x.com/runtime_ai/status/503',
      author_handle: '@runtime_ai', text: 'What would you test next?', links: [],
      published_at: '2026-08-19T06:01:02.000Z', reply_to_id: '502'
    }
  ];
}

describe('verifyPublicThread', () => {
  it('reconstructs a full ordered chain and accepts t.co display links', () => {
    expect(verifyPublicThread(plan(), posts())).toMatchObject({
      kind: 'full_match', root_url: 'https://x.com/runtime_ai/status/501',
      posts: [{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }]
    });
  });

  it('reports a missing tail as partial', () => {
    expect(verifyPublicThread(plan(), posts().slice(0, 2))).toEqual({
      kind: 'partial',
      matched_ordinals: [1, 2],
      missing_ordinals: [3],
      posts: expect.any(Array)
    });
  });

  it('rejects duplicate IDs, wrong authors, and visible text changes', () => {
    const duplicate = posts();
    duplicate[2] = { ...duplicate[2]!, post_id: '502' };
    expect(verifyPublicThread(plan(), duplicate)).toMatchObject({ kind: 'conflict' });

    const wrongAuthor = posts();
    wrongAuthor[1] = { ...wrongAuthor[1]!, author_handle: '@other_ai' };
    expect(verifyPublicThread(plan(), wrongAuthor)).toMatchObject({ kind: 'conflict' });

    for (const changed of [
      '“Runtime boundaries”  stay exact.',
      '"Runtime boundaries" stay exact.',
      '“Runtime boundaries” stay exact!'
    ]) {
      const altered = posts();
      altered[1] = { ...altered[1]!, text: changed };
      expect(verifyPublicThread(plan(), altered)).not.toMatchObject({ kind: 'full_match' });
    }
  });
});
