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
export interface WorkspaceEntry {
    readonly name: string;
    readonly relative_path: string;
    readonly kind: 'file' | 'directory' | 'symlink';
}
export declare class WorkspaceStore {
    readonly root: string;
    private constructor();
    static open(root: string): Promise<WorkspaceStore>;
    private resolveAllowed;
    writeNew(relativePath: string, value: string | object): Promise<ArtifactRef>;
    writeNewBytes(relativePath: string, value: Uint8Array): Promise<ArtifactRef>;
    writeNewDirectory(relativeDirectory: string, entries: Readonly<Record<string, string | object | Uint8Array>>): Promise<void>;
    readBytes(relativePath: string): Promise<Buffer>;
    resolveRegularFile(relativePath: string): Promise<string>;
    readJson<T>(relativePath: string): Promise<T>;
    readText(relativePath: string): Promise<string>;
    exists(relativePath: string): Promise<boolean>;
    list(relativeDirectory: string): Promise<readonly WorkspaceEntry[]>;
    removeFile(relativePath: string): Promise<number>;
    appendLine(relativePath: string, line: string): Promise<ArtifactRef>;
    replaceAtomic(relativePath: string, value: string | object): Promise<ArtifactRef>;
    withLock<T>(relativePath: string, operation: () => Promise<T>): Promise<T>;
}
