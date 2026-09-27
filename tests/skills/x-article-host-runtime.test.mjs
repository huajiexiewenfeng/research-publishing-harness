import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  discoverHarnessCli,
  loadXArticleObservationBuilder,
  observeXArticleEditor
} from '../../skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function temporaryRuntime() {
  const root = await mkdtemp(join(tmpdir(), 'rph-host-runtime-'));
  temporaryRoots.push(root);
  const cli = join(root, 'dist/harnesses/research-publishing/cli/index.js');
  const builder = join(
    root,
    'dist/harnesses/research-publishing/adapters/x/article-browser',
    'article-browser-host-observation.js'
  );
  await mkdir(dirname(cli), { recursive: true });
  await mkdir(dirname(builder), { recursive: true });
  await writeFile(cli, '');
  return { root, cli, builder };
}

describe('X Article Host runtime discovery', () => {
  it('discovers an explicit CLI and imports its sibling Observation Builder', async () => {
    const { root, cli, builder } = await temporaryRuntime();
    await writeFile(
      builder,
      'export const buildXArticleHostObservation = (input) => ({ built: input.observation_id });'
    );

    expect(discoverHarnessCli({
      env: { RESEARCH_PUBLISHING_HARNESS_CLI: cli },
      repositoryRoot: root
    })).toBe(resolve(cli));
    await expect(loadXArticleObservationBuilder({ cliPath: cli })).resolves.toHaveProperty(
      'buildXArticleHostObservation',
      expect.any(Function)
    );
  });

  it('falls back to the bundled CLI and then the registered CLI', async () => {
    const bundled = await temporaryRuntime();
    expect(discoverHarnessCli({ env: {}, repositoryRoot: bundled.root })).toBe(resolve(bundled.cli));

    const registered = await temporaryRuntime();
    const registryPath = join(registered.root, 'registry/harnesses.json');
    await mkdir(dirname(registryPath), { recursive: true });
    await rm(join(registered.root, 'dist'), { recursive: true, force: true });
    await mkdir(dirname(registered.cli), { recursive: true });
    await writeFile(registered.cli, '');
    await writeFile(registryPath, JSON.stringify({
      schema_version: '1.0',
      harnesses: [{
        id: 'research-publishing',
        cli: '../dist/harnesses/research-publishing/cli/index.js'
      }]
    }));

    expect(discoverHarnessCli({
      env: { RESEARCH_PUBLISHING_HARNESS_REGISTRY: registryPath },
      repositoryRoot: join(registered.root, 'unrelated')
    })).toBe(resolve(registered.cli));
  });

  it('fails closed for missing CLIs and incompatible Builder exports', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-host-runtime-missing-'));
    temporaryRoots.push(root);
    expect(() => discoverHarnessCli({ env: {}, repositoryRoot: root }))
      .toThrow(/No compatible research-publishing Harness CLI/i);

    const runtime = await temporaryRuntime();
    await writeFile(runtime.builder, 'export const incompatible = true;');
    await expect(loadXArticleObservationBuilder({ cliPath: runtime.cli }))
      .rejects.toThrow(/Builder export is incompatible/i);
  });
});

describe('official X Article editor observer', () => {
  it('uses exactly one packaged extraction and exact Builder field mapping', async () => {
    const tab = { id: 'chrome-tab' };
    const command = { command_id: 'command_1' };
    const context = { publication_plan: {}, materialization_plan: {} };
    const pageSnapshot = { schema_version: 'x-article-host-page-snapshot/v1' };
    const callerObserve = vi.fn();
    const extract = vi.fn(async () => pageSnapshot);
    const build = vi.fn((input) => ({ observation_id: input.observation_id }));

    await expect(observeXArticleEditor({
      tab,
      command,
      context,
      previousObservation: null,
      observationId: 'observation_1',
      observedAt: '2026-08-29T08:00:00.000Z',
      observe: callerObserve,
      dependencies: {
        extractXArticleEditorSnapshot: extract,
        buildXArticleHostObservation: build
      }
    })).resolves.toEqual({ observation_id: 'observation_1' });

    expect(extract).toHaveBeenCalledOnce();
    expect(extract).toHaveBeenCalledWith({ tab });
    expect(build).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledWith({
      command,
      context,
      page_snapshot: pageSnapshot,
      previous_observation: null,
      observation_id: 'observation_1',
      observed_at: '2026-08-29T08:00:00.000Z'
    });
    expect(callerObserve).not.toHaveBeenCalled();
  });

  it('normalizes JSON contracts crossing a foreign Host realm before Builder validation', async () => {
    const foreign = runInNewContext(`({
      command: { command_id: 'command_foreign' },
      context: { publication_plan: {}, materialization_plan: {} },
      previous: { observation_id: 'observation_foreign_previous' },
      pageSnapshot: { schema_version: 'x-article-host-page-snapshot/v1' }
    })`);
    const build = vi.fn((input) => {
      expect(Object.getPrototypeOf(input.command)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(input.context)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(input.context.publication_plan)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(input.previous_observation)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(input.page_snapshot)).toBe(Object.prototype);
      return { observation_id: input.observation_id };
    });

    await expect(observeXArticleEditor({
      tab: { id: 'chrome-tab' },
      command: foreign.command,
      context: foreign.context,
      previousObservation: foreign.previous,
      observationId: 'observation_foreign',
      observedAt: '2026-08-30T01:00:00.000Z',
      dependencies: {
        extractXArticleEditorSnapshot: vi.fn(async () => foreign.pageSnapshot),
        buildXArticleHostObservation: build
      }
    })).resolves.toEqual({ observation_id: 'observation_foreign' });

    expect(build).toHaveBeenCalledOnce();
  });
});
