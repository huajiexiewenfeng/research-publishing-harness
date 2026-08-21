import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleService } from '../../harnesses/research-publishing/branches/x-article-harness/x-article-service.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

async function fixture(): Promise<{
  store: WorkspaceStore;
  root: string;
  packageRef: { root: string; digest: string; artifacts: string[]; warnings: string[] };
}> {
  const diskRoot = await mkdtemp(join(tmpdir(), 'rph-x-article-'));
  const store = await WorkspaceStore.open(diskRoot);
  const root = 'articles/runtime-boundary/article_1';
  const manifestBase = { schema_version: '1.0', article_run_id: 'article_1', bindings: [] };
  const files = {
    'article.md': '# Runtime boundary\n\nSkills own semantics.\n',
    'visual-manifest.json': { ...manifestBase, manifest_digest: sha256(manifestBase) },
    'draft-candidate.json': {
      schema_version: '1.0', run_id: 'article_1', title: 'Runtime boundary', summary: 'Skills own semantics.',
      language: 'en', sections: [{
        section_id: 'boundary', heading: 'Boundary', markdown: 'Skills own semantics.',
        claim_refs: [], source_refs: []
      }], visual_slots: [], open_questions: []
    }
  };
  const digest = sha256(Object.entries(files)
    .map(([path, value]) => ({ path, digest: sha256(value) }))
    .sort((left, right) => left.path.localeCompare(right.path)));
  const packageRef = {
    root,
    digest,
    artifacts: Object.keys(files).map((path) => `${root}/${path}`),
    warnings: []
  };
  await store.writeNewDirectory(root, { ...files, 'package-ref.json': packageRef });
  return { store, root, packageRef };
}

describe('XArticleService', () => {
  it('plans only from a digest-valid finalized Article Package', async () => {
    const { store, packageRef } = await fixture();
    const service = new XArticleService(store, {
      runId: () => 'x_article_run_1', planId: () => 'x_article_plan_1',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const plan = await service.plan(packageRef, '@Glen56121');
    expect(plan.intent.document.title).toBe('Runtime boundary');
    expect(plan.intent.article_package).toEqual({ root: packageRef.root, digest: packageRef.digest });
    expect(await store.exists('runs/x_article_run_1/x-article/publication-plan-v1.json')).toBe(true);
  });

  it('rejects a package whose canonical Article changed after finalization', async () => {
    const { store, root, packageRef } = await fixture();
    await store.removeFile(`${root}/article.md`);
    await store.writeNew(`${root}/article.md`, '# Tampered\n');
    const service = new XArticleService(store, { runId: () => 'x_article_run_2' });
    await expect(service.plan(packageRef, '@Glen56121'))
      .rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
