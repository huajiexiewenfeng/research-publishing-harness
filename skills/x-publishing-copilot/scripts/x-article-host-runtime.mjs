import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { extractXArticleEditorSnapshot } from './x-article-editor-extractor.mjs';

const moduleRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

function normalizeHostJson(value, label) {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new TypeError(`${label} is not JSON serializable`);
    }
    return JSON.parse(encoded);
  } catch (error) {
    throw new Error(`${label} could not cross the X Article Host boundary`, {
      cause: error
    });
  }
}

function discoverRegisteredCli(registryPath) {
  if (existsSync(registryPath)) {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    const entry = registry.harnesses?.find((candidate) =>
      candidate.id === 'research-publishing'
    );
    if (typeof entry?.cli === 'string') {
      const discovered = resolve(dirname(registryPath), entry.cli);
      if (existsSync(discovered)) return discovered;
    }
  }
  throw new Error('No compatible research-publishing Harness CLI was found.');
}

export function discoverHarnessCli({ env = process.env, repositoryRoot }) {
  const explicit = env.RESEARCH_PUBLISHING_HARNESS_CLI;
  if (explicit && existsSync(explicit)) return resolve(explicit);

  const bundled = resolve(
    repositoryRoot,
    'dist',
    'harnesses',
    'research-publishing',
    'cli',
    'index.js'
  );
  if (existsSync(bundled)) return bundled;

  const registryPath = env.RESEARCH_PUBLISHING_HARNESS_REGISTRY
    ? resolve(env.RESEARCH_PUBLISHING_HARNESS_REGISTRY)
    : resolve(repositoryRoot, 'registry', 'harnesses.json');
  return discoverRegisteredCli(registryPath);
}

export async function loadXArticleObservationBuilder({ cliPath }) {
  const modulePath = resolve(
    dirname(cliPath),
    '..',
    'adapters',
    'x',
    'article-browser',
    'article-browser-host-observation.js'
  );
  if (!existsSync(modulePath)) {
    throw new Error('Compatible X Article Host Observation Builder was not found');
  }
  const loaded = await import(pathToFileURL(modulePath).href);
  if (typeof loaded.buildXArticleHostObservation !== 'function') {
    throw new Error('X Article Host Observation Builder export is incompatible');
  }
  return loaded;
}

export async function observeXArticleEditor(input) {
  const extract = input.dependencies?.extractXArticleEditorSnapshot
    ?? extractXArticleEditorSnapshot;
  let build = input.dependencies?.buildXArticleHostObservation;

  if (typeof extract !== 'function') {
    throw new Error('X Article Host extractor dependency is incompatible');
  }
  if (build !== undefined && typeof build !== 'function') {
    throw new Error('X Article Host Observation Builder dependency is incompatible');
  }
  if (build === undefined) {
    const cliPath = input.cliPath ?? discoverHarnessCli({
      env: input.env,
      repositoryRoot: input.repositoryRoot ?? moduleRepositoryRoot
    });
    ({ buildXArticleHostObservation: build } = await loadXArticleObservationBuilder({ cliPath }));
  }

  const pageSnapshot = normalizeHostJson(
    await extract({ tab: input.tab }),
    'X Article page snapshot'
  );
  return build({
    command: normalizeHostJson(input.command, 'X Article command'),
    context: normalizeHostJson(input.context, 'X Article Host context'),
    page_snapshot: pageSnapshot,
    previous_observation: input.previousObservation === null
      ? null
      : normalizeHostJson(input.previousObservation, 'Previous X Article observation'),
    observation_id: input.observationId,
    observed_at: input.observedAt
  });
}
