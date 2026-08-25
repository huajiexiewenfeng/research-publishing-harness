import { describe, expect, it } from 'vitest';

import { ResearchSynthesisService } from '../../harnesses/research-publishing/core/research-synthesis-service.js';
import {
  createResearchSynthesisFixture,
  synthesisCandidate
} from '../fixtures/research-synthesis.js';

describe('Research Synthesis recovery', () => {
  it('keeps prior accepted revisions immutable when rethinking the same Snapshot', async () => {
    const fixture = await createResearchSynthesisFixture();
    const service = new ResearchSynthesisService(fixture.store);
    const snapshot = await service.plan(fixture.input);
    const first = await service.record({
      synthesis_id: 'synthesis_week_01', snapshot_id: snapshot.snapshot_id,
      candidate: synthesisCandidate(), recorded_at: '2026-08-25T11:05:00.000Z'
    });
    const firstBytes = await fixture.store.readText(
      'research/syntheses/synthesis_week_01/revisions/1/revision.json'
    );
    const second = await service.record({
      synthesis_id: 'synthesis_week_01', snapshot_id: snapshot.snapshot_id,
      candidate: synthesisCandidate('insufficient_evidence'),
      recorded_at: '2026-08-25T11:06:00.000Z'
    });

    expect(second.revision).toBe(2);
    expect(second.previous_revision_ref?.path)
      .toBe('research/syntheses/synthesis_week_01/revisions/1/revision.json');
    expect(await fixture.store.readText(
      'research/syntheses/synthesis_week_01/revisions/1/revision.json'
    )).toBe(firstBytes);
    expect(first.revision_digest).not.toBe(second.revision_digest);
    expect((await service.status('synthesis_week_01')).attempt_count).toBe(2);
  });
});
