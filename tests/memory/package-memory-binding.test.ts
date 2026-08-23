import { describe, expect, it } from 'vitest';

import { createContextSnapshot, createMemoryQueryPlan } from '../../harnesses/research-publishing/core/memory-contracts.js';
import { bindMemoryContext, bindResearchMemoryContext, validatePackageMemoryBinding } from '../../harnesses/research-publishing/core/memory-package.js';
import type { ResearchContentPackageV1_1 } from '../../harnesses/research-publishing/core/types.js';
import { researchPackage } from '../fixtures/research-package.js';

const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}` as const;

function fixture() {
  const plan = createMemoryQueryPlan({
    research_track: 'enterprise-agent-runtime',
    purpose: 'candidate_enrichment',
    primary_domain: 'research-publishing',
    allowed_paths: ['domains/research-publishing/tracks/enterprise-agent-runtime/**'],
    query_terms: ['runtime boundary'],
    context_budget: { max_items: 8, max_chars: 16_000, max_item_chars: 4_000 },
    ordering_policy: 'path_asc',
    profile_digest: digest('a'),
    scp_digest: digest('b'),
    runtime_requirement: { name: 'llm-wiki-runtime', version: '0.2.0' }
  }, {
    queryId: () => 'query_binding_001',
    runId: () => 'run_binding_001',
    now: () => new Date('2026-08-22T10:00:00.000Z')
  });
  const snapshot = createContextSnapshot(plan, {
    status: 'loaded',
    runtime_version: '0.2.0',
    items: [{
      path: 'domains/research-publishing/tracks/enterprise-agent-runtime/insights/i1.md',
      checksum: digest('c'),
      content: 'A bounded runtime may need an explicit revocation contract.',
      instruction_policy: 'data_only',
      sanitized: false,
      risk_flags: []
    }],
    excluded_count: 0,
    truncated_count: 0
  }, { snapshotId: () => 'snapshot_binding_001' });
  const draft = {
    ...researchPackage,
    schema_version: '1.1',
    status: 'draft',
    memory_context: {
      query_plan_digest: null,
      context_snapshot_digest: null,
      context_refs: [],
      status: 'not_configured',
      reviewer: null,
      reviewed_at: null
    }
  } as const satisfies ResearchContentPackageV1_1;
  return { plan, snapshot, draft };
}

describe('Package 1.1 memory binding', () => {
  it('binds only selected refs from a frozen snapshot', () => {
    const { snapshot, draft } = fixture();
    const selected = snapshot.items[0]!.context_ref;
    const bound = bindMemoryContext(
      draft,
      snapshot,
      [selected],
      'human-reviewer',
      new Date('2026-08-22T10:30:00.000Z')
    );
    expect(bound.memory_context).toEqual({
      query_plan_digest: snapshot.query_plan_digest,
      context_snapshot_digest: snapshot.snapshot_digest,
      context_refs: [selected],
      status: 'applied',
      reviewer: 'human-reviewer',
      reviewed_at: '2026-08-22T10:30:00.000Z'
    });
    expect(draft.memory_context.status).toBe('not_configured');
  });

  it('rejects unknown selections and evidence sourced from unapplied memory', () => {
    const { snapshot, draft } = fixture();
    const selected = snapshot.items[0]!.context_ref;
    expect(() => bindMemoryContext(draft, snapshot, ['llm-wiki:unknown@sha256:bad'], 'reviewer', new Date()))
      .toThrowError(/snapshot/);

    const packageWithUnappliedEvidence = {
      ...draft,
      evidence: [{
        ...draft.evidence[0],
        source_ref: selected
      }]
    } as ResearchContentPackageV1_1;
    expect(() => validatePackageMemoryBinding(packageWithUnappliedEvidence))
      .toThrowError(/unapplied memory context/);
  });

  it('does not bind new memory to a non-draft package', () => {
    const { snapshot, draft } = fixture();
    expect(() => bindMemoryContext(
      { ...draft, status: 'evidence_ready' },
      snapshot,
      [snapshot.items[0]!.context_ref],
      'reviewer',
      new Date()
    )).toThrowError(/draft/);
  });

  it('binds a reviewed V2 Snapshot without mutating the draft and rejects non-draft states', () => {
    const { draft } = fixture();
    const snapshot = {
      schema_version: 'research-context-snapshot/v2' as const,
      snapshot_id: 'snapshot_v2', query_id: 'query_v2', query_plan_digest: digest('a'),
      query_intent: 'test', track_id: 'enterprise-agent-runtime', view: 'mainline' as const,
      index_refs: [], selected_summary_refs: [], selected_record_refs: [], selected_evidence_refs: [],
      context_items: [{ context_ref: 'claim:test@1', relative_path: 'claims/test.md', content_digest: digest('c'), content: 'test', source_layer: 'semantic_record' as const, classification: 'data_only' as const, sanitized: false, risk_flags: [] }],
      risk_flags: [], budgets: { max_shards: 4, max_records: 12, max_chunks: 6, max_chars_per_index_record: 12000, max_reconstructed_document_chars: 60000 } as const,
      selection_rationale: 'test', query_status: 'loaded' as const, runtime_version: '0.2.0' as const,
      created_at: '2026-08-23T00:00:00.000Z', snapshot_digest: digest('b')
    };
    const review = {
      schema_version: 'research-context-review/v2' as const, review_id: 'review_v2', query_id: 'query_v2',
      query_plan_digest: digest('a'), snapshot_digest: digest('b'), selected_context_refs: ['claim:test@1'],
      reviewer: 'human-reviewer', reviewed_at: '2026-08-23T00:01:00.000Z', review_digest: digest('c')
    };
    const bound = bindResearchMemoryContext(draft, snapshot, review);
    expect(bound.memory_context).toMatchObject({ schema_version: 'memory-context/v2', status: 'applied' });
    expect(draft.memory_context.status).toBe('not_configured');
    expect(() => bindResearchMemoryContext({ ...draft, status: 'frozen' }, snapshot, review))
      .toThrowError(/draft/);
  });
});
