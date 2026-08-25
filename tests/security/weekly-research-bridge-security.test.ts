import { describe, expect, it } from 'vitest';

import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import type { PublicationExpressionV1 } from '../../harnesses/research-publishing/core/research-memory-types.js';
import type { ResearchEvidenceSnapshotV1 } from '../../harnesses/research-publishing/core/research-memory-types.js';
import { WeeklyResearchBridgeService } from '../../harnesses/research-publishing/core/weekly-research-bridge-service.js';
import { createClosedPhase4OutcomeFixture } from '../fixtures/phase-4-research-loop.js';

describe('Weekly Research Bridge security', () => {
  it('rejects caller-supplied Track identity', async () => {
    const fixture = await createClosedPhase4OutcomeFixture();
    const bridge = new WeeklyResearchBridgeService(fixture.store);

    await expect(bridge.assemble({
      cycle_id: fixture.cycle_id,
      workspace_identity_digest: fixture.workspace_identity_digest,
      track_id: 'caller-track'
    } as never)).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('does not roll back a truthful Outcome when installed Expression evidence is stale', async () => {
    const fixture = await createClosedPhase4OutcomeFixture();
    const bridge = new WeeklyResearchBridgeService(fixture.store);
    await bridge.assemble({
      cycle_id: fixture.cycle_id,
      workspace_identity_digest: fixture.workspace_identity_digest
    });
    const path = `program/weeks/${fixture.cycle_id}/research-bridge/article-expression.json`;
    const expression = await fixture.store.readJson<PublicationExpressionV1>(path);
    await fixture.store.replaceAtomic(path, {
      ...expression,
      intended_content: {
        ...expression.intended_content,
        approved_plan_digest: `sha256:${'f'.repeat(64)}`
      }
    });

    await expect(bridge.resume({ cycle_id: fixture.cycle_id }))
      .rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    expect((await fixture.outcomes.status(fixture.cycle_id)).phase).toBe('complete');
    expect((await fixture.weeks.status(fixture.cycle_id)).phase).toBe('published');
  });

  it('rejects an installed Evidence Snapshot that downgrades initial privacy', async () => {
    const fixture = await createClosedPhase4OutcomeFixture();
    const bridge = new WeeklyResearchBridgeService(fixture.store);
    await bridge.assemble({
      cycle_id: fixture.cycle_id,
      workspace_identity_digest: fixture.workspace_identity_digest
    });
    const path =
      `memory/evidence/snapshots/evidence_${fixture.cycle_id}_research_package/manifest.json`;
    const snapshot = await fixture.store.readJson<ResearchEvidenceSnapshotV1>(path);
    const body = {
      ...snapshot,
      privacy_classification: 'public' as const
    };
    const { snapshot_digest: _digest, ...digestBody } = body;
    void _digest;
    await fixture.store.replaceAtomic(path, {
      ...digestBody,
      snapshot_digest: sha256(digestBody)
    });

    await expect(bridge.resume({ cycle_id: fixture.cycle_id }))
      .rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    expect((await fixture.outcomes.status(fixture.cycle_id)).phase).toBe('complete');
  });
});
