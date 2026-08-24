import { describe, expect, it } from 'vitest';

import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { createPublicationBundleFixture } from '../fixtures/publication-bundle.js';

describe('Publication Bundle Publish Gate', () => {
  it('fails closed before exact Bundle approval', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks);
    const plan = await service.plan(fixture.planInput);
    await expect(service.articleAuthorization(plan.bundle_id))
      .rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
  });

  it('derives one Article authorization from the exact Bundle Approval', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks, {
      now: () => new Date('2026-08-24T12:00:00.000Z'),
      approvalId: () => 'bundle_approval_week_01'
    });
    const plan = await service.plan(fixture.planInput);
    const approval = await service.approve({
      bundle_id: plan.bundle_id,
      confirmed_bundle_digest: plan.bundle_digest,
      approved_by: 'human:Glen56121'
    });
    const authorization = await service.articleAuthorization(plan.bundle_id);
    expect(authorization.child_plan_digest).toBe(plan.article_plan.plan_digest);
    expect(authorization.child_approval.approved_by).toBe(approval.approved_by);
    expect(authorization.bundle_approval_ref.path).toContain('/approval.json');
  });
});
