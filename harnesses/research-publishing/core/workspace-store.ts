import { randomUUID } from 'node:crypto';
import { access, link, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';

const ALLOWED_TOP_LEVEL = new Set([
  'approvals',
  'articles',
  'candidates',
  'exports',
  'feedback',
  'packages',
  'receipts',
  'reviews',
  'runs',
  'x'
]);

export interface ArtifactRef {
  readonly relative_path: string;
  readonly digest: string;
  readonly bytes: number;
}

export interface WorkspaceExecutionApi {
  exists(relativePath: string): Promise<boolean>;
  appendLine(relativePath: string, line: string): Promise<ArtifactRef>;
  replaceAtomic(relativePath: string, value: string | object): Promise<ArtifactRef>;
  withLock<T>(relativePath: string, operation: () => Promise<T>): Promise<T>;
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

  async readText(relativePath: string): Promise<string> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    try {
      return await readFile(absolutePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
      }
      throw error;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    const { absolutePath } = this.resolveAllowed(relativePath);
    try {
      await access(absolutePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async appendLine(relativePath: string, line: string): Promise<ArtifactRef> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    if (line.includes('\n') || line.includes('\r')) {
      throw new HarnessError('CONTRACT_INVALID', 'appendLine accepts exactly one line');
    }
    const serialized = `${line}\n`;
    await mkdir(dirname(absolutePath), { recursive: true });
    const handle = await open(absolutePath, 'a');
    try {
      await handle.writeFile(serialized, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    return {
      relative_path: normalized,
      digest: sha256(serialized),
      bytes: Buffer.byteLength(serialized)
    };
  }

  async replaceAtomic(relativePath: string, value: string | object): Promise<ArtifactRef> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    const serialized = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
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
      await rename(temporaryPath, absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST' && code !== 'EPERM') throw error;
      await unlink(absolutePath).catch((unlinkError: NodeJS.ErrnoException) => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
      await rename(temporaryPath, absolutePath);
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
    return {
      relative_path: normalized,
      digest: sha256(serialized),
      bytes: Buffer.byteLength(serialized)
    };
  }

  async withLock<T>(relativePath: string, operation: () => Promise<T>): Promise<T> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    await mkdir(dirname(absolutePath), { recursive: true });

    const acquire = async (allowStaleRetry: boolean): Promise<void> => {
      let handle;
      try {
        handle = await open(absolutePath, 'wx');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        let owner: { pid: number; created_at: string };
        try {
          owner = JSON.parse(await readFile(absolutePath, 'utf8')) as typeof owner;
          if (!Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.created_at !== 'string') {
            throw new Error('malformed lock');
          }
        } catch {
          throw new HarnessError('EXECUTION_BUSY', `execution lock is malformed or active: ${normalized}`);
        }
        try {
          process.kill(owner.pid, 0);
          throw new HarnessError('EXECUTION_BUSY', `execution lock is active: ${normalized}`);
        } catch (killError) {
          if (killError instanceof HarnessError) throw killError;
          const code = (killError as NodeJS.ErrnoException).code;
          if (code === 'EPERM') {
            throw new HarnessError('EXECUTION_BUSY', `execution lock is active: ${normalized}`);
          }
          if (code !== 'ESRCH' || !allowStaleRetry) {
            throw new HarnessError('EXECUTION_BUSY', `execution lock is active: ${normalized}`);
          }
        }
        await unlink(absolutePath).catch((unlinkError: NodeJS.ErrnoException) => {
          if (unlinkError.code !== 'ENOENT') throw unlinkError;
        });
        return acquire(false);
      }

      try {
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })}\n`,
          'utf8'
        );
        await handle.sync();
      } catch (error) {
        await handle.close().catch(() => undefined);
        await unlink(absolutePath).catch(() => undefined);
        throw error;
      }
      await handle.close();
    };

    await acquire(true);
    try {
      return await operation();
    } finally {
      await unlink(absolutePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
    }
  }
}
