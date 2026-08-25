import { describe, expect, it } from 'vitest';

import { ResearchSynthesisService } from '../../harnesses/research-publishing/core/research-synthesis-service.js';
import {
  createResearchSynthesisFixture,
  synthesisCandidate
} from '../fixtures/research-synthesis.js';

describe('Research Continuation Proposal', () => {
  it('stores zero candidates without selecting or mutating the next Topic', async () => {
    const fixture = await createResearchSynthesisFixture();
    const service = new ResearchSynthesisService(fixture.store);
    const snapshot = await service.plan(fixture.input);
    await service.record({
      synthesis_id: 'synthesis_week_01', snapshot_id: snapshot.snapshot_id,
      candidate: synthesisCandidate(), recorded_at: '2026-08-25T11:05:00.000Z'
    });
    const revisionPath = 'research/syntheses/synthesis_week_01/revisions/1/revision.json';
    const revisionRef = await fixture.store.resolveExistingArtifact(revisionPath);
    const roadmapBefore = await fixture.store.readText(fixture.outcome.roadmap_ref.path);

    const proposal = await service.proposeContinuation({
      proposal_id: 'continuation_week_01',
      synthesis_ref: { path: revisionRef.relative_path, digest: revisionRef.digest },
      candidates: [],
      proposed_at: '2026-08-25T11:06:00.000Z'
    });

    expect(proposal.candidates).toEqual([]);
    expect(proposal.authority).toBe('non_authoritative');
    expect(await fixture.store.readText(fixture.outcome.roadmap_ref.path)).toBe(roadmapBefore);
    expect(await fixture.store.list('memory/deltas')).toEqual([]);
  });
});
