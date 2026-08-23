import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ResearchIndexMaintenanceService } from '../../harnesses/research-publishing/core/research-index-maintenance-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { progressiveQueryFixture } from '../memory/progressive-query-fixture.js';

describe('research Index rebuild planning', () => {
  it('creates a digest-bound approval-required Plan without mutating Runtime', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-index-rebuild-')));
    const fixture = progressiveQueryFixture();
    const service = new ResearchIndexMaintenanceService(store, fixture.runtime, {
      reportId: () => 'doctor_report_rebuild', planId: () => 'rebuild_plan_001',
      now: () => new Date('2026-08-23T03:10:00.000Z')
    });
    const plan = await service.rebuildPlan('enterprise-agent-runtime');
    expect(plan).toMatchObject({ approval_required: true, source_record_refs: [{ ref: 'claim:runtime_boundary@1' }] });
    expect(plan.proposed_generation).not.toBe(fixture.projection.generation);
    expect(plan.plan_digest).toMatch(/^sha256:/);
    expect(fixture.runtime.calls.every((call) => call.startsWith('find:') || call.startsWith('load:'))).toBe(true);
  });
});
