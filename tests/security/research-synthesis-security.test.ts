import { describe, expect, it } from 'vitest';

import { ResearchSynthesisService } from '../../harnesses/research-publishing/core/research-synthesis-service.js';
import type { ResearchSynthesisAttemptV1 } from '../../harnesses/research-publishing/core/research-synthesis-types.js';
import {
  createResearchSynthesisFixture,
  synthesisCandidate
} from '../fixtures/research-synthesis.js';

describe('Research Synthesis security', () => {
  it('records a rejected Attempt digest without persisting hidden reasoning', async () => {
    const fixture = await createResearchSynthesisFixture();
    const service = new ResearchSynthesisService(fixture.store);
    const snapshot = await service.plan(fixture.input);
    await expect(service.record({
      synthesis_id: 'synthesis_week_01',
      snapshot_id: snapshot.snapshot_id,
      candidate: { ...synthesisCandidate(), chain_of_thought: 'do not persist' },
      recorded_at: '2026-08-25T11:05:00.000Z'
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });

    const attempt = await fixture.store.readJson<ResearchSynthesisAttemptV1>(
      'research/syntheses/synthesis_week_01/attempts/1/attempt.json'
    );
    expect(attempt.status).toBe('rejected');
    expect(JSON.stringify(attempt)).not.toContain('do not persist');
  });

  it('rejects an Insight ref outside the frozen Snapshot', async () => {
    const fixture = await createResearchSynthesisFixture();
    const service = new ResearchSynthesisService(fixture.store);
    const snapshot = await service.plan(fixture.input);
    const candidate = synthesisCandidate('material_update');
    await expect(service.record({
      synthesis_id: 'synthesis_week_01', snapshot_id: snapshot.snapshot_id,
      candidate: {
        ...candidate,
        insights: [{ ...candidate.insights[0]!, evidence_refs: ['evidence:not_selected'] }]
      },
      recorded_at: '2026-08-25T11:05:00.000Z'
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(await fixture.store.list('memory/promotions')).toEqual([]);
  });

  it('rejects stale source bytes before installing a Snapshot', async () => {
    const fixture = await createResearchSynthesisFixture();
    const source = fixture.input.source_refs[0]!;
    await fixture.store.replaceAtomic(source.ref.path, { stale: true });

    await expect(new ResearchSynthesisService(fixture.store).plan(fixture.input))
      .rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    expect(await fixture.store.exists(
      `research/synthesis-inputs/${fixture.input.snapshot_id}.json`
    )).toBe(false);
  });

  it('rejects a non-canonical Evidence ref instead of silently skipping verification', async () => {
    const fixture = await createResearchSynthesisFixture();

    await expect(new ResearchSynthesisService(fixture.store).plan({
      ...fixture.input,
      evidence_refs: ['not-an-evidence-ref']
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
