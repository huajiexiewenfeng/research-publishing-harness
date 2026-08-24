import { describe, expect, it } from 'vitest';

import { PublicationBundleService } from '../../harnesses/research-publishing/core/publication-bundle-service.js';
import { createPublicationBundleFixture } from '../fixtures/publication-bundle.js';

describe('Publication Bundle Audit', () => {
  it('renders unknown final URL and locked TTL honestly before confirmation', async () => {
    const fixture = await createPublicationBundleFixture();
    const service = new PublicationBundleService(fixture.store, fixture.weeks);
    const plan = await service.plan(fixture.planInput);
    const audit = await service.audit(plan.bundle_id);
    expect(audit.single_template).toContain('{{X_ARTICLE_URL}}');
    expect(audit.final_single_bytes_known).toBe(false);
    expect(audit.authorization_ttl_ms).toBe(7_200_000);
    expect(audit.bundle_digest).toBe(plan.bundle_digest);
  });
});
