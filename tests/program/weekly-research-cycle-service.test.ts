import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResearchBacklogService } from '../../harnesses/research-publishing/core/research-backlog-service.js';
import {
  createResearchContextReview,
  createResearchContextSnapshot,
  createResearchQueryPlan
} from '../../harnesses/research-publishing/core/research-query-types.js';
import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import { WeeklyResearchCycleService } from '../../harnesses/research-publishing/core/weekly-research-cycle-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import type {
  OpenWeeklyCycleInput,
  ResearchTopicRevisionV1,
  SubmitWeeklyCandidatesInput
} from '../../harnesses/research-publishing/core/research-program-types.js';
import {
  roadmapInput,
  topicInput,
  weeklyCandidateBrief
} from '../fixtures/research-program.js';

const digest = (char: string) => `sha256:${char.repeat(64)}` as const;

async function seedReviewedQuery(store: WorkspaceStore) {
  const plan = createResearchQueryPlan({
    query_id: 'query_week_01', track_id: 'enterprise-agent-runtime',
    query_intent: 'Find evidence for the Runtime boundary.', view: 'mainline',
    include_working: false, selection_terms: ['runtime', 'boundary'],
    selection_rationale: 'Prefer accepted claims with canonical evidence.',
    document_mode: 'none', catalog_ref: null, selected_shard_refs: [],
    selected_record_refs: [], selected_manifest_refs: [], selected_chunk_refs: [],
    created_at: '2026-08-24T07:00:00.000Z'
  });
  const snapshot = createResearchContextSnapshot({
    snapshot_id: 'snapshot_week_01', query_plan_digest: plan.plan_digest,
    query_id: plan.query_id, query_intent: plan.query_intent, track_id: plan.track_id,
    view: plan.view, index_refs: [], selected_summary_refs: [], selected_record_refs: [],
    selected_evidence_refs: ['evidence:runtime_boundary'], context_items: [{
      context_ref: 'claim:runtime_boundary@1',
      relative_path: 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/runtime_boundary/versions/1.md',
      content_digest: digest('a'), content: 'Deterministic access belongs in the Runtime.',
      source_layer: 'semantic_record', classification: 'data_only', sanitized: true, risk_flags: []
    }], risk_flags: [], budgets: plan.budgets, selection_rationale: plan.selection_rationale,
    query_status: 'loaded', runtime_version: '0.2.0', created_at: '2026-08-24T07:01:00.000Z'
  });
  const review = createResearchContextReview(snapshot, {
    review_id: 'review_week_01', selected_context_refs: ['claim:runtime_boundary@1'],
    reviewer: 'human', reviewed_at: '2026-08-24T07:02:00.000Z'
  });
  const root = `memory/queries-v2/${plan.query_id}`;
  await store.writeNew(`${root}/plan.json`, plan);
  await store.writeNew(`${root}/snapshot.json`, snapshot);
  await store.writeNew(`${root}/review.json`, review);
  return { plan, snapshot, review };
}

describe('WeeklyResearchCycleService', () => {
  let store: WorkspaceStore;
  let roadmaps: ResearchRoadmapService;
  let backlog: ResearchBacklogService;
  let service: WeeklyResearchCycleService;
  let openInput: OpenWeeklyCycleInput;
  let candidateInput: SubmitWeeklyCandidatesInput;

  beforeEach(async () => {
    store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-weekly-cycle-')));
    roadmaps = new ResearchRoadmapService(store);
    const roadmap = await roadmaps.create(roadmapInput);
    backlog = new ResearchBacklogService(store, roadmaps);
    const topics: ResearchTopicRevisionV1[] = [];
    for (const id of ['a', 'b', 'c']) {
      topics.push(await backlog.add(topicInput(`topic_${id}`, 'evidence_ready')));
    }
    const query = await seedReviewedQuery(store);
    const context = {
      query_id: query.plan.query_id,
      plan_digest: query.plan.plan_digest,
      snapshot_digest: query.snapshot.snapshot_digest,
      review_digest: query.review.review_digest,
      selected_context_refs: query.review.selected_context_refs,
      query_status: query.snapshot.query_status,
      application_status: 'applied' as const,
      runtime_version: query.snapshot.runtime_version
    };
    openInput = {
      cycle_id: 'week_01_2026',
      roadmap_ref: {
        path: `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`,
        digest: roadmap.roadmap_digest
      },
      week_number: 1, month_id: 'month_01', context_binding: context,
      opened_by: 'human', opened_at: '2026-08-24T08:00:00.000Z'
    };
    candidateInput = {
      candidate_set_id: 'candidate_set_week_01_2026', cycle_id: openInput.cycle_id,
      roadmap_ref: openInput.roadmap_ref, context_binding: context,
      candidates: ['a', 'b'].map((id, index) => ({
        ...weeklyCandidateBrief(id),
        topic_ref: {
          path: `program/backlog/topics/topic_${id}/revisions/1.json`,
          digest: topics[index]!.revision_digest
        }
      })),
      generated_by_skill: 'article-publishing-copilot', created_at: '2026-08-24T09:00:00.000Z'
    };
    service = new WeeklyResearchCycleService(store, roadmaps, backlog);
  });

  it('opens only against the current Roadmap and a reviewed Query', async () => {
    const cycle = await service.open(openInput);
    expect(cycle.context_binding.review_digest).toBe(openInput.context_binding.review_digest);
    await expect(service.status(cycle.cycle_id)).resolves.toMatchObject({ phase: 'opened' });
  });

  it('selects exactly the Human-named brief and reserves only its Topic', async () => {
    await service.open(openInput);
    const candidateSet = await service.submitCandidates(candidateInput);
    const selection = await service.select({
      cycle_id: openInput.cycle_id, candidate_set_digest: candidateSet.candidate_set_digest,
      selected_brief_id: 'brief_b', selection_source: 'human_explicit', selected_by: 'human',
      selected_at: '2026-08-24T10:00:00.000Z'
    });
    expect(selection.selected_brief_id).toBe('brief_b');
    const catalog = await backlog.catalog(roadmapInput.roadmap_id);
    expect(catalog.entries.find((entry) => entry.topic_id === 'topic_b')!.availability).toBe('reserved');
    expect(catalog.entries.find((entry) => entry.topic_id === 'topic_a')!.availability).toBe('available');
  });

  it('releases the reserved Topic only through an exact Human cancellation', async () => {
    await service.open(openInput);
    const candidateSet = await service.submitCandidates(candidateInput);
    const selection = await service.select({
      cycle_id: openInput.cycle_id, candidate_set_digest: candidateSet.candidate_set_digest,
      selected_brief_id: 'brief_b', selection_source: 'human_explicit', selected_by: 'human',
      selected_at: '2026-08-24T10:00:00.000Z'
    });
    const status = await service.cancel({
      cycle_id: selection.cycle_id, confirmed_selection_digest: selection.selection_digest,
      reason: 'Selected evidence did not survive review.', cancelled_by: 'human',
      cancelled_at: '2026-08-24T11:00:00.000Z'
    });
    expect(status.phase).toBe('cancelled');
    const catalog = await backlog.catalog(roadmapInput.roadmap_id);
    expect(catalog.entries.find((entry) => entry.topic_id === 'topic_b')!.availability).toBe('available');
  });

  it('allows only one non-cancelled Cycle for a Roadmap/week pair', async () => {
    await service.open(openInput);
    await expect(service.open({ ...openInput, cycle_id: 'week_01_replacement' }))
      .rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });

  it('recovers a Candidate Set written before status projection failure', async () => {
    await service.open(openInput);
    const original = store.replaceAtomic.bind(store);
    const failure = vi.spyOn(store, 'replaceAtomic').mockImplementation(async (path, value) => {
      if (path.endsWith('/status.json')) throw new Error('synthetic status failure');
      return original(path, value);
    });
    await expect(service.submitCandidates(candidateInput)).rejects.toThrowError(/synthetic status failure/);
    failure.mockRestore();
    await expect(service.status(openInput.cycle_id)).resolves.toMatchObject({ phase: 'candidates_submitted' });
  });
});
