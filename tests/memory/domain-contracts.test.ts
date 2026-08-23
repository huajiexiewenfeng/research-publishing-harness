import { readFile } from 'node:fs/promises';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

interface ProfileAsset {
  profile: { id: string; version: string };
  write_rules: { records: Record<string, unknown> };
  logs: { types: { memory_event: unknown } };
  read_rules: { context_pack: Record<string, unknown>; record_lookup?: Record<string, unknown> };
}

interface MappingAsset {
  mapping: { id: string; version: string; domain: string; owner_skill_id: string };
  produces: readonly unknown[];
}

interface ScpAsset {
  skill: { id: string; domain: string };
  query: { primary_domain: string; supports: readonly unknown[] };
  llm_wiki: { profile: string; required: boolean };
  ingest: { produces: readonly unknown[] };
}

async function yaml<T>(path: string): Promise<T> {
  return parse(await readFile(path, 'utf8')) as T;
}

describe('research-publishing LLM Wiki domain assets', () => {
  it('declares create-only research records, append-only events, and bounded context', async () => {
    const profile = await yaml<ProfileAsset>('harnesses/research-publishing/memory/llm-wiki-profile.yml');
    expect(profile.profile).toMatchObject({ id: 'research-publishing', version: 'v0.1' });
    expect(profile.write_rules.records).toMatchObject({
      publication_evidence: {
        path: 'domains/research-publishing/tracks/{research_track}/publications/{publication_id}.md',
        mode: 'create_only',
        required_vars: ['research_track', 'publication_id'],
        required_refs: ['source_id']
      },
      feedback_snapshot: {
        path: 'domains/research-publishing/tracks/{research_track}/feedback/{feedback_id}.md',
        mode: 'create_only',
        required_vars: ['research_track', 'feedback_id'],
        required_refs: ['source_id', 'publication_id']
      },
      candidate_insight: {
        path: 'domains/research-publishing/tracks/{research_track}/insights/{insight_id}.md',
        mode: 'create_only',
        required_vars: ['research_track', 'insight_id'],
        required_refs: ['source_id', 'feedback_id']
      }
    });
    expect(profile.logs.types.memory_event).toEqual({
      path: 'logs/research-publishing-memory-event.jsonl',
      mode: 'append_only'
    });
    expect(profile.read_rules.context_pack).toMatchObject({
      include: ['domains/research-publishing/**'],
      exclude: ['sources/originals/**', '.meta/**'],
      order: 'path_asc'
    });
  });

  it('binds mapping validation to the internal harness and semantics to Article/X Skills', async () => {
    const mapping = await yaml<MappingAsset>('harnesses/research-publishing/memory/ingest-mapping.yml');
    const harnessScp = await yaml<ScpAsset>('harnesses/research-publishing/memory/scp.yml');
    const articleScp = await yaml<ScpAsset>('skills/article-publishing-copilot/scp.yml');
    const xScp = await yaml<ScpAsset>('skills/x-publishing-copilot/scp.yml');

    expect(mapping.mapping).toMatchObject({
      id: 'research-publishing-memory',
      version: 'v0.1',
      domain: 'research-publishing',
      owner_skill_id: 'research-publishing-harness-memory'
    });
    expect(mapping.produces).toEqual(expect.arrayContaining([
      { record_type: 'publication_evidence' },
      { record_type: 'feedback_snapshot' },
      { record_type: 'candidate_insight' },
      { log_type: 'memory_event' }
    ]));
    expect(harnessScp.skill).toEqual({ id: 'research-publishing-harness-memory', domain: 'research-publishing' });

    for (const [id, scp] of [
      ['article-publishing-copilot', articleScp],
      ['x-publishing-copilot', xScp]
    ] as const) {
      expect(scp.skill).toEqual({ id, domain: 'research-publishing' });
      expect(scp.query).toEqual({ primary_domain: 'research-publishing', supports: [] });
      expect(scp.llm_wiki).toMatchObject({ profile: 'research-publishing', required: false });
      expect(scp.ingest.produces).toEqual(expect.arrayContaining([
        { domain: 'research-publishing', record_type: 'publication_evidence' },
        { domain: 'research-publishing', record_type: 'feedback_snapshot' },
        { domain: 'research-publishing', record_type: 'candidate_insight' }
      ]));
    }
  });

  it('declares all V2.3 Runtime records, stable Catalog lookup, and bounded full index records', async () => {
    const profile = await yaml<ProfileAsset>('harnesses/research-publishing/memory/llm-wiki-profile.yml');
    const expected = {
      research_increment: ['domains/research-publishing/tracks/{research_track}/increments/{increment_id}/revisions/{revision}/summary.md', 'create_only'],
      research_lifecycle_event: ['domains/research-publishing/tracks/{research_track}/increments/{increment_id}/lifecycle/{event_id}.md', 'create_only'],
      canonical_document_manifest: ['domains/research-publishing/tracks/{research_track}/documents/{document_id}/manifest.md', 'create_only'],
      canonical_document_chunk: ['domains/research-publishing/tracks/{research_track}/documents/{document_id}/chunks/{ordinal}-{digest_hex}.md', 'create_only'],
      claim_version: ['domains/research-publishing/tracks/{research_track}/claims/{claim_id}/versions/{version}.md', 'create_only'],
      research_decision: ['domains/research-publishing/tracks/{research_track}/decisions/{decision_id}.md', 'create_only'],
      open_question: ['domains/research-publishing/tracks/{research_track}/questions/{question_id}/versions/{version}.md', 'create_only'],
      publication_expression: ['domains/research-publishing/tracks/{research_track}/publications/{expression_id}.md', 'create_only'],
      research_evolution_edge: ['domains/research-publishing/tracks/{research_track}/evolution/{edge_id}.md', 'create_only'],
      research_index_shard: ['domains/research-publishing/tracks/{research_track}/i/{generation}/{view}/{digest_hex}.md', 'create_only'],
      research_index_catalog: ['domains/research-publishing/tracks/{research_track}/indexes/catalog.md', 'update_allowed']
    } as const;
    for (const [recordType, [path, mode]] of Object.entries(expected)) {
      expect(profile.write_rules.records[recordType]).toMatchObject({ path, mode });
    }
    expect(profile.read_rules.context_pack.max_chars_per_file).toBe(12_000);
    expect(profile.read_rules.record_lookup?.research_index_catalog).toEqual({
      identity_field: 'index_id', display_field: 'index_id', match_fields: ['index_id'],
      return_fields: ['index_id', 'track_id', 'generation', 'catalog_digest'], max_results: 1
    });

    const mapping = await yaml<MappingAsset>('harnesses/research-publishing/memory/ingest-mapping.yml');
    for (const recordType of Object.keys(expected)) {
      expect(mapping.produces).toContainEqual({ record_type: recordType });
    }
  });
});
