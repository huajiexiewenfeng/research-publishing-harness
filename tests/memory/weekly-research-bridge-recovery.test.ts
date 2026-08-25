import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { WeeklyResearchIncrementBindingV1 } from '../../harnesses/research-publishing/core/research-bridge-types.js';
import { WeeklyResearchBridgeService } from '../../harnesses/research-publishing/core/weekly-research-bridge-service.js';
import { createClosedPhase4OutcomeFixture } from '../fixtures/phase-4-research-loop.js';

describe('WeeklyResearchBridgeService recovery', () => {
  it('resumes one missing Single Expression without replacing Article evidence', async () => {
    const fixture = await createClosedPhase4OutcomeFixture();
    const bridge = new WeeklyResearchBridgeService(fixture.store);
    const complete = await bridge.assemble({
      cycle_id: fixture.cycle_id,
      workspace_identity_digest: fixture.workspace_identity_digest
    });
    const root = `program/weeks/${fixture.cycle_id}/research-bridge`;
    const binding = await fixture.store.readJson<WeeklyResearchIncrementBindingV1>(
      `${root}/increment-binding.json`
    );
    const singleEvidenceId = complete.single_evidence_ref!.slice('evidence:'.length);
    await fixture.store.removeFile(`${root}/single-expression.json`);
    await fixture.store.removeFile(`${root}/status.json`);
    await rm(
      resolve(fixture.store.root, `memory/evidence/snapshots/${singleEvidenceId}`),
      { recursive: true }
    );

    const resumed = await bridge.resume({ cycle_id: fixture.cycle_id });

    expect(resumed.phase).toBe('complete');
    expect(resumed.article_evidence_ref).toBe(complete.article_evidence_ref);
    expect(resumed.increment_binding_ref).toEqual(complete.increment_binding_ref);
    expect((await fixture.store.readJson<WeeklyResearchIncrementBindingV1>(
      `${root}/increment-binding.json`
    )).increment_id).toBe(binding.increment_id);
  });
});
