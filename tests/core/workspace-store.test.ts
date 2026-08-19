import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { HarnessError } from '../../harnesses/research-publishing/core/errors.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

describe('WorkspaceStore', () => {
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
