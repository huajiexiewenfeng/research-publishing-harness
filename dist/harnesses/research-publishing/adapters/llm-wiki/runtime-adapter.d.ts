import type { RuntimeContextResult } from '../../core/memory-types.js';
import type { ResearchRuntimeRecordType } from '../../core/research-memory-types.js';
import type { RuntimeEnvelope, RuntimeFindRecordsInput, RuntimeFindRecordsResult, RuntimeLaunchConfig, RuntimeLoadPathsInput, RuntimeLoadPathsResult, RuntimeProcessRunner } from './runtime-protocol.js';
export type LLMWikiRuntimeAdapterConfig = RuntimeLaunchConfig & Readonly<{
    readonly workspace: string;
    readonly profile_path: string;
    readonly mapping_path: string;
    readonly scp_paths: readonly string[];
    readonly runner?: RuntimeProcessRunner;
}>;
export interface RuntimeDoctorResult {
    readonly status: 'ok' | 'not_configured';
    readonly runtime_version: '0.2.0' | '0.3.0';
    readonly configured: boolean;
    readonly profile: 'research-publishing';
    readonly mapping_id: string | null;
    readonly profile_digest: `sha256:${string}`;
    readonly mapping_digest: `sha256:${string}`;
    readonly scp_digests: readonly `sha256:${string}`[];
    readonly wiki_root: string | null;
}
export interface RuntimeQueryInput {
    readonly allowed_paths: readonly string[];
    readonly excluded_paths: readonly string[];
    readonly max_items: number;
    readonly max_item_chars: number;
    readonly ordering_policy: 'path_asc';
}
export type LegacyRuntimeRecordType = 'publication_evidence' | 'feedback_snapshot' | 'candidate_insight';
export interface RuntimeWriteRecordInput {
    readonly record_type: LegacyRuntimeRecordType | ResearchRuntimeRecordType;
    readonly variables: Readonly<Record<string, string>>;
    readonly refs: Readonly<Record<string, string>>;
    readonly content_file: string;
}
export interface RuntimeCopySourceInput {
    readonly source: string;
    readonly logical_path: string;
    readonly source_type: 'publication_checkpoint' | 'feedback_insight' | 'research_promotion';
    readonly metadata: Readonly<Record<string, unknown>>;
}
export interface RuntimeWriteResult extends RuntimeEnvelope {
    readonly status: 'ok' | 'already_exists';
    readonly path: string;
    readonly checksum: `sha256:${string}`;
}
export type RuntimeCatalogLookupResult = Readonly<{
    status: 'not_found';
}> | Readonly<{
    status: 'found';
    path: string;
    digest: `sha256:${string}`;
}>;
export declare class LLMWikiRuntimeAdapter {
    private readonly config;
    private readonly runner;
    private readonly prefix;
    private readonly registryPath;
    private readonly wikiRoot;
    constructor(config: LLMWikiRuntimeAdapterConfig);
    private invoke;
    version(): Promise<'0.2.0' | '0.3.0'>;
    doctor(): Promise<RuntimeDoctorResult>;
    query(input: RuntimeQueryInput): Promise<RuntimeContextResult>;
    findRecords(input: RuntimeFindRecordsInput): Promise<RuntimeFindRecordsResult>;
    loadPaths(input: RuntimeLoadPathsInput): Promise<RuntimeLoadPathsResult>;
    validateMapping(): Promise<RuntimeEnvelope>;
    findCatalog(trackId: string): Promise<RuntimeCatalogLookupResult>;
    copySource(input: RuntimeCopySourceInput): Promise<RuntimeWriteResult>;
    writeRecord(input: RuntimeWriteRecordInput): Promise<RuntimeWriteResult>;
    registerArtifact(record: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
    appendLog(record: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
}
export declare function createLLMWikiRuntimeAdapter(config: LLMWikiRuntimeAdapterConfig): LLMWikiRuntimeAdapter;
