import { describe, expect, it } from 'vitest';
import { createPublicationPlanV2, assertPublicationPlanV2 } from '../../harnesses/research-publishing/core/publication-plan-v2.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { nextComposerDecision } from '../../harnesses/research-publishing/adapters/x/browser/composer-protocol.js';
import { XWeb202608Contract } from '../../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import { verifyPublicThread } from '../../harnesses/research-publishing/adapters/x/browser/public-verifier.js';
import { emptyComposer } from '../fixtures/x-browser-observations.js';

const quote = { id: '123', url: 'https://x.com/runtime_ai/status/123', author: '@runtime_ai', snapshot_digest: sha256('article') };
function plan() {
  const input = { planId: 'quote_plan', runId: 'quote_run', targetAccount: '@runtime_ai',
    adapter: 'browser' as const, mode: 'single' as const, targetPost: null, quotePost: quote,
    media: [], items: [{ ordinal: 1, text: 'One developer. Multiple teams.' }],
    plannedAt: '2026-09-27T10:00:00.000Z', provenance: {} };
  return createPublicationPlanV2(input);
}
describe('Single with an explicit quoted article', () => {
  it('binds the quote to the approval digest', () => {
    const value = plan();
    expect(value.intent).toHaveProperty('quote_post', quote);
    expect(() => assertPublicationPlanV2({ ...value, intent: { ...value.intent, quote_post: { ...quote, id: '456' } } })).toThrow();
  });
  it('rejects a URL whose post ID differs from its quote binding', () => {
    const value = plan();
    const intent = { ...value.intent, quote_post: { ...quote, url: 'https://x.com/runtime_ai/status/999' } };
    expect(() => assertPublicationPlanV2({ ...value, intent, plan_digest: sha256(intent) })).toThrow();
  });
  it('will not populate a composer with a missing or wrong quote', () => {
    for (const id of [null, '456']) {
      const context = { plan: plan(), expected_account: '@runtime_ai', created_item_refs: [], next_ordinal: 1, add_retry_count: 0, last_page_revision: null };
      const observation = { ...emptyComposer, composer_quote_post_id: id };
      expect(nextComposerDecision(context, observation, new XWeb202608Contract()).kind).toBe('blocked');
    }
  });
  it('populates the matching quote composer', () => {
    const context = { plan: plan(), expected_account: '@runtime_ai', created_item_refs: [], next_ordinal: 1, add_retry_count: 0, last_page_revision: null };
    const observation = { ...emptyComposer, composer_quote_post_id: '123' };
    expect(nextComposerDecision(context, observation, new XWeb202608Contract())).toMatchObject({ kind: 'command', input: { kind: 'set_text' } });
  });
  it('rejects an unplanned Quote in a plain Single', () => {
    const value = plan();
    const { quote_post: _quote, ...intent } = value.intent;
    expect(_quote?.id).toBe('123');
    const plain = { ...value, intent, plan_digest: sha256(intent) };
    const context = { plan: plain, expected_account: '@runtime_ai', created_item_refs: [], next_ordinal: 1, add_retry_count: 0, last_page_revision: null };
    expect(nextComposerDecision(context, { ...emptyComposer, composer_quote_post_id: '123' }, new XWeb202608Contract()).kind).toBe('blocked');
  });
  it('requires the quoted post ID in public evidence', () => {
    const post = { post_id: '500', canonical_url: 'https://x.com/runtime_ai/status/500', author_handle: '@runtime_ai',
      text: plan().items[0]!.text, links: [], published_at: '2026-09-27T10:01:00.000Z', reply_to_id: null };
    expect(verifyPublicThread(plan(), [post]).kind).toBe('conflict');
    expect(verifyPublicThread(plan(), [{ ...post, quoted_post_id: '456' }]).kind).toBe('conflict');
    expect(verifyPublicThread(plan(), [{ ...post, quoted_post_id: '123' }]).kind).toBe('full_match');
  });
});
