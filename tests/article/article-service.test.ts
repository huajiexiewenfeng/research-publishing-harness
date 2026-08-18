import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArticleService } from '../../harnesses/research-publishing/branches/article-harness/article-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import { researchPackage } from '../fixtures/research-package.js';

const brief = {
  articleType: 'technical_essay',
  primaryAudience: 'AI Agent and AI Infra developers',
  language: 'en',
  targetDepth: 'focused',
  includeOpenQuestions: true
} as const;

const frozenPackage = { ...researchPackage, status: 'frozen', version: 3 } as const;

async function service(): Promise<ArticleService> {
  const root = await mkdtemp(join(tmpdir(), 'rph-article-'));
  return new ArticleService(await WorkspaceStore.open(root), {
    runId: () => 'article_run_1',
    now: () => new Date('2026-08-18T14:00:00.000Z')
  });
}

describe('ArticleService prepare and accept', () => {
  it('accepts only frozen packages and emits a claim-led deterministic task', async () => {
    const articles = await service();
    await expect(
      articles.prepareArticle({ ...frozenPackage, status: 'reviewed' }, brief)
    ).rejects.toMatchObject({ code: 'STATE_TRANSITION_INVALID' });

    const run = await articles.prepareArticle(frozenPackage, brief);
    expect(run.generation_task.claims.map((claim) => claim.claim_id)).toEqual([
      'claim_verified',
      'claim_planned'
    ]);
    expect(run.generation_task.boundaries.planned_work).toHaveLength(1);
  });

  it('rejects a draft that cites an unknown claim', async () => {
    const articles = await service();
    const run = await articles.prepareArticle(frozenPackage, brief);

    await expect(
      articles.acceptArticleDraft(run.run_id, {
        schema_version: '1.0',
        run_id: run.run_id,
        title: 'Runtime context is a governed artifact',
        summary: 'An evidence-first architecture note.',
        language: 'en',
        sections: [
          {
            heading: 'Context needs boundaries',
            markdown: 'Context packages make boundaries explicit.',
            claim_refs: ['claim_missing'],
            source_refs: []
          }
        ],
        open_questions: []
      })
    ).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
  });
});
