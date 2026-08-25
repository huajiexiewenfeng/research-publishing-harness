import { describe, expect, it } from 'vitest';

import { ResearchSynthesisService } from '../../harnesses/research-publishing/core/research-synthesis-service.js';
import {
  createResearchSynthesisFixture,
  synthesisCandidate
} from '../fixtures/research-synthesis.js';

async function tree(store: Awaited<ReturnType<typeof createResearchSynthesisFixture>>['store'], root: string) {
  const output: string[] = [];
  for (const entry of await store.list(root)) {
    output.push(entry.relative_path);
    if (entry.kind === 'directory') output.push(...await tree(store, entry.relative_path));
  }
  return output;
}

describe('Phase 4 research partner loop', () => {
  it('closes publication and records an honest Fake-AI material checkpoint', async () => {
    const fixture = await createResearchSynthesisFixture({ loaded_query: true });
    const synthesis = new ResearchSynthesisService(fixture.store);
    const roadmapsBefore = await tree(fixture.store, 'program/roadmaps');
    const snapshot = await synthesis.plan(fixture.input);
    const revision = await synthesis.record({
      synthesis_id: 'synthesis_week_01',
      snapshot_id: snapshot.snapshot_id,
      candidate: synthesisCandidate('material_update', 'loaded'),
      recorded_at: '2026-08-25T11:05:00.000Z'
    });
    const revisionPath = 'research/syntheses/synthesis_week_01/revisions/1/revision.json';
    const revisionArtifact = await fixture.store.resolveExistingArtifact(revisionPath);
    const continuation = await synthesis.proposeContinuation({
      proposal_id: 'continuation_week_01',
      synthesis_ref: { path: revisionArtifact.relative_path, digest: revisionArtifact.digest },
      candidates: [{
        candidate_id: 'test_separate_authority_boundary',
        kind: 'test_hypothesis',
        proposal: 'Test the same authority boundary in another Skill integration.',
        rationale: 'The new Insight is based on one bounded weekly loop.',
        origin_refs: [`insight:${revision.insights[0]!.insight_id}`],
        uncertainties: ['Cross-Skill behavior is not yet measured.']
      }],
      proposed_at: '2026-08-25T11:06:00.000Z'
    });

    expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('published');
    expect((await fixture.outcomes.status(fixture.cycle_id)).phase).toBe('complete');
    expect(fixture.bridgeStatus.phase).toBe('complete');
    expect(revision.disposition).toBe('material_update');
    expect(revision.insights).toHaveLength(1);
    expect(continuation.candidates).toHaveLength(1);
    expect(continuation.authority).toBe('non_authoritative');
    expect(await tree(fixture.store, 'memory/promotions')).toEqual([]);
    expect(await tree(fixture.store, 'memory/deltas')).toEqual([]);
    expect(await tree(fixture.store, 'program/roadmaps')).toEqual(roadmapsBefore);
  });

  it('records no material change with zero Insights when Runtime is unavailable', async () => {
    const fixture = await createResearchSynthesisFixture();
    const synthesis = new ResearchSynthesisService(fixture.store);
    const snapshot = await synthesis.plan(fixture.input);
    const revision = await synthesis.record({
      synthesis_id: 'synthesis_week_01',
      snapshot_id: snapshot.snapshot_id,
      candidate: synthesisCandidate(),
      recorded_at: '2026-08-25T11:05:00.000Z'
    });

    expect(snapshot.runtime_context.status).toBe('unavailable');
    expect(revision).toMatchObject({
      disposition: 'no_material_change',
      insights: [],
      memory_context_status: 'unavailable'
    });
    expect(revision.limitations).toContain('Historical research context was not loaded.');
    expect(await tree(fixture.store, 'memory/promotions')).toEqual([]);
    expect(await tree(fixture.store, 'program/backlog')).not.toEqual([]);
  });
});
