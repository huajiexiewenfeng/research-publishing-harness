import { describe, expect, it } from 'vitest';

import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { createPublicationBundleFixture } from '../fixtures/publication-bundle.js';

describe('Publication Bundle Approval security', () => {
  it('takes no TTL and derives the locked expiry from the installed Plan', async () => {
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
    expect(Date.parse(approval.expires_at) - Date.parse(approval.approved_at))
      .toBe(plan.authorization_ttl_ms);
    expect(approval).not.toHaveProperty('ttl_ms');
  });
});
