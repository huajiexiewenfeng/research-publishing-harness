import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ArticleService, type ArticleDraft } from '../../harnesses/research-publishing/branches/article-harness/article-service.js';
import { PackageService } from '../../harnesses/research-publishing/core/package-service.js';
import type { Candidate, ResearchContentPackage } from '../../harnesses/research-publishing/core/types.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const examples = resolve('harnesses/research-publishing/examples/synthetic');

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(examples, name), 'utf8')) as T;
}

describe('offline synthetic Article workflow', () => {
  it('runs Candidate through explicit Article handoff without network access', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-article-e2e-'));
    const store = await WorkspaceStore.open(root);
    const packages = new PackageService(store, () => new Date('2026-08-18T13:00:00.000Z'));
    const candidate = await fixture<Candidate>('candidate.json');
    await packages.captureCandidate(candidate);
    const qualified = await packages.qualifyCandidate(candidate.candidate_id, {
      novelty_hint: candidate.novelty_hint!
    });
    const draftPackage = await packages.buildPackage(
      qualified,
      await fixture<ResearchContentPackage>('package.json')
    );
    const reviewed = await packages.reviewPackage(draftPackage);
    const frozen = await packages.freezePackage(reviewed.package);

    const articles = new ArticleService(store, {
      runId: () => 'synthetic_article',
      now: () => new Date('2026-08-18T14:00:00.000Z')
    });
    const run = await articles.prepareArticle(frozen.package, {
      articleType: 'architecture_note',
      primaryAudience: 'AI Agent and AI Infra developers',
      language: 'en',
      targetDepth: 'deep',
      includeOpenQuestions: true
    });
    await articles.acceptArticleDraft(run.run_id, await fixture<ArticleDraft>('article-draft.json'));
    expect((await articles.reviewArticle(run.run_id)).passed).toBe(true);
    const canonical = await articles.finalizeArticle(run.run_id);
    const handoff = await articles.createXHandoff(run.run_id);

    expect(canonical.artifacts).toHaveLength(7);
    expect(handoff.article_digest).toBe(canonical.digest);
  });
});
