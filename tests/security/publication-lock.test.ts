import { describe, expect, it } from 'vitest';

import type { PublicationPlan } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { approvePublication, verifyApproval } from '../../harnesses/research-publishing/core/approval.js';
import { publicationPlanFixture } from '../fixtures/publication-plan.js';

describe('publication lock', () => {
  const mutations: ReadonlyArray<[string, (plan: PublicationPlan) => PublicationPlan]> = [
    ['text', (plan) => ({ ...plan, items: [{ ...plan.items[0]!, text: 'mutated' }] })],
    ['item order', (plan) => ({ ...plan, items: [...plan.items].reverse() })],
    ['target URL', (plan) => ({ ...plan, target_post: { ...plan.target_post!, url: 'https://x.com/other/status/1' } })],
    ['account', (plan) => ({ ...plan, target_account: '@other' })],
    ['adapter', (plan) => ({ ...plan, adapter: 'api' as unknown as 'manual' })],
    ['Reply target', (plan) => ({ ...plan, target_post_id: '2000', target_post: { ...plan.target_post!, id: '2000' } })]
  ];

  it.each(mutations)('invalidates approval after %s changes', (_name, mutate) => {
    const original = publicationPlanFixture();
    const approval = approvePublication(
      original,
      'human-reviewer',
      60_000,
      new Date('2026-08-18T15:01:00.000Z')
    );

    expect(() =>
      verifyApproval(mutate(original), approval, new Date('2026-08-18T15:01:30.000Z'))
    ).toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
  });
});
