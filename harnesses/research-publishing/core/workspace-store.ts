import { randomUUID } from 'node:crypto';
import { access, link, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';

const ALLOWED_TOP_LEVEL = new Set([
  'approvals',
  'articles',
  'candidates',
  'exports',
  'feedback',
  'memory',
  'packages',
  'receipts',
  'reviews',
  'runs',
  'x'
]);

export interface ArtifactRef {
  readonly relative_path: string;
  readonly digest: `sha256:${string}`;
  readonly bytes: number;
}

export interface ContainedArtifact extends ArtifactRef {
  readonly absolute_path: string;
  readonly content: Buffer;
}

export interface WorkspaceExecutionApi {
  exists(relativePath: string): Promise<boolean>;
  appendLine(relativePath: string, line: string): Promise<ArtifactRef>;
  replaceAtomic(relativePath: string, value: string | object): Promise<ArtifactRef>;
  withLock<T>(relativePath: string, operation: () => Promise<T>): Promise<T>;
}

export interface WorkspaceEntry {
  readonly name: string;
  readonly relative_path: string;
  readonly kind: 'file' | 'directory' | 'symlink';
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

  async writeNewBytes(relativePath: string, value: Uint8Array): Promise<ArtifactRef> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    const bytes = Buffer.from(value);
    await mkdir(dirname(absolutePath), { recursive: true });
    const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, 'wx');
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await link(temporaryPath, absolutePath);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new HarnessError('ARTIFACT_EXISTS', `artifact already exists: ${normalized}`);
      }
      throw error;
    }
    await unlink(temporaryPath);
    return { relative_path: normalized, digest: sha256Bytes(bytes), bytes: bytes.length };
  }

  async writeNewDirectory(
    relativeDirectory: string,
    entries: Readonly<Record<string, string | object | Uint8Array>>
  ): Promise<void> {
    const { absolutePath, normalized } = this.resolveAllowed(relativeDirectory);
    await mkdir(dirname(absolutePath), { recursive: true });
    try {
      await lstat(absolutePath);
      throw new HarnessError('ARTIFACT_EXISTS', `artifact directory already exists: ${normalized}`);
    } catch (error) {
      if (error instanceof HarnessError) throw error;
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
    await mkdir(temporaryPath);
    try {
      for (const [entryPath, value] of Object.entries(entries)) {
        const portable = entryPath.replaceAll('\\', '/');
        const segments = portable.split('/');
        if (
          portable.length === 0 ||
          isAbsolute(entryPath) ||
          segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
        ) {
          throw new HarnessError('WORKSPACE_PATH_INVALID', `invalid package entry path: ${entryPath}`);
        }
        const target = resolve(temporaryPath, portable);
        const relativeToTemporary = relative(temporaryPath, target);
        if (
          relativeToTemporary === '..' ||
          relativeToTemporary.startsWith(`..${sep}`) ||
          isAbsolute(relativeToTemporary)
        ) {
          throw new HarnessError('WORKSPACE_PATH_INVALID', `package entry escapes staging directory: ${entryPath}`);
        }
        await mkdir(dirname(target), { recursive: true });
        const bytes = value instanceof Uint8Array
          ? Buffer.from(value)
          : Buffer.from(typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, 'utf8');
        const handle = await open(target, 'wx');
        try {
          await handle.writeFile(bytes);
          await handle.sync();
        } finally {
          await handle.close();
        }
      }
      try {
        await rename(temporaryPath, absolutePath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'EEXIST' || code === 'ENOTEMPTY' || code === 'EPERM') {
          throw new HarnessError('ARTIFACT_EXISTS', `artifact directory already exists: ${normalized}`);
        }
        throw error;
      }
    } finally {
      await rm(temporaryPath, { recursive: true, force: true });
    }
  }

  async readBytes(relativePath: string): Promise<Buffer> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    try {
      return await readFile(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
      }
      throw error;
    }
  }

  async resolveRegularFile(relativePath: string): Promise<string> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    const metadata = await lstat(absolutePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
      }
      throw error;
    });
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new HarnessError('VISUAL_PATH_OUTSIDE_PACKAGE', `visual asset is not a regular file: ${normalized}`);
    }
    const [realRoot, realFile] = await Promise.all([realpath(this.root), realpath(absolutePath)]);
    const relativeToRoot = relative(realRoot, realFile);
    if (relativeToRoot === '..' || relativeToRoot.startsWith(`..${sep}`) || isAbsolute(relativeToRoot)) {
      throw new HarnessError('VISUAL_PATH_OUTSIDE_PACKAGE', `visual asset escapes workspace: ${normalized}`);
    }
    return realFile;
  }

  async resolveExistingArtifact(
    relativePath: string
  ): Promise<ArtifactRef & { readonly absolute_path: string }> {
    const artifact = await this.readContainedArtifact(relativePath);
    return {
      relative_path: artifact.relative_path,
      absolute_path: artifact.absolute_path,
      digest: artifact.digest,
      bytes: artifact.bytes
    };
  }

  async readContainedArtifact(relativePath: string): Promise<ContainedArtifact> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    const segments = normalized.split('/');
    let current = this.root;
    for (const segment of segments) {
      current = resolve(current, segment);
      const metadata = await lstat(current).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
        }
        throw error;
      });
      if (metadata.isSymbolicLink()) {
        throw new HarnessError('WORKSPACE_PATH_INVALID', `artifact path contains a link: ${normalized}`);
      }
    }

    const metadata = await lstat(absolutePath);
    if (!metadata.isFile()) {
      throw new HarnessError('WORKSPACE_PATH_INVALID', `artifact is not a regular file: ${normalized}`);
    }
    const [realRoot, realFile] = await Promise.all([realpath(this.root), realpath(absolutePath)]);
    const relativeToRoot = relative(realRoot, realFile);
    if (
      relativeToRoot === '..' ||
      relativeToRoot.startsWith(`..${sep}`) ||
      isAbsolute(relativeToRoot)
    ) {
      throw new HarnessError('WORKSPACE_PATH_INVALID', `artifact escapes workspace: ${normalized}`);
    }
    const bytes = await readFile(realFile);
    return {
      relative_path: normalized,
      absolute_path: realFile,
      digest: sha256Bytes(bytes),
      bytes: bytes.length,
      content: bytes
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

  async list(relativeDirectory: string): Promise<readonly WorkspaceEntry[]> {
    const { absolutePath, normalized } = this.resolveAllowed(relativeDirectory);
    let entries;
    try {
      entries = await readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    return entries
      .map((entry): WorkspaceEntry => ({
        name: entry.name,
        relative_path: `${normalized}/${entry.name}`,
        kind: entry.isSymbolicLink()
          ? 'symlink'
          : entry.isDirectory()
            ? 'directory'
            : 'file'
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async removeFile(relativePath: string): Promise<number> {
    const { absolutePath, normalized } = this.resolveAllowed(relativePath);
    let metadata;
    try {
      metadata = await lstat(absolutePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
      }
      throw error;
    }
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new HarnessError(
        'WORKSPACE_PATH_INVALID',
        `retention may remove regular files only: ${normalized}`
      );
    }
    await unlink(absolutePath);
    return metadata.size;
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
