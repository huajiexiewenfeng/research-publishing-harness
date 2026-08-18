import { describe, expect, it } from 'vitest';

import {
  approvePublication,
  verifyApproval
} from '../../harnesses/research-publishing/core/approval.js';
import { publicationPlanFixture } from '../fixtures/publication-plan.js';

describe('Publication Approval', () => {
  it('is scoped to one digest-bound publication and expires', () => {
    const publication = publicationPlanFixture();
    const approval = approvePublication(
      publication,
      'human-reviewer',
      60_000,
      new Date('2026-08-18T15:01:00.000Z')
    );

    expect(approval).toMatchObject({
      scope: 'single_publication',
      target_account: '@runtime_ai',
      adapter: 'manual',
      target_post_id: '1900000000000000000'
    });
    expect(() => verifyApproval(publication, approval, new Date('2026-08-18T15:01:30.000Z'))).not.toThrow();
    expect(() => verifyApproval(publication, approval, new Date('2026-08-18T15:02:00.000Z'))).toThrowError(
      expect.objectContaining({ code: 'APPROVAL_STALE' })
    );
  });
});
