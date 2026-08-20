import { describe, expect, it } from 'vitest';

import { approvePublicationV2_1, verifyApprovalV2_1 } from '../../harnesses/research-publishing/core/approval-v2-1.js';
import { publicationPlanV2_1Fixture } from '../fixtures/publication-plan-v2-1.js';

describe('ApprovalV2.1', () => {
  it('binds the complete visual Plan with one publish-once confirmation', () => {
    const plan = publicationPlanV2_1Fixture();
    const approval = approvePublicationV2_1(plan, 'human-reviewer', 60_000, new Date('2026-08-20T03:01:00.000Z'), () => 'approval_visual_1');
    expect(approval).toMatchObject({ schema_version: '2.1', target_account: '@runtime_ai', adapter: 'browser', mode: 'thread', scope: 'publish_once' });
    expect(() => verifyApprovalV2_1(plan, approval, new Date('2026-08-20T03:01:30.000Z'))).not.toThrow();
  });

  it('becomes stale if the approved image or Alt Text changes', () => {
    const plan = publicationPlanV2_1Fixture();
    const approval = approvePublicationV2_1(plan, 'human-reviewer', 60_000, new Date('2026-08-20T03:01:00.000Z'));
    const changed = { ...plan, items: plan.items.map((item, index) => index === 0 ? { ...item, attachments: [{ ...item.attachments[0]!, alt_text: 'changed' }] } : item) };
    expect(() => verifyApprovalV2_1(changed, approval, new Date('2026-08-20T03:01:30.000Z'))).toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
  });

  it('becomes stale if the approved Article Package identity changes', () => {
    const plan = publicationPlanV2_1Fixture();
    const approval = approvePublicationV2_1(plan, 'human-reviewer', 60_000, new Date('2026-08-20T03:01:00.000Z'));
    const changed = {
      ...plan,
      article_package: { root: 'articles/visual/replaced', digest: `sha256:${'f'.repeat(64)}` }
    };

    expect(() => verifyApprovalV2_1(changed, approval, new Date('2026-08-20T03:01:30.000Z')))
      .toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
  });
});
