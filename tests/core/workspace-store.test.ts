import { access, mkdir, mkdtemp, readFile, rename, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { HarnessError } from '../../harnesses/research-publishing/core/errors.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

describe('WorkspaceStore', () => {
  it('contains memory artifacts but never exposes .llm-wiki', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-memory-boundary-'));
    const store = await WorkspaceStore.open(root);

    await expect(store.writeNew('memory/queries/q1/plan.json', { ok: true })).resolves.toMatchObject({
      relative_path: 'memory/queries/q1/plan.json'
    });
    await expect(store.writeNew('.llm-wiki/domains/research-publishing/x.md', 'forbidden'))
      .rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });

    const artifact = await store.resolveExistingArtifact('memory/queries/q1/plan.json');
    expect(artifact).toMatchObject({
      relative_path: 'memory/queries/q1/plan.json',
      absolute_path: resolve(root, 'memory/queries/q1/plan.json')
    });
    expect(artifact.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(artifact.bytes).toBeGreaterThan(0);
  });

  it('refuses to resolve missing, directory, or linked memory artifacts', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-memory-resolve-'));
    const root = join(parent, 'workspace');
    const store = await WorkspaceStore.open(root);
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'source.json'), '{}', 'utf8');
    await symlink(outside, join(root, 'memory', 'outside-link'), 'junction');

    await expect(store.resolveExistingArtifact('memory/missing.json')).rejects.toMatchObject({
      code: 'ARTIFACT_NOT_FOUND'
    });
    await expect(store.resolveExistingArtifact('memory')).rejects.toMatchObject({
      code: 'WORKSPACE_PATH_INVALID'
    });
    await expect(store.resolveExistingArtifact('memory/outside-link/source.json')).rejects.toMatchObject({
      code: 'WORKSPACE_PATH_INVALID'
    });
  });
  it('installs a complete directory atomically and refuses replacement or traversal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-workspace-directory-'));
    const store = await WorkspaceStore.open(root);
    await store.writeNewDirectory('articles/atomic/run_1', {
      'article.md': '# Complete\n',
      'assets/image.png': Buffer.from([137, 80, 78, 71])
    });
    await expect(store.readText('articles/atomic/run_1/article.md')).resolves.toBe('# Complete\n');
    await expect(store.readBytes('articles/atomic/run_1/assets/image.png')).resolves.toEqual(Buffer.from([137, 80, 78, 71]));
    await expect(store.writeNewDirectory('articles/atomic/run_1', { 'other.md': 'no' }))
      .rejects.toMatchObject({ code: 'ARTIFACT_EXISTS' });
    await expect(store.writeNewDirectory('articles/atomic/run_2', { '../escape.md': 'no' }))
      .rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
    await expect(store.exists('articles/atomic/run_2')).resolves.toBe(false);
  });

  it('retries a transient Windows directory rename failure when the destination is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-workspace-directory-retry-'));
    let attempts = 0;
    const store = await WorkspaceStore.open(root, {
      renameDirectory: async (source, destination) => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error('transient Windows file lock'), { code: 'EPERM' });
        }
        await rename(source, destination);
      },
      wait: async () => undefined
    });

    await expect(store.writeNewDirectory('runs/retry/run_1', { 'audit.json': { ok: true } }))
      .resolves.toBeUndefined();
    expect(attempts).toBe(2);
    await expect(store.readJson('runs/retry/run_1/audit.json')).resolves.toEqual({ ok: true });
  });

  it('preserves a persistent Windows rename error when the destination is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-workspace-directory-error-'));
    let attempts = 0;
    const store = await WorkspaceStore.open(root, {
      renameDirectory: async () => {
        attempts += 1;
        throw Object.assign(new Error('persistent Windows file lock'), { code: 'EPERM' });
      },
      wait: async () => undefined
    });

    await expect(store.writeNewDirectory('runs/retry/run_2', { 'audit.json': { ok: true } }))
      .rejects.toMatchObject({ code: 'EPERM' });
    expect(attempts).toBe(4);
    await expect(store.exists('runs/retry/run_2')).resolves.toBe(false);
  });

  it('creates an atomic artifact and round-trips JSON', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-store-'));
    const store = await WorkspaceStore.open(root);

    const artifact = await store.writeNew('candidates/example.json', { value: 42 });

    expect(artifact.relative_path).toBe('candidates/example.json');
    expect(artifact.bytes).toBeGreaterThan(0);
    await expect(store.readJson('candidates/example.json')).resolves.toEqual({ value: 42 });
    await expect(readFile(join(root, 'candidates', 'example.json'), 'utf8')).resolves.toContain('42');
  });

  it('never overwrites an existing artifact', async () => {
    const root = await mkdtemp(join(tmpdir(), 'rph-store-'));
    const store = await WorkspaceStore.open(root);
    await store.writeNew('runs/run-1/value.json', { first: true });

    await expect(store.writeNew('runs/run-1/value.json', { first: false })).rejects.toMatchObject({
      code: 'ARTIFACT_EXISTS'
    } satisfies Partial<HarnessError>);
    await expect(store.readJson('runs/run-1/value.json')).resolves.toEqual({ first: true });
  });

  it.each(['../escape.json', 'candidates/../../escape.json', 'unknown/file.json'])(
    'rejects disallowed path %s without writing outside the workspace',
    async (relativePath) => {
      const parent = await mkdtemp(join(tmpdir(), 'rph-store-parent-'));
      const root = join(parent, 'workspace');
      const store = await WorkspaceStore.open(root);

      await expect(store.writeNew(relativePath, 'blocked')).rejects.toMatchObject({
        code: 'WORKSPACE_PATH_INVALID'
      });
      await expect(access(join(parent, 'escape.json'))).rejects.toBeDefined();
    }
  );

  it('lists links without following them and refuses to remove a link', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'rph-store-link-'));
    const root = join(parent, 'workspace');
    const store = await WorkspaceStore.open(root);
    const targetDirectory = join(parent, 'target');
    const target = join(targetDirectory, 'target.txt');
    await mkdir(targetDirectory);
    await writeFile(target, 'outside', 'utf8');
    await symlink(targetDirectory, join(root, 'runs', 'target-link'), 'junction');

    await expect(store.list('runs')).resolves.toContainEqual({
      name: 'target-link', relative_path: 'runs/target-link', kind: 'symlink'
    });
    await expect(store.removeFile('runs/target-link')).rejects.toMatchObject({
      code: 'WORKSPACE_PATH_INVALID'
    });
    await expect(readFile(target, 'utf8')).resolves.toBe('outside');
  });
});
