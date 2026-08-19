import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { ManualAdapter } from '../harnesses/research-publishing/adapters/x/manual/manual-adapter.js';
import { BrowserAdapter } from '../harnesses/research-publishing/adapters/x/browser/browser-adapter.js';
import type {
  BrowserCapabilityManifest,
  BrowserCommand,
  BrowserNodeObservation,
  BrowserObservationInput,
  BrowserPublicPostObservation
} from '../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { CommandBroker } from '../harnesses/research-publishing/adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import { ArticleService, type ArticleDraft } from '../harnesses/research-publishing/branches/article-harness/article-service.js';
import { XService, type XDraft } from '../harnesses/research-publishing/branches/x-harness/x-service.js';
import { approvePublication } from '../harnesses/research-publishing/core/approval.js';
import { approvePublicationV2 } from '../harnesses/research-publishing/core/approval-v2.js';
import { ExecutionStore } from '../harnesses/research-publishing/core/execution-store.js';
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
let browserXComplete = false;
let submitCommands = 0;
let submitClaims = 0;

const browserAt = '2026-08-18T16:00:00.000Z';
const browserManifest: BrowserCapabilityManifest = {
  executor: 'codex-chrome', executor_version: 'acceptance-fake-host', browser_family: 'chrome',
  capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'],
  observed_at: browserAt
};

function accountNode(): BrowserNodeObservation {
  return {
    ref: 'account', role: 'button', name: 'Account menu', text: '@runtime_ai',
    test_id: 'SideNav_AccountSwitcher_Button', editable: false, disabled: false, parent_ref: null
  };
}

function composerNodes(values: readonly string[]): BrowserNodeObservation[] {
  return [
    accountNode(),
    ...values.map((text, index) => ({
      ref: `item_${index + 1}`, role: 'textbox', name: 'Post text', text,
      test_id: `tweetTextarea_${index}`, editable: true, disabled: false, parent_ref: null
    })),
    {
      ref: 'add', role: 'button', name: 'Add post', text: 'Add post', test_id: 'addButton',
      editable: false, disabled: false, parent_ref: null
    },
    {
      ref: 'submit', role: 'button', name: 'Post all', text: 'Post all', test_id: 'tweetButton',
      editable: false, disabled: values.some((value) => value.length === 0), parent_ref: null
    }
  ];
}

function observed(
  command: BrowserCommand,
  url: string,
  nodes: readonly BrowserNodeObservation[],
  posts: readonly BrowserPublicPostObservation[] = []
): BrowserObservationInput {
  return {
    schema_version: '2.0', observation_id: `obs_${command.command_id}`,
    execution_id: command.execution_id, command_id: command.command_id,
    origin: 'https://x.com', canonical_url: url, observed_at: browserAt,
    nodes, public_posts: posts
  };
}

async function browserReport(
  adapter: BrowserAdapter,
  command: BrowserCommand,
  observation: BrowserObservationInput | null,
  status: 'success' | 'uncertain' = 'success'
): Promise<void> {
  await adapter.claim(command.execution_id, command.command_id);
  await adapter.report(command.execution_id, {
    schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
    status, observation, error_code: null, reported_at: browserAt
  });
}

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

  const browserX = new XService(store, {
    runId: () => 'acceptance_browser_x',
    planId: () => 'plan_acceptance_browser_x',
    now: () => new Date(browserAt)
  });
  const browserRun = await browserX.prepareX(frozen.package, {
    contentType: 'anchor', format: 'thread', language: 'en', targetAccount: '@runtime_ai'
  });
  const browserDraft = { ...(await fixture<XDraft>('x-draft.json')), run_id: browserRun.run_id };
  await browserX.acceptXDraft(browserRun.run_id, browserDraft);
  const browserReview = await browserX.reviewX(browserRun.run_id);
  const browserPlan = await browserX.planXBrowser(browserRun.run_id);
  const browserApproval = approvePublicationV2(
    browserPlan, 'acceptance-reviewer', 60_000, new Date(browserAt), () => 'approval_acceptance_browser'
  );
  let browserEvent = 0;
  let browserCommand = 0;
  const browserExecutions = new ExecutionStore(
    store, () => new Date(browserAt), () => `evt_acceptance_${++browserEvent}`
  );
  const browserBroker = new CommandBroker(
    store, browserExecutions, () => new Date(browserAt), () => `cmd_acceptance_${++browserCommand}`
  );
  const browserAdapter = new BrowserAdapter(
    store, browserExecutions, browserBroker, new XWeb202608Contract(),
    () => new Date(browserAt), () => 'attempt_acceptance_browser', () => 'receipt_acceptance_browser'
  );
  await browserAdapter.start({
    execution_id: 'exec_acceptance_browser', plan: browserPlan,
    approval: browserApproval, capability_manifest: browserManifest
  });
  let browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(
    browserAdapter, browserNext, observed(browserNext, 'https://x.com/home', [accountNode()])
  );
  browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(
    browserAdapter, browserNext,
    observed(browserNext, 'https://x.com/compose/post', composerNodes(['']))
  );
  const browserTexts = browserPlan.items.map((item) => item.text);
  for (let index = 0; index < browserTexts.length; index += 1) {
    browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
    await browserReport(
      browserAdapter, browserNext,
      observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts.slice(0, index + 1)))
    );
    if (index < browserTexts.length - 1) {
      browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
      await browserReport(
        browserAdapter, browserNext,
        observed(browserNext, 'https://x.com/compose/post', composerNodes([
          ...browserTexts.slice(0, index + 1), ''
        ]))
      );
    }
  }
  browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(
    browserAdapter, browserNext,
    observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts))
  );
  const submit = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(browserAdapter, submit, null, 'uncertain');
  const publicPosts: BrowserPublicPostObservation[] = browserTexts.map((text, index) => {
    const id = (800000000000000100n + BigInt(index)).toString();
    return {
      post_id: id, canonical_url: `https://x.com/runtime_ai/status/${id}`,
      author_handle: '@runtime_ai', text, links: [], published_at: browserAt,
      reply_to_id: index === 0 ? null : (800000000000000100n + BigInt(index - 1)).toString()
    };
  });
  browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(
    browserAdapter, browserNext,
    observed(browserNext, publicPosts[0]!.canonical_url, [accountNode()], publicPosts)
  );
  const browserStatus = await browserAdapter.status('exec_acceptance_browser');
  const browserPrefix = 'runs/acceptance_browser_x/x/browser/exec_acceptance_browser';
  for (const entry of await store.list(`${browserPrefix}/commands`)) {
    if (entry.kind !== 'file') continue;
    const persisted = await store.readJson<BrowserCommand>(entry.relative_path);
    if (persisted.side_effect === 'submit') submitCommands += 1;
  }
  submitClaims = (await store.list(`${browserPrefix}/claims`)).filter(
    (entry) => entry.name === `${submit.command_id}.json`
  ).length;
  browserXComplete =
    browserReview.passed &&
    browserStatus.snapshot.state === 'finalized' &&
    browserStatus.snapshot.submit_command_count === 1 &&
    submitCommands === 1 &&
    submitClaims === 1;

  if (!articleComplete || !manualXComplete || !browserXComplete) {
    throw new Error('acceptance workflow did not reach the required terminal artifacts');
  }
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      article: 'complete',
      manual_x: 'complete',
      browser_x: 'simulated_complete',
      network: 'unused',
      submit_commands: submitCommands,
      submit_claims: submitClaims
    })}\n`
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
