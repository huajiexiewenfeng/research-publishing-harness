import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { roadmapInput } from '../fixtures/research-program.js';

describe('ResearchRoadmapService', () => {
  let store: WorkspaceStore;
  let service: ResearchRoadmapService;

  beforeEach(async () => {
    store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-roadmap-')));
    service = new ResearchRoadmapService(store);
  });

  it('installs revision one and an exact current projection', async () => {
    const created = await service.create(roadmapInput);
    expect(created.revision).toBe(1);
    await expect(store.readJson(`program/roadmaps/${created.roadmap_id}/current.json`))
      .resolves.toEqual(created);
    await expect(store.readJson(`program/roadmaps/${created.roadmap_id}/revisions/1.json`))
      .resolves.toEqual(created);
  });

  it('creates an immutable next revision and switches current last', async () => {
    const first = await service.create(roadmapInput);
    const second = await service.revise({
      roadmap: {
        ...roadmapInput,
        revision: 2,
        previous_revision_ref: {
          path: `program/roadmaps/${first.roadmap_id}/revisions/1.json`,
          digest: first.roadmap_digest
        },
        change_reason: 'incorporate confirmed research evidence'
      },
      confirmed_current_digest: first.roadmap_digest
    });

    expect(second.revision).toBe(2);
    await expect(service.current(first.roadmap_id)).resolves.toEqual(second);
    await expect(store.readJson(`program/roadmaps/${first.roadmap_id}/revisions/1.json`))
      .resolves.toEqual(first);
  });

  it('rejects a revision based on a stale current digest', async () => {
    const first = await service.create(roadmapInput);
    await expect(service.revise({
      roadmap: {
        ...roadmapInput,
        revision: 2,
        previous_revision_ref: {
          path: `program/roadmaps/${first.roadmap_id}/revisions/1.json`,
          digest: first.roadmap_digest
        }
      },
      confirmed_current_digest: `sha256:${'0'.repeat(64)}`
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    await expect(service.current(first.roadmap_id)).resolves.toEqual(first);
  });

  it('requires the exact next revision and previous revision ref', async () => {
    const first = await service.create(roadmapInput);
    await expect(service.revise({
      roadmap: {
        ...roadmapInput,
        revision: 3,
        previous_revision_ref: {
          path: `program/roadmaps/${first.roadmap_id}/revisions/1.json`,
          digest: first.roadmap_digest
        }
      },
      confirmed_current_digest: first.roadmap_digest
    })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });

    await expect(service.revise({
      roadmap: {
        ...roadmapInput,
        revision: 2,
        previous_revision_ref: {
          path: `program/roadmaps/${first.roadmap_id}/revisions/9.json`,
          digest: first.roadmap_digest
        }
      },
      confirmed_current_digest: first.roadmap_digest
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
  });
});
