import { describe, expect, it } from 'vitest';

import { ingestFixture } from '../memory/memory-ingest-fixture.js';

describe('Memory Ingest security', () => {
  it('rejects expired or cross-Plan approvals before any Runtime write', async () => {
    const { service, runtime, receiptPath, receipt } = await ingestFixture();
    const plan = await service.planPublicationCheckpoint({
      receipt_path: receiptPath, receipt_digest: receipt.digest,
      research_track: 'enterprise-agent-runtime', publication_id: 'publication_001'
    });
    const approval = await service.approve(plan.ingest_id, 'human-reviewer', 1);
    await expect(service.execute(plan.ingest_id, {
      ...approval,
      ingest_plan_digest: `sha256:${'f'.repeat(64)}`
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    expect(runtime.count('copySource')).toBe(0);
  });

  it('rejects unsafe record path identifiers before creating a Plan', async () => {
    const { service, receiptPath, receipt } = await ingestFixture();
    await expect(service.planPublicationCheckpoint({
      receipt_path: receiptPath, receipt_digest: receipt.digest,
      research_track: '../other-domain', publication_id: 'publication_001'
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
