import { describe, expect, it } from 'vitest';

import {
  approvePublication,
  computePublicationDigest,
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

  it('rejects a plan whose item digest does not match its text', () => {
    const original = publicationPlanFixture();
    const items = original.items.map((item, index) =>
      index === 0 ? { ...item, digest: `sha256:${'0'.repeat(64)}` } : item
    );
    const unlocked = {
      schema_version: original.schema_version,
      run_id: original.run_id,
      target_account: original.target_account,
      adapter: original.adapter,
      target_post_id: original.target_post_id,
      target_post: original.target_post,
      items,
      planned_at: original.planned_at
    };
    const inconsistent = { ...unlocked, publication_digest: computePublicationDigest(unlocked) };

    expect(() => approvePublication(inconsistent, 'human-reviewer', 60_000)).toThrowError(
      expect.objectContaining({ code: 'APPROVAL_STALE' })
    );
  });
});
