import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ResearchBacklogService } from '../../harnesses/research-publishing/core/research-backlog-service.js';
import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { roadmapInput, topicInput } from '../fixtures/research-program.js';

describe('ResearchBacklogService', () => {
  let store: WorkspaceStore;
  let backlog: ResearchBacklogService;

  beforeEach(async () => {
    store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-backlog-')));
    const roadmaps = new ResearchRoadmapService(store);
    await roadmaps.create(roadmapInput);
    backlog = new ResearchBacklogService(store, roadmaps);
  });

  it('projects all three backlog states in stable topic order', async () => {
    await backlog.add(topicInput('topic_b', 'researching'));
    await backlog.add(topicInput('topic_c', 'long_term'));
    await backlog.add(topicInput('topic_a', 'evidence_ready'));
    const catalog = await backlog.catalog(roadmapInput.roadmap_id);
    expect(catalog.entries.map((entry) => entry.topic_id)).toEqual([
      'topic_a', 'topic_b', 'topic_c'
    ]);
    expect(catalog.counts).toEqual({ evidence_ready: 1, researching: 1, long_term: 1 });
  });

  it('fails cadence readiness below two available Evidence Ready topics', async () => {
    await backlog.add(topicInput('topic_a', 'evidence_ready'));
    await expect(backlog.assertCadenceReady(roadmapInput.roadmap_id))
      .rejects.toMatchObject({ code: 'RESEARCH_GATE_BLOCKED' });
    await backlog.add(topicInput('topic_b', 'evidence_ready'));
    await expect(backlog.assertCadenceReady(roadmapInput.roadmap_id)).resolves.toBeUndefined();
  });

  it('counts only available Evidence Ready topics as cadence buffer', async () => {
    const first = await backlog.add(topicInput('topic_a', 'evidence_ready'));
    await backlog.add(topicInput('topic_b', 'evidence_ready'));
    const reserved = await backlog.reserve({
      topic_ref: {
        path: 'program/backlog/topics/topic_a/revisions/1.json',
        digest: first.revision_digest
      },
      selection_ref: {
        path: 'program/weeks/week_01/selection.json',
        digest: `sha256:${'a'.repeat(64)}`
      },
      changed_by: 'human',
      changed_at: '2026-08-24T10:00:00.000Z'
    });
    expect(reserved.availability).toBe('reserved');
    expect((await backlog.catalog(first.roadmap_id)).counts.evidence_ready).toBe(1);
    await expect(backlog.assertCadenceReady(first.roadmap_id))
      .rejects.toMatchObject({ code: 'RESEARCH_GATE_BLOCKED' });
  });

  it('releases and completes only through explicit lifecycle transitions', async () => {
    const first = await backlog.add(topicInput('topic_a', 'evidence_ready'));
    const selectionRef = {
      path: 'program/weeks/week_01/selection.json',
      digest: `sha256:${'a'.repeat(64)}` as const
    };
    const reserved = await backlog.reserve({
      topic_ref: { path: 'program/backlog/topics/topic_a/revisions/1.json', digest: first.revision_digest },
      selection_ref: selectionRef,
      changed_by: 'human',
      changed_at: '2026-08-24T10:00:00.000Z'
    });
    const released = await backlog.release({
      topic_ref: { path: 'program/backlog/topics/topic_a/revisions/2.json', digest: reserved.revision_digest },
      release_reason: 'candidate was not selected for this week',
      changed_by: 'human',
      changed_at: '2026-08-24T11:00:00.000Z'
    });
    expect(released).toMatchObject({
      availability: 'available',
      backlog_state: first.backlog_state,
      claim_status: first.claim_status,
      selection_ref: selectionRef
    });

    const reservedAgain = await backlog.reserve({
      topic_ref: { path: 'program/backlog/topics/topic_a/revisions/3.json', digest: released.revision_digest },
      selection_ref: selectionRef,
      changed_by: 'human',
      changed_at: '2026-08-25T10:00:00.000Z'
    });
    const outcomeRef = {
      path: 'program/weeks/week_01/outcome.json',
      digest: `sha256:${'b'.repeat(64)}` as const
    };
    const completed = await backlog.complete({
      topic_ref: { path: 'program/backlog/topics/topic_a/revisions/4.json', digest: reservedAgain.revision_digest },
      outcome_ref: outcomeRef,
      changed_by: 'human',
      changed_at: '2026-08-31T10:00:00.000Z'
    });
    expect(completed).toMatchObject({
      availability: 'completed',
      backlog_state: first.backlog_state,
      claim_status: first.claim_status,
      outcome_ref: outcomeRef
    });
  });

  it('allows evidence to weaken only through an explicit revision reason', async () => {
    const first = await backlog.add(topicInput('topic_a', 'evidence_ready'));
    await expect(backlog.revise({
      topic: {
        ...topicInput('topic_a', 'researching'),
        revision: 2,
        previous_revision_ref: {
          path: 'program/backlog/topics/topic_a/revisions/1.json',
          digest: first.revision_digest
        },
        change_reason: ''
      },
      confirmed_current_digest: first.revision_digest
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('serializes simultaneous revisions so one stale writer loses', async () => {
    const first = await backlog.add(topicInput('topic_a', 'researching'));
    const request = {
      topic: {
        ...topicInput('topic_a', 'researching'),
        revision: 2,
        previous_revision_ref: {
          path: 'program/backlog/topics/topic_a/revisions/1.json',
          digest: first.revision_digest
        },
        change_reason: 'concurrent explicit revision'
      },
      confirmed_current_digest: first.revision_digest
    };
    const results = await Promise.allSettled([backlog.revise(request), backlog.revise(request)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});
