import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { ManualAdapter } from '../harnesses/research-publishing/adapters/x/manual/manual-adapter.js';
import { ArticleService, type ArticleDraft } from '../harnesses/research-publishing/branches/article-harness/article-service.js';
import { XService, type XDraft } from '../harnesses/research-publishing/branches/x-harness/x-service.js';
import { approvePublication } from '../harnesses/research-publishing/core/approval.js';
import { PackageService } from '../harnesses/research-publishing/core/package-service.js';
import type { Candidate, ResearchContentPackage } from '../harnesses/research-publishing/core/types.js';
import { WorkspaceStore } from '../harnesses/research-publishing/core/workspace-store.js';

const examples = resolve(import.meta.dirname, '../harnesses/research-publishing/examples/synthetic');
async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(examples, name), 'utf8')) as T;
}

const workspace = await mkdtemp(join(tmpdir(), 'research-publishing-acceptance-'));
let articleComplete = false;
let manualXComplete = false;

try {
  const store = await WorkspaceStore.open(workspace);
  const packages = new PackageService(store, () => new Date('2026-08-18T13:00:00.000Z'));
  const candidate = await fixture<Candidate>('candidate.json');
  await packages.captureCandidate(candidate);
  const qualified = await packages.qualifyCandidate(candidate.candidate_id, {
    novelty_hint: candidate.novelty_hint!
  });
  const built = await packages.buildPackage(
    qualified,
    await fixture<ResearchContentPackage>('package.json')
  );
  const reviewed = await packages.reviewPackage(built);
  const frozen = await packages.freezePackage(reviewed.package);

  const articles = new ArticleService(store, {
    runId: () => 'acceptance_article',
    now: () => new Date('2026-08-18T14:00:00.000Z')
  });
  const articleRun = await articles.prepareArticle(frozen.package, {
    articleType: 'architecture_note',
    primaryAudience: 'AI Agent and AI Infra developers',
    language: 'en',
    targetDepth: 'deep',
    includeOpenQuestions: true
  });
  const articleDraft = {
    ...(await fixture<ArticleDraft>('article-draft.json')),
    run_id: articleRun.run_id
  };
  await articles.acceptArticleDraft(articleRun.run_id, articleDraft);
  const articleReview = await articles.reviewArticle(articleRun.run_id);
  const canonical = await articles.finalizeArticle(articleRun.run_id);
  const articleHandoff = await articles.createXHandoff(articleRun.run_id);
  articleComplete =
    articleReview.passed &&
    canonical.artifacts.length === 7 &&
    articleHandoff.article_digest === canonical.digest;

  const x = new XService(store, {
    runId: () => 'acceptance_x',
    now: () => new Date('2026-08-18T15:00:00.000Z')
  });
  const xRun = await x.prepareX(frozen.package, {
    contentType: 'anchor',
    format: 'thread',
    language: 'en',
    targetAccount: '@runtime_ai'
  });
  const xDraft = { ...(await fixture<XDraft>('x-draft.json')), run_id: xRun.run_id };
  await x.acceptXDraft(xRun.run_id, xDraft);
  const xReview = await x.reviewX(xRun.run_id);
  const plan = await x.planX(xRun.run_id);
  const approval = approvePublication(
    plan,
    'acceptance-reviewer',
    60_000,
    new Date('2026-08-18T15:00:10.000Z')
  );
  const manual = new ManualAdapter(store, {
    receiptId: () => 'receipt_acceptance_x',
    now: () => new Date('2026-08-18T15:00:20.000Z')
  });
  const receipt = await manual.handoff(plan, approval);
  const recorded = await manual.recordPublished(receipt, {
    url: 'https://x.com/runtime_ai/status/2000000000000000200',
    postIds: ['2000000000000000200', '2000000000000000201', '2000000000000000202'],
    publishedAt: '2026-08-18T15:10:00.000Z'
  });
  manualXComplete =
    xReview.passed &&
    receipt.status === 'handed_off' &&
    recorded.status === 'manual_recorded' &&
    recorded.verification_source === 'manual';

  if (!articleComplete || !manualXComplete) {
    throw new Error('acceptance workflow did not reach the required terminal artifacts');
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, article: 'complete', manual_x: 'complete', network: 'unused' })}\n`
  );
} finally {
  const verifiedRoot = resolve(workspace);
  if (
    resolve(verifiedRoot, '..') !== resolve(tmpdir()) ||
    !basename(verifiedRoot).startsWith('research-publishing-acceptance-')
  ) {
    throw new Error('refusing to remove an unverified acceptance path');
  }
  await rm(verifiedRoot, { recursive: true, force: false });
}
