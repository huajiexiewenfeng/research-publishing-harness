import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { createPublicationExpression } from '../../harnesses/research-publishing/core/research-memory-contracts.js';
import { ResearchEvidenceService } from '../../harnesses/research-publishing/core/research-evidence-service.js';
import { ResearchFlywheelService } from '../../harnesses/research-publishing/core/research-flywheel-service.js';
import { ResearchIncrementService } from '../../harnesses/research-publishing/core/research-increment-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const workspaceDigest = `sha256:${'a'.repeat(64)}` as const;

async function flywheelFixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-flywheel-'));
  const store = await WorkspaceStore.open(root);
  await store.writeNew('packages/flywheel.md', '# Flywheel source\n');
  const initial = await new ResearchEvidenceService(store, {
    evidenceSnapshotId: () => 'evidence_flywheel_initial', now: () => new Date('2026-08-23T03:00:00.000Z')
  }).capture({
    increment_id: 'increment_flywheel', increment_revision: 1,
    capture_event: 'research_package_finalized', capture_kind: 'automatic_terminal',
    workspace_identity_digest: workspaceDigest,
    artifacts: [{
      workspace_relative_path: 'packages/flywheel.md', role: 'research_package', media_type: 'text/markdown',
      canonical: true, privacy_classification: 'internal'
    }], source_refs: ['package:flywheel'], privacy_classification: 'internal'
  });
  await new ResearchIncrementService(store, {
    lifecycleEventId: () => 'event_flywheel_working', now: () => new Date('2026-08-23T03:01:00.000Z')
  }).assemble({
    increment_id: 'increment_flywheel', revision: 1, title: 'Runtime boundary',
    research_question: 'Where should Skill memory end?', thesis: 'Deterministic access belongs in the Runtime.',
    summary: 'A governed Skill and Runtime boundary.', document_manifest_refs: [], tags: ['runtime'],
    claim_refs: ['claim:runtime-boundary@1'], decision_refs: [], boundary_refs: [],
    open_question_refs: ['question:trace-contract@1'], source_refs: ['package:flywheel'],
    evidence_snapshot_refs: [`evidence:${initial.evidence_snapshot_id}`], predecessor_refs: []
  });
  await store.replaceAtomic('memory/increments/increment_flywheel/status.json', {
    schema_version: 'research-increment-status/v1', increment_id: 'increment_flywheel',
    track_id: 'enterprise-agent-runtime', state: 'accepted', latest_revision: 1,
    latest_revision_ref: 'increment:enterprise-agent-runtime:increment_flywheel@1',
    latest_event_ref: `lifecycle:event_flywheel_accepted@${sha256('accepted')}`,
    latest_event_seq: 2, updated_at: '2026-08-23T03:02:00.000Z'
  });
  const expression = createPublicationExpression({
    expression_id: 'expression_flywheel', increment_ref: 'increment:enterprise-agent-runtime:increment_flywheel@1',
    channel: 'x_thread', language: 'en', derivation_type: 'adaptation',
    claim_refs: ['claim:runtime-boundary@1'], visual_refs: [], evidence_snapshot_refs: ['evidence:evidence_flywheel_initial'],
    intended_content: {
      approved_plan_ref: 'x/flywheel/plan.json', approved_plan_digest: sha256('plan'),
      local_content_path: 'articles/flywheel.md', content_digest: sha256('content'),
      expected_item_order: [1, 2], link_refs: [], visual_refs: []
    },
    observed_content: {
      source: 'public_page', public_url: 'https://x.com/runtime/status/1001', platform_ids: ['1001', '1002'],
      observed_digest: sha256('observed'), actual_item_order: [1, 2], media_verification: 'matched',
      link_verification: 'matched', missing_content: [], unexpected_content: [], mismatches: []
    },
    verification_level: 'public_verified', platform_refs: ['https://x.com/runtime/status/1001', '1001', '1002'],
    publication_receipt_ref: 'receipt:receipts/flywheel.json', published_at: '2026-08-23T03:03:00.000Z'
  });
  await store.writeNew('receipts/flywheel-expression.json', expression);
  await store.writeNew('receipts/flywheel.json', { receipt_id: 'receipt_flywheel', status: 'finalized' });
  const publication = await new ResearchEvidenceService(store, {
    evidenceSnapshotId: () => 'evidence_flywheel_publication', now: () => new Date('2026-08-23T03:04:00.000Z')
  }).capture({
    increment_id: 'increment_flywheel', increment_revision: 1,
    capture_event: 'publication_receipt_terminal', capture_kind: 'automatic_terminal',
    workspace_identity_digest: workspaceDigest,
    artifacts: [
      { workspace_relative_path: 'receipts/flywheel-expression.json', role: 'publication_expression', media_type: 'application/json', canonical: true, privacy_classification: 'internal' },
      { workspace_relative_path: 'receipts/flywheel.json', role: 'publication_receipt', media_type: 'application/json', canonical: true, privacy_classification: 'internal' }
    ], source_refs: ['receipt:flywheel'], privacy_classification: 'internal'
  });
  return { store, publication };
}

describe('ResearchFlywheelService', () => {
  it('proposes publication attachment and lifecycle operations but never approves them', async () => {
    const { store, publication } = await flywheelFixture();
    const service = new ResearchFlywheelService(store, {
      deltaId: () => 'delta_flywheel_publication', lifecycleEventId: () => 'event_flywheel_published',
      now: () => new Date('2026-08-23T03:05:00.000Z')
    });
    const delta = await service.proposeFromEvidence(publication.evidence_snapshot_id);
    expect(delta.proposed_operations.map((operation) => operation.operation_type)).toEqual([
      'attach_publication', 'change_lifecycle'
    ]);
    expect(delta.proposed_operations[1]?.target_content).toMatchObject({
      semantic_record: { event_type: 'publication_attached', resulting_state: 'published' },
      publication_verification_strength: 'public_verified',
      refs: { publication_receipt_ref: expressionReceiptRef() }
    });
    await expect(store.exists('memory/reviews/review_flywheel/review.json')).resolves.toBe(false);
    await expect(store.exists('memory/promotions/delta_flywheel_publication/approval.json')).resolves.toBe(false);
  });

  it('proposes data-only next questions with limitations', async () => {
    const { store } = await flywheelFixture();
    const questions = await new ResearchFlywheelService(store).proposeNextQuestions(
      'increment:enterprise-agent-runtime:increment_flywheel@1'
    );
    expect(questions[0]).toMatchObject({
      data_classification: 'data_only', evidence_strength: 'anecdotal'
    });
    expect(questions[0]?.limitations).not.toEqual([]);
  });
});

function expressionReceiptRef(): string {
  return 'receipt:receipts/flywheel.json';
}
