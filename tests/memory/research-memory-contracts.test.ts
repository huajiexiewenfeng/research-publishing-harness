import { describe, expect, it } from 'vitest';

import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  createArtifactRefV2,
  createClaimVersion,
  createResearchIncrementRevision
} from '../../harnesses/research-publishing/core/research-memory-contracts.js';
import { RESEARCH_MEMORY_POLICY_V1 } from '../../harnesses/research-publishing/core/research-memory-policy.js';

const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}` as const;

describe('Research Memory V2.3 contracts', () => {
  it('locks the implementation policy into a versioned constant', () => {
    expect(RESEARCH_MEMORY_POLICY_V1).toEqual({
      policy_version: 'research-memory-policy/v1',
      default_track_id: 'enterprise-agent-runtime',
      max_chars_per_chunk: 3_000,
      max_chars_per_index_record: 12_000,
      max_shards_per_query: 4,
      max_semantic_records_per_query: 12,
      max_document_chunks_per_query: 6,
      max_reconstructed_document_chars: 60_000,
      shard_entry_threshold: 64,
      shard_byte_threshold: 96_000,
      runtime_requirement: { name: 'llm-wiki-runtime', version: '0.2.0' }
    });
  });

  it('creates a relative digest-addressed Artifact ref and rejects absolute paths', () => {
    const value = createArtifactRefV2({
      role: 'canonical_article',
      workspace_relative_path: 'articles/runtime/article.md',
      digest: digest('a'),
      media_type: 'text/markdown',
      byte_size: 42,
      canonical: true,
      privacy_classification: 'internal'
    });
    expect(value.object_path).toBe(`memory/evidence/objects/sha256/aa/${'a'.repeat(64)}`);
    expect(() => createArtifactRefV2({
      ...value,
      workspace_relative_path: 'C:\\secret.md'
    })).toThrowError(/workspace-relative/);
    expect(() => createArtifactRefV2({
      ...value,
      workspace_relative_path: '../secret.md'
    })).toThrowError(/workspace-relative/);
  });

  it('binds a Research Increment revision to its complete canonical content', () => {
    const input = {
      increment_id: 'increment_runtime_boundary',
      revision: 1,
      track_id: 'enterprise-agent-runtime',
      title: 'Skill and Runtime boundary',
      research_question: 'Where should deterministic knowledge access live?',
      thesis: 'Domain semantics belong in the Skill; deterministic access belongs in the Runtime.',
      summary: 'Separating semantics from deterministic access prevents each Skill from rebuilding storage policy.',
      document_manifest_refs: ['document:runtime-boundary@1'],
      tags: ['agent-runtime', 'skills'],
      claim_refs: ['claim:runtime-boundary@1'],
      decision_refs: [],
      boundary_refs: ['boundary:no-production-impact-proof'],
      open_question_refs: ['question:trace-contract@1'],
      source_refs: ['evidence:evidence_runtime_boundary'],
      evidence_snapshot_refs: ['evidence:evidence_runtime_boundary'],
      predecessor_refs: [],
      created_at: '2026-08-23T00:00:00.000Z'
    } as const;
    const revision = createResearchIncrementRevision(input);
    expect(revision.content_digest).toBe(sha256(input));
    expect(() => createResearchIncrementRevision({ ...input, thesis: '' }))
      .toThrowError(/research-increment-revision/);
  });

  it('does not allow a Claim to outrank its canonical source status', () => {
    expect(() => createClaimVersion({
      claim_id: 'claim_runtime_boundary',
      version: 1,
      statement: 'The boundary improves production reliability.',
      claim_status: 'verified',
      canonical_claim_status: 'observed',
      evidence_refs: ['evidence:evidence_runtime_boundary'],
      boundary_refs: ['boundary:no-production-impact-proof'],
      increment_ref: 'increment:increment_runtime_boundary@1',
      evolution_refs: [],
      summary: 'Observed locally; no production benchmark.'
    })).toThrowError(/claim status/);
  });
});
