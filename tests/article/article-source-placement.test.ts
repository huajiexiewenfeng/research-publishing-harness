import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ArticleService, type ArticleDraft } from '../../harnesses/research-publishing/branches/article-harness/article-service.js';
import { compileXArticleDocument } from '../../harnesses/research-publishing/branches/x-article-harness/article-compiler.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import type { ArticleVisualManifest } from '../../harnesses/research-publishing/core/types.js';
import { researchPackage } from '../fixtures/research-package.js';

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const marker = (id: string) => `<!-- rph-visual:${id} -->`;
async function setup(markdown: string, ids = ['head', 'middle', 'end']) {
  const root = await mkdtemp(join(tmpdir(), 'rph-source-placement-'));
  roots.push(root);
  const store = await WorkspaceStore.open(root);
  const article = new ArticleService(store, { runId: () => 'source_placement' });
  const run = await article.prepareArticle({ ...researchPackage, status: 'frozen', version: 3 }, {
    articleType: 'architecture_note', primaryAudience: 'developers', language: 'en',
    targetDepth: 'deep', includeOpenQuestions: false
  });
  const draft = {
    schema_version: '1.0', run_id: run.run_id, title: 'Original positions', summary: 'Summary.', language: 'en',
    sections: [{ section_id: 's', heading: 'Boundary', markdown, claim_refs: ['claim_verified'], source_refs: ['source_test'] }],
    visual_slots: ids.map(slot_id => ({ slot_id, placement: { kind: 'in_place' }, purpose: 'explanation', required: true, brief: slot_id, claim_refs: ['claim_verified'] })),
    open_questions: []
  } as unknown as ArticleDraft;
  return { article, store, root, draft, runId: run.run_id };
}

describe('source-position article images', () => {
  it('preserves heading, mid-paragraph-gap and section-end positions through finalization and X import', async () => {
    const { article, store, root, draft, runId } = await setup(
      [marker('head'), 'First paragraph.', marker('middle'), 'Last paragraph.', marker('end')].join('\n\n'),
      ['end', 'head', 'middle'] // Slot order must not relocate the author's images.
    );
    await article.acceptArticleDraft(runId, draft);
    await article.reviewArticle(runId);
    const source = join(root, 'source.png');
    await writeFile(source, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
    const selected: Record<string, string> = {};
    for (const slot of draft.visual_slots!) {
      const candidateId = `candidate_${slot.slot_id}`;
      await article.attachVisual(runId, { candidateId, assetId: slot.slot_id, slotId: slot.slot_id, sourcePath: source,
        altText: slot.slot_id, claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: 'test' } });
      selected[slot.slot_id] = candidateId;
    }
    await article.reviewVisual(runId, { selectedCandidates: selected, reviewedBy: 'test', claimAlignment: true,
      boundaryAlignment: true, mobileLegibility: true, singleMessage: true, privacyReview: true });
    const ref = await article.finalizeArticle(runId);
    const markdown = await store.readText(`${ref.root}/article.md`);
    expect(markdown).toContain('## Boundary\n\n![head](assets/head.png)\n\nFirst paragraph.\n\n![middle](assets/middle.png)\n\nLast paragraph.\n\n![end](assets/end.png)');
    expect(markdown).not.toContain('rph-visual:');
    const manifest = await store.readJson<ArticleVisualManifest>(`${ref.root}/visual-manifest.json`);
    const document = compileXArticleDocument({ markdown, visuals: manifest.bindings.map(b => ({ asset: b.asset, placement: draft.visual_slots!.find(s => s.slot_id === b.slot_id)!.placement })) });
    expect(document.blocks.map(b => b.kind)).toEqual(['paragraph', 'heading', 'image', 'paragraph', 'image', 'paragraph', 'image']);
    expect(createXArticleImportTemplate(document).anchors.map(a => [a.asset_id, a.block_ordinal])).toEqual([['head', 3], ['middle', 5], ['end', 7]]);
  });

  it.each([
    ['missing', 'Body only.'],
    ['duplicate', `${marker('head')}\n\n${marker('head')}`],
    ['unknown', `${marker('head')}\n\n${marker('other')}`],
    ['inline', `Paragraph ${marker('head')} tail.`],
    ['malformed', '<!-- rph-visual:head-->']
  ])('rejects %s source markers before accepting the draft', async (_name, markdown) => {
    const { article, draft, runId } = await setup(markdown, ['head']);
    await expect(article.acceptArticleDraft(runId, draft)).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });

  it('supports an image between summary paragraphs', async () => {
    const { article, draft, runId } = await setup('Body.', ['intro']);
    await expect(article.acceptArticleDraft(runId, { ...draft, summary: `Intro.\n\n${marker('intro')}\n\nMore intro.` })).resolves.toBeDefined();
  });

  it('does not reinterpret legacy after_section slots as source placeholders', async () => {
    const { article, draft, runId } = await setup(marker('head'), ['head']);
    await expect(article.acceptArticleDraft(runId, { ...draft, visual_slots: [{ ...draft.visual_slots![0]!, placement: { kind: 'after_section', section_id: 's' } }] })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
