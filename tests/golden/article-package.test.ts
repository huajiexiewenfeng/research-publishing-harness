import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArticleService } from '../../harnesses/research-publishing/branches/article-harness/article-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';

describe('canonical article package', () => {
  it('reviews, finalizes idempotently, and creates X handoff only on request', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-article-golden-'));
    const store = await WorkspaceStore.open(root);
    const articles = new ArticleService(store, {
      runId: () => 'article_golden_1',
      now: () => new Date('2026-08-18T14:00:00.000Z')
    });
    const run = await articles.prepareArticle(
      { ...researchPackage, status: 'frozen', version: 3 },
      {
        articleType: 'architecture_note',
        primaryAudience: 'AI infrastructure engineers',
        language: 'en',
        targetDepth: 'deep',
        includeOpenQuestions: true
      }
    );
    await articles.acceptArticleDraft(run.run_id, {
      schema_version: '1.0',
      run_id: run.run_id,
      title: 'Treat Runtime Context as a Governed Artifact',
      summary: 'Evidence and boundaries belong in runtime contracts.',
      language: 'en',
      sections: [
        {
          heading: 'The contract',
          markdown: 'The synthetic runtime validates context packages.',
          claim_refs: ['claim_verified'],
          source_refs: ['source_test']
        },
        {
          heading: 'What comes next',
          markdown: 'A trace adapter is planned for a later version.',
          claim_refs: ['claim_planned'],
          source_refs: []
        }
      ],
      open_questions: ['Which evidence should survive between runs?']
    });

    const review = await articles.reviewArticle(run.run_id);
    expect(review.passed).toBe(true);
    const finalized = await articles.finalizeArticle(run.run_id);
    const again = await articles.finalizeArticle(run.run_id);
    expect(again).toEqual(finalized);
    expect(finalized.artifacts.map((artifact) => artifact.split('/').at(-1))).toEqual(
      expect.arrayContaining([
        'article.md',
        'article.meta.yaml',
        'claim-map.json',
        'sources.md',
        'review-report.json',
        'generation-task.json',
        'draft-candidate.json'
      ])
    );
    await expect(store.readJson(`${finalized.root}/x-handoff.json`)).rejects.toMatchObject({
      code: 'ARTIFACT_NOT_FOUND'
    });

    const handoff = await articles.createXHandoff(run.run_id);
    expect(handoff.article_digest).toBe(finalized.digest);
    await expect(store.readJson(`${finalized.root}/x-handoff.json`)).resolves.toEqual(handoff);
  });

  it('blocks shipped language for a planned claim and private material', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-article-adversarial-'));
    const articles = new ArticleService(await WorkspaceStore.open(root), {
      runId: () => 'article_bad_1',
      now: () => new Date('2026-08-18T14:00:00.000Z')
    });
    const run = await articles.prepareArticle(
      { ...researchPackage, status: 'frozen', version: 3 },
      {
        articleType: 'technical_essay',
        primaryAudience: 'developers',
        language: 'en',
        targetDepth: 'focused',
        includeOpenQuestions: false
      }
    );
    await articles.acceptArticleDraft(run.run_id, {
      schema_version: '1.0',
      run_id: run.run_id,
      title: 'Bad draft',
      summary: 'A deliberately unsafe draft.',
      language: 'en',
      sections: [
        {
          heading: 'Overclaim',
          markdown: 'The trace adapter is implemented at C:\\Users\\alice\\private\\trace.ts.',
          claim_refs: ['claim_planned'],
          source_refs: []
        }
      ],
      open_questions: []
    });

    const review = await articles.reviewArticle(run.run_id);
    expect(review.passed).toBe(false);
    expect(review.findings.map((finding) => finding.code)).toEqual(
      expect.arrayContaining(['CLAIM_STATUS_LANGUAGE_MISMATCH', 'WINDOWS_PRIVATE_PATH'])
    );
    await expect(articles.finalizeArticle(run.run_id)).rejects.toMatchObject({
      code: 'EVIDENCE_GATE_BLOCKED'
    });
  });

  it('does not expose a paraphrase-only Source location', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-article-paraphrase-'));
    const store = await WorkspaceStore.open(root);
    const articles = new ArticleService(store, {
      runId: () => 'article_paraphrase_1',
      now: () => new Date('2026-08-18T14:00:00.000Z')
    });
    const packageValue = {
      ...researchPackage,
      status: 'frozen',
      version: 3,
      sources: [
        {
          ...researchPackage.sources[0],
          location: 'https://example.com/location-must-not-be-exposed',
          publication_policy: 'paraphrase_only'
        }
      ]
    } as const;
    const run = await articles.prepareArticle(packageValue, {
      articleType: 'architecture_note',
      primaryAudience: 'developers',
      language: 'en',
      targetDepth: 'focused',
      includeOpenQuestions: false
    });
    await articles.acceptArticleDraft(run.run_id, {
      schema_version: '1.0',
      run_id: run.run_id,
      title: 'Paraphrase-only source',
      summary: 'A source policy check.',
      language: 'en',
      sections: [
        {
          heading: 'Finding',
          markdown: 'The synthetic runtime validates context packages.',
          claim_refs: ['claim_verified'],
          source_refs: ['source_test']
        }
      ],
      open_questions: []
    });
    await articles.reviewArticle(run.run_id);
    const finalized = await articles.finalizeArticle(run.run_id);

    const sources = await store.readText(`${finalized.root}/sources.md`);
    expect(sources).toContain('source_test');
    expect(sources).not.toContain('location-must-not-be-exposed');
  });
});
