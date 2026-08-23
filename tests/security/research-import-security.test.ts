import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ResearchImportService } from '../../harnesses/research-publishing/core/research-import-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { firstIncrementImportFixture } from '../fixtures/first-increment-import.js';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-import-security-'));
  const store = await WorkspaceStore.open(root);
  return { store, manifest: await firstIncrementImportFixture(store) };
}

describe('Research Import security', () => {
  it('rejects extra historical posts in the same manifest', async () => {
    const { store, manifest } = await fixture();
    await expect(new ResearchImportService(store).inspect({
      ...manifest,
      thread: { ...manifest.thread, items: [...manifest.thread.items, { ...manifest.thread.items[5]!, ordinal: 7 }] }
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('rejects local path escape and non-HTTPS public URLs', async () => {
    const { store, manifest } = await fixture();
    await expect(new ResearchImportService(store).inspect({
      ...manifest, mother_article: { ...manifest.mother_article, path: '../mother.md' }
    })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
    await expect(new ResearchImportService(store).inspect({
      ...manifest, gist: { ...manifest.gist, url: 'http://gist.github.com/example' }
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('rejects reordered or duplicated Thread ordinals', async () => {
    const { store, manifest } = await fixture();
    const items = [...manifest.thread.items];
    items[2] = { ...items[2]!, ordinal: 2 };
    await expect(new ResearchImportService(store).inspect({
      ...manifest, thread: { ...manifest.thread, items }
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});

