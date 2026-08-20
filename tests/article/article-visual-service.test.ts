import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArticleService } from '../../harnesses/research-publishing/branches/article-harness/article-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const frozenPackage = { ...researchPackage, status: 'frozen', version: 3 } as const;

async function setup(required = true) {
  const root = await mkdtemp(join(tmpdir(), 'rph-article-visual-'));
  const source = join(root, 'cover.png');
  await writeFile(source, PNG);
  const store = await WorkspaceStore.open(join(root, 'workspace'));
  const article = new ArticleService(store, {
    runId: () => 'article_visual_1',
    now: () => new Date('2026-08-20T02:00:00.000Z')
  });
  const run = await article.prepareArticle(frozenPackage, {
    articleType: 'architecture_note', primaryAudience: 'developers', language: 'en',
    targetDepth: 'deep', includeOpenQuestions: false
  });
  await article.acceptArticleDraft(run.run_id, {
    schema_version: '1.0', run_id: run.run_id, title: 'Visual runtime boundary',
    summary: 'The boundary remains evidence-backed.', language: 'en',
    sections: [{ section_id: 'boundary', heading: 'Boundary', markdown: 'The synthetic runtime validates context packages.', claim_refs: ['claim_verified'], source_refs: ['source_test'] }],
    visual_slots: [{ slot_id: 'cover', placement: { kind: 'cover' }, purpose: 'cover', required, brief: 'Show one runtime boundary.', claim_refs: ['claim_verified'] }],
    open_questions: []
  });
  await article.reviewArticle(run.run_id);
  return { article, store, root, runId: run.run_id, source };
}

describe('Article visual lifecycle', () => {
  it('blocks finalization until a required slot is selected and reviewed', async () => {
    const { article, runId } = await setup();
    await expect(article.finalizeArticle(runId)).rejects.toMatchObject({ code: 'VISUAL_SLOT_UNRESOLVED' });
    expect(await article.visualStatus(runId)).toMatchObject({ required_unresolved: ['cover'] });
  });

  it('finalizes one selected candidate into a relative self-contained package and explicit X handoff', async () => {
    const { article, store, runId, source } = await setup();
    const candidate = await article.attachVisual(runId, {
      candidateId: 'candidate_cover', assetId: 'asset_cover', slotId: 'cover', sourcePath: source,
      altText: 'A single boundary around the evidence-backed runtime.', claimRefs: ['claim_verified'],
      provenance: { method: 'generated', tool: 'synthetic-test' }, editableSourcePath: source
    });
    await article.reviewVisual(runId, {
      selectedCandidates: { cover: candidate.candidate_id }, reviewedBy: 'human:test',
      claimAlignment: true, boundaryAlignment: true, mobileLegibility: true,
      singleMessage: true, privacyReview: true
    });
    const finalized = await article.finalizeArticle(runId);
    const markdown = await store.readText(`${finalized.root}/article.md`);
    const manifest = await store.readJson<{ bindings: Array<{ asset: { asset_id: string }; editable_source: { relative_path: string } | null }> }>(`${finalized.root}/visual-manifest.json`);
    expect(markdown).toContain('![A single boundary around the evidence-backed runtime.](assets/asset_cover.png)');
    expect(markdown).not.toMatch(/!\[[^\]]*\]\((?:[A-Za-z]:|\/)/);
    expect(manifest.bindings[0]?.asset.asset_id).toBe('asset_cover');
    expect(manifest.bindings[0]?.editable_source?.relative_path).toBe('assets/editable/asset_cover.png');
    await expect(store.readBytes(`${finalized.root}/assets/asset_cover.png`)).resolves.toBeInstanceOf(Buffer);
    await expect(store.readBytes(`${finalized.root}/assets/editable/asset_cover.png`)).resolves.toEqual(PNG);

    await expect(article.createXHandoff(runId, 'missing')).rejects.toMatchObject({ code: 'VISUAL_ASSET_INVALID' });
    const handoff = await article.createXHandoff(runId, 'asset_cover');
    expect(handoff).toMatchObject({ schema_version: '1.1', visual_asset: { asset_id: 'asset_cover' } });
    await expect(article.attachVisual(runId, {
      candidateId: 'late', assetId: 'late', slotId: 'cover', sourcePath: source,
      altText: 'Late.', claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: null }
    })).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });
  });

  it('rejects a selected staged asset whose bytes changed after visual review', async () => {
    const { article, root, runId, source } = await setup();
    const candidate = await article.attachVisual(runId, {
      candidateId: 'candidate_tampered', assetId: 'asset_tampered', slotId: 'cover', sourcePath: source,
      altText: 'The reviewed runtime boundary.', claimRefs: ['claim_verified'],
      provenance: { method: 'generated', tool: 'synthetic-test' }
    });
    await article.reviewVisual(runId, {
      selectedCandidates: { cover: candidate.candidate_id }, reviewedBy: 'human:test',
      claimAlignment: true, boundaryAlignment: true, mobileLegibility: true,
      singleMessage: true, privacyReview: true
    });
    await writeFile(join(root, 'workspace', candidate.staged_relative_path), Buffer.from('tampered'));

    await expect(article.finalizeArticle(runId)).rejects.toMatchObject({ code: 'VISUAL_DIGEST_MISMATCH' });
  });

  it('allows an optional unresolved slot with an explicit warning', async () => {
    const { article, runId } = await setup(false);
    const finalized = await article.finalizeArticle(runId);
    expect(finalized.warnings).toContain('optional visual slot cover is unresolved');
  });

  it('blocks semantic review failures instead of presenting an unverified visual as approved', async () => {
    const { article, runId, source } = await setup();
    const candidate = await article.attachVisual(runId, {
      candidateId: 'candidate_semantic', assetId: 'asset_semantic', slotId: 'cover', sourcePath: source,
      altText: 'A proposed boundary.', claimRefs: ['claim_verified'],
      provenance: { method: 'generated', tool: 'synthetic-test' }
    });
    const report = await article.reviewVisual(runId, {
      selectedCandidates: { cover: candidate.candidate_id }, reviewedBy: 'human:test',
      claimAlignment: false, boundaryAlignment: true, mobileLegibility: true,
      singleMessage: true, privacyReview: true
    });
    expect(report).toMatchObject({ passed: false, findings: [{ code: 'VISUAL_REVIEW_BLOCKED', severity: 'error' }] });
    await expect(article.finalizeArticle(runId)).rejects.toMatchObject({ code: 'VISUAL_SLOT_UNRESOLVED' });
  });

  it('rejects undeclared Markdown images so the Canonical Package remains the image fact source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-article-undeclared-image-'));
    const store = await WorkspaceStore.open(join(root, 'workspace'));
    const article = new ArticleService(store, { runId: () => 'article_undeclared' });
    const run = await article.prepareArticle(frozenPackage, {
      articleType: 'architecture_note', primaryAudience: 'developers', language: 'en',
      targetDepth: 'deep', includeOpenQuestions: false
    });
    await expect(article.acceptArticleDraft(run.run_id, {
      schema_version: '1.0', run_id: run.run_id, title: 'Undeclared image', summary: 'Unsafe.', language: 'en',
      sections: [{ heading: 'Boundary', markdown: '![outside](C:/private/image.png)', claim_refs: ['claim_verified'], source_refs: ['source_test'] }],
      open_questions: []
    })).rejects.toMatchObject({ code: 'VISUAL_ASSET_INVALID' });
  });
});
