import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createGenerationTask } from '../../harnesses/research-publishing/core/generation.js';
import { createContextSnapshot, createMemoryQueryPlan } from '../../harnesses/research-publishing/core/memory-contracts.js';
import { bindMemoryContext } from '../../harnesses/research-publishing/core/memory-package.js';
import { PackageService } from '../../harnesses/research-publishing/core/package-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';

const candidate = {
  schema_version: '1.0',
  candidate_id: 'candidate_runtime',
  title: 'Evidence-bound runtime context',
  source_type: 'design',
  research_track: 'enterprise-agent-runtime',
  thesis_hint: 'Runtime context should carry evidence and boundaries.',
  source_refs: ['https://example.com/design'],
  privacy: 'public',
  status: 'idea',
  captured_at: '2026-08-18T12:00:00.000Z'
} as const;

describe('research package lifecycle', () => {
  it('revalidates applied memory provenance through build, review, and freeze', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-memory-lifecycle-'));
    const store = await WorkspaceStore.open(root);
    const service = new PackageService(store, () => new Date('2026-08-22T13:00:00.000Z'));
    await service.captureCandidate(candidate);
    const qualified = await service.qualifyCandidate(candidate.candidate_id, {
      novelty_hint: 'Memory provenance is frozen with the package.'
    });
    const plan = createMemoryQueryPlan({
      research_track: 'enterprise-agent-runtime', purpose: 'candidate_enrichment',
      primary_domain: 'research-publishing',
      allowed_paths: ['domains/research-publishing/tracks/enterprise-agent-runtime/**'],
      query_terms: [], context_budget: { max_items: 2, max_chars: 1000, max_item_chars: 500 },
      ordering_policy: 'path_asc',
      profile_digest: `sha256:${'a'.repeat(64)}`, scp_digest: `sha256:${'b'.repeat(64)}`,
      runtime_requirement: { name: 'llm-wiki-runtime', version: '0.2.0' }
    });
    const snapshot = createContextSnapshot(plan, {
      status: 'loaded', runtime_version: '0.2.0', excluded_count: 0, truncated_count: 0,
      items: [{
        path: 'domains/research-publishing/tracks/enterprise-agent-runtime/insights/i1.md',
        checksum: `sha256:${'c'.repeat(64)}`, content: 'Candidate memory evidence.',
        instruction_policy: 'data_only', sanitized: false, risk_flags: []
      }]
    });
    const ref = snapshot.items[0]!.context_ref;
    const draft11 = bindMemoryContext({
      ...researchPackage, schema_version: '1.1', package_id: 'package_memory_runtime', version: 1,
      status: 'draft', evidence: [{ ...researchPackage.evidence[0], source_ref: ref }],
      memory_context: { query_plan_digest: null, context_snapshot_digest: null, context_refs: [], status: 'not_configured', reviewer: null, reviewed_at: null }
    }, snapshot, [ref], 'human-reviewer', new Date('2026-08-22T12:30:00.000Z'));

    const built = await service.buildPackage(qualified, draft11);
    const reviewed = await service.reviewPackage(built);
    const frozen = await service.freezePackage(reviewed.package);
    expect(frozen.package).toMatchObject({ schema_version: '1.1', status: 'frozen' });

    if (built.schema_version !== '1.1') throw new Error('expected Package 1.1');
    await expect(service.reviewPackage({
      ...built,
      memory_context: { ...built.memory_context, context_refs: [] }
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
  it('qualifies, reviews and freezes immutable package versions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-lifecycle-'));
    const store = await WorkspaceStore.open(root);
    const service = new PackageService(store, () => new Date('2026-08-18T13:00:00.000Z'));

    await service.captureCandidate(candidate);
    await expect(service.qualifyCandidate(candidate.candidate_id, {})).rejects.toMatchObject({
      code: 'RESEARCH_GATE_BLOCKED'
    });

    const qualified = await service.qualifyCandidate(candidate.candidate_id, {
      novelty_hint: 'This makes the evidence boundary a runtime input instead of prompt prose.'
    });
    expect(qualified.status).toBe('evidence_ready');

    const draft = await service.buildPackage(qualified, {
      ...researchPackage,
      status: 'draft',
      package_id: 'package_runtime',
      version: 1
    });
    expect(draft.status).toBe('evidence_ready');
    const reviewed = await service.reviewPackage(draft);
    expect(reviewed.package.status).toBe('reviewed');
    expect(reviewed.package.version).toBe(2);
    expect(reviewed.report.passed).toBe(true);

    const frozen = await service.freezePackage(reviewed.package);
    expect(frozen.package.status).toBe('frozen');
    expect(frozen.package.version).toBe(3);
    expect(frozen.digest).toMatch(/^sha256:[a-f0-9]{64}$/);

    await expect(service.freezePackage(reviewed.package)).rejects.toMatchObject({
      code: 'ARTIFACT_EXISTS'
    });
    await expect(
      store.readJson('packages/package_runtime/v2/package.json')
    ).resolves.toMatchObject({ status: 'reviewed', version: 2 });
  });

  it('creates a contract-valid generation task without internal-only sources', () => {
    const packageWithPrivateSource = {
      ...researchPackage,
      status: 'frozen',
      sources: [
        ...researchPackage.sources,
        {
          source_id: 'source_private',
          source_type: 'document',
          location: 'private design',
          access: 'private',
          publication_policy: 'internal_only'
        }
      ]
    } as const;

    const task = createGenerationTask(
      { run_id: 'run_article_1', branch: 'article', mode: 'deep_dive', language: 'en' },
      packageWithPrivateSource,
      ['Do not present planned work as shipped.']
    );

    expect(task.source_summaries.map((source) => source.source_id)).toEqual(['source_test']);
    expect(task.claims[1]).toMatchObject({ claim_status: 'planned' });
  });
});
