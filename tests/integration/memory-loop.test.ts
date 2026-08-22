import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryFeedbackService } from '../../harnesses/research-publishing/core/memory-feedback-service.js';
import { MemoryIngestService } from '../../harnesses/research-publishing/core/memory-ingest-service.js';
import { MemoryInsightService } from '../../harnesses/research-publishing/core/memory-insight-service.js';
import { MemoryQueryService } from '../../harnesses/research-publishing/core/memory-query-service.js';
import type { RuntimeContextResult } from '../../harnesses/research-publishing/core/memory-types.js';
import { PackageService } from '../../harnesses/research-publishing/core/package-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';
import { FakeMemoryIngestRuntime } from '../memory/memory-ingest-runtime.fake.js';

const TRACK = 'enterprise-agent-runtime';
const PROFILE_DIGEST = `sha256:${'b'.repeat(64)}` as const;
const SCP_DIGEST = `sha256:${'c'.repeat(64)}` as const;

class MutableQueryRuntime {
  result: RuntimeContextResult = {
    status: 'loaded', runtime_version: '0.2.0', excluded_count: 0, truncated_count: 0,
    items: [{
      path: `domains/research-publishing/tracks/${TRACK}/publications/prior.md`,
      checksum: `sha256:${'a'.repeat(64)}`, content: 'Prior evidence supports an explicit Runtime boundary.',
      instruction_policy: 'data_only', sanitized: false, risk_flags: []
    }]
  };

  async query(): Promise<RuntimeContextResult> {
    return this.result;
  }
}

describe('V2.2 governed research memory loop', () => {
  it('carries reviewed memory through Package 1.1, two approved ingests, resume, and the next Query', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-memory-loop-'));
    const store = await WorkspaceStore.open(root);
    const queryRuntime = new MutableQueryRuntime();
    let queryCounter = 0;
    const query = new MemoryQueryService(store, queryRuntime, {
      queryId: () => `query_loop_${++queryCounter}`,
      runId: () => `run_loop_${queryCounter}`,
      snapshotId: () => `snapshot_loop_${queryCounter}`,
      now: () => new Date('2026-08-22T10:00:00.000Z')
    });
    const queryPlan = await query.planQuery({
      research_track: TRACK, purpose: 'candidate_enrichment', query_terms: ['runtime boundary'],
      context_budget: { max_items: 4, max_chars: 8_000, max_item_chars: 2_000 },
      profile_digest: PROFILE_DIGEST, scp_digest: SCP_DIGEST
    });
    const context = await query.executeQuery(queryPlan.query_id);
    const selectedRef = context.items[0]!.context_ref;
    await query.reviewContext(queryPlan.query_id, {
      selected_refs: [selectedRef], reviewed_by: 'human-reviewer',
      reviewed_at: new Date('2026-08-22T10:05:00.000Z')
    });
    const draft = await query.bindPackage(queryPlan.query_id, {
      ...researchPackage,
      schema_version: '1.1', package_id: 'package_memory_loop', status: 'draft',
      evidence: [{ ...researchPackage.evidence[0], source_ref: selectedRef }],
      memory_context: {
        query_plan_digest: null, context_snapshot_digest: null, context_refs: [],
        status: 'not_configured', reviewer: null, reviewed_at: null
      }
    });
    const packages = new PackageService(store, () => new Date('2026-08-22T10:10:00.000Z'));
    const candidate = {
      schema_version: '1.0', candidate_id: 'candidate_memory_loop', title: 'Governed memory loop',
      source_type: 'design', research_track: TRACK,
      thesis_hint: 'Memory must remain evidence-backed.', source_refs: ['https://example.com/memory-loop'],
      privacy: 'public', status: 'idea', captured_at: '2026-08-22T10:00:00.000Z'
    } as const;
    await packages.captureCandidate(candidate);
    const qualified = await packages.qualifyCandidate(candidate.candidate_id, {
      novelty_hint: 'The next Package can cite only reviewed context.'
    });
    const frozen = await packages.freezePackage((await packages.reviewPackage(
      await packages.buildPackage(qualified, draft)
    )).package);
    expect(frozen.package).toMatchObject({
      schema_version: '1.1', status: 'frozen',
      memory_context: { status: 'applied', context_refs: [selectedRef] }
    });

    const publicationReceiptPath = 'receipts/publication_loop.json';
    await store.writeNew(publicationReceiptPath, {
      receipt_id: 'publication_loop', status: 'finalized', target_account: '@runtime_ai',
      public_result: { root_url: 'https://x.com/runtime_ai/status/100' }
    });
    const publicationReceipt = await store.resolveExistingArtifact(publicationReceiptPath);
    const ingestRuntime = new FakeMemoryIngestRuntime();
    let ingestCounter = 0;
    let approvalCounter = 0;
    let receiptCounter = 0;
    const ingest = new MemoryIngestService(store, ingestRuntime, {
      profile_path: resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml'),
      mapping_path: resolve('harnesses/research-publishing/memory/ingest-mapping.yml'),
      scp_paths: [
        resolve('harnesses/research-publishing/memory/scp.yml'),
        resolve('skills/article-publishing-copilot/scp.yml'),
        resolve('skills/x-publishing-copilot/scp.yml')
      ]
    }, {
      ingestId: () => `ingest_loop_${++ingestCounter}`,
      approvalId: () => `approval_loop_${++approvalCounter}`,
      receiptId: () => `memory_receipt_loop_${++receiptCounter}`,
      now: () => new Date('2026-08-22T11:00:00.000Z')
    });
    const checkpointPlan = await ingest.planPublicationCheckpoint({
      receipt_path: publicationReceiptPath, receipt_digest: publicationReceipt.digest,
      research_track: TRACK, publication_id: 'publication_loop'
    });
    const checkpointApproval = await ingest.approve(checkpointPlan.ingest_id, 'human-reviewer', 600_000);
    await expect(ingest.execute(checkpointPlan.ingest_id, checkpointApproval)).resolves.toMatchObject({
      status: 'succeeded', resume_cursor: null
    });

    const feedbackService = new MemoryFeedbackService(store, {
      feedbackSnapshotId: () => 'feedback_loop'
    });
    const feedback = await feedbackService.capture({
      receipt_path: publicationReceiptPath, receipt_digest: publicationReceipt.digest,
      publication_kind: 'x_thread', public_url: 'https://x.com/runtime_ai/status/100',
      account: '@runtime_ai', observed_at: new Date('2026-08-22T12:00:00.000Z'),
      selection_actor: 'human-reviewer', selection_reason: 'Preserve a concrete counterexample.',
      entries: [{
        public_url: 'https://x.com/peer/status/101', platform_id: '101', author: '@peer',
        observed_text: 'A crash between registration and state persistence can duplicate an index entry.',
        observed_metrics: { replies: 2 }
      }]
    });
    const feedbackPath = `feedback/${feedback.feedback_snapshot_id}/snapshot.json`;
    const feedbackArtifact = await store.resolveExistingArtifact(feedbackPath);
    const insights = new MemoryInsightService(store, { proposalId: () => 'insight_loop' });
    const insight = await insights.propose({
      feedback_snapshot_path: feedbackPath,
      feedback_snapshot_digest: feedbackArtifact.digest,
      basis: 'observed_text', research_track: TRACK, insight_type: 'counterexample',
      proposition: 'Artifact registration recovery needs an idempotency contract.',
      source_refs: ['feedback:feedback_loop:1'], affected_claim_refs: [],
      evidence_strength: 'anecdotal', confidence: 0.4,
      boundary_note: 'One public reply is not proof of a production failure.',
      alternative_explanations: ['The runtime may deduplicate at a later version.'],
      recommended_disposition: 'investigate', created_by_skill: 'x-publishing-copilot'
    });
    await insights.reviewInsight(insight.proposal_id, {
      reviewed_by: 'human-reviewer', accepted: true,
      reason: 'Retain as a candidate research question, not a verified conclusion.',
      reviewed_at: new Date('2026-08-22T12:05:00.000Z')
    });
    const feedbackPlan = await ingest.planFeedbackInsight({
      receipt_path: publicationReceiptPath, receipt_digest: publicationReceipt.digest,
      feedback_snapshot_path: feedbackPath,
      feedback_snapshot_file_digest: feedbackArtifact.digest,
      proposal_ids: [insight.proposal_id], research_track: TRACK,
      publication_id: 'publication_loop', feedback_id: feedback.feedback_snapshot_id
    });
    const feedbackApproval = await ingest.approve(feedbackPlan.ingest_id, 'human-reviewer', 600_000);
    ingestRuntime.failOnce('appendLog');
    await expect(ingest.execute(feedbackPlan.ingest_id, feedbackApproval)).resolves.toMatchObject({
      status: 'partial', resume_cursor: 'append_log'
    });
    const writeCountBeforeResume = ingestRuntime.count('writeRecord');
    await expect(ingest.resume(feedbackPlan.ingest_id, feedbackApproval)).resolves.toMatchObject({
      status: 'succeeded', resume_cursor: null
    });
    expect(ingestRuntime.count('writeRecord')).toBe(writeCountBeforeResume);

    const insightPath = `domains/research-publishing/tracks/${TRACK}/insights/${insight.proposal_id}.md`;
    queryRuntime.result = {
      status: 'loaded', runtime_version: '0.2.0', excluded_count: 0, truncated_count: 0,
      items: [{
        path: insightPath, checksum: insight.proposal_digest,
        content: insight.proposition, instruction_policy: 'data_only', sanitized: false, risk_flags: []
      }]
    };
    const nextPlan = await query.planQuery({
      research_track: TRACK, purpose: 'feedback_followup', query_terms: ['registration recovery'],
      context_budget: { max_items: 4, max_chars: 8_000, max_item_chars: 2_000 },
      profile_digest: PROFILE_DIGEST, scp_digest: SCP_DIGEST
    });
    const nextContext = await query.executeQuery(nextPlan.query_id);
    expect(nextContext.items).toEqual([
      expect.objectContaining({
        relative_path: insightPath,
        classification: 'data_only',
        excerpt: insight.proposition
      })
    ]);
  });
});
