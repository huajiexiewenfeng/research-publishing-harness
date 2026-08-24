import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import { ResearchBacklogService } from '../../harnesses/research-publishing/core/research-backlog-service.js';
import {
  createResearchContextReview,
  createResearchContextSnapshot,
  createResearchQueryPlan
} from '../../harnesses/research-publishing/core/research-query-types.js';
import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import { WeeklyResearchCycleService } from '../../harnesses/research-publishing/core/weekly-research-cycle-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import type { OpenWeeklyCycleInput, SubmitWeeklyCandidatesInput } from '../../harnesses/research-publishing/core/research-program-types.js';
import { roadmapInput, topicInput, weeklyCandidateBrief } from '../fixtures/research-program.js';

describe('WeeklyResearchCycleService security', () => {
  let store: WorkspaceStore;
  let service: WeeklyResearchCycleService;
  let openInput: OpenWeeklyCycleInput;
  let candidateInput: SubmitWeeklyCandidatesInput;

  beforeEach(async () => {
    store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-weekly-security-')));
    const roadmaps = new ResearchRoadmapService(store);
    const roadmap = await roadmaps.create(roadmapInput);
    const backlog = new ResearchBacklogService(store, roadmaps);
    const topicA = await backlog.add(topicInput('topic_a', 'evidence_ready'));
    const topicB = await backlog.add(topicInput('topic_b', 'evidence_ready'));
    const plan = createResearchQueryPlan({
      query_id: 'query_week_01', track_id: 'enterprise-agent-runtime', query_intent: 'Boundary evidence.',
      view: 'mainline', include_working: false, selection_terms: ['boundary'],
      selection_rationale: 'Use accepted evidence.', document_mode: 'none', catalog_ref: null,
      selected_shard_refs: [], selected_record_refs: [], selected_manifest_refs: [], selected_chunk_refs: [],
      created_at: '2026-08-24T07:00:00.000Z'
    });
    const snapshot = createResearchContextSnapshot({
      snapshot_id: 'snapshot_week_01', query_plan_digest: plan.plan_digest, query_id: plan.query_id,
      query_intent: plan.query_intent, track_id: plan.track_id, view: plan.view, index_refs: [],
      selected_summary_refs: [], selected_record_refs: [], selected_evidence_refs: [], context_items: [{
        context_ref: 'claim:runtime_boundary@1', relative_path: 'domains/research-publishing/claims/runtime.md',
        content_digest: `sha256:${'a'.repeat(64)}`, content: 'Reviewed context.', source_layer: 'semantic_record',
        classification: 'data_only', sanitized: true, risk_flags: []
      }], risk_flags: [], budgets: plan.budgets, selection_rationale: plan.selection_rationale,
      query_status: 'loaded', runtime_version: '0.2.0', created_at: '2026-08-24T07:01:00.000Z'
    });
    const review = createResearchContextReview(snapshot, {
      review_id: 'review_week_01', selected_context_refs: ['claim:runtime_boundary@1'],
      reviewer: 'human', reviewed_at: '2026-08-24T07:02:00.000Z'
    });
    await store.writeNew('memory/queries-v2/query_week_01/plan.json', plan);
    await store.writeNew('memory/queries-v2/query_week_01/snapshot.json', snapshot);
    await store.writeNew('memory/queries-v2/query_week_01/review.json', review);
    const context = {
      query_id: plan.query_id, plan_digest: plan.plan_digest, snapshot_digest: snapshot.snapshot_digest,
      review_digest: review.review_digest, selected_context_refs: review.selected_context_refs,
      query_status: snapshot.query_status, application_status: 'applied' as const,
      runtime_version: snapshot.runtime_version
    };
    openInput = {
      cycle_id: 'week_01_2026', roadmap_ref: {
        path: `program/roadmaps/${roadmap.roadmap_id}/revisions/1.json`, digest: roadmap.roadmap_digest
      }, week_number: 1, month_id: 'month_01', context_binding: context,
      opened_by: 'human', opened_at: '2026-08-24T08:00:00.000Z'
    };
    candidateInput = {
      candidate_set_id: 'candidate_set_week_01_2026', cycle_id: openInput.cycle_id,
      roadmap_ref: openInput.roadmap_ref, context_binding: context,
      candidates: [
        { ...weeklyCandidateBrief('a'), topic_ref: { path: 'program/backlog/topics/topic_a/revisions/1.json', digest: topicA.revision_digest } },
        { ...weeklyCandidateBrief('b'), topic_ref: { path: 'program/backlog/topics/topic_b/revisions/1.json', digest: topicB.revision_digest } }
      ], generated_by_skill: 'article-publishing-copilot', created_at: '2026-08-24T09:00:00.000Z'
    };
    service = new WeeklyResearchCycleService(store, roadmaps, backlog);
  });

  it('rejects a Context digest copied from another Query', async () => {
    await expect(service.open({
      ...openInput,
      context_binding: { ...openInput.context_binding, snapshot_digest: `sha256:${'f'.repeat(64)}` }
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
  });

  it('rejects non-canonical and foreign Topic refs before writing Candidates', async () => {
    await service.open(openInput);
    const first = candidateInput.candidates[0]!;
    await expect(service.submitCandidates({
      ...candidateInput,
      candidates: [{ ...first, topic_ref: { ...first.topic_ref, path: 'program/backlog/topics/../topic_a/revisions/1.json' } }, candidateInput.candidates[1]!]
    })).rejects.toMatchObject({ code: 'APPROVAL_STALE' });
    await expect(store.exists(`program/weeks/${openInput.cycle_id}/candidates.json`)).resolves.toBe(false);
  });

  it('rejects implicit or agent-selected provenance', async () => {
    await service.open(openInput);
    const set = await service.submitCandidates(candidateInput);
    await expect(service.select({
      cycle_id: openInput.cycle_id, candidate_set_digest: set.candidate_set_digest,
      selected_brief_id: 'brief_a', selection_source: 'agent_inferred', selected_by: 'codex',
      selected_at: '2026-08-24T10:00:00.000Z'
    } as never)).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('never overwrites a first Human Selection with a second choice', async () => {
    await service.open(openInput);
    const set = await service.submitCandidates(candidateInput);
    const selection = await service.select({
      cycle_id: openInput.cycle_id, candidate_set_digest: set.candidate_set_digest,
      selected_brief_id: 'brief_b', selection_source: 'human_explicit', selected_by: 'human',
      selected_at: '2026-08-24T10:00:00.000Z'
    });
    await expect(service.select({
      cycle_id: openInput.cycle_id, candidate_set_digest: set.candidate_set_digest,
      selected_brief_id: 'brief_a', selection_source: 'human_explicit', selected_by: 'human',
      selected_at: '2026-08-24T10:01:00.000Z'
    })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
    await expect(store.readJson(`program/weeks/${openInput.cycle_id}/selection.json`)).resolves.toEqual(selection);
  });
});
