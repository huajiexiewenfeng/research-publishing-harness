import { runCoverUpload } from './x-article-cover-host.mjs';
import { runInlineImageUpload } from './x-article-inline-image-host.mjs';
import { observeXArticleEditor } from './x-article-host-runtime.mjs';

const ALLOWED = new Set([
  'navigate',
  'observe_article_page',
  'upload_article_cover',
  'replace_article_visual_anchor'
]);
const FORBIDDEN = new Set([
  'open_article_preview',
  'open_publish_review',
  'publish_article_once'
]);

function observationValue(value, fallback) {
  return typeof value === 'function' ? value() : value ?? fallback;
}

function officialObserver(input) {
  return () => observeXArticleEditor({
    tab: input.tab,
    command: input.command,
    context: input.context,
    previousObservation: input.previousObservation ?? null,
    observationId: observationValue(
      input.observationId,
      `host_${input.command.command_id}_${Date.now()}`
    ),
    observedAt: observationValue(input.observedAt, new Date().toISOString()),
    cliPath: input.cliPath,
    env: input.env,
    repositoryRoot: input.repositoryRoot,
    dependencies: input.dependencies?.observerDependencies
  });
}

async function navigateTab(input) {
  const url = input.command?.payload?.kind === 'navigate'
    ? input.command.payload.url
    : null;
  if (typeof url !== 'string' || !url.startsWith('https://x.com/')) {
    throw new Error('X Article Host navigate command is invalid');
  }
  const currentUrl = typeof input.tab?.url === 'function'
    ? await input.tab.url()
    : null;
  if (currentUrl === url) return;
  if (typeof input.tab?.goto === 'function') {
    await input.tab.goto(url);
  } else if (typeof input.tab?.playwright?.goto === 'function') {
    await input.tab.playwright.goto(url);
  } else {
    throw new Error('X Article Host tab navigation is unavailable');
  }
}

async function runObserve(input) {
  const observation = await input.observe();
  return {
    status: 'success',
    effect: 'complete',
    reason: 'observation_captured',
    observation,
    retry_authorized: false
  };
}

async function runNavigate(input) {
  await navigateTab(input);
  return runObserve(input);
}

async function dispatchOne(input) {
  const observe = officialObserver(input);
  if (input.command.kind === 'navigate') {
    const transaction = input.dependencies?.runNavigate ?? runNavigate;
    return transaction({ ...input, observe });
  }
  if (input.command.kind === 'observe_article_page') {
    const transaction = input.dependencies?.runObserve ?? runObserve;
    return transaction({ ...input, observe });
  }
  if (input.command.kind === 'upload_article_cover') {
    const transaction = input.dependencies?.runCoverUpload ?? runCoverUpload;
    return transaction({
      ...input,
      observe,
      deadlineExceeded: input.deadline.exceeded
    });
  }

  const transaction = input.dependencies?.runInlineImageUpload ?? runInlineImageUpload;
  const beforeObservation = input.dependencies?.runInlineImageUpload === undefined
    ? await observe()
    : input.beforeObservation ?? null;
  return transaction({
    ...input,
    beforeObservation,
    observe,
    deadlineExceeded: input.deadline.exceeded
  });
}

export async function runXArticleHostBridge(input) {
  const kind = input.command?.kind;
  if (FORBIDDEN.has(kind)) {
    throw new Error('X Article Host Bridge is Draft-only');
  }
  if (!ALLOWED.has(kind)) {
    throw new Error(`Unsupported X Article Host command: ${kind}`);
  }
  if (typeof input.deadline?.exceeded !== 'function') {
    throw new Error('X Article Host Bridge requires the shared deadline');
  }
  if (input.deadline.exceeded()) {
    throw new Error('X Article Fast Path deadline exceeded');
  }

  const outcome = await dispatchOne(input);
  return {
    ...outcome,
    report: {
      command: input.command,
      status: outcome.status,
      host_reason: outcome.reason,
      observation: outcome.observation
    }
  };
}
