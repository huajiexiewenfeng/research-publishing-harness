import { describe, expect, it } from 'vitest';

import { approveMemoryIngest } from '../../harnesses/research-publishing/core/memory-ingest-service.js';
import { ingestFixture } from './memory-ingest-fixture.js';

describe('Memory Ingest Plan and Approval', () => {
  it('renders a bounded publication checkpoint without upgrading uncertain evidence', async () => {
    const { store, service, receiptPath, receipt } = await ingestFixture();
    const plan = await service.planPublicationCheckpoint({
      receipt_path: receiptPath,
      receipt_digest: receipt.digest,
      research_track: 'enterprise-agent-runtime',
      publication_id: 'publication_001'
    });
    expect(plan).toMatchObject({
      ingest_kind: 'publication_checkpoint', source_feedback_snapshot_digest: null,
      candidate_insight_digests: [], runtime_version: '0.2.0',
      record_operations: [{ record_type: 'publication_evidence' }],
      action: 'ingest_confirmed'
    });
    expect(plan.plan_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    const preview = await store.readText(`memory/ingests/${plan.ingest_id}/preview.md`);
    expect(preview).toContain('outcome_unknown');
    expect(preview).not.toContain('verified publication');
    await expect(store.resolveExistingArtifact(plan.source_artifact.relative_path)).resolves.toMatchObject({
      digest: plan.source_artifact.digest
    });
  });

  it('binds approval to exact Plan, Workspace, Domain, action, and expiry', async () => {
    const { service, receiptPath, receipt } = await ingestFixture();
    const plan = await service.planPublicationCheckpoint({
      receipt_path: receiptPath, receipt_digest: receipt.digest,
      research_track: 'enterprise-agent-runtime', publication_id: 'publication_001'
    });
    const approval = approveMemoryIngest(
      plan, 'human-reviewer', 600_000,
      new Date('2026-08-22T11:05:00.000Z'), () => 'approval_exact_001'
    );
    expect(approval).toMatchObject({
      ingest_plan_digest: plan.plan_digest,
      workspace_identity_digest: plan.workspace_identity_digest,
      target_domain: 'research-publishing', target_profile: 'research-publishing',
      approved_action: 'ingest_confirmed', approved_by: 'human-reviewer'
    });
    expect(approval.approval_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
