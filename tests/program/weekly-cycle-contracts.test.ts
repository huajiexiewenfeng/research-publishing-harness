import { describe, expect, it } from 'vitest';

import {
  createWeeklyCandidateSet,
  createWeeklyCycleCancellation,
  createWeeklyCycleStatus,
  createWeeklyResearchCycle,
  createWeeklyTopicSelection
} from '../../harnesses/research-publishing/core/research-program-contracts.js';
import {
  weeklyCandidateBrief,
  weeklyCandidateSetInput,
  weeklyCycleInput
} from '../fixtures/research-program.js';

describe('weekly research cycle contracts', () => {
  it('requires two or three Candidate Briefs', () => {
    expect(() => createWeeklyCandidateSet({
      ...weeklyCandidateSetInput,
      candidates: [weeklyCandidateBrief('a')]
    })).toThrowError(/two or three/);
    expect(() => createWeeklyCandidateSet({
      ...weeklyCandidateSetInput,
      candidates: ['a', 'b', 'c', 'd'].map(weeklyCandidateBrief)
    })).toThrowError(/two or three/);
  });

  it('binds a Human-reviewed Runtime Context rather than raw model text', () => {
    expect(() => createWeeklyResearchCycle({
      ...weeklyCycleInput,
      context_binding: {
        ...weeklyCycleInput.context_binding,
        review_digest: null
      } as unknown as typeof weeklyCycleInput.context_binding
    })).toThrowError(/review digest/);
  });

  it('does not mark empty Context as applied', () => {
    expect(() => createWeeklyResearchCycle({
      ...weeklyCycleInput,
      context_binding: {
        ...weeklyCycleInput.context_binding,
        query_status: 'empty',
        selected_context_refs: [],
        application_status: 'applied'
      }
    })).toThrowError(/cannot be applied/);
  });

  it('requires different Topic revisions and stable Brief ids', () => {
    const duplicate = weeklyCandidateBrief('a');
    expect(() => createWeeklyCandidateSet({
      ...weeklyCandidateSetInput,
      candidates: [duplicate, { ...weeklyCandidateBrief('b'), topic_ref: duplicate.topic_ref }]
    })).toThrowError(/Topic refs/);
  });

  it('rejects agent or implicit Topic selection provenance', () => {
    const candidateSet = createWeeklyCandidateSet(weeklyCandidateSetInput);
    expect(() => createWeeklyTopicSelection(candidateSet, {
      cycle_id: candidateSet.cycle_id,
      candidate_set_digest: candidateSet.candidate_set_digest,
      selected_brief_id: 'brief_a',
      selected_by: 'codex',
      selection_source: 'agent_inferred',
      selected_at: '2026-08-24T09:00:00.000Z'
    } as never)).toThrowError(/human_explicit/);
  });

  it('binds the exact Candidate Set and Human-named Brief deterministically', () => {
    const candidateSet = createWeeklyCandidateSet(weeklyCandidateSetInput);
    const selection = createWeeklyTopicSelection(candidateSet, {
      cycle_id: candidateSet.cycle_id,
      candidate_set_digest: candidateSet.candidate_set_digest,
      selected_brief_id: 'brief_b',
      selected_by: 'human',
      selection_source: 'human_explicit',
      selected_at: '2026-08-24T10:00:00.000Z'
    });
    expect(selection.selected_brief_id).toBe('brief_b');
    expect(createWeeklyTopicSelection(candidateSet, {
      cycle_id: candidateSet.cycle_id,
      candidate_set_digest: candidateSet.candidate_set_digest,
      selected_brief_id: 'brief_b',
      selected_by: 'human',
      selection_source: 'human_explicit',
      selected_at: '2026-08-24T10:00:00.000Z'
    })).toEqual(selection);
  });

  it('requires status refs that match the projected phase', () => {
    const cycle = createWeeklyResearchCycle(weeklyCycleInput);
    expect(() => createWeeklyCycleStatus({
      cycle_ref: {
        path: `program/weeks/${cycle.cycle_id}/cycle.json`,
        digest: cycle.cycle_digest
      },
      phase: 'topic_selected',
      candidate_set_ref: null,
      selection_ref: null,
      cancellation_ref: null,
      package_ref: null,
      article_ref: null,
      bundle_ref: null,
      outcome_ref: null,
      blocked_reason: null,
      updated_at: '2026-08-24T10:00:00.000Z'
    })).toThrowError(/topic_selected/);
  });

  it('creates an exact cancellation event from Cycle and Selection refs', () => {
    const cycle = createWeeklyResearchCycle(weeklyCycleInput);
    const candidateSet = createWeeklyCandidateSet(weeklyCandidateSetInput);
    const selection = createWeeklyTopicSelection(candidateSet, {
      cycle_id: cycle.cycle_id,
      candidate_set_digest: candidateSet.candidate_set_digest,
      selected_brief_id: 'brief_b',
      selected_by: 'human',
      selection_source: 'human_explicit',
      selected_at: '2026-08-24T10:00:00.000Z'
    });
    const cancellation = createWeeklyCycleCancellation(cycle, selection, {
      cycle_id: cycle.cycle_id,
      confirmed_selection_digest: selection.selection_digest,
      reason: 'Selected evidence did not survive review.',
      cancelled_by: 'human',
      cancelled_at: '2026-08-24T11:00:00.000Z'
    });
    expect(cancellation).toMatchObject({
      cancellation_id: `${cycle.cycle_id}_cancellation`,
      reason: 'Selected evidence did not survive review.'
    });
  });
});
