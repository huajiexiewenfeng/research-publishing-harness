import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { sha256Bytes } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
import { NodeRuntimeProcessRunner } from './runtime-process.js';
const TIMEOUT_MS = 15_000;
const OUTPUT_LIMIT = 1_048_576;
const DOMAIN = 'research-publishing';
const SUPPORTED_RUNTIME_VERSIONS = ['0.2.0', '0.3.0'];
const SAFE_TRACK_PATH = /^domains\/research-publishing\/tracks\/[a-z0-9][a-z0-9_-]{0,127}\/\*\*$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9_-]{0,127}$/;
const SAFE_LOOKUP_VALUE = /^[a-z0-9][a-z0-9_:-]{0,255}$/;
const SAFE_RUNTIME_PATH = /^domains\/research-publishing\/[a-zA-Z0-9._\/-]+$/;
const INGEST_SUCCESS = new Set(['ok', 'already_exists']);
const RUNTIME_RECORD_TYPES = new Set([
    'publication_evidence', 'feedback_snapshot', 'candidate_insight',
    'research_increment', 'claim_version', 'research_decision', 'open_question',
    'publication_expression', 'research_evolution_edge', 'canonical_document_manifest',
    'canonical_document_chunk', 'research_lifecycle_event', 'research_index_catalog',
    'research_index_shard'
]);
const RUNTIME_SOURCE_TYPES = new Set([
    'publication_checkpoint', 'feedback_insight', 'research_promotion'
]);
const RUNTIME_LOOKUP_KEYS = new Map([
    ['research_index_catalog', 'index_id']
]);
function requireAbsolute(value, label) {
    if (!isAbsolute(value)) {
        throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', `expected absolute ${label}`);
    }
}
function assertContained(root, target, label) {
    requireAbsolute(target, label);
    const rel = relative(root, target);
    if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
        throw new HarnessError('WORKSPACE_PATH_INVALID', `${label} is outside the publishing workspace`);
    }
}
function envelope(output) {
    const status = output.envelope.status;
    if (typeof status !== 'string' || status.length === 0) {
        throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'runtime response has no status');
    }
    return output.envelope;
}
function statusFailure(command, result) {
    return new HarnessError('MEMORY_RUNTIME_FAILED', `runtime ${command} failed with status ${result.status}`);
}
function normalizedDigest(value) {
    if (typeof value !== 'string')
        return null;
    if (/^sha256:[a-f0-9]{64}$/.test(value))
        return value;
    if (/^[a-f0-9]{64}$/.test(value))
        return `sha256:${value}`;
    return null;
}
function normalizeEnvelopeChecksum(result) {
    const checksum = normalizedDigest(result.checksum);
    return checksum === null ? result : { ...result, checksum };
}
function mutationResult(command, result) {
    const normalized = normalizeEnvelopeChecksum(result);
    if ((normalized.status !== 'ok' && normalized.status !== 'already_exists') ||
        typeof normalized.path !== 'string' || normalizedDigest(normalized.checksum) === null) {
        throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', `runtime ${command} returned an invalid mutation result`);
    }
    return normalized;
}
function validateExactRuntimePath(path) {
    return SAFE_RUNTIME_PATH.test(path) &&
        !path.includes('..') && !path.includes('\\') &&
        !path.split('/').includes('.') && !path.includes('//') &&
        !/[?*\[\]]/.test(path) && !isAbsolute(path);
}
function contextItems(result, allowedPaths) {
    if (!Array.isArray(result.items)) {
        throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'runtime context response has no items');
    }
    const observed = new Set();
    return result.items.map((raw) => {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'invalid context item');
        }
        const item = raw;
        if (typeof item.path !== 'string' || !validateExactRuntimePath(item.path) ||
            (allowedPaths !== undefined && !allowedPaths.has(item.path)) || observed.has(item.path) ||
            normalizedDigest(item.checksum) === null || typeof item.content !== 'string' ||
            item.instruction_policy !== 'data_only' || typeof item.sanitized !== 'boolean' ||
            !Array.isArray(item.risk_flags) || !item.risk_flags.every((flag) => typeof flag === 'string')) {
            throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'invalid context item fields');
        }
        observed.add(item.path);
        return {
            path: item.path, checksum: normalizedDigest(item.checksum), content: item.content,
            instruction_policy: 'data_only', sanitized: item.sanitized,
            risk_flags: item.risk_flags
        };
    });
}
export class LLMWikiRuntimeAdapter {
    config;
    runner;
    prefix;
    registryPath;
    wikiRoot;
    constructor(config) {
        this.config = config;
        if (config.launcher !== 'console-script' && config.launcher !== 'python-module') {
            throw new HarnessError('MEMORY_RUNTIME_INVALID_CONFIG', 'unsupported runtime launcher');
        }
        requireAbsolute(config.executable, 'runtime executable');
        requireAbsolute(config.workspace, 'publishing workspace');
        for (const path of [config.profile_path, config.mapping_path, ...config.scp_paths]) {
            requireAbsolute(path, 'Domain asset path');
        }
        if (!SUPPORTED_RUNTIME_VERSIONS.includes(config.expected_version)) {
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
    async invoke(command, args = []) {
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
    async version() {
        const result = await this.invoke('version');
        if (result.status !== 'ok' || result.version !== this.config.expected_version) {
            throw new HarnessError('MEMORY_RUNTIME_INCOMPATIBLE', 'llm-wiki-runtime version differs from the explicitly selected supported version');
        }
        return this.config.expected_version;
    }
    async doctor() {
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
                profile: DOMAIN, mapping_id: null, profile_digest: digests[0],
                mapping_digest: digests[1], scp_digests: digests.slice(2), wiki_root: null
            };
        }
        const registry = await this.invoke('scan-scp', [
            '--scp-path-json', JSON.stringify(this.config.scp_paths),
            '--write', '--output', this.registryPath
        ]);
        if (registry.status !== 'ok')
            throw statusFailure('scan-scp', registry);
        const mapping = await this.validateMapping();
        return {
            status: 'ok', runtime_version: runtimeVersion, configured: true,
            profile: DOMAIN,
            mapping_id: typeof mapping.mapping_id === 'string' ? mapping.mapping_id : null,
            profile_digest: digests[0], mapping_digest: digests[1],
            scp_digests: digests.slice(2),
            wiki_root: typeof resolved.wiki_root === 'string' ? resolved.wiki_root : this.wikiRoot
        };
    }
    async query(input) {
        if (input.allowed_paths.length === 0 ||
            input.allowed_paths.some((path) => !SAFE_TRACK_PATH.test(path)) ||
            input.excluded_paths.some((path) => !['sources/originals/**', '.meta/**'].includes(path)) ||
            !Number.isInteger(input.max_items) || input.max_items <= 0 ||
            !Number.isInteger(input.max_item_chars) || input.max_item_chars <= 0 ||
            input.ordering_policy !== 'path_asc') {
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
            if (result.status !== 'ok') {
                throw statusFailure('load-context-pack', result);
            }
            const items = contextItems(result);
            return {
                status: items.length > 0 ? 'loaded' : 'empty',
                runtime_version: this.config.expected_version,
                items,
                excluded_count: typeof result.excluded_count === 'number' ? result.excluded_count : 0,
                truncated_count: 0
            };
        }
        catch (error) {
            if (error instanceof HarnessError && error.code === 'CONTRACT_INVALID')
                throw error;
            return {
                status: 'unavailable', runtime_version: null, items: [],
                excluded_count: 0, truncated_count: 0
            };
        }
    }
    async findRecords(input) {
        const expectedKey = RUNTIME_LOOKUP_KEYS.get(input.record_type);
        const entries = Object.entries(input.lookup);
        if (expectedKey === undefined || entries.length !== 1 || entries[0][0] !== expectedKey ||
            !SAFE_LOOKUP_VALUE.test(entries[0][1])) {
            throw new HarnessError('CONTRACT_INVALID', 'invalid or undeclared exact Runtime record lookup');
        }
        const result = await this.invoke('find-records', [
            '--scope-root', this.config.workspace, '--record-type', input.record_type,
            '--lookup-value-json', JSON.stringify(entries[0][1]),
            '--caller-domain', DOMAIN, '--target-domain', DOMAIN
        ]);
        if (result.status === 'not_found') {
            if (!Array.isArray(result.matches) || result.matches.length !== 0) {
                throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'Runtime not_found lookup returned matches');
            }
            return { status: 'not_found', record_type: input.record_type, matches: [] };
        }
        if (result.status !== 'found' || !Array.isArray(result.matches) || result.matches.length !== 1) {
            throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'Runtime record lookup was not exact');
        }
        const raw = result.matches[0];
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'Runtime record lookup match is invalid');
        }
        const value = raw;
        const checksum = normalizedDigest(value.checksum);
        if (typeof value.path !== 'string' || !validateExactRuntimePath(value.path) || checksum === null ||
            typeof value.identity !== 'string' || typeof value.display !== 'string' ||
            value.fields === null || typeof value.fields !== 'object' || Array.isArray(value.fields)) {
            throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'Runtime record lookup fields are invalid');
        }
        const match = {
            path: value.path, checksum, identity: value.identity, display: value.display,
            fields: value.fields
        };
        return { status: 'found', record_type: input.record_type, matches: [match] };
    }
    async loadPaths(input) {
        if (input.paths.length === 0 || input.paths.some((path) => !validateExactRuntimePath(path)) ||
            new Set(input.paths).size !== input.paths.length ||
            !Number.isInteger(input.max_items) || input.max_items <= 0 || input.paths.length > input.max_items ||
            !Number.isInteger(input.max_item_chars) || input.max_item_chars <= 0 ||
            !Number.isInteger(input.max_total_chars) || input.max_total_chars <= 0) {
            throw new HarnessError('CONTRACT_INVALID', 'invalid exact Runtime path query or context_budget_exceeded');
        }
        const result = await this.invoke('load-context-pack', [
            '--wiki-root', this.wikiRoot,
            '--include-json', JSON.stringify(['domains/research-publishing/**']),
            '--exclude-json', JSON.stringify(['sources/originals/**', '.meta/**']),
            '--max-files', String(input.max_items), '--max-chars-per-file', String(input.max_item_chars),
            '--path-json', JSON.stringify(input.paths), '--glob-json', '[]',
            '--order', 'path_asc', '--policy', 'data_only',
            '--caller-domain', DOMAIN, '--target-domain', DOMAIN
        ]);
        if (result.status !== 'ok')
            throw statusFailure('load-context-pack', result);
        const items = contextItems(result, new Set(input.paths));
        if (items.length > input.max_items ||
            items.some((item) => item.content.length > input.max_item_chars) ||
            items.reduce((sum, item) => sum + item.content.length, 0) > input.max_total_chars) {
            throw new HarnessError('CONTRACT_INVALID', 'context_budget_exceeded');
        }
        const byPath = new Map(items.map((item) => [item.path, item]));
        const ordered = input.paths.flatMap((path) => {
            const item = byPath.get(path);
            return item === undefined ? [] : [item];
        });
        return {
            status: ordered.length > 0 ? 'loaded' : 'empty', runtime_version: this.config.expected_version,
            items: ordered,
            excluded_count: typeof result.excluded_count === 'number' ? result.excluded_count : 0,
            truncated_count: 0
        };
    }
    async validateMapping() {
        const result = await this.invoke('validate-mapping', [
            '--mapping-path', this.config.mapping_path,
            '--registry-path', this.registryPath,
            '--profile-path', this.config.profile_path
        ]);
        if (result.status !== 'ok')
            throw statusFailure('validate-mapping', result);
        return normalizeEnvelopeChecksum(result);
    }
    async findCatalog(trackId) {
        if (!SAFE_SLUG.test(trackId)) {
            throw new HarnessError('CONTRACT_INVALID', 'Catalog Track id must be a safe slug');
        }
        const result = await this.findRecords({
            record_type: 'research_index_catalog', lookup: { index_id: `${trackId}:research` }
        });
        if (result.status === 'not_found')
            return { status: 'not_found' };
        return { status: 'found', path: result.matches[0].path, digest: result.matches[0].checksum };
    }
    async copySource(input) {
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
        if (!INGEST_SUCCESS.has(result.status))
            throw statusFailure('copy-source', result);
        return mutationResult('copy-source', result);
    }
    async writeRecord(input) {
        assertContained(this.config.workspace, input.content_file, 'record content file');
        if (!RUNTIME_RECORD_TYPES.has(input.record_type)) {
            throw new HarnessError('CONTRACT_INVALID', 'unsupported Runtime record type');
        }
        for (const value of Object.values(input.variables)) {
            if (!SAFE_SLUG.test(value))
                throw new HarnessError('CONTRACT_INVALID', 'invalid record path variable');
        }
        const result = await this.invoke('write-record', [
            '--scope-root', this.config.workspace, '--profile-path', this.config.profile_path,
            '--record-type', input.record_type,
            '--variables-json', JSON.stringify(input.variables), '--refs-json', JSON.stringify(input.refs),
            '--content-file', input.content_file
        ]);
        if (!INGEST_SUCCESS.has(result.status))
            throw statusFailure('write-record', result);
        return mutationResult('write-record', result);
    }
    async registerArtifact(record) {
        const result = await this.invoke('register-artifact', [
            '--wiki-root', this.wikiRoot, '--record-json', JSON.stringify(record)
        ]);
        if (!INGEST_SUCCESS.has(result.status))
            throw statusFailure('register-artifact', result);
        return result;
    }
    async appendLog(record) {
        const result = await this.invoke('append-log', [
            '--scope-root', this.config.workspace, '--profile-path', this.config.profile_path,
            '--log-type', 'memory_event', '--record-json', JSON.stringify(record)
        ]);
        if (!INGEST_SUCCESS.has(result.status))
            throw statusFailure('append-log', result);
        return result;
    }
}
export function createLLMWikiRuntimeAdapter(config) {
    return new LLMWikiRuntimeAdapter(config);
}
//# sourceMappingURL=runtime-adapter.js.map