import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, unlink, link } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';

const ALLOWED_TOP_LEVEL = new Set([
  'approvals',
  'candidates',
  'exports',
  'packages',
  'runs'
]);

export interface ArtifactRef {
  readonly relative_path: string;
  readonly digest: string;
  readonly bytes: number;
}

export class WorkspaceStore {
  readonly root: string;

  private constructor(root: string) {
    this.root = root;
  }

  static async open(root: string): Promise<WorkspaceStore> {
    const resolvedRoot = resolve(root);
    await mkdir(resolvedRoot, { recursive: true });
    await Promise.all(
      [...ALLOWED_TOP_LEVEL].map((folder) =>
        mkdir(resolve(resolvedRoot, folder), { recursive: true })
      )
    );
    return new WorkspaceStore(resolvedRoot);
  }

  private resolveAllowed(relativePath: string): { absolutePath: string; normalized: string } {
    const portablePath = relativePath.replaceAll('\\', '/');
    if (portablePath.length === 0 || isAbsolute(relativePath)) {
      throw new HarnessError('WORKSPACE_PATH_INVALID', `invalid workspace path: ${relativePath}`);
    }

    const absolutePath = resolve(this.root, portablePath);
    const relativeToRoot = relative(this.root, absolutePath);
    const segments = relativeToRoot.split(sep);
    if (
      relativeToRoot.length === 0 ||
      relativeToRoot.startsWith(`..${sep}`) ||
      relativeToRoot === '..' ||
      isAbsolute(relativeToRoot) ||
      !ALLOWED_TOP_LEVEL.has(segments[0] ?? '')
    ) {
      throw new HarnessError(
        'WORKSPACE_PATH_INVALID',
        `path is outside the publishing workspace allowlist: ${relativePath}`
      );
    }

    return { absolutePath, normalized: relativeToRoot.split(sep).join('/') };
  }

  async writeNew(relativePath: string, value: string | object): Promise<ArtifactRef> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    const serialized = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
    const bytes = Buffer.byteLength(serialized);
    await mkdir(dirname(absolutePath), { recursive: true });

    const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, 'wx');
    try {
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      // A hard-link installs the fully-written inode atomically and fails if the target exists.
      await link(temporaryPath, absolutePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new HarnessError('ARTIFACT_EXISTS', `artifact already exists: ${normalized}`);
      }
      throw error;
    }
    await unlink(temporaryPath);

    return {
      relative_path: normalized,
      digest: sha256(serialized),
      bytes
    };
  }

  async readJson<T>(relativePath: string): Promise<T> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    try {
      return JSON.parse(await readFile(absolutePath, 'utf8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
      }
      throw error;
    }
  }
}
