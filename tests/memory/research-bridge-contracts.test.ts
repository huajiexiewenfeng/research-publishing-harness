import { describe, expect, it } from 'vitest';

import {
  createClaimProjection,
  createWeeklyResearchBridgeStatus,
  createWeeklyResearchIncrementBinding
} from '../../harnesses/research-publishing/core/research-bridge-contracts.js';

const digest = (char: string) => `sha256:${char.repeat(64)}` as const;
const ref = (path: string, char: string) => ({ path, digest: digest(char) });

const projectionInput = {
  projection_id: 'projection_week_01_2026',
  outcome_ref: ref('program/weeks/week_01_2026/outcome.json', 'a'),
  package_ref: ref('program/weeks/week_01_2026/package.json', 'b'),
  items: [{
    source_claim_ref: 'package:rcp_2026_001:claim:claim_verified',
    source_claim_id: 'claim_verified',
    statement_digest: digest('c'),
    source_status: 'validated' as const,
    candidate_claim_ref: 'claim-candidate:projection_week_01_2026:claim_verified',
    candidate_status: 'verified' as const,
    evidence_refs: ['package:rcp_2026_001:evidence:evidence_test'],
    projection_rule: 'package-to-memory-claim/v1' as const,
    loss_note: 'Package validation is preserved as a candidate verified status, not accepted truth.'
  }],
  projected_at: '2026-08-25T09:00:00.000Z'
};

describe('Research Bridge contracts', () => {
  it('creates an ordered candidate-only Claim Projection', () => {
    const projection = createClaimProjection(projectionInput);

    expect(projection.items[0]?.candidate_claim_ref)
      .toBe('claim-candidate:projection_week_01_2026:claim_verified');
    expect(projection.projection_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects hidden status strengthening', () => {
    expect(() => createClaimProjection({
      ...projectionInput,
      items: [{ ...projectionInput.items[0]!, candidate_status: 'inferred' as const }]
    })).toThrowError(/mapping|status|inferred/i);
  });

  it('binds the exact Outcome, Projection and working Increment revision', () => {
    const binding = createWeeklyResearchIncrementBinding({
      cycle_id: 'week_01_2026',
      outcome_ref: projectionInput.outcome_ref,
      claim_projection_ref: ref(
        'program/weeks/week_01_2026/research-bridge/claim-projection.json', 'd'
      ),
      track_id: 'enterprise-agent-runtime',
      increment_id: 'weekly_week_01_2026_outcome_abcdef123456',
      increment_ref: 'increment:enterprise-agent-runtime:weekly_week_01_2026_outcome_abcdef123456@1',
      increment_revision_ref: ref(
        'memory/increments/weekly_week_01_2026_outcome_abcdef123456/revisions/1/revision.json', 'e'
      ),
      bound_at: '2026-08-25T09:01:00.000Z'
    });

    expect(binding.binding_policy).toBe('one-outcome-one-increment/v1');
    expect(binding.track_id).toBe('enterprise-agent-runtime');
    expect(binding.binding_digest).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('requires complete Bridge status to contain both Expressions and Evidence refs', () => {
    expect(() => createWeeklyResearchBridgeStatus({
      cycle_id: 'week_01_2026',
      phase: 'complete',
      outcome_ref: projectionInput.outcome_ref,
      claim_projection_ref: null,
      increment_binding_ref: null,
      article_expression_ref: null,
      article_evidence_ref: null,
      single_expression_ref: null,
      single_evidence_ref: null,
      blocked_reason: null,
      updated_at: '2026-08-25T09:02:00.000Z'
    })).toThrowError(/complete/i);
  });

  it('requires blocked Bridge status to explain the failure', () => {
    expect(() => createWeeklyResearchBridgeStatus({
      cycle_id: 'week_01_2026',
      phase: 'blocked',
      outcome_ref: projectionInput.outcome_ref,
      claim_projection_ref: null,
      increment_binding_ref: null,
      article_expression_ref: null,
      article_evidence_ref: null,
      single_expression_ref: null,
      single_evidence_ref: null,
      blocked_reason: null,
      updated_at: '2026-08-25T09:02:00.000Z'
    })).toThrowError(/reason/i);
  });
});
