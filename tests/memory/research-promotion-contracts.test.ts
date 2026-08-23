import { describe, expect, it } from 'vitest';

import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  createSemanticMemoryDelta,
  createSemanticPromotionReview
} from '../../harnesses/research-publishing/core/research-memory-contracts.js';

const digest = (character: string) => `sha256:${character.repeat(64)}` as const;

function deltaInput() {
  const targetContent = {
    claim_id: 'claim_runtime_boundary',
    statement: 'Deterministic access belongs in the Runtime.',
    claim_status: 'observed',
    canonical_claim_status: 'verified'
  } as const;
  return {
    delta_id: 'delta_runtime_001',
    increment_ref: 'increment:enterprise-agent-runtime:increment_runtime_001@1',
    base_catalog_digest: digest('a'),
    evidence_snapshot_refs: ['evidence:evidence_runtime_001'],
    proposed_operations: [{
      operation_id: 'op_claim_runtime_boundary',
      operation_type: 'add_record' as const,
      target_id: 'claim_runtime_boundary',
      record_type: 'claim_version' as const,
      target_content: targetContent,
      target_content_digest: sha256(targetContent),
      evidence_refs: ['evidence:evidence_runtime_001'],
      evidence_privacy_classification: 'internal' as const,
      target_privacy_classification: 'internal' as const,
      index_impact: ['mainline', 'history'] as const
    }],
    generated_by: 'research-publishing-harness',
    generated_at: '2026-08-23T03:00:00.000Z',
    policy_version: 'semantic-promotion/v1' as const
  };
}

describe('research promotion contracts', () => {
  it('creates a digest-bound Delta and records accepted and rejected review operations', () => {
    const delta = createSemanticMemoryDelta(deltaInput());
    expect(delta.delta_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    const review = createSemanticPromotionReview(delta, {
      review_id: 'review_runtime_001',
      accepted_operation_ids: ['op_claim_runtime_boundary'],
      rejected_operation_ids: [], rejection_reasons: [], operation_replacements: [],
      reviewer: 'human-reviewer', reviewed_at: '2026-08-23T03:05:00.000Z'
    });
    expect(review).toMatchObject({
      delta_id: delta.delta_id, delta_digest: delta.delta_digest,
      accepted_operation_ids: ['op_claim_runtime_boundary']
    });
  });

  it('cannot strengthen a claim during review without new Evidence', () => {
    const delta = createSemanticMemoryDelta(deltaInput());
    expect(() => createSemanticPromotionReview(delta, {
      review_id: 'review_runtime_002',
      accepted_operation_ids: ['op_claim_runtime_boundary'],
      rejected_operation_ids: [], rejection_reasons: [],
      operation_replacements: [{
        operation_id: 'op_claim_runtime_boundary', claim_status: 'verified',
        evidence_refs: ['evidence:evidence_runtime_001']
      }],
      reviewer: 'human-reviewer', reviewed_at: '2026-08-23T03:05:00.000Z'
    })).toThrowError(/strengthen/i);
  });

  it('rejects content digest drift, privacy downgrade, and incomplete review partitions', () => {
    const input = deltaInput();
    expect(() => createSemanticMemoryDelta({
      ...input,
      proposed_operations: [{ ...input.proposed_operations[0]!, target_content_digest: digest('f') }]
    })).toThrowError(/digest/i);
    expect(() => createSemanticMemoryDelta({
      ...input,
      proposed_operations: [{
        ...input.proposed_operations[0]!,
        evidence_privacy_classification: 'restricted', target_privacy_classification: 'public'
      }]
    })).toThrowError(/privacy/i);
    const delta = createSemanticMemoryDelta(input);
    expect(() => createSemanticPromotionReview(delta, {
      review_id: 'review_runtime_003', accepted_operation_ids: [], rejected_operation_ids: [],
      rejection_reasons: [], operation_replacements: [], reviewer: 'human-reviewer',
      reviewed_at: '2026-08-23T03:05:00.000Z'
    })).toThrowError(/partition/i);
  });
});
