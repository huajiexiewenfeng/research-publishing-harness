import { describe, expect, it } from 'vitest';

import { createContextSnapshot, createMemoryQueryPlan } from '../../harnesses/research-publishing/core/memory-contracts.js';
import { bindMemoryContext, validatePackageMemoryBinding } from '../../harnesses/research-publishing/core/memory-package.js';
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
});
