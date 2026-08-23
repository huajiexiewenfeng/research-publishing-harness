import { describe, expect, it } from 'vitest';

import {
  createResearchContextReview,
  createResearchContextSnapshot,
  createResearchQueryPlan
} from '../../harnesses/research-publishing/core/research-query-types.js';

const digest = (char: string) => `sha256:${char.repeat(64)}` as const;

function input() {
  return {
    query_id: 'query_runtime_boundary', track_id: 'enterprise-agent-runtime',
    query_intent: 'Find evidence for the Runtime boundary.', view: 'mainline' as const,
    include_working: false, selection_terms: ['runtime', 'boundary'],
    selection_rationale: 'Prefer accepted claims with canonical evidence.',
    document_mode: 'supporting_chunks' as const,
    catalog_ref: { path: 'domains/research-publishing/tracks/enterprise-agent-runtime/indexes/catalog.md', digest: digest('a'), generation: 'g_001' },
    selected_shard_refs: [{ shard_id: 'shard_001', path: 'domains/research-publishing/tracks/enterprise-agent-runtime/indexes/generations/g_001/mainline/shards/shard_001-a.md', digest: digest('b'), generation: 'g_001', view: 'mainline' as const }],
    selected_record_refs: [{ ref: 'claim:runtime_boundary@1', path: 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/runtime_boundary/versions/1.md', digest: digest('c'), evidence_refs: ['evidence:e_001'], document_manifest_ref: null }],
    selected_manifest_refs: [{ document_id: 'doc_001', path: 'domains/research-publishing/tracks/enterprise-agent-runtime/documents/doc_001/manifest.md', digest: digest('d') }],
    selected_chunk_refs: [{ chunk_id: 'chunk_001', path: 'domains/research-publishing/tracks/enterprise-agent-runtime/documents/doc_001/chunks/1-a.md', digest: digest('e'), ordinal: 1, char_start: 0, char_end: 100 }],
    created_at: '2026-08-23T01:00:00.000Z'
  };
}

describe('progressive research Query contracts', () => {
  it('binds every selection layer and locked policy limit into the Plan digest', () => {
    const plan = createResearchQueryPlan(input());
    expect(plan.index_id).toBe('enterprise-agent-runtime:research');
    expect(plan.budgets).toMatchObject({
      max_shards: 4, max_records: 12, max_chunks: 6, max_reconstructed_document_chars: 60_000
    });
    const history = input();
    expect(plan.plan_digest).not.toBe(createResearchQueryPlan({
      ...history, view: 'history',
      selected_shard_refs: history.selected_shard_refs.map((item) => ({ ...item, view: 'history' as const }))
    }).plan_digest);
  });

  it('requires explicit opt-in for Working and explicit mode for full reconstruction', () => {
    expect(() => createResearchQueryPlan({ ...input(), view: 'working' }))
      .toThrowError(/include_working/);
    expect(() => createResearchQueryPlan({
      ...input(), document_mode: 'supporting_chunks', full_document_requested: true
    })).toThrowError(/full_explicit/);
    for (const view of ['mainline', 'history', 'publication', 'feedback'] as const) {
      const candidate = input();
      expect(() => createResearchQueryPlan({
        ...candidate, view,
        selected_shard_refs: candidate.selected_shard_refs.map((item) => ({ ...item, view }))
      })).not.toThrow();
    }
    const working = input();
    expect(() => createResearchQueryPlan({
      ...working, view: 'working', include_working: true,
      selected_shard_refs: working.selected_shard_refs.map((item) => ({ ...item, view: 'working' as const }))
    })).not.toThrow();
  });

  it('creates digest-bound Snapshot and Human Review values', () => {
    const plan = createResearchQueryPlan(input());
    const snapshot = createResearchContextSnapshot({
      snapshot_id: 'snapshot_runtime_boundary', query_plan_digest: plan.plan_digest,
      query_id: plan.query_id, query_intent: plan.query_intent, track_id: plan.track_id,
      view: plan.view, index_refs: [plan.catalog_ref!],
      selected_summary_refs: ['claim:runtime_boundary@1'],
      selected_record_refs: plan.selected_record_refs,
      selected_evidence_refs: ['evidence:e_001'],
      context_items: [{
        context_ref: 'claim:runtime_boundary@1', relative_path: plan.selected_record_refs[0]!.path,
        content_digest: digest('c'), content: 'Deterministic access belongs in the Runtime.',
        source_layer: 'semantic_record', classification: 'data_only', sanitized: false, risk_flags: []
      }],
      risk_flags: [], budgets: plan.budgets, selection_rationale: plan.selection_rationale,
      query_status: 'loaded', runtime_version: '0.2.0', created_at: '2026-08-23T01:01:00.000Z'
    });
    const review = createResearchContextReview(snapshot, {
      review_id: 'review_runtime_boundary', selected_context_refs: ['claim:runtime_boundary@1'],
      reviewer: 'human-reviewer', reviewed_at: '2026-08-23T01:02:00.000Z'
    });
    expect(snapshot.snapshot_digest).toMatch(/^sha256:/);
    expect(review.snapshot_digest).toBe(snapshot.snapshot_digest);
  });
});
