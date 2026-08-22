import { describe, expect, it } from 'vitest';

import { MemoryFeedbackService } from '../../harnesses/research-publishing/core/memory-feedback-service.js';
import { MemoryInsightService } from '../../harnesses/research-publishing/core/memory-insight-service.js';
import { ingestFixture } from '../memory/memory-ingest-fixture.js';

describe('feedback insight ingest integration', () => {
  it('ingests only a Human-selected snapshot and accepted Candidate Insight', async () => {
    const { store, service, receiptPath } = await ingestFixture();
    await store.replaceAtomic(receiptPath, {
      receipt_id: 'publication_001', status: 'finalized', target_account: '@runtime_ai',
      public_result: { root_url: 'https://x.com/runtime_ai/status/1' }
    });
    const finalReceipt = await store.resolveExistingArtifact(receiptPath);
    const feedbackService = new MemoryFeedbackService(store, { feedbackSnapshotId: () => 'feedback_ingest_001' });
    const feedback = await feedbackService.capture({
      receipt_path: receiptPath, receipt_digest: finalReceipt.digest, publication_kind: 'x_thread',
      public_url: 'https://x.com/runtime_ai/status/1', account: '@runtime_ai',
      observed_at: new Date('2026-08-22T12:00:00.000Z'), selection_actor: 'human-reviewer',
      selection_reason: 'Runtime counterexample', entries: [{
        public_url: 'https://x.com/example/status/2', platform_id: '2', author: '@example',
        observed_text: 'Revocation deserves its own contract.', observed_metrics: { replies: 1 }
      }]
    });
    const feedbackPath = `feedback/${feedback.feedback_snapshot_id}/snapshot.json`;
    const feedbackArtifact = await store.resolveExistingArtifact(feedbackPath);
    const insightService = new MemoryInsightService(store, { proposalId: () => 'insight_ingest_001' });
    const insight = await insightService.propose({
      feedback_snapshot_path: feedbackPath, feedback_snapshot_digest: feedbackArtifact.digest,
      research_track: 'enterprise-agent-runtime', insight_type: 'counterexample',
      proposition: 'Revocation may need a separate runtime contract.',
      source_refs: [`feedback:${feedback.feedback_snapshot_id}:1`], affected_claim_refs: [],
      evidence_strength: 'anecdotal', confidence: 0.4,
      boundary_note: 'A reply is not a benchmark.', alternative_explanations: ['Different runtime model.'],
      recommended_disposition: 'investigate', created_by_skill: 'x-publishing-copilot', basis: 'observed_text'
    });
    await insightService.reviewInsight(insight.proposal_id, {
      reviewed_by: 'human-reviewer', accepted: true, reason: 'Preserve as candidate only.',
      reviewed_at: new Date('2026-08-22T12:30:00.000Z')
    });

    const plan = await service.planFeedbackInsight({
      receipt_path: receiptPath, receipt_digest: finalReceipt.digest,
      feedback_snapshot_path: feedbackPath, feedback_snapshot_file_digest: feedbackArtifact.digest,
      proposal_ids: [insight.proposal_id], research_track: 'enterprise-agent-runtime',
      publication_id: 'publication_001', feedback_id: feedback.feedback_snapshot_id
    });
    expect(plan).toMatchObject({
      ingest_kind: 'feedback_insight', source_feedback_snapshot_digest: feedback.snapshot_digest,
      candidate_insight_digests: [insight.proposal_digest]
    });
    expect(plan.record_operations.map((operation) => operation.record_type)).toEqual([
      'feedback_snapshot', 'candidate_insight'
    ]);
    const approval = await service.approve(plan.ingest_id, 'human-reviewer', 600_000);
    await expect(service.execute(plan.ingest_id, approval)).resolves.toMatchObject({ status: 'succeeded' });
  });
});
