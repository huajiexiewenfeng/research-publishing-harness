import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchImportService } from '../../harnesses/research-publishing/core/research-import-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { firstIncrementImportFixture } from '../fixtures/first-increment-import.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-import-'));
  const store = await WorkspaceStore.open(root);
  return { store, manifest: await firstIncrementImportFixture(store) };
}

describe('ResearchImportService', () => {
  it('reports unrecoverable platform-id and metrics gaps without inventing values', async () => {
    const { store, manifest } = await fixture();
    const report = await new ResearchImportService(store).inspect(manifest);
    expect(report.unrecoverable_gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'thread.items[2].platform_id' }),
      expect.objectContaining({ field: 'thread.items[0].metrics' })
    ]));
    expect(report.blocking_gaps).toEqual([]);
    expect(report.item_order).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('captures exactly one explicit-import Evidence Snapshot', async () => {
    const { store, manifest } = await fixture();
    const snapshot = await new ResearchImportService(store).capture(manifest);
    expect(snapshot).toMatchObject({
      increment_id: manifest.increment.increment_id,
      capture_kind: 'explicit_import', capture_event: 'research_increment_imported'
    });
    expect(snapshot.artifact_refs.map((ref) => ref.role)).toEqual([
      'research_package', 'canonical_article', 'publication_receipt'
    ]);
  });

  it('preserves six-item order and manual-recorded assertions in the proposed expression', async () => {
    const { store, manifest } = await fixture();
    const service = new ResearchImportService(store, {
      deltaId: () => 'delta_first_import', lifecycleEventId: () => 'event_first_import_accepted'
    });
    const snapshot = await service.capture(manifest);
    const delta = await service.propose(manifest, snapshot.evidence_snapshot_id);
    const expression = await store.readJson<Record<string, unknown>>(
      `memory/imports/${manifest.import_id}/publication-expression.json`
    );
    expect((expression.intended_content as { expected_item_order: number[] }).expected_item_order)
      .toEqual([1, 2, 3, 4, 5, 6]);
    expect(expression.verification_level).toBe('manual_recorded');
    expect(delta.proposed_operations.some((operation) => operation.operation_type === 'attach_publication')).toBe(true);
    await expect(store.exists('memory/promotions/import_first_runtime_boundary/approval.json')).resolves.toBe(false);
  });
});

