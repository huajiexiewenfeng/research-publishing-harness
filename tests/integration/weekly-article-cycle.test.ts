import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArticleService } from '../../harnesses/research-publishing/branches/article-harness/article-service.js';
import { PackageService } from '../../harnesses/research-publishing/core/package-service.js';
import { ResearchBacklogService } from '../../harnesses/research-publishing/core/research-backlog-service.js';
import {
  createResearchContextReview,
  createResearchContextSnapshot,
  createResearchQueryPlan
} from '../../harnesses/research-publishing/core/research-query-types.js';
import { ResearchRoadmapService } from '../../harnesses/research-publishing/core/research-roadmap-service.js';
import { WeeklyPackageCompiler } from '../../harnesses/research-publishing/core/weekly-package-compiler.js';
import { WeeklyResearchCycleService } from '../../harnesses/research-publishing/core/weekly-research-cycle-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import type { ResearchTopicRevisionV1 } from '../../harnesses/research-publishing/core/research-program-types.js';
import { researchPackage } from '../fixtures/research-package.js';
import { roadmapInput, topicInput, weeklyCandidateBrief } from '../fixtures/research-program.js';

describe('Phase 2 weekly article cycle', () => {
  it('ends at a finalized local Article Package with no publication or Browser write', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-weekly-integration-')));
    const roadmaps = new ResearchRoadmapService(store);
    const roadmap = await roadmaps.create(roadmapInput);
    const backlog = new ResearchBacklogService(store, roadmaps);
    const topics: ResearchTopicRevisionV1[] = [];
    for (const id of ['a', 'b', 'c']) {
      topics.push(await backlog.add(topicInput(`topic_${id}`, 'evidence_ready')));
    }
    const plan = createResearchQueryPlan({
      query_id: 'query_weekly_integration', track_id: 'enterprise-agent-runtime',
      query_intent: 'Find the current Runtime boundary.', view: 'mainline', include_working: false,
      selection_terms: ['runtime', 'boundary'], selection_rationale: 'Use accepted evidence.',
      document_mode: 'none', catalog_ref: null, selected_shard_refs: [], selected_record_refs: [],
      selected_manifest_refs: [], selected_chunk_refs: [], created_at: '2026-08-24T07:00:00.000Z'
    });
    const snapshot = createResearchContextSnapshot({
      snapshot_id: 'snapshot_weekly_integration', query_plan_digest: plan.plan_digest,
      query_id: plan.query_id, query_intent: plan.query_intent, track_id: plan.track_id, view: plan.view,
      index_refs: [], selected_summary_refs: [], selected_record_refs: [],
      selected_evidence_refs: ['evidence:runtime'], context_items: [{
        context_ref: 'claim:runtime_boundary@1', relative_path: 'domains/research-publishing/claims/runtime.md',
        content_digest: `sha256:${'a'.repeat(64)}`, content: 'The boundary is evidence-backed.',
        source_layer: 'semantic_record', classification: 'data_only', sanitized: true, risk_flags: []
      }], risk_flags: [], budgets: plan.budgets, selection_rationale: plan.selection_rationale,
      query_status: 'loaded', runtime_version: '0.2.0', created_at: '2026-08-24T07:01:00.000Z'
    });
    const review = createResearchContextReview(snapshot, {
      review_id: 'review_weekly_integration', selected_context_refs: ['claim:runtime_boundary@1'],
      reviewer: 'human', reviewed_at: '2026-08-24T07:02:00.000Z'
    });
    const queryRoot = `memory/queries-v2/${plan.query_id}`;
    await store.writeNew(`${queryRoot}/plan.json`, plan);
    await store.writeNew(`${queryRoot}/snapshot.json`, snapshot);
    await store.writeNew(`${queryRoot}/review.json`, review);
    const context = {
      query_id: plan.query_id, plan_digest: plan.plan_digest, snapshot_digest: snapshot.snapshot_digest,
      review_digest: review.review_digest, selected_context_refs: review.selected_context_refs,
      query_status: snapshot.query_status, application_status: 'applied' as const,
      runtime_version: snapshot.runtime_version
    };
    const roadmapRef = {
      path: `program/roadmaps/${roadmap.roadmap_id}/revisions/${roadmap.revision}.json`,
      digest: roadmap.roadmap_digest
    };
    const weeks = new WeeklyResearchCycleService(store, roadmaps, backlog);
    const cycle = await weeks.open({
      cycle_id: 'week_01_integration', roadmap_ref: roadmapRef, week_number: 1,
      month_id: 'month_01', context_binding: context, opened_by: 'human',
      opened_at: '2026-08-24T08:00:00.000Z'
    });
    const candidates = await weeks.submitCandidates({
      candidate_set_id: 'candidate_set_week_01_integration', cycle_id: cycle.cycle_id,
      roadmap_ref: roadmapRef, context_binding: context,
      candidates: ['a', 'b'].map((id, index) => ({
        ...weeklyCandidateBrief(id),
        topic_ref: {
          path: `program/backlog/topics/topic_${id}/revisions/1.json`,
          digest: topics[index]!.revision_digest
        }
      })),
      generated_by_skill: 'article-publishing-copilot', created_at: '2026-08-24T09:00:00.000Z'
    });
    const selection = await weeks.select({
      cycle_id: cycle.cycle_id, candidate_set_digest: candidates.candidate_set_digest,
      selected_brief_id: 'brief_b', selection_source: 'human_explicit', selected_by: 'human',
      selected_at: '2026-08-24T10:00:00.000Z'
    });
    const compiled = await new WeeklyPackageCompiler(store).compile({
      cycle_id: cycle.cycle_id, selected_brief_id: selection.selected_brief_id,
      candidate_set_digest: candidates.candidate_set_digest, selection_digest: selection.selection_digest,
      package: {
        ...researchPackage, status: 'draft',
        thesis: { ...researchPackage.thesis, claim_status: 'observed' },
        claims: researchPackage.claims.map((claim) => ({
          ...claim, claim_status: claim.claim_status === 'planned' ? 'planned' as const : 'observed' as const
        }))
      }
    });
    const packages = new PackageService(store, () => new Date('2026-08-24T11:00:00.000Z'));
    const built = await packages.buildPackage({
      schema_version: '1.0', candidate_id: 'candidate_week_01_integration', title: compiled.topic,
      source_type: 'design', research_track: compiled.research_track.id,
      thesis_hint: compiled.thesis.summary, novelty_hint: 'Weekly evidence increment.',
      source_refs: ['source:test'], privacy: 'public', status: 'evidence_ready',
      captured_at: '2026-08-24T08:00:00.000Z'
    }, compiled);
    const reviewed = await packages.reviewPackage(built);
    const frozen = await packages.freezePackage(reviewed.package);
    const articles = new ArticleService(store, {
      runId: () => 'article_week_01_integration',
      now: () => new Date('2026-08-24T12:00:00.000Z')
    });
    const article = await articles.prepareArticle(frozen.package, {
      articleType: 'technical_essay', primaryAudience: 'AI Agent developers',
      language: 'en', targetDepth: 'focused', includeOpenQuestions: true
    });
    await articles.acceptArticleDraft(article.run_id, {
      schema_version: '1.0', run_id: article.run_id, title: 'Runtime Context as a Boundary',
      summary: 'A bounded weekly research increment.', language: 'en',
      sections: [{ heading: 'Observed contract', markdown: 'The scoped contract is observed.',
        claim_refs: ['claim_verified'], source_refs: ['source_test'] }],
      open_questions: ['Which failures should become Trace contracts?']
    });
    await articles.reviewArticle(article.run_id);
    const finalized = await articles.finalizeArticle(article.run_id);
    expect(finalized.artifacts).toContain(`${finalized.root}/article.md`);
    expect(await store.list('receipts')).toEqual([]);
    expect(await store.list('x')).toEqual([]);
  });
});
