import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CanonicalDocumentService } from '../../harnesses/research-publishing/core/canonical-document-service.js';
import { EvidenceObjectStore } from '../../harnesses/research-publishing/core/evidence-object-store.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { canonicalDocumentFixtures } from '../fixtures/canonical-documents.js';

async function textFixture(bytes: Uint8Array, mediaType = 'text/markdown') {
  const root = await mkdtemp(join(tmpdir(), 'rph-canonical-document-'));
  const store = await WorkspaceStore.open(root);
  await store.writeNewBytes('articles/runtime/article.md', bytes);
  const result = await new EvidenceObjectStore(store).put({
    workspace_relative_path: 'articles/runtime/article.md',
    role: 'canonical_article', media_type: mediaType, canonical: true,
    privacy_classification: 'internal'
  });
  return { store, artifactRef: result.artifact_ref };
}

describe('CanonicalDocumentService', () => {
  it.each([
    ['LF', canonicalDocumentFixtures.lf],
    ['CRLF', canonicalDocumentFixtures.crlf],
    ['UTF-8 BOM', canonicalDocumentFixtures.utf8Bom]
  ])('projects and reconstructs normalized %s content deterministically', async (_label, bytes) => {
    const { store, artifactRef } = await textFixture(bytes);
    const service = new CanonicalDocumentService(store);
    const result = await service.project({
      document_id: 'document_runtime_boundary',
      document_role: 'canonical_article',
      track_id: 'enterprise-agent-runtime',
      increment_ref: 'increment:increment_runtime_boundary@1',
      artifact_ref: artifactRef,
      language: 'en'
    });
    expect(result.status).toBe('projected');
    if (result.status !== 'projected') throw new Error('expected projected document');
    expect(await service.reconstruct(result.manifest)).toBe(canonicalDocumentFixtures.canonicalLf);
    expect(result.manifest.chunks.every((chunk, index) => chunk.ordinal === index + 1)).toBe(true);
    await expect(store.readJson(
      'memory/evidence/documents/document_runtime_boundary/manifest.json'
    )).resolves.toEqual(result.manifest);
  });

  it('returns evidence_only without chunk artifacts for binary input', async () => {
    const { store, artifactRef } = await textFixture(canonicalDocumentFixtures.binary, 'image/png');
    const service = new CanonicalDocumentService(store);
    await expect(service.project({
      document_id: 'document_binary', document_role: 'visual_asset',
      track_id: 'enterprise-agent-runtime', increment_ref: 'increment:increment_binary@1',
      artifact_ref: { ...artifactRef, role: 'visual_asset', media_type: 'image/png' }, language: 'und'
    })).resolves.toEqual({
      status: 'evidence_only', reason: 'non_text_media', artifact_ref: {
        ...artifactRef, role: 'visual_asset', media_type: 'image/png'
      }
    });
    await expect(store.exists('memory/evidence/documents/document_binary/manifest.json'))
      .resolves.toBe(false);
  });

  it('returns evidence_only for invalid UTF-8 declared as text', async () => {
    const { store, artifactRef } = await textFixture(canonicalDocumentFixtures.invalidUtf8);
    const service = new CanonicalDocumentService(store);
    await expect(service.project({
      document_id: 'document_invalid_utf8', document_role: 'canonical_article',
      track_id: 'enterprise-agent-runtime', increment_ref: 'increment:increment_invalid@1',
      artifact_ref: artifactRef, language: 'en'
    })).resolves.toMatchObject({ status: 'evidence_only', reason: 'lossy_decode' });
  });
});
