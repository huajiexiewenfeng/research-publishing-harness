import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ResearchIndexMaintenanceService } from '../../harnesses/research-publishing/core/research-index-maintenance-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { progressiveQueryFixture } from './progressive-query-fixture.js';

describe('ResearchIndexMaintenanceService', () => {
  it('diagnoses a healthy multi-view Index through exact Catalog refs only', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-index-doctor-')));
    const fixture = progressiveQueryFixture();
    const report = await new ResearchIndexMaintenanceService(store, fixture.runtime, {
      reportId: () => 'doctor_report_001', now: () => new Date('2026-08-23T03:00:00.000Z')
    }).doctor('enterprise-agent-runtime');
    expect(report).toMatchObject({ status: 'healthy', findings: [] });
    expect(fixture.runtime.calls.every((call) => !call.includes('**'))).toBe(true);
  });

  it('reports legacy_only when no V2.3 Catalog exists', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-index-legacy-')));
    const fixture = progressiveQueryFixture();
    fixture.runtime.catalogFound = false;
    await expect(new ResearchIndexMaintenanceService(store, fixture.runtime, {
      reportId: () => 'doctor_report_legacy'
    }).doctor('enterprise-agent-runtime')).resolves.toMatchObject({
      status: 'legacy_only', catalog_ref: null
    });
  });

  it('reports index_rebuild_required for Shard drift without repairing it', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-index-corrupt-')));
    const fixture = progressiveQueryFixture();
    fixture.runtime.contents.set(fixture.shard.path, `${fixture.shard.content}\ncorrupt`);
    const report = await new ResearchIndexMaintenanceService(store, fixture.runtime, {
      reportId: () => 'doctor_report_corrupt'
    }).doctor('enterprise-agent-runtime');
    expect(report).toMatchObject({ status: 'index_rebuild_required' });
    expect(report.findings.map((finding) => finding.code)).toContain('SHARD_DIGEST_MISMATCH');
  });
});
