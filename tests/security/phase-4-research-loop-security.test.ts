import { describe, expect, it } from 'vitest';

import { ResearchSynthesisService } from '../../harnesses/research-publishing/core/research-synthesis-service.js';
import { WeeklyOutcomeService } from '../../harnesses/research-publishing/core/weekly-outcome-service.js';
import { WeeklyResearchBridgeService } from '../../harnesses/research-publishing/core/weekly-research-bridge-service.js';
import { createCompletedPhase4BundleFixture, createClosedPhase4OutcomeFixture } from '../fixtures/phase-4-research-loop.js';
import {
  createResearchSynthesisFixture,
  synthesisCandidate
} from '../fixtures/research-synthesis.js';

describe('Phase 4 full-loop security boundary', () => {
  it('rejects caller URL/status/Track injection and unsafe Cycle paths', async () => {
    const bundle = await createCompletedPhase4BundleFixture();
    const outcomes = new WeeklyOutcomeService(bundle.store, bundle.roadmaps, bundle.backlog, bundle.weeks);
    for (const input of [
      { cycle_id: bundle.cycle_id, public_url: 'https://x.com/attacker/status/1' },
      { cycle_id: bundle.cycle_id, status: 'published' },
      { cycle_id: '../week_01_2026' },
      { cycle_id: 'C:/tmp/week_01_2026' }
    ]) {
      await expect(outcomes.assemble(input as never))
        .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    }
    expect(await bundle.store.exists(`program/weeks/${bundle.cycle_id}/outcome.json`)).toBe(false);

    const closed = await createClosedPhase4OutcomeFixture();
    await expect(new WeeklyResearchBridgeService(closed.store).assemble({
      cycle_id: closed.cycle_id,
      workspace_identity_digest: closed.workspace_identity_digest,
      track_id: 'caller-track'
    } as never)).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('rejects stale, escaping, secret-bearing, downgraded, and unresolved inputs', async () => {
    const fixture = await createResearchSynthesisFixture();
    const synthesis = new ResearchSynthesisService(fixture.store);
    await expect(synthesis.plan({
      ...fixture.input,
      snapshot_id: 'stale_snapshot',
      source_refs: [{
        ...fixture.input.source_refs[0]!,
        ref: { ...fixture.input.source_refs[0]!.ref, digest: `sha256:${'f'.repeat(64)}` }
      }]
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    await expect(synthesis.plan({
      ...fixture.input,
      snapshot_id: 'escaping_snapshot',
      source_refs: [{
        ...fixture.input.source_refs[0]!,
        ref: { path: '../outside.md', digest: fixture.input.source_refs[0]!.ref.digest }
      }]
    })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });

    const secretPath = 'articles/secret-source.md';
    await fixture.store.writeNew(secretPath, 'api_token = "abcdefgh12345678"');
    const secret = await fixture.store.resolveExistingArtifact(secretPath);
    await expect(synthesis.plan({
      ...fixture.input,
      snapshot_id: 'secret_snapshot',
      source_refs: [{
        ref: { path: secret.relative_path, digest: secret.digest }, role: 'article',
        media_type: 'text/markdown', privacy_classification: 'internal'
      }]
    })).rejects.toMatchObject({ code: 'PRIVACY_GATE_BLOCKED' });
    await expect(synthesis.plan({
      ...fixture.input,
      snapshot_id: 'unresolved_evidence_snapshot',
      evidence_refs: ['evidence:missing_snapshot']
    })).rejects.toMatchObject({ code: 'ARTIFACT_NOT_FOUND' });
    const internalEvidence = await fixture.store.resolveExistingArtifact(
      `memory/evidence/snapshots/evidence_${fixture.cycle_id}_research_package/manifest.json`
    );
    await expect(synthesis.plan({
      ...fixture.input,
      snapshot_id: 'privacy_downgrade_snapshot',
      source_refs: [{
        ref: { path: internalEvidence.relative_path, digest: internalEvidence.digest },
        role: 'evidence', media_type: 'application/json', privacy_classification: 'public'
      }]
    })).rejects.toMatchObject({ code: 'PRIVACY_GATE_BLOCKED' });
    expect(await fixture.store.list('memory/promotions')).toEqual([]);
  });

  it('rejects unknown Candidate fields, fake material change, and proposal authority injection', async () => {
    const fixture = await createResearchSynthesisFixture();
    const synthesis = new ResearchSynthesisService(fixture.store);
    const snapshot = await synthesis.plan(fixture.input);
    await expect(synthesis.record({
      synthesis_id: 'synthesis_unknown', snapshot_id: snapshot.snapshot_id,
      candidate: { ...synthesisCandidate(), chain_of_thought: 'hidden' },
      recorded_at: '2026-08-25T11:05:00.000Z'
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(synthesis.record({
      synthesis_id: 'synthesis_fake_material', snapshot_id: snapshot.snapshot_id,
      candidate: { ...synthesisCandidate(), disposition: 'material_update', insights: [] },
      recorded_at: '2026-08-25T11:06:00.000Z'
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });

    const revision = await synthesis.record({
      synthesis_id: 'synthesis_valid', snapshot_id: snapshot.snapshot_id,
      candidate: synthesisCandidate(), recorded_at: '2026-08-25T11:07:00.000Z'
    });
    const revisionPath = 'research/syntheses/synthesis_valid/revisions/1/revision.json';
    const ref = await fixture.store.resolveExistingArtifact(revisionPath);
    await expect(synthesis.proposeContinuation({
      proposal_id: 'proposal_with_authority',
      synthesis_ref: { path: ref.relative_path, digest: ref.digest },
      candidates: [{
        candidate_id: 'candidate_mutation', kind: 'continue_topic',
        proposal: 'Continue automatically.', rationale: 'Injected authority.',
        origin_refs: [revision.input_snapshot_ref.path], uncertainties: [],
        selected: true
      }],
      proposed_at: '2026-08-25T11:08:00.000Z'
    } as never)).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    expect(await fixture.store.list('memory/promotions')).toEqual([]);
    expect(await fixture.store.list('memory/deltas')).toEqual([]);
  });

  it('fails concurrent recording closed, then retries into a unique immutable revision', async () => {
    const fixture = await createResearchSynthesisFixture();
    const synthesis = new ResearchSynthesisService(fixture.store);
    const snapshot = await synthesis.plan(fixture.input);
    const concurrent = await Promise.allSettled([
      synthesis.record({
        synthesis_id: 'synthesis_concurrent', snapshot_id: snapshot.snapshot_id,
        candidate: synthesisCandidate(), recorded_at: '2026-08-25T11:05:00.000Z'
      }),
      synthesis.record({
        synthesis_id: 'synthesis_concurrent', snapshot_id: snapshot.snapshot_id,
        candidate: synthesisCandidate('insufficient_evidence'),
        recorded_at: '2026-08-25T11:06:00.000Z'
      })
    ]);

    expect(concurrent.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const rejected = concurrent.find((item) => item.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { code: 'EXECUTION_BUSY' } });
    const retried = await synthesis.record({
      synthesis_id: 'synthesis_concurrent', snapshot_id: snapshot.snapshot_id,
      candidate: synthesisCandidate('insufficient_evidence'),
      recorded_at: '2026-08-25T11:07:00.000Z'
    });
    expect(retried.revision).toBe(2);
    expect(retried.previous_revision_ref?.path)
      .toBe('research/syntheses/synthesis_concurrent/revisions/1/revision.json');
    expect(await fixture.store.list('memory/promotions')).toEqual([]);
  });
});
