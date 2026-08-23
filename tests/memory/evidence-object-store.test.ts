import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { EvidenceObjectStore } from '../../harnesses/research-publishing/core/evidence-object-store.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-evidence-object-'));
  const store = await WorkspaceStore.open(root);
  const objects = new EvidenceObjectStore(store);
  await store.writeNew('articles/runtime/article.md', '# Runtime boundary\n');
  return { store, objects };
}

describe('EvidenceObjectStore', () => {
  it('stores source bytes at a digest-addressed path and verifies them', async () => {
    const { objects } = await fixture();
    const result = await objects.put({
      workspace_relative_path: 'articles/runtime/article.md',
      role: 'canonical_article',
      media_type: 'text/markdown',
      canonical: true,
      privacy_classification: 'internal'
    });
    expect(result.status).toBe('created');
    expect(result.artifact_ref.object_path).toMatch(
      /^memory\/evidence\/objects\/sha256\/[a-f0-9]{2}\/[a-f0-9]{64}$/
    );
    await expect(objects.verify(result.artifact_ref)).resolves.toBeUndefined();
  });

  it('revalidates bytes when a digest-addressed object already exists', async () => {
    const { store, objects } = await fixture();
    const first = await objects.put({
      workspace_relative_path: 'articles/runtime/article.md',
      role: 'canonical_article',
      media_type: 'text/markdown',
      canonical: true,
      privacy_classification: 'internal'
    });
    await expect(objects.put({
      workspace_relative_path: 'articles/runtime/article.md',
      role: 'canonical_article',
      media_type: 'text/markdown',
      canonical: true,
      privacy_classification: 'internal'
    })).resolves.toMatchObject({ status: 'already_exists' });

    await store.replaceAtomic(first.artifact_ref.object_path, 'tampered');
    await expect(objects.put({
      workspace_relative_path: 'articles/runtime/article.md',
      role: 'canonical_article',
      media_type: 'text/markdown',
      canonical: true,
      privacy_classification: 'internal'
    })).rejects.toMatchObject({ code: 'MEMORY_EVIDENCE_CORRUPT' });
  });
});
