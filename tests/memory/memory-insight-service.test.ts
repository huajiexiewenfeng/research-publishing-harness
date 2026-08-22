import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryFeedbackService } from '../../harnesses/research-publishing/core/memory-feedback-service.js';
import { MemoryInsightService } from '../../harnesses/research-publishing/core/memory-insight-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-insight-'));
  const store = await WorkspaceStore.open(root);
  const receiptPath = 'receipts/receipt_insight_001.json';
  await store.writeNew(receiptPath, {
    receipt_id: 'receipt_insight_001', status: 'published', target_account: '@runtime_ai',
    public_evidence: { canonical_url: 'https://x.com/runtime_ai/article/1' }
  });
  const receipt = await store.resolveExistingArtifact(receiptPath);
  const feedback = new MemoryFeedbackService(store, { feedbackSnapshotId: () => 'feedback_insight_001' });
  const snapshot = await feedback.capture({
    receipt_path: receiptPath, receipt_digest: receipt.digest, publication_kind: 'x_article',
    public_url: 'https://x.com/runtime_ai/article/1', account: '@runtime_ai',
    observed_at: new Date('2026-08-22T11:00:00.000Z'), selection_actor: 'human-reviewer',
    selection_reason: 'Potential runtime counterexample',
    entries: [{ public_url: 'https://x.com/example/status/2', platform_id: '2', author: '@example',
      observed_text: 'Revocation may need its own contract.', observed_metrics: { likes: 2 } }]
  });
  const snapshotRef = await store.resolveExistingArtifact('feedback/feedback_insight_001/snapshot.json');
  const service = new MemoryInsightService(store, { proposalId: () => 'insight_001' });
  const input = {
    feedback_snapshot_path: 'feedback/feedback_insight_001/snapshot.json',
    feedback_snapshot_digest: snapshotRef.digest,
    research_track: 'enterprise-agent-runtime', insight_type: 'counterexample' as const,
    proposition: 'Revocation may require a separate runtime contract.',
    source_refs: [`feedback:${snapshot.feedback_snapshot_id}:1`],
    affected_claim_refs: ['claim_runtime_boundary'], evidence_strength: 'anecdotal' as const,
    confidence: 0.4, boundary_note: 'One public reply is not a benchmark.',
    alternative_explanations: ['The reply may refer to another runtime model.'],
    recommended_disposition: 'investigate' as const,
    created_by_skill: 'x-publishing-copilot' as const,
    basis: 'observed_text' as const
  };
  return { store, service, input };
}

describe('MemoryInsightService', () => {
  it('creates a bounded proposal and one immutable accepted Evidence Review', async () => {
    const { store, service, input } = await fixture();
    const proposal = await service.propose(input);
    expect(proposal).toMatchObject({
      proposal_id: 'insight_001', insight_type: 'counterexample',
      evidence_strength: 'anecdotal', confidence: 0.4
    });
    const review = await service.reviewInsight(proposal.proposal_id, {
      reviewed_by: 'human-reviewer', accepted: true,
      reason: 'Preserve as a research question, not a conclusion.',
      reviewed_at: new Date('2026-08-22T12:00:00.000Z')
    });
    expect(review).toMatchObject({ accepted: true, proposal_digest: proposal.proposal_digest });
    await expect(service.requireAccepted(proposal.proposal_id)).resolves.toEqual(proposal);
    await expect(service.reviewInsight(proposal.proposal_id, {
      reviewed_by: 'other', accepted: false, reason: 'changed', reviewed_at: new Date()
    })).rejects.toMatchObject({ code: 'ARTIFACT_EXISTS' });
    await expect(store.readJson('memory/insights/insight_001/review.json')).resolves.toEqual(review);
  });

  it('keeps rejected or modified proposals out of Ingest', async () => {
    const { store, service, input } = await fixture();
    const proposal = await service.propose(input);
    await service.reviewInsight(proposal.proposal_id, {
      reviewed_by: 'human-reviewer', accepted: true, reason: 'Investigate later.',
      reviewed_at: new Date('2026-08-22T12:00:00.000Z')
    });
    await store.replaceAtomic('memory/insights/insight_001/proposal.json', {
      ...proposal, proposition: 'Tampered conclusion.'
    });
    await expect(service.requireAccepted(proposal.proposal_id))
      .rejects.toMatchObject({ code: 'MEMORY_SOURCE_STALE' });
  });

  it('does not turn metrics-only signals into counterexamples or claims', async () => {
    const { service, input } = await fixture();
    await expect(service.propose({ ...input, basis: 'metrics_only' }))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(service.propose({ ...input, evidence_strength: 'reproducible' }))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
