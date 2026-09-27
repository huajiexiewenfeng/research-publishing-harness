import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { RuntimeEnvelope } from '../../harnesses/research-publishing/adapters/llm-wiki/runtime-protocol.js';
import { sha256, sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
import { HarnessError } from '../../harnesses/research-publishing/core/errors.js';
import type { MemoryPromotionRuntime } from '../../harnesses/research-publishing/core/memory-promotion-service.js';
import { ResearchEvidenceService } from '../../harnesses/research-publishing/core/research-evidence-service.js';
import type { ResearchIndexSourceRecordV1 } from '../../harnesses/research-publishing/core/research-index-types.js';
import { ResearchIncrementService } from '../../harnesses/research-publishing/core/research-increment-service.js';
import { SemanticDeltaService } from '../../harnesses/research-publishing/core/semantic-delta-service.js';
import type { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

export const promotionAssets = {
  profile_path: resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml'),
  mapping_path: resolve('harnesses/research-publishing/memory/ingest-mapping.yml'),
  scp_paths: [
    resolve('harnesses/research-publishing/memory/scp.yml'),
    resolve('skills/article-publishing-copilot/scp.yml'),
    resolve('skills/x-publishing-copilot/scp.yml')
  ]
} as const;

export class FakePromotionRuntime implements MemoryPromotionRuntime {
  readonly calls: string[] = [];
  failOnceAt: string | null = null;
  mismatchAlreadyExistsType: string | null = null;
  catalog: { path: string; digest: `sha256:${string}` } | null = null;

  private fail(name: string): void {
    this.calls.push(name);
    if (this.failOnceAt === name) {
      this.failOnceAt = null;
      throw new HarnessError('MEMORY_RUNTIME_FAILED', `synthetic failure at ${name}`);
    }
  }

  async version(): Promise<'0.2.0' | '0.3.0'> { this.fail('version'); return '0.2.0' as const; }
  async validateMapping() { this.fail('validate_mapping'); return { status: 'ok' } as RuntimeEnvelope; }
  async findCatalog() {
    this.fail('find_catalog');
    return this.catalog === null ? { status: 'not_found' as const } : { status: 'found' as const, ...this.catalog };
  }
  async copySource(input: Readonly<Record<string, unknown>>) {
    this.fail('copy_source');
    const checksum = sha256Bytes(await readFile(input.source as string));
    return { status: 'ok' as const, path: input.logical_path as string, checksum };
  }
  async writeRecord(input: Readonly<Record<string, unknown>>) {
    const recordType = input.record_type as string;
    this.fail(`write_record:${recordType}`);
    const actual = sha256Bytes(await readFile(input.content_file as string));
    const checksum = this.mismatchAlreadyExistsType === recordType
      ? `sha256:${'f'.repeat(64)}` as const : actual;
    if (recordType === 'research_index_catalog') {
      this.catalog = { path: 'domains/research-publishing/tracks/enterprise-agent-runtime/indexes/catalog.md', digest: checksum };
    }
    return { status: this.mismatchAlreadyExistsType === recordType ? 'already_exists' as const : 'ok' as const, path: `runtime/${recordType}.md`, checksum };
  }
  async registerArtifact() { this.fail('register_artifact'); return { status: 'ok' } as RuntimeEnvelope; }
  async appendLog() { this.fail('append_log'); return { status: 'ok', path: 'logs/memory.jsonl' } as RuntimeEnvelope; }
}

export async function createPromotionFixture(store: WorkspaceStore) {
  await store.writeNew('packages/promotion.md', '# Promotion source\n');
  const evidence = await new ResearchEvidenceService(store, {
    evidenceSnapshotId: () => 'evidence_promotion_001',
    now: () => new Date('2026-08-23T04:00:00.000Z')
  }).capture({
    increment_id: 'increment_promotion_001', increment_revision: 1,
    capture_event: 'research_package_finalized', capture_kind: 'automatic_terminal',
    workspace_identity_digest: `sha256:${'a'.repeat(64)}`,
    artifacts: [{ workspace_relative_path: 'packages/promotion.md', role: 'research_package', media_type: 'text/markdown', canonical: true, privacy_classification: 'internal' }],
    source_refs: ['package:promotion'], privacy_classification: 'internal'
  });
  await new ResearchIncrementService(store, {
    lifecycleEventId: () => 'event_promotion_working',
    now: () => new Date('2026-08-23T04:01:00.000Z')
  }).assemble({
    increment_id: 'increment_promotion_001', revision: 1, title: 'Promotion',
    research_question: 'Can promotion remain atomic?', thesis: 'Catalog must commit last.',
    summary: 'Human-promoted atomic promotion summary.', document_manifest_refs: [], tags: ['promotion'],
    claim_refs: [], decision_refs: [], boundary_refs: [], open_question_refs: [], source_refs: ['package:promotion'],
    evidence_snapshot_refs: [`evidence:${evidence.evidence_snapshot_id}`], predecessor_refs: []
  });
  const indexEntry: ResearchIndexSourceRecordV1 = {
    ref: 'claim:claim_promotion_001@1', record_path: 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/claim_promotion_001/versions/1.md',
    record_digest: `sha256:${'b'.repeat(64)}`, title: 'Catalog-last promotion',
    summary: 'Human-promoted claim summary.', tags: ['promotion'], category: 'semantic',
    claim_status: 'observed', lifecycle_status: 'accepted', evolution_target: null,
    updated_at: '2026-08-23T04:02:00.000Z', accepted_at: '2026-08-23T04:02:00.000Z', published_at: null,
    evidence_available: true, document_manifest_available: false
  };
  const targetContent = {
    frontmatter: { claim_id: 'claim_promotion_001', version: 1, claim_status: 'observed' },
    body: '# Catalog-last promotion\n\nHuman-promoted claim summary.\n',
    variables: { research_track: 'enterprise-agent-runtime', claim_id: 'claim_promotion_001', version: '1' },
    refs: {}, index_entry: indexEntry
  };
  const deltas = new SemanticDeltaService(store, {
    now: () => new Date('2026-08-23T04:03:00.000Z')
  });
  const delta = await deltas.propose({
    delta_id: 'delta_promotion_001', increment_ref: 'increment:enterprise-agent-runtime:increment_promotion_001@1',
    base_catalog_digest: sha256({ catalog: null }), evidence_snapshot_refs: [`evidence:${evidence.evidence_snapshot_id}`],
    proposed_operations: [{
      operation_id: 'op_claim_promotion_001', operation_type: 'add_record', target_id: 'claim_promotion_001',
      record_type: 'claim_version', target_content: targetContent, target_content_digest: sha256(targetContent),
      evidence_refs: [`evidence:${evidence.evidence_snapshot_id}`], evidence_privacy_classification: 'internal',
      target_privacy_classification: 'internal', index_impact: ['mainline', 'history']
    }], generated_by: 'research-publishing-harness', generated_at: '2026-08-23T04:03:00.000Z',
    policy_version: 'semantic-promotion/v1'
  });
  const review = await deltas.review(delta.delta_id, {
    review_id: 'review_promotion_001', accepted_operation_ids: ['op_claim_promotion_001'],
    rejected_operation_ids: [], rejection_reasons: [], operation_replacements: [],
    reviewer: 'human-reviewer', reviewed_at: '2026-08-23T04:04:00.000Z'
  });
  return { delta, review, indexEntry };
}
