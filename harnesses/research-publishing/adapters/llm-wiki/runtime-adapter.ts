import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

import { sha256Bytes } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
import type { RuntimeContextResult } from '../../core/memory-types.js';
import type { ResearchRuntimeRecordType } from '../../core/research-memory-types.js';
import { NodeRuntimeProcessRunner } from './runtime-process.js';
import type {
  RuntimeEnvelope,
  RuntimeLaunchConfig,
  RuntimeProcessOutput,
  RuntimeProcessRunner
} from './runtime-protocol.js';

const TIMEOUT_MS = 15_000;
const OUTPUT_LIMIT = 1_048_576;
const DOMAIN = 'research-publishing';
const RUNTIME_VERSION = '0.2.0';
const SAFE_TRACK_PATH = /^domains\/research-publishing\/tracks\/[a-z0-9][a-z0-9_-]{0,127}\/\*\*$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const INGEST_SUCCESS = new Set(['ok', 'already_exists']);

export type LLMWikiRuntimeAdapterConfig = RuntimeLaunchConfig & Readonly<{
  readonly workspace: string;
  readonly profile_path: string;
  readonly mapping_path: string;
  readonly scp_paths: readonly string[];
  readonly runner?: RuntimeProcessRunner;
}>;

export interface RuntimeDoctorResult {
  readonly status: 'ok' | 'not_configured';
  readonly runtime_version: '0.2.0';
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

const RUNTIME_RECORD_TYPES = new Set<LegacyRuntimeRecordType | ResearchRuntimeRecordType>([
  'publication_evidence', 'feedback_snapshot', 'candidate_insight',
  'research_increment', 'claim_version', 'research_decision', 'open_question',
  'publication_expression', 'research_evolution_edge', 'canonical_document_manifest',
  'canonical_document_chunk', 'research_lifecycle_event', 'research_index_catalog',
  'research_index_shard'
]);
const RUNTIME_SOURCE_TYPES = new Set<RuntimeCopySourceInput['source_type']>([
  'publication_checkpoint', 'feedback_insight', 'research_promotion'
]);

function requireAbsolute(value: string, label: string): void {
  if (!isAbsolute(value)) {
    throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', `expected absolute ${label}`);
  }
}

function assertContained(root: string, target: string, label: string): void {
  requireAbsolute(target, label);
  const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new HarnessError('WORKSPACE_PATH_INVALID', `${label} is outside the publishing workspace`);
  }
}

function envelope(output: RuntimeProcessOutput): RuntimeEnvelope {
  const status = output.envelope.status;
  if (typeof status !== 'string' || status.length === 0) {
    throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'runtime response has no status');
  }
  return output.envelope as RuntimeEnvelope;
}

function statusFailure(command: string, result: RuntimeEnvelope): HarnessError {
  return new HarnessError(
    'MEMORY_RUNTIME_FAILED',
    `runtime ${command} failed with status ${result.status}`
  );
}

function normalizedDigest(value: unknown): `sha256:${string}` | null {
  if (typeof value !== 'string') return null;
  if (/^sha256:[a-f0-9]{64}$/.test(value)) return value as `sha256:${string}`;
  if (/^[a-f0-9]{64}$/.test(value)) return `sha256:${value}`;
  return null;
}

function normalizeEnvelopeChecksum(result: RuntimeEnvelope): RuntimeEnvelope {
  const checksum = normalizedDigest(result.checksum);
  return checksum === null ? result : { ...result, checksum };
}

function mutationResult(command: string, result: RuntimeEnvelope): RuntimeWriteResult {
  const normalized = normalizeEnvelopeChecksum(result);
  if (
    (normalized.status !== 'ok' && normalized.status !== 'already_exists') ||
    typeof normalized.path !== 'string' || normalizedDigest(normalized.checksum) === null
  ) {
    throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', `runtime ${command} returned an invalid mutation result`);
  }
  return normalized as RuntimeWriteResult;
}

export class LLMWikiRuntimeAdapter {
  private readonly runner: RuntimeProcessRunner;
  private readonly prefix: readonly string[];
  private readonly registryPath: string;
  private readonly wikiRoot: string;

  constructor(private readonly config: LLMWikiRuntimeAdapterConfig) {
    if (config.launcher !== 'console-script' && config.launcher !== 'python-module') {
      throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'unsupported runtime launcher');
    }
    requireAbsolute(config.executable, 'runtime executable');
    requireAbsolute(config.workspace, 'publishing workspace');
    for (const path of [config.profile_path, config.mapping_path, ...config.scp_paths]) {
      requireAbsolute(path, 'Domain asset path');
    }
    if (config.expected_version !== RUNTIME_VERSION) {
      throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'unsupported expected runtime version');
    }
    if (config.scp_paths.length === 0) {
      throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'at least one Domain SCP is required');
    }
    const sourceRoot = resolve(dirname(config.profile_path), '../../..');
    if (resolve(config.workspace) === sourceRoot) {
      throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'publishing workspace cannot be the Harness source root');
    }
    this.runner = config.runner ?? new NodeRuntimeProcessRunner();
    this.prefix = config.launcher === 'python-module' ? ['-m', 'llm_wiki_runtime.cli'] : [];
    this.registryPath = resolve(config.workspace, 'memory/runtime/skill-registry.json');
    this.wikiRoot = resolve(config.workspace, '.llm-wiki');
  }

  private async invoke(command: string, args: readonly string[] = []): Promise<RuntimeEnvelope> {
    const output = await this.runner.run({
      executable: this.config.executable,
      args: [...this.prefix, command, ...args],
      cwd: this.config.workspace,
      shell: false,
      timeout_ms: TIMEOUT_MS,
      max_output_bytes: OUTPUT_LIMIT
    });
    return envelope(output);
  }

  async version(): Promise<'0.2.0'> {
    const result = await this.invoke('version');
    if (result.status !== 'ok' || result.version !== this.config.expected_version) {
      throw new HarnessError(
        'MEMORY_RUNTIME_INCOMPATIBLE',
        'llm-wiki-runtime version is not compatible with V2.2'
      );
    }
    return RUNTIME_VERSION;
  }

  async doctor(): Promise<RuntimeDoctorResult> {
    const runtimeVersion = await this.version();
    const digests = await Promise.all([
      readFile(this.config.profile_path).then(sha256Bytes),
      readFile(this.config.mapping_path).then(sha256Bytes),
      ...this.config.scp_paths.map((path) => readFile(path).then(sha256Bytes))
    ]);
    const resolved = await this.invoke('resolve-config', [
      '--cwd', this.config.workspace,
      '--profile', DOMAIN,
      '--scope', this.config.workspace
    ]);
    if (resolved.status !== 'enabled' || resolved.enabled !== true) {
      return {
        status: 'not_configured', runtime_version: runtimeVersion, configured: false,
        profile: DOMAIN, mapping_id: null, profile_digest: digests[0]!,
        mapping_digest: digests[1]!, scp_digests: digests.slice(2), wiki_root: null
      };
    }
    const registry = await this.invoke('scan-scp', [
      '--scp-path-json', JSON.stringify(this.config.scp_paths),
      '--write', '--output', this.registryPath
    ]);
    if (registry.status !== 'ok') throw statusFailure('scan-scp', registry);
    const mapping = await this.validateMapping();
    return {
      status: 'ok', runtime_version: runtimeVersion, configured: true,
      profile: DOMAIN,
      mapping_id: typeof mapping.mapping_id === 'string' ? mapping.mapping_id : null,
      profile_digest: digests[0]!, mapping_digest: digests[1]!,
      scp_digests: digests.slice(2),
      wiki_root: typeof resolved.wiki_root === 'string' ? resolved.wiki_root : this.wikiRoot
    };
  }

  async query(input: RuntimeQueryInput): Promise<RuntimeContextResult> {
    if (
      input.allowed_paths.length === 0 ||
      input.allowed_paths.some((path) => !SAFE_TRACK_PATH.test(path)) ||
      input.excluded_paths.some((path) => !['sources/originals/**', '.meta/**'].includes(path)) ||
      !Number.isInteger(input.max_items) || input.max_items <= 0 ||
      !Number.isInteger(input.max_item_chars) || input.max_item_chars <= 0 ||
      input.ordering_policy !== 'path_asc'
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'invalid research-publishing context query');
    }
    try {
      const result = await this.invoke('load-context-pack', [
        '--wiki-root', this.wikiRoot,
        '--include-json', JSON.stringify(input.allowed_paths),
        '--exclude-json', JSON.stringify(input.excluded_paths),
        '--max-files', String(input.max_items),
        '--max-chars-per-file', String(input.max_item_chars),
        '--path-json', '[]', '--glob-json', '[]',
        '--order', 'path_asc', '--policy', 'data_only',
        '--caller-domain', DOMAIN, '--target-domain', DOMAIN
      ]);
      if (result.status !== 'ok' || !Array.isArray(result.items)) {
        throw statusFailure('load-context-pack', result);
      }
      const items = result.items.map((raw) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'invalid context item');
        }
        const item = raw as Record<string, unknown>;
        if (
          typeof item.path !== 'string' || normalizedDigest(item.checksum) === null ||
          typeof item.content !== 'string' || item.instruction_policy !== 'data_only' ||
          typeof item.sanitized !== 'boolean' || !Array.isArray(item.risk_flags) ||
          !item.risk_flags.every((flag) => typeof flag === 'string')
        ) {
          throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'invalid context item fields');
        }
        return {
          path: item.path,
          checksum: normalizedDigest(item.checksum)!,
          content: item.content,
          instruction_policy: 'data_only' as const,
          sanitized: item.sanitized,
          risk_flags: item.risk_flags as string[]
        };
      });
      return {
        status: items.length > 0 ? 'loaded' : 'empty',
        runtime_version: RUNTIME_VERSION,
        items,
        excluded_count: typeof result.excluded_count === 'number' ? result.excluded_count : 0,
        truncated_count: 0
      };
    } catch (error) {
      if (error instanceof HarnessError && error.code === 'CONTRACT_INVALID') throw error;
      return {
        status: 'unavailable', runtime_version: null, items: [],
        excluded_count: 0, truncated_count: 0
      };
    }
  }

  async validateMapping(): Promise<RuntimeEnvelope> {
    const result = await this.invoke('validate-mapping', [
      '--mapping-path', this.config.mapping_path,
      '--registry-path', this.registryPath,
      '--profile-path', this.config.profile_path
    ]);
    if (result.status !== 'ok') throw statusFailure('validate-mapping', result);
    return normalizeEnvelopeChecksum(result);
  }

  async copySource(input: RuntimeCopySourceInput): Promise<RuntimeWriteResult> {
    assertContained(this.config.workspace, input.source, 'source staging file');
    if (!RUNTIME_SOURCE_TYPES.has(input.source_type)) {
      throw new HarnessError('CONTRACT_INVALID', 'unsupported Runtime source type');
    }
    if (input.logical_path.includes('..') || input.logical_path.startsWith('/') || input.logical_path.includes('\\')) {
      throw new HarnessError('CONTRACT_INVALID', 'invalid logical source path');
    }
    const result = await this.invoke('copy-source', [
      '--wiki-root', this.wikiRoot, '--source', input.source,
      '--logical-path', input.logical_path, '--source-type', input.source_type,
      '--metadata-json', JSON.stringify(input.metadata)
    ]);
    if (!INGEST_SUCCESS.has(result.status)) throw statusFailure('copy-source', result);
    return mutationResult('copy-source', result);
  }

  async writeRecord(input: RuntimeWriteRecordInput): Promise<RuntimeWriteResult> {
    assertContained(this.config.workspace, input.content_file, 'record content file');
    if (!RUNTIME_RECORD_TYPES.has(input.record_type)) {
      throw new HarnessError('CONTRACT_INVALID', 'unsupported Runtime record type');
    }
    for (const value of Object.values(input.variables)) {
      if (!SAFE_SLUG.test(value)) throw new HarnessError('CONTRACT_INVALID', 'invalid record path variable');
    }
    const result = await this.invoke('write-record', [
      '--scope-root', this.config.workspace, '--profile-path', this.config.profile_path,
      '--record-type', input.record_type,
      '--variables-json', JSON.stringify(input.variables), '--refs-json', JSON.stringify(input.refs),
      '--content-file', input.content_file
    ]);
    if (!INGEST_SUCCESS.has(result.status)) throw statusFailure('write-record', result);
    return mutationResult('write-record', result);
  }

  async registerArtifact(record: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope> {
    const result = await this.invoke('register-artifact', [
      '--wiki-root', this.wikiRoot, '--record-json', JSON.stringify(record)
    ]);
    if (!INGEST_SUCCESS.has(result.status)) throw statusFailure('register-artifact', result);
    return result;
  }

  async appendLog(record: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope> {
    const result = await this.invoke('append-log', [
      '--scope-root', this.config.workspace, '--profile-path', this.config.profile_path,
      '--log-type', 'memory_event', '--record-json', JSON.stringify(record)
    ]);
    if (!INGEST_SUCCESS.has(result.status)) throw statusFailure('append-log', result);
    return result;
  }
}

export function createLLMWikiRuntimeAdapter(
  config: LLMWikiRuntimeAdapterConfig
): LLMWikiRuntimeAdapter {
  return new LLMWikiRuntimeAdapter(config);
}
