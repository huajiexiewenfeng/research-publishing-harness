import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArticleService } from '../../harnesses/research-publishing/branches/article-harness/article-service.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import type { ResearchContentPackageV1_2 } from '../../harnesses/research-publishing/core/types.js';
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

  it('finalizes V1.2 as a structured Canonical Article Package', async () => {
    const articles = await service();
    const packageV1_2 = {
      ...frozenPackage, schema_version: '1.2',
      thesis: { ...frozenPackage.thesis, claim_status: 'observed' },
      claims: frozenPackage.claims.map((claim) => ({
        ...claim, claim_status: claim.claim_status === 'planned' ? 'planned' as const : 'observed' as const
      })),
      memory_context: {
        query_plan_digest: null, context_snapshot_digest: null, context_refs: [],
        status: 'not_configured', reviewer: null, reviewed_at: null
      },
      research_program_binding: {
        roadmap_ref: { path: 'program/roadmaps/runtime/revisions/1.json', digest: `sha256:${'1'.repeat(64)}` },
        topic_ref: { path: 'program/backlog/topics/runtime/revisions/1.json', digest: `sha256:${'2'.repeat(64)}` },
        candidate_set_ref: { path: 'program/weeks/week_01/candidates.json', digest: `sha256:${'3'.repeat(64)}` },
        selection_ref: { path: 'program/weeks/week_01/selection.json', digest: `sha256:${'4'.repeat(64)}` }
      }
    } as ResearchContentPackageV1_2;
    const run = await articles.prepareArticle(packageV1_2, brief);
    await articles.acceptArticleDraft(run.run_id, {
      schema_version: '1.0', run_id: run.run_id, title: 'A bounded runtime claim',
      summary: 'Evidence and boundaries.', language: 'en',
      sections: [{
        heading: 'Observed boundary', markdown: 'The contract is observed in the scoped tests.',
        claim_refs: ['claim_verified'], source_refs: ['source_test']
      }],
      open_questions: []
    });
    await articles.reviewArticle(run.run_id);
    const finalized = await articles.finalizeArticle(run.run_id);
    const names = finalized.artifacts.map((path) => path.slice(finalized.root.length + 1));
    expect(names).toEqual(expect.arrayContaining([
      'article.md', 'evidence.json', 'claim-boundaries.json',
      'visual-manifest.json', 'source-refs.json'
    ]));
    expect(names).not.toContain('article.zh-CN.md');
  });
});
