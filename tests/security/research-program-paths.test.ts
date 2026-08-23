import { access, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { roadmapInput } from '../fixtures/research-program.js';

describe('research program path boundary', () => {
  it.each(['../escape', 'C:\\private', 'roadmap/../../outside'])(
    'rejects unsafe roadmap id %s without an external write',
    async (roadmapId) => {
      const parent = await mkdtemp(join(tmpdir(), 'rph-program-path-'));
      const root = join(parent, 'workspace');
      const service = new ResearchRoadmapService(await WorkspaceStore.open(root));

      await expect(service.create({ ...roadmapInput, roadmap_id: roadmapId }))
        .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
      await expect(access(join(parent, 'escape'))).rejects.toBeDefined();
      await expect(access(join(parent, 'outside'))).rejects.toBeDefined();
    }
  );

  it('allows only the contained program top-level workspace root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-program-root-'));
    const store = await WorkspaceStore.open(root);
    await expect(store.writeNew('program/probe.json', { ok: true }))
      .resolves.toMatchObject({ relative_path: 'program/probe.json' });
    await expect(store.writeNew('programs/probe.json', { ok: false }))
      .rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });
});
