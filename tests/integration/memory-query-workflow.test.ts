import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MemoryQueryService } from '../../harnesses/research-publishing/core/memory-query-service.js';
import { PackageService } from '../../harnesses/research-publishing/core/package-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';

const candidate = {
  schema_version: '1.0', candidate_id: 'candidate_memory_query', title: 'Memory query boundary',
  source_type: 'design', research_track: 'enterprise-agent-runtime',
  thesis_hint: 'Context provenance belongs in the package.', source_refs: ['https://example.com/design'],
  privacy: 'public', status: 'idea', captured_at: '2026-08-22T09:00:00.000Z'
} as const;

describe('memory query to frozen package integration', () => {
  it('keeps query/review artifacts immutable and freezes only applied provenance', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-memory-query-integration-'));
    const store = await WorkspaceStore.open(root);
    const runtime = {
      async query() {
        return {
          status: 'loaded' as const, runtime_version: '0.2.0' as const,
          excluded_count: 0, truncated_count: 0,
          items: [{
            path: 'domains/research-publishing/tracks/enterprise-agent-runtime/insights/query.md',
            checksum: `sha256:${'a'.repeat(64)}` as const,
            content: 'A query boundary needs explicit provenance.', instruction_policy: 'data_only' as const,
            sanitized: false, risk_flags: []
          }]
        };
      }
    };
    const query = new MemoryQueryService(store, runtime, {
      queryId: () => 'query_integration_001', runId: () => 'run_integration_001',
      snapshotId: () => 'snapshot_integration_001',
      now: () => new Date('2026-08-22T10:00:00.000Z')
    });
    const plan = await query.planQuery({
      research_track: 'enterprise-agent-runtime', purpose: 'candidate_enrichment', query_terms: [],
      context_budget: { max_items: 4, max_chars: 8_000, max_item_chars: 2_000 },
      profile_digest: `sha256:${'b'.repeat(64)}`, scp_digest: `sha256:${'c'.repeat(64)}`
    });
    const snapshot = await query.executeQuery(plan.query_id);
    await query.reviewContext(plan.query_id, {
      selected_refs: [snapshot.items[0]!.context_ref], reviewed_by: 'human-reviewer',
      reviewed_at: new Date('2026-08-22T10:30:00.000Z')
    });
    const draft = await query.bindPackage(plan.query_id, {
      ...researchPackage, schema_version: '1.1', package_id: 'package_query_integration',
      status: 'draft', evidence: [{ ...researchPackage.evidence[0], source_ref: snapshot.items[0]!.context_ref }],
      memory_context: { query_plan_digest: null, context_snapshot_digest: null, context_refs: [], status: 'not_configured', reviewer: null, reviewed_at: null }
    });
    const packages = new PackageService(store, () => new Date('2026-08-22T11:00:00.000Z'));
    await packages.captureCandidate(candidate);
    const qualified = await packages.qualifyCandidate(candidate.candidate_id, {
      novelty_hint: 'The Package binds the exact context snapshot.'
    });
    const built = await packages.buildPackage(qualified, draft);
    const reviewed = await packages.reviewPackage(built);
    const frozen = await packages.freezePackage(reviewed.package);
    expect(frozen.package).toMatchObject({
      schema_version: '1.1', status: 'frozen',
      memory_context: { status: 'applied', context_refs: [snapshot.items[0]!.context_ref] }
    });
    await expect(query.reviewContext(plan.query_id, {
      selected_refs: [], reviewed_by: 'second-reviewer', reviewed_at: new Date()
    })).rejects.toMatchObject({ code: 'ARTIFACT_EXISTS' });
  });
});
