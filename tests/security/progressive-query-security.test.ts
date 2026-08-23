import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ProgressiveResearchQueryService } from '../../harnesses/research-publishing/core/progressive-research-query-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { progressiveQueryFixture } from '../memory/progressive-query-fixture.js';

describe('progressive Query security', () => {
  it('fails before Shard loading when the Catalog checksum drifts', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-progressive-security-')));
    const fixture = progressiveQueryFixture();
    fixture.runtime.catalogDigest = `sha256:${'f'.repeat(64)}`;
    const service = new ProgressiveResearchQueryService(store, fixture.runtime);
    await service.plan(fixture.input);
    await expect(service.execute(fixture.input.query_id)).rejects.toThrowError(/Catalog digest/);
    expect(fixture.runtime.calls).toHaveLength(1);
  });

  it('rejects a broad or unplanned Runtime response path before any later load', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-progressive-unplanned-')));
    const fixture = progressiveQueryFixture();
    fixture.runtime.returnUnplannedPath = true;
    const service = new ProgressiveResearchQueryService(store, fixture.runtime);
    await service.plan(fixture.input);
    await expect(service.execute(fixture.input.query_id)).rejects.toThrowError(/unplanned/);
    expect(fixture.runtime.calls).toEqual(['find:catalog', `load:${fixture.projection.catalog_path}`]);
  });

  it('rejects Shard byte drift before semantic record loading', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-progressive-shard-drift-')));
    const fixture = progressiveQueryFixture();
    fixture.runtime.contents.set(fixture.shard.path, `${fixture.shard.content}\ncorrupt`);
    const service = new ProgressiveResearchQueryService(store, fixture.runtime);
    await service.plan(fixture.input);
    await expect(service.execute(fixture.input.query_id)).rejects.toThrowError(/Shard digest/);
    expect(fixture.runtime.calls).toHaveLength(3);
  });
});
