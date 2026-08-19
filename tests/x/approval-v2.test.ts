import { describe, expect, it } from 'vitest';

import {
  approvePublicationV2,
  verifyApprovalV2
} from '../../harnesses/research-publishing/core/approval-v2.js';
import { publicationPlanV2Fixture } from '../fixtures/publication-plan-v2.js';

describe('ApprovalV2', () => {
  it('binds account, adapter, mode, plan digest, and publish-once scope', () => {
    const plan = publicationPlanV2Fixture();
    const approval = approvePublicationV2(
      plan,
      'human-reviewer',
      600_000,
      new Date('2026-08-19T02:00:00.000Z'),
      () => 'approval_v2_1'
    );
    expect(approval).toMatchObject({
      schema_version: '2.0',
      target_account: '@runtime_ai',
      adapter: 'browser',
      mode: 'thread',
      scope: 'publish_once'
    });
    expect(() =>
      verifyApprovalV2(plan, approval, new Date('2026-08-19T02:09:59.000Z'))
    ).not.toThrow();
  });

  it('rejects expiry and any intent mutation', () => {
    const plan = publicationPlanV2Fixture();
    const approval = approvePublicationV2(
      plan,
      'human-reviewer',
      60_000,
      new Date('2026-08-19T02:00:00.000Z')
    );
    expect(() =>
      verifyApprovalV2(plan, approval, new Date('2026-08-19T02:01:00.000Z'))
    ).toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
    const changed = {
      ...plan,
      intent: { ...plan.intent, target_account: '@changed' }
    };
    expect(() =>
      verifyApprovalV2(changed, approval, new Date('2026-08-19T02:00:30.000Z'))
    ).toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
  });
});
