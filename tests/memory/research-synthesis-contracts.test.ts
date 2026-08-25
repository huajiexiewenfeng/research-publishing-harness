import { describe, expect, it } from 'vitest';

import {
  createResearchContinuationProposal,
  createResearchSynthesisAttempt,
  createResearchSynthesisRevision,
  createSynthesisInputSnapshot
} from '../../harnesses/research-publishing/core/research-synthesis-contracts.js';
import type {
  ResearchSynthesisCandidateV1,
  SynthesisDisposition
} from '../../harnesses/research-publishing/core/research-synthesis-types.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';

const digest = (char: string) => `sha256:${char.repeat(64)}` as const;
const ref = (path: string, char: string) => ({ path, digest: digest(char) });

const snapshotInput = {
  snapshot_id: 'snapshot_week_01',
  trigger: { kind: 'weekly_outcome' as const, reason: 'A completed weekly publication.' },
  source_items: [{
    ref: ref('program/weeks/week_01/outcome.json', 'a'),
    role: 'outcome' as const,
    media_type: 'application/json',
    privacy_classification: 'internal' as const,
    content: '{"outcome":"complete"}',
    original_chars: 22,
    included_chars: 22,
    truncated: false
  }],
  evidence_refs: ['evidence:evidence_week_01_article_terminal'],
  prior_synthesis_ref: null,
  runtime_context: {
    status: 'unavailable' as const,
    query_plan_ref: null,
    context_snapshot_ref: null,
    review_ref: null,
    selected_context_refs: [],
    limitation: 'Historical research context was not loaded.'
  },
  created_at: '2026-08-25T10:00:00.000Z'
};

function candidate(disposition: SynthesisDisposition): ResearchSynthesisCandidateV1 {
  const material = disposition === 'material_update' || disposition === 'conflicting_evidence';
  return {
    schema_version: 'research-synthesis-candidate/v1',
    disposition,
    insights: material ? [{
      insight_id: 'insight_boundary_01',
      kind: disposition === 'conflicting_evidence' ? 'contradiction' : 'architecture_connection',
      epistemic_status: 'inference',
      statement: 'Publication closure and semantic promotion require separate authority.',
      rationale: 'The Outcome is factual while accepted semantic memory remains Human-gated.',
      evidence_refs: ['evidence:evidence_week_01_article_terminal'],
      prior_semantic_refs: [],
      confidence: 0.76,
      confidence_rationale: 'Supported by the bounded Outcome and terminal Evidence.',
      falsification_condition: 'A safe automatic promotion path demonstrates equivalent authority controls.',
      missing_evidence: ['Cross-project production evidence is still missing.'],
      potential_mainline_impact: 'May refine the enterprise Agent Runtime governance boundary.'
    }] : [],
    summary: material ? 'A source-backed research change exists.' : 'No supported change is present.',
    limitations: ['Historical research context was not loaded.'],
    memory_context_status: 'unavailable',
    generator_provenance: {
      provider: 'fake-ai',
      model: 'fixture-v1',
      invocation_id: 'invocation_week_01'
    }
  };
}

function revisionInput(disposition: SynthesisDisposition) {
  const { schema_version: _schema, ...content } = candidate(disposition);
  void _schema;
  return {
    synthesis_id: 'synthesis_week_01',
    revision: 1,
    previous_revision_ref: null,
    input_snapshot_ref: ref('research/synthesis-inputs/snapshot_week_01.json', 'b'),
    ...content,
    recorded_at: '2026-08-25T10:01:00.000Z'
  };
}

describe('Research Synthesis contracts', () => {
  const snapshot = createSynthesisInputSnapshot(snapshotInput);

  it.each(['no_material_change', 'insufficient_evidence'] as const)(
    'accepts honest %s with zero Insights',
    (disposition) => {
      expect(createResearchSynthesisRevision(revisionInput(disposition), snapshot).insights)
        .toEqual([]);
    }
  );

  it.each(['material_update', 'conflicting_evidence'] as const)(
    'requires evidence-backed Insights for %s',
    (disposition) => {
      expect(() => createResearchSynthesisRevision({
        ...revisionInput(disposition),
        insights: []
      }, snapshot)).toThrowError(/Insight/i);
    }
  );

  it('rejects hidden reasoning and unknown Candidate fields', () => {
    expect(() => validateContract('research-synthesis-candidate', {
      ...candidate('no_material_change'),
      chain_of_thought: 'private reasoning'
    })).toThrowError(/additional properties/i);
  });

  it('requires every Insight Evidence ref to resolve inside the frozen Snapshot', () => {
    const value = candidate('material_update');
    expect(() => createResearchSynthesisRevision({
      ...revisionInput('material_update'),
      insights: [{ ...value.insights[0]!, evidence_refs: ['evidence:outside_snapshot'] }]
    }, snapshot)).toThrowError(/Evidence ref/i);
  });

  it('records rejected attempts without raw Candidate content', () => {
    const attempt = createResearchSynthesisAttempt({
      synthesis_id: 'synthesis_week_01',
      attempt_ordinal: 1,
      input_snapshot_ref: revisionInput('no_material_change').input_snapshot_ref,
      candidate_digest: digest('c'),
      status: 'rejected',
      error_codes: ['CONTRACT_INVALID'],
      attempted_at: '2026-08-25T10:01:00.000Z'
    });
    expect(attempt.status).toBe('rejected');
    expect(JSON.stringify(attempt)).not.toContain('private reasoning');
  });

  it('allows zero or four non-authoritative continuation candidates', () => {
    const synthesisRef = ref(
      'research/syntheses/synthesis_week_01/revisions/1/revision.json', 'd'
    );
    const candidates = Array.from({ length: 4 }, (_, index) => ({
      candidate_id: `continuation_${index + 1}`,
      kind: 'run_experiment' as const,
      proposal: `Run bounded experiment ${index + 1}.`,
      rationale: 'The evidence gap is explicit.',
      origin_refs: ['insight:insight_boundary_01'],
      uncertainties: ['Production impact remains unknown.']
    }));
    expect(createResearchContinuationProposal({
      proposal_id: 'proposal_empty', synthesis_ref: synthesisRef,
      candidates: [], proposed_at: '2026-08-25T10:02:00.000Z'
    }, []).candidates).toEqual([]);
    expect(createResearchContinuationProposal({
      proposal_id: 'proposal_four', synthesis_ref: synthesisRef,
      candidates, proposed_at: '2026-08-25T10:02:00.000Z'
    }, ['insight:insight_boundary_01']).candidates).toHaveLength(4);
  });

  it('rejects a Snapshot that exceeds the fixed item budget', () => {
    expect(() => createSynthesisInputSnapshot({
      ...snapshotInput,
      source_items: Array.from({ length: 25 }, (_, index) => ({
        ...snapshotInput.source_items[0]!,
        ref: ref(`articles/item-${index}.md`, 'e')
      }))
    })).toThrowError(/budget/i);
  });
});
