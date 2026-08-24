import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createWeeklyCandidateSet,
  createWeeklyResearchCycle,
  createWeeklyTopicSelection
} from '../../harnesses/research-publishing/core/research-program-contracts.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { PackageService } from '../../harnesses/research-publishing/core/package-service.js';
import { WeeklyPackageCompiler } from '../../harnesses/research-publishing/core/weekly-package-compiler.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import type { CompileWeeklyPackageInput } from '../../harnesses/research-publishing/core/types.js';
import { researchPackage } from '../fixtures/research-package.js';
import {
  weeklyCandidateBrief,
  weeklyCandidateSetInput,
  weeklyCycleInput
} from '../fixtures/research-program.js';

describe('WeeklyPackageCompiler', () => {
  it('compiles only the exact Human-selected Candidate Brief', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-weekly-compiler-')));
    const reviewBody = {
      schema_version: 'research-context-review/v2' as const,
      review_id: 'review_week_01', query_id: weeklyCycleInput.context_binding.query_id,
      query_plan_digest: weeklyCycleInput.context_binding.plan_digest,
      snapshot_digest: weeklyCycleInput.context_binding.snapshot_digest,
      selected_context_refs: weeklyCycleInput.context_binding.selected_context_refs,
      reviewer: 'human', reviewed_at: '2026-08-24T07:30:00.000Z'
    };
    const review = { ...reviewBody, review_digest: sha256(reviewBody) };
    const cycle = createWeeklyResearchCycle({
      ...weeklyCycleInput,
      context_binding: { ...weeklyCycleInput.context_binding, review_digest: review.review_digest }
    });
    const candidateSet = createWeeklyCandidateSet({
      ...weeklyCandidateSetInput,
      context_binding: cycle.context_binding,
      candidates: [weeklyCandidateBrief('a'), weeklyCandidateBrief('b')]
    });
    const selection = createWeeklyTopicSelection(candidateSet, {
      cycle_id: cycle.cycle_id, candidate_set_digest: candidateSet.candidate_set_digest,
      selected_brief_id: 'brief_b', selection_source: 'human_explicit', selected_by: 'human',
      selected_at: '2026-08-24T10:00:00.000Z'
    });
    await store.writeNew(`program/weeks/${cycle.cycle_id}/cycle.json`, cycle);
    await store.writeNew(`program/weeks/${cycle.cycle_id}/candidates.json`, candidateSet);
    await store.writeNew(`program/weeks/${cycle.cycle_id}/selection.json`, selection);
    await store.writeNew(`memory/queries-v2/${cycle.context_binding.query_id}/review.json`, review);

    const packageDraft: CompileWeeklyPackageInput['package'] = {
      ...researchPackage,
      status: 'draft',
      thesis: { ...researchPackage.thesis, claim_status: 'observed' },
      claims: researchPackage.claims.map((claim) => ({
        ...claim,
        claim_status: claim.claim_status === 'planned' ? 'planned' as const : 'observed' as const
      }))
    };
    const compiled = await new WeeklyPackageCompiler(store).compile({
      cycle_id: cycle.cycle_id, selected_brief_id: 'brief_b',
      candidate_set_digest: candidateSet.candidate_set_digest,
      selection_digest: selection.selection_digest,
      package: packageDraft
    });
    expect(compiled.topic).toBe(candidateSet.candidates[1]!.working_title);
    expect(compiled.thesis).toEqual({
      summary: candidateSet.candidates[1]!.thesis,
      claim_status: candidateSet.candidates[1]!.claim_status
    });
    expect(compiled.research_program_binding.selection_ref.digest).toBe(selection.selection_digest);
    expect(compiled.memory_context).toMatchObject({ status: 'applied', reviewer: 'human' });
    const packages = new PackageService(store, () => new Date('2026-08-24T11:00:00.000Z'));
    const built = await packages.buildPackage({
      schema_version: '1.0', candidate_id: 'candidate_week_01', title: compiled.topic,
      source_type: 'design', research_track: compiled.research_track.id,
      thesis_hint: compiled.thesis.summary, novelty_hint: 'Explicit weekly increment.',
      source_refs: ['source:test'], privacy: 'public', status: 'evidence_ready',
      captured_at: '2026-08-24T08:00:00.000Z'
    }, compiled);
    const reviewed = await packages.reviewPackage(built);
    expect(reviewed.report.gates).toEqual([
      'research_lineage', 'evidence', 'claim_boundary', 'privacy'
    ]);
  });

  it('rejects stale digests and never falls back to another Brief', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-weekly-compiler-stale-')));
    await expect(new WeeklyPackageCompiler(store).compile({
      cycle_id: 'missing_cycle', selected_brief_id: 'brief_b',
      candidate_set_digest: `sha256:${'a'.repeat(64)}`,
      selection_digest: `sha256:${'b'.repeat(64)}`,
      package: {} as never
    })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
  });
});
