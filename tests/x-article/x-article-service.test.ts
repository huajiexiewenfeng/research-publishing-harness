import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleService } from '../../harnesses/research-publishing/branches/x-article-harness/x-article-service.js';
import { sha256, sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
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

async function fastPathFixture(): Promise<{
  store: WorkspaceStore;
  packageRef: { root: string; digest: string; artifacts: string[]; warnings: string[] };
}> {
  const diskRoot = await mkdtemp(join(tmpdir(), 'rph-x-article-fast-path-'));
  const store = await WorkspaceStore.open(diskRoot);
  const root = 'articles/runtime-boundary/article_fast_1';
  const coverBytes = new Uint8Array([1, 2, 3]);
  const diagramBytes = new Uint8Array([4, 5, 6]);
  const cover = {
    asset_id: 'cover', relative_path: 'assets/cover.png', digest: sha256Bytes(coverBytes),
    mime_type: 'image/png' as const, alt_text: 'Runtime layers', claim_refs: ['claim:cover']
  };
  const diagram = {
    asset_id: 'diagram', relative_path: 'assets/diagram.png', digest: sha256Bytes(diagramBytes),
    mime_type: 'image/png' as const, alt_text: 'Skill and Runtime boundary', claim_refs: ['claim:diagram']
  };
  const manifestBase = {
    schema_version: '1.0',
    article_run_id: 'article_fast_1',
    bindings: [
      {
        slot_id: 'cover_slot', asset: cover, placement_ordinal: 1, width: 1600, height: 900,
        byte_size: coverBytes.length, normalization_version: 'v1',
        provenance: { method: 'generated', tool: 'test', source_digest: null }, editable_source: null
      },
      {
        slot_id: 'diagram_slot', asset: diagram, placement_ordinal: 2, width: 1200, height: 800,
        byte_size: diagramBytes.length, normalization_version: 'v1',
        provenance: { method: 'generated', tool: 'test', source_digest: null }, editable_source: null
      }
    ]
  };
  const files = {
    'article.md': [
      '# From Skill Memory to Shared Agent Knowledge',
      '',
      '![Runtime layers](assets/cover.png)',
      '',
      'Domain semantics belong in the Skill.',
      '',
      '*Status: X Article Draft (v0.1) · Evidence review date: 2026-08-25*',
      '',
      '![Skill and Runtime boundary](assets/diagram.png)',
      ''
    ].join('\n'),
    'visual-manifest.json': { ...manifestBase, manifest_digest: sha256(manifestBase) },
    'draft-candidate.json': {
      schema_version: '1.0', run_id: 'article_fast_1',
      title: 'From Skill Memory to Shared Agent Knowledge', summary: 'Domain semantics belong in the Skill.',
      language: 'en',
      sections: [{
        section_id: 'boundary', heading: 'Boundary', markdown: 'Domain semantics belong in the Skill.',
        claim_refs: ['claim:diagram'], source_refs: []
      }],
      visual_slots: [
        {
          slot_id: 'cover_slot', placement: { kind: 'cover' }, purpose: 'cover', required: true,
          brief: 'Runtime layers', claim_refs: ['claim:cover']
        },
        {
          slot_id: 'diagram_slot', placement: { kind: 'after_section', section_id: 'boundary' },
          purpose: 'architecture', required: true, brief: 'Skill and Runtime boundary',
          claim_refs: ['claim:diagram']
        }
      ],
      open_questions: []
    },
    'assets/cover.png': coverBytes,
    'assets/diagram.png': diagramBytes
  };
  const digest = sha256(Object.entries(files)
    .map(([path, value]) => ({
      path,
      digest: value instanceof Uint8Array ? sha256Bytes(value) : sha256(value)
    }))
    .sort((left, right) => left.path.localeCompare(right.path)));
  const packageRef = {
    root,
    digest,
    artifacts: Object.keys(files).map((path) => `${root}/${path}`),
    warnings: []
  };
  await store.writeNewDirectory(root, { ...files, 'package-ref.json': packageRef });
  return { store, packageRef };
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

  it('plans Fast Path from the sanitized document and persists one locked Audit set', async () => {
    const { store, packageRef } = await fastPathFixture();
    const service = new XArticleService(store, {
      runId: () => 'x_article_run_fast_1', planId: () => 'x_article_plan_fast_1',
      now: () => new Date('2026-08-29T01:00:00.000Z')
    });

    const audit = await service.planFastPath(packageRef, '@Glen56121', { kind: 'new' });

    expect(audit.preflight.removals).toHaveLength(1);
    expect(audit.publication_plan.intent.document.blocks).toHaveLength(2);
    expect(audit.publication_plan.intent.document.blocks.some((block) =>
      block.kind === 'paragraph'
      && block.runs.some((run) => run.text.includes('X Article Draft'))
    )).toBe(false);
    expect(audit.publication_plan.intent.visuals[1]!.placement)
      .toEqual({ kind: 'block', block_ordinal: 2 });
    const root = 'runs/x_article_run_fast_1/x-article';
    expect(await store.readJson(`${root}/publication-preflight-v1.json`)).toEqual(audit.preflight);
    expect(await store.readJson(`${root}/publication-plan-v1.json`)).toEqual(audit.publication_plan);
    expect(await store.readJson(`${root}/fast-path-audit-v1.json`)).toEqual(audit);
  });

  it('keeps legacy plan behavior unchanged and Fast Path binds an existing Draft target', async () => {
    const { store, packageRef } = await fastPathFixture();
    const service = new XArticleService(store, {
      runId: (() => {
        const ids = ['x_article_run_legacy', 'x_article_run_existing'];
        return () => ids.shift()!;
      })(),
      planId: (() => {
        const ids = ['x_article_plan_legacy', 'x_article_plan_existing'];
        return () => ids.shift()!;
      })(),
      now: () => new Date('2026-08-29T01:00:00.000Z')
    });

    const legacy = await service.plan(packageRef, '@Glen56121');
    const audit = await service.planFastPath(
      packageRef,
      '@Glen56121',
      { kind: 'existing', draft_id: '2092452393472733510' }
    );

    expect(legacy.intent.document.blocks).toHaveLength(3);
    expect(audit.draft_target).toEqual({ kind: 'existing', draft_id: '2092452393472733510' });
  });
});
