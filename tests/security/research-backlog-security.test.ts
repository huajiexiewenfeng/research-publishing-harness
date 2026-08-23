import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResearchBacklogService } from '../../harnesses/research-publishing/core/research-backlog-service.js';
import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { roadmapInput, topicInput } from '../fixtures/research-program.js';

describe('ResearchBacklogService security and recovery', () => {
  let store: WorkspaceStore;
  let backlog: ResearchBacklogService;

  beforeEach(async () => {
    store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-backlog-security-')));
    const roadmaps = new ResearchRoadmapService(store);
    await roadmaps.create(roadmapInput);
    backlog = new ResearchBacklogService(store, roadmaps);
  });

  it('rejects duplicate sources and unknown streams before writing', async () => {
    const base = topicInput('topic_a', 'researching');
    await expect(backlog.add({ ...base, source_refs: ['source:a', 'source:a'] }))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(backlog.add({
      ...base,
      topic_id: 'topic_b',
      stream_ids: ['unknown_stream'] as unknown as typeof base.stream_ids
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(store.exists('program/backlog/topics/topic_a/revisions/1.json')).resolves.toBe(false);
  });

  it('rejects stale and path-mismatched Topic refs', async () => {
    const first = await backlog.add(topicInput('topic_a', 'evidence_ready'));
    await expect(backlog.reserve({
      topic_ref: {
        path: 'program/backlog/topics/topic_a/revisions/9.json',
        digest: first.revision_digest
      },
      selection_ref: {
        path: 'program/weeks/week_01/selection.json',
        digest: `sha256:${'a'.repeat(64)}`
      },
      changed_by: 'human',
      changed_at: '2026-08-24T10:00:00.000Z'
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
  });

  it('recovers a revision written before Catalog projection failure', async () => {
    const original = store.replaceAtomic.bind(store);
    const projectionFailure = vi.spyOn(store, 'replaceAtomic').mockImplementation(async (path, value) => {
      if (path === 'program/backlog/catalog.json') {
        throw new Error('synthetic projection failure');
      }
      return original(path, value);
    });
    await expect(backlog.add(topicInput('topic_a', 'evidence_ready')))
      .rejects.toThrowError(/synthetic projection failure/);
    projectionFailure.mockRestore();

    await expect(store.readJson('program/backlog/topics/topic_a/revisions/1.json'))
      .resolves.toMatchObject({ topic_id: 'topic_a' });
    const recovered = await backlog.rebuildCatalog(roadmapInput.roadmap_id);
    expect(recovered.entries.map((entry) => entry.topic_id)).toEqual(['topic_a']);
  });

  it('refuses a malformed Catalog projection instead of treating it as Topic truth', async () => {
    await backlog.add(topicInput('topic_a', 'evidence_ready'));
    await store.replaceAtomic('program/backlog/catalog.json', { entries: 'corrupt' });
    await expect(backlog.catalog(roadmapInput.roadmap_id))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    const rebuilt = await backlog.rebuildCatalog(roadmapInput.roadmap_id);
    expect(rebuilt.entries).toHaveLength(1);
  });
});
