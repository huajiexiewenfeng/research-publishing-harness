import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchEvidenceService } from '../../harnesses/research-publishing/core/research-evidence-service.js';
import { ResearchIncrementService } from '../../harnesses/research-publishing/core/research-increment-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const digest = `sha256:${'a'.repeat(64)}` as const;

describe('Research Evidence foundation integration', () => {
  it('assembles a default-track Working Increment from verified Evidence', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-increment-foundation-'));
    const store = await WorkspaceStore.open(root);
    await store.writeNew('packages/runtime/package.md', '# Runtime package\n');
    const evidence = await new ResearchEvidenceService(store, {
      evidenceSnapshotId: () => 'evidence_increment_001',
      now: () => new Date('2026-08-23T02:00:00.000Z')
    }).capture({
      increment_id: 'increment_runtime_001', increment_revision: 1,
      capture_event: 'research_package_finalized', capture_kind: 'automatic_terminal',
      workspace_identity_digest: digest,
      artifacts: [{
        workspace_relative_path: 'packages/runtime/package.md', role: 'research_package',
        media_type: 'text/markdown', canonical: true, privacy_classification: 'internal'
      }],
      source_refs: ['package:runtime'], privacy_classification: 'internal'
    });
    const increments = new ResearchIncrementService(store, {
      lifecycleEventId: () => 'event_increment_runtime_001_1',
      now: () => new Date('2026-08-23T02:05:00.000Z')
    });
    const revision = await increments.assemble({
      increment_id: 'increment_runtime_001', revision: 1,
      title: 'Runtime boundary', research_question: 'Where should deterministic access live?',
      thesis: 'Domain semantics stay in Skills and deterministic access stays in Runtime.',
      summary: 'A governed boundary prevents per-Skill storage implementations.',
      document_manifest_refs: [], tags: ['agent-runtime'], claim_refs: [], decision_refs: [],
      boundary_refs: ['boundary:no-production-benchmark'], open_question_refs: [],
      source_refs: ['package:runtime'], evidence_snapshot_refs: [`evidence:${evidence.evidence_snapshot_id}`],
      predecessor_refs: []
    });
    expect(revision.track_id).toBe('enterprise-agent-runtime');
    await expect(increments.status(revision.increment_id)).resolves.toMatchObject({
      state: 'working', latest_revision: 1, track_id: 'enterprise-agent-runtime'
    });
    await expect(increments.lineage(revision.increment_id)).resolves.toMatchObject({
      revisions: [{ revision: 1, content_digest: revision.content_digest }]
    });
    await expect(store.exists('.llm-wiki/domains/research-publishing/index.md'))
      .rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });

  it('keeps side tracks isolated and resolves an explicit cross-track predecessor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-increment-tracks-'));
    const store = await WorkspaceStore.open(root);
    const evidenceService = new ResearchEvidenceService(store);
    const increments = new ResearchIncrementService(store);
    for (const [id, track] of [
      ['increment_skill_001', 'agent-skills'],
      ['increment_runtime_002', 'enterprise-agent-runtime']
    ] as const) {
      await store.writeNew(`packages/${id}.md`, `# ${id}\n`);
      const evidence = await evidenceService.capture({
        increment_id: id, increment_revision: 1,
        capture_event: 'research_package_finalized', capture_kind: 'automatic_terminal',
        workspace_identity_digest: digest,
        artifacts: [{
          workspace_relative_path: `packages/${id}.md`, role: 'research_package',
          media_type: 'text/markdown', canonical: true, privacy_classification: 'internal'
        }], source_refs: [`package:${id}`], privacy_classification: 'internal'
      });
      await increments.assemble({
        increment_id: id, revision: 1, track_id: track,
        title: id, research_question: `Question for ${id}?`, thesis: `Thesis for ${id}.`,
        summary: `Summary for ${id}.`, document_manifest_refs: [], tags: [], claim_refs: [],
        decision_refs: [], boundary_refs: [], open_question_refs: [], source_refs: [`package:${id}`],
        evidence_snapshot_refs: [`evidence:${evidence.evidence_snapshot_id}`],
        predecessor_refs: id === 'increment_runtime_002'
          ? ['increment:agent-skills:increment_skill_001@1'] : []
      });
    }
    await expect(increments.lineage('increment_runtime_002')).resolves.toMatchObject({
      track_id: 'enterprise-agent-runtime',
      revisions: [{ predecessor_refs: ['increment:agent-skills:increment_skill_001@1'] }]
    });
  });
});
