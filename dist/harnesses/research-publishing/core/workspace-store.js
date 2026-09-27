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
    'program',
    'research',
    'receipts',
    'reviews',
    'runs',
    'x'
]);
const DIRECTORY_RENAME_RETRY_DELAYS_MS = [25, 100, 250];
const TRANSIENT_DIRECTORY_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);
const waitFor = async (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
export class WorkspaceStore {
    root;
    renameDirectory;
    wait;
    constructor(root, dependencies) {
        this.root = root;
        this.renameDirectory = dependencies.renameDirectory ?? rename;
        this.wait = dependencies.wait ?? waitFor;
    }
    static async open(root, dependencies = {}) {
        const resolvedRoot = resolve(root);
        await mkdir(resolvedRoot, { recursive: true });
        await Promise.all([...ALLOWED_TOP_LEVEL].map((folder) => mkdir(resolve(resolvedRoot, folder), { recursive: true })));
        return new WorkspaceStore(resolvedRoot, dependencies);
    }
    async installDirectory(temporaryPath, absolutePath, normalized) {
        for (let attempt = 0;; attempt += 1) {
            try {
                await this.renameDirectory(temporaryPath, absolutePath);
                return;
            }
            catch (error) {
                const code = error.code;
                const destinationExists = await lstat(absolutePath).then(() => true, (statError) => {
                    if (statError.code === 'ENOENT')
                        return false;
                    throw statError;
                });
                if (destinationExists) {
                    throw new HarnessError('ARTIFACT_EXISTS', `artifact directory already exists: ${normalized}`);
                }
                const delay = DIRECTORY_RENAME_RETRY_DELAYS_MS[attempt];
                if (!code || !TRANSIENT_DIRECTORY_RENAME_ERRORS.has(code) || delay === undefined) {
                    throw error;
                }
                await this.wait(delay);
            }
        }
    }
    resolveAllowed(relativePath) {
        const portablePath = relativePath.replaceAll('\\', '/');
        if (portablePath.length === 0 || isAbsolute(relativePath)) {
            throw new HarnessError('WORKSPACE_PATH_INVALID', `invalid workspace path: ${relativePath}`);
        }
        const absolutePath = resolve(this.root, portablePath);
        const relativeToRoot = relative(this.root, absolutePath);
        const segments = relativeToRoot.split(sep);
        if (relativeToRoot.length === 0 ||
            relativeToRoot.startsWith(`..${sep}`) ||
            relativeToRoot === '..' ||
            isAbsolute(relativeToRoot) ||
            !ALLOWED_TOP_LEVEL.has(segments[0] ?? '')) {
            throw new HarnessError('WORKSPACE_PATH_INVALID', `path is outside the publishing workspace allowlist: ${relativePath}`);
        }
        return { absolutePath, normalized: relativeToRoot.split(sep).join('/') };
    }
    async writeNew(relativePath, value) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        const serialized = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
        const bytes = Buffer.byteLength(serialized);
        await mkdir(dirname(absolutePath), { recursive: true });
        const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
        const handle = await open(temporaryPath, 'wx');
        try {
            await handle.writeFile(serialized, 'utf8');
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        try {
            // A hard-link installs the fully-written inode atomically and fails if the target exists.
            await link(temporaryPath, absolutePath);
        }
        catch (error) {
            await unlink(temporaryPath).catch(() => undefined);
            if (error.code === 'EEXIST') {
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
    async writeNewBytes(relativePath, value) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        const bytes = Buffer.from(value);
        await mkdir(dirname(absolutePath), { recursive: true });
        const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
        const handle = await open(temporaryPath, 'wx');
        try {
            await handle.writeFile(bytes);
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        try {
            await link(temporaryPath, absolutePath);
        }
        catch (error) {
            await unlink(temporaryPath).catch(() => undefined);
            if (error.code === 'EEXIST') {
                throw new HarnessError('ARTIFACT_EXISTS', `artifact already exists: ${normalized}`);
            }
            throw error;
        }
        await unlink(temporaryPath);
        return { relative_path: normalized, digest: sha256Bytes(bytes), bytes: bytes.length };
    }
    async writeNewDirectory(relativeDirectory, entries) {
        const { absolutePath, normalized } = this.resolveAllowed(relativeDirectory);
        await mkdir(dirname(absolutePath), { recursive: true });
        try {
            await lstat(absolutePath);
            throw new HarnessError('ARTIFACT_EXISTS', `artifact directory already exists: ${normalized}`);
        }
        catch (error) {
            if (error instanceof HarnessError)
                throw error;
            if (error.code !== 'ENOENT')
                throw error;
        }
        const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
        await mkdir(temporaryPath);
        try {
            for (const [entryPath, value] of Object.entries(entries)) {
                const portable = entryPath.replaceAll('\\', '/');
                const segments = portable.split('/');
                if (portable.length === 0 ||
                    isAbsolute(entryPath) ||
                    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
                    throw new HarnessError('WORKSPACE_PATH_INVALID', `invalid package entry path: ${entryPath}`);
                }
                const target = resolve(temporaryPath, portable);
                const relativeToTemporary = relative(temporaryPath, target);
                if (relativeToTemporary === '..' ||
                    relativeToTemporary.startsWith(`..${sep}`) ||
                    isAbsolute(relativeToTemporary)) {
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
                }
                finally {
                    await handle.close();
                }
            }
            await this.installDirectory(temporaryPath, absolutePath, normalized);
        }
        finally {
            await rm(temporaryPath, { recursive: true, force: true });
        }
    }
    async readBytes(relativePath) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        try {
            return await readFile(absolutePath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
            }
            throw error;
        }
    }
    async resolveRegularFile(relativePath) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        const metadata = await lstat(absolutePath).catch((error) => {
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
    async resolveExistingArtifact(relativePath) {
        const artifact = await this.readContainedArtifact(relativePath);
        return {
            relative_path: artifact.relative_path,
            absolute_path: artifact.absolute_path,
            digest: artifact.digest,
            bytes: artifact.bytes
        };
    }
    async readContainedArtifact(relativePath) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        const segments = normalized.split('/');
        let current = this.root;
        for (const segment of segments) {
            current = resolve(current, segment);
            const metadata = await lstat(current).catch((error) => {
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
        if (relativeToRoot === '..' ||
            relativeToRoot.startsWith(`..${sep}`) ||
            isAbsolute(relativeToRoot)) {
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
    async readJson(relativePath) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        try {
            return JSON.parse(await readFile(absolutePath, 'utf8'));
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
            }
            throw error;
        }
    }
    async readText(relativePath) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        try {
            return await readFile(absolutePath, 'utf8');
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
            }
            throw error;
        }
    }
    async exists(relativePath) {
        const { absolutePath } = this.resolveAllowed(relativePath);
        try {
            await access(absolutePath);
            return true;
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return false;
            throw error;
        }
    }
    async list(relativeDirectory) {
        const { absolutePath, normalized } = this.resolveAllowed(relativeDirectory);
        let entries;
        try {
            entries = await readdir(absolutePath, { withFileTypes: true });
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
        return entries
            .map((entry) => ({
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
    async removeFile(relativePath) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        let metadata;
        try {
            metadata = await lstat(absolutePath);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new HarnessError('ARTIFACT_NOT_FOUND', `artifact not found: ${normalized}`);
            }
            throw error;
        }
        if (!metadata.isFile() || metadata.isSymbolicLink()) {
            throw new HarnessError('WORKSPACE_PATH_INVALID', `retention may remove regular files only: ${normalized}`);
        }
        await unlink(absolutePath);
        return metadata.size;
    }
    async appendLine(relativePath, line) {
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
        }
        finally {
            await handle.close();
        }
        return {
            relative_path: normalized,
            digest: sha256(serialized),
            bytes: Buffer.byteLength(serialized)
        };
    }
    async replaceAtomic(relativePath, value) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        const serialized = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`;
        await mkdir(dirname(absolutePath), { recursive: true });
        const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
        const handle = await open(temporaryPath, 'wx');
        try {
            await handle.writeFile(serialized, 'utf8');
            await handle.sync();
        }
        finally {
            await handle.close();
        }
        try {
            await rename(temporaryPath, absolutePath);
        }
        catch (error) {
            const code = error.code;
            if (code !== 'EEXIST' && code !== 'EPERM')
                throw error;
            await unlink(absolutePath).catch((unlinkError) => {
                if (unlinkError.code !== 'ENOENT')
                    throw unlinkError;
            });
            await rename(temporaryPath, absolutePath);
        }
        finally {
            await unlink(temporaryPath).catch(() => undefined);
        }
        return {
            relative_path: normalized,
            digest: sha256(serialized),
            bytes: Buffer.byteLength(serialized)
        };
    }
    async withLock(relativePath, operation) {
        const { absolutePath, normalized } = this.resolveAllowed(relativePath);
        await mkdir(dirname(absolutePath), { recursive: true });
        const acquire = async (allowStaleRetry) => {
            let handle;
            try {
                handle = await open(absolutePath, 'wx');
            }
            catch (error) {
                if (error.code !== 'EEXIST')
                    throw error;
                let owner;
                try {
                    owner = JSON.parse(await readFile(absolutePath, 'utf8'));
                    if (!Number.isInteger(owner.pid) || owner.pid <= 0 || typeof owner.created_at !== 'string') {
                        throw new Error('malformed lock');
                    }
                }
                catch {
                    throw new HarnessError('EXECUTION_BUSY', `execution lock is malformed or active: ${normalized}`);
                }
                try {
                    process.kill(owner.pid, 0);
                    throw new HarnessError('EXECUTION_BUSY', `execution lock is active: ${normalized}`);
                }
                catch (killError) {
                    if (killError instanceof HarnessError)
                        throw killError;
                    const code = killError.code;
                    if (code === 'EPERM') {
                        throw new HarnessError('EXECUTION_BUSY', `execution lock is active: ${normalized}`);
                    }
                    if (code !== 'ESRCH' || !allowStaleRetry) {
                        throw new HarnessError('EXECUTION_BUSY', `execution lock is active: ${normalized}`);
                    }
                }
                await unlink(absolutePath).catch((unlinkError) => {
                    if (unlinkError.code !== 'ENOENT')
                        throw unlinkError;
                });
                return acquire(false);
            }
            try {
                await handle.writeFile(`${JSON.stringify({ pid: process.pid, created_at: new Date().toISOString() })}\n`, 'utf8');
                await handle.sync();
            }
            catch (error) {
                await handle.close().catch(() => undefined);
                await unlink(absolutePath).catch(() => undefined);
                throw error;
            }
            await handle.close();
        };
        await acquire(true);
        try {
            return await operation();
        }
        finally {
            await unlink(absolutePath).catch((error) => {
                if (error.code !== 'ENOENT')
                    throw error;
            });
        }
    }
}
//# sourceMappingURL=workspace-store.js.map