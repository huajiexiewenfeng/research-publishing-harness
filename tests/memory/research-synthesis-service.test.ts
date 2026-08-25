import { describe, expect, it } from 'vitest';

import { ResearchSynthesisService } from '../../harnesses/research-publishing/core/research-synthesis-service.js';
import {
  createResearchSynthesisFixture,
  synthesisCandidate
} from '../fixtures/research-synthesis.js';

describe('ResearchSynthesisService', () => {
  it('freezes only selected bounded context and a reviewed Runtime Query chain', async () => {
    const fixture = await createResearchSynthesisFixture({ loaded_query: true });
    const snapshot = await new ResearchSynthesisService(fixture.store).plan(fixture.input);

    expect(snapshot.runtime_context.status).toBe('loaded');
    expect(snapshot.runtime_context.selected_context_refs).toEqual(['claim:runtime_boundary@1']);
    expect(snapshot.source_items.length).toBeLessThanOrEqual(24);
    expect(snapshot.source_items.reduce((sum, item) => sum + item.included_chars, 0))
      .toBeLessThanOrEqual(64_000);
    expect(snapshot.source_items.at(-1)?.role).toBe('runtime_context');
  });

  it('continues locally when Runtime context is unavailable and records the limitation', async () => {
    const fixture = await createResearchSynthesisFixture();
    const service = new ResearchSynthesisService(fixture.store);
    const snapshot = await service.plan(fixture.input);

    expect(snapshot.runtime_context).toMatchObject({
      status: 'unavailable',
      limitation: expect.stringMatching(/historical research context was not loaded/i)
    });
    const revision = await service.record({
      synthesis_id: 'synthesis_week_01',
      snapshot_id: snapshot.snapshot_id,
      candidate: synthesisCandidate(),
      recorded_at: '2026-08-25T11:05:00.000Z'
    });
    expect(revision.disposition).toBe('no_material_change');
    expect(revision.insights).toEqual([]);
  });

  it('records a reviewed empty Runtime Query without inventing context or a failure', async () => {
    const fixture = await createResearchSynthesisFixture({ empty_query: true });
    const snapshot = await new ResearchSynthesisService(fixture.store).plan(fixture.input);

    expect(snapshot.runtime_context).toMatchObject({
      status: 'empty',
      selected_context_refs: [],
      limitation: null
    });
    expect(snapshot.source_items.some((item) => item.role === 'runtime_context')).toBe(false);
  });

  it('preserves selected source order and marks deterministic per-item truncation', async () => {
    const fixture = await createResearchSynthesisFixture();
    const path = 'articles/synthesis-long-source.md';
    await fixture.store.writeNew(path, 'x'.repeat(13_000));
    const artifact = await fixture.store.resolveExistingArtifact(path);
    const longSource = {
      ref: { path: artifact.relative_path, digest: artifact.digest },
      role: 'article' as const,
      media_type: 'text/markdown',
      privacy_classification: 'public' as const
    };

    const snapshot = await new ResearchSynthesisService(fixture.store).plan({
      ...fixture.input,
      snapshot_id: 'synthesis_input_with_long_source',
      source_refs: [longSource, ...fixture.input.source_refs]
    });

    expect(snapshot.source_items[0]).toMatchObject({
      ref: longSource.ref,
      original_chars: 13_000,
      included_chars: 12_000,
      truncated: true
    });
    expect(snapshot.source_items.slice(1).map((item) => item.ref))
      .toEqual(fixture.input.source_refs.map((item) => item.ref));
  });
});
