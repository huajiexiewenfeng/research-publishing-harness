import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { sha256, sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
import { ProgressiveResearchQueryService } from '../../harnesses/research-publishing/core/progressive-research-query-service.js';
import { renderResearchRecord } from '../../harnesses/research-publishing/core/research-record-renderer.js';
import type { QueryableCanonicalDocumentV1 } from '../../harnesses/research-publishing/core/research-memory-types.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { progressiveQueryFixture } from './progressive-query-fixture.js';

describe('ProgressiveResearchQueryService', () => {
  it('loads only the exact planned Catalog, Shard and semantic record in order', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-progressive-query-')));
    const fixture = progressiveQueryFixture();
    const service = new ProgressiveResearchQueryService(store, fixture.runtime, {
      snapshotId: () => 'snapshot_progressive_001', now: () => new Date('2026-08-23T02:20:00.000Z')
    });
    const plan = await service.plan(fixture.input);
    const snapshot = await service.execute(plan.query_id);
    expect(snapshot).toMatchObject({ query_status: 'loaded', runtime_version: '0.2.0' });
    expect(snapshot.context_items.map((item) => item.relative_path)).toEqual([fixture.semanticPath]);
    expect(fixture.runtime.calls).toEqual([
      'find:catalog',
      `load:${fixture.projection.catalog_path}`,
      `load:${fixture.shard.path}`,
      `load:${fixture.semanticPath}`
    ]);
  });

  it('returns an honest unavailable Snapshot without broad fallback', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-progressive-unavailable-')));
    const fixture = progressiveQueryFixture();
    fixture.runtime.unavailable = true;
    const service = new ProgressiveResearchQueryService(store, fixture.runtime, {
      snapshotId: () => 'snapshot_progressive_unavailable'
    });
    await service.plan(fixture.input);
    const snapshot = await service.execute(fixture.input.query_id);
    expect(snapshot).toMatchObject({ query_status: 'runtime_unavailable', context_items: [] });
    expect(fixture.runtime.calls).toEqual(['find:catalog']);
  });

  it('returns index_unavailable for a missing exact Catalog without legacy fallback', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-progressive-no-index-')));
    const fixture = progressiveQueryFixture();
    fixture.runtime.catalogFound = false;
    const service = new ProgressiveResearchQueryService(store, fixture.runtime, {
      snapshotId: () => 'snapshot_progressive_no_index'
    });
    await service.plan(fixture.input);
    await expect(service.execute(fixture.input.query_id)).resolves.toMatchObject({
      query_status: 'index_unavailable', selected_record_refs: [], context_items: []
    });
    expect(fixture.runtime.calls).toEqual(['find:catalog']);
  });

  it('loads exact Manifests and reconstructs full_explicit documents by Chunk ordinal', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-progressive-document-')));
    const fixture = progressiveQueryFixture();
    const parts = ['Part one. ', 'Part two.'];
    const documentId = 'document_runtime_boundary';
    const chunks = parts.map((body, index) => {
      const chunkDigest = sha256Bytes(Buffer.from(body, 'utf8'));
      const chunkId = `chunk_${index + 1}`;
      const path = `domains/research-publishing/tracks/enterprise-agent-runtime/documents/${documentId}/chunks/${index + 1}-${chunkDigest.slice(7)}.md`;
      fixture.runtime.contents.set(path, renderResearchRecord({
        record_type: 'canonical_document_chunk',
        frontmatter: { document_id: documentId, chunk_id: chunkId, ordinal: index + 1 }, body
      }));
      return {
        chunk_id: chunkId, ordinal: index + 1, record_path: path, chunk_digest: chunkDigest,
        char_start: parts.slice(0, index).join('').length,
        char_end: parts.slice(0, index + 1).join('').length,
        heading_path: [], byte_size: Buffer.byteLength(body)
      };
    });
    const manifestBody = {
      schema_version: 'queryable-canonical-document/v1' as const,
      document_id: documentId, document_role: 'research_package' as const,
      increment_ref: 'increment:enterprise-agent-runtime:increment_001@1',
      artifact_ref: {
        schema_version: '2.3' as const, role: 'research_package' as const,
        workspace_relative_path: 'packages/runtime.md', digest: `sha256:${'a'.repeat(64)}` as const,
        media_type: 'text/markdown', byte_size: 19, canonical: true,
        privacy_classification: 'internal' as const,
        object_path: `memory/evidence/objects/sha256/aa/${'a'.repeat(64)}`
      },
      full_content_digest: sha256Bytes(Buffer.from(parts.join(''), 'utf8')),
      chunk_policy_version: 'canonical-markdown-chunks/v1' as const, chunks,
      language: 'en', privacy_classification: 'internal' as const,
      instruction_policy: 'data_only' as const
    };
    const manifest: QueryableCanonicalDocumentV1 = { ...manifestBody, manifest_digest: sha256(manifestBody) };
    const manifestPath = `domains/research-publishing/tracks/enterprise-agent-runtime/documents/${documentId}/manifest.md`;
    const manifestContent = renderResearchRecord({
      record_type: 'canonical_document_manifest', frontmatter: { document_id: documentId },
      body: `${JSON.stringify(manifest)}\n`
    });
    const manifestDigest = sha256Bytes(Buffer.from(manifestContent, 'utf8'));
    fixture.runtime.contents.set(manifestPath, manifestContent);
    const manifestRef = { document_id: documentId, path: manifestPath, digest: manifestDigest };
    const input = {
      ...fixture.input, document_mode: 'full_explicit' as const, full_document_requested: true,
      selected_record_refs: fixture.input.selected_record_refs.map((item) => ({
        ...item, document_manifest_ref: manifestRef
      })),
      selected_manifest_refs: [manifestRef],
      selected_chunk_refs: chunks.map((chunk) => ({
        chunk_id: chunk.chunk_id, path: chunk.record_path, digest: chunk.chunk_digest,
        ordinal: chunk.ordinal, char_start: chunk.char_start, char_end: chunk.char_end
      }))
    };
    const service = new ProgressiveResearchQueryService(store, fixture.runtime, {
      snapshotId: () => 'snapshot_progressive_document'
    });
    await service.plan(input);
    const snapshot = await service.execute(input.query_id);
    expect(snapshot.context_items.map((item) => item.source_layer))
      .toEqual(['semantic_record', 'document_chunk', 'document_chunk']);
    expect(snapshot.context_items.slice(1).map((item) => item.content).join('')).toBe(parts.join(''));
    expect(fixture.runtime.calls.slice(-2)).toEqual([
      `load:${manifestPath}`,
      `load:${chunks.map((chunk) => chunk.record_path).join(',')}`
    ]);
  });
});
