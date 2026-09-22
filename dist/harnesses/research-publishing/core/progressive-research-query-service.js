import { randomUUID } from 'node:crypto';
import { sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import { bindResearchMemoryContext } from './memory-package.js';
import { createResearchContextReview, createResearchContextSnapshot, createResearchQueryPlan } from './research-query-types.js';
import { validateContract } from './schema-validator.js';
function parseRenderedRecord(content) {
    const lines = content.split('\n');
    if (lines[0] !== '---')
        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Runtime record frontmatter is missing');
    const end = lines.indexOf('---', 1);
    if (end < 0)
        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Runtime record frontmatter is unterminated');
    const frontmatter = {};
    for (const line of lines.slice(1, end)) {
        const separator = line.indexOf(':');
        if (separator <= 0)
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Runtime record frontmatter is invalid');
        const key = line.slice(0, separator).trim();
        const raw = line.slice(separator + 1).trim();
        try {
            frontmatter[key] = JSON.parse(raw);
        }
        catch {
            frontmatter[key] = raw;
        }
    }
    return { frontmatter, body: lines.slice(end + 1).join('\n') };
}
function bodyJson(body) {
    const start = body.indexOf('{');
    if (start < 0)
        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Runtime record body has no JSON projection');
    try {
        return JSON.parse(body.slice(start).trim());
    }
    catch {
        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Runtime record JSON projection is invalid');
    }
}
function sortedUnique(values) {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
export function parseResearchIndexCatalogRecord(content) {
    const parsed = parseRenderedRecord(content);
    const views = bodyJson(parsed.body);
    return validateContract('research-index-catalog', {
        schema_version: 'research-index-catalog/v1', index_id: parsed.frontmatter.index_id,
        track_id: parsed.frontmatter.track_id, generation: parsed.frontmatter.generation,
        index_policy_version: 'research-index-policy/v1', views,
        catalog_digest: parsed.frontmatter.catalog_digest
    });
}
export function parseResearchIndexShardRecord(content, checksum) {
    const parsed = parseRenderedRecord(content);
    const entries = parsed.body.split('\n').filter((line) => line.startsWith('- ')).map((line) => {
        try {
            return JSON.parse(line.slice(2));
        }
        catch {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Index Shard entry JSON is invalid');
        }
    });
    return validateContract('research-index-shard', {
        schema_version: 'research-index-shard/v1', shard_id: parsed.frontmatter.shard_id,
        track_id: parsed.frontmatter.track_id, generation: parsed.frontmatter.generation,
        view: parsed.frontmatter.view, quarter: parsed.frontmatter.quarter, part: parsed.frontmatter.part,
        entries, entry_count: entries.length,
        status_tags: sortedUnique(entries.map((item) => item.lifecycle_status)),
        category_tags: sortedUnique(entries.map((item) => item.category)), shard_digest: checksum
    });
}
export class ProgressiveResearchQueryService {
    store;
    runtime;
    ids;
    now;
    constructor(store, runtime, ids = {}) {
        this.store = store;
        this.runtime = runtime;
        this.ids = ids;
        this.now = ids.now ?? (() => new Date());
    }
    root(queryId) { return `memory/queries-v2/${queryId}`; }
    planPath(queryId) { return `${this.root(queryId)}/plan.json`; }
    snapshotPath(queryId) { return `${this.root(queryId)}/snapshot.json`; }
    reviewPath(queryId) { return `${this.root(queryId)}/review.json`; }
    statusPath(queryId) { return `${this.root(queryId)}/status.json`; }
    async plan(input) {
        const plan = createResearchQueryPlan(input);
        await this.store.writeNew(this.planPath(plan.query_id), plan);
        await this.writeStatus({
            schema_version: 'research-query-status/v2', query_id: plan.query_id,
            plan_digest: plan.plan_digest, phase: 'planned', snapshot_digest: null,
            review_digest: null, updated_at: this.now().toISOString()
        });
        return plan;
    }
    async execute(queryId) {
        const plan = await this.store.readJson(this.planPath(queryId));
        if (plan.catalog_ref === null) {
            throw new HarnessError('CONTRACT_INVALID', 'Progressive Query execution requires a planned Catalog ref');
        }
        let runtimeVersion = '0.2.0';
        let lookup;
        try {
            runtimeVersion = await this.runtime.version?.() ?? '0.2.0';
            lookup = await this.runtime.findRecords({
                record_type: 'research_index_catalog', lookup: { index_id: plan.index_id }
            });
        }
        catch (error) {
            if (!(error instanceof HarnessError) ||
                !['MEMORY_RUNTIME_UNAVAILABLE', 'MEMORY_RUNTIME_TIMEOUT', 'MEMORY_RUNTIME_FAILED', 'MEMORY_RUNTIME_INCOMPATIBLE'].includes(error.code))
                throw error;
            return this.persistSnapshot(plan, {
                index_refs: [], context_items: [], selected_summary_refs: [], selected_record_refs: [], selected_evidence_refs: [],
                risk_flags: [], query_status: 'runtime_unavailable', runtime_version: null
            });
        }
        const matches = lookup.matches;
        if (lookup.status === 'not_found') {
            return this.persistSnapshot(plan, {
                index_refs: [], context_items: [], selected_summary_refs: [], selected_record_refs: [], selected_evidence_refs: [],
                risk_flags: [], query_status: 'index_unavailable', runtime_version: runtimeVersion
            });
        }
        if (lookup.status !== 'found') {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Catalog lookup status is invalid');
        }
        if (!Array.isArray(matches) || matches.length !== 1) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Catalog lookup is not exact');
        }
        const match = matches[0];
        if (match.path !== plan.catalog_ref.path || match.checksum !== plan.catalog_ref.digest) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Catalog digest or path drifted from the Query Plan');
        }
        const catalogItem = (await this.loadExact([plan.catalog_ref.path], plan.budgets.max_chars_per_index_record))[0];
        if (catalogItem.checksum !== plan.catalog_ref.digest) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Catalog digest does not match the Query Plan');
        }
        const catalog = parseResearchIndexCatalogRecord(catalogItem.content);
        if (catalog.index_id !== plan.index_id || catalog.generation !== plan.catalog_ref.generation) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Catalog identity does not match the Query Plan');
        }
        const availableShards = new Map(catalog.views[plan.view].shards.map((item) => [item.shard_id, item]));
        for (const ref of plan.selected_shard_refs) {
            const available = availableShards.get(ref.shard_id);
            if (available === undefined || available.path !== ref.path || available.digest !== ref.digest) {
                throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'planned Shard is absent or changed in Catalog');
            }
        }
        const shardItems = plan.selected_shard_refs.length === 0 ? [] :
            await this.loadExact(plan.selected_shard_refs.map((item) => item.path), plan.budgets.max_chars_per_index_record);
        const entries = new Map();
        shardItems.forEach((item, index) => {
            const ref = plan.selected_shard_refs[index];
            if (item.checksum !== ref.digest)
                throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Shard digest does not match');
            for (const entry of parseResearchIndexShardRecord(item.content, item.checksum).entries)
                entries.set(entry.ref, entry);
        });
        for (const ref of plan.selected_record_refs) {
            const entry = entries.get(ref.ref);
            if (entry === undefined || entry.record_path !== ref.path || entry.record_digest !== ref.digest) {
                throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'planned semantic record is absent or changed in Shards');
            }
        }
        const recordItems = plan.selected_record_refs.length === 0 ? [] :
            await this.loadExact(plan.selected_record_refs.map((item) => item.path), 12_000);
        const contextItems = recordItems.map((item, index) => {
            const ref = plan.selected_record_refs[index];
            if (item.checksum !== ref.digest)
                throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'semantic record digest does not match');
            return {
                context_ref: ref.ref, relative_path: item.path, content_digest: item.checksum,
                content: item.content, source_layer: 'semantic_record',
                classification: 'data_only', sanitized: item.sanitized, risk_flags: item.risk_flags
            };
        });
        const plannedManifestKeys = new Set(plan.selected_manifest_refs.map((item) => `${item.path}@${item.digest}`));
        const recordManifestKeys = new Set(plan.selected_record_refs.flatMap((item) => item.document_manifest_ref === null ? [] : [`${item.document_manifest_ref.path}@${item.document_manifest_ref.digest}`]));
        if (plannedManifestKeys.size !== recordManifestKeys.size ||
            [...plannedManifestKeys].some((key) => !recordManifestKeys.has(key))) {
            throw new HarnessError('CONTRACT_INVALID', 'planned Manifests must be referenced by selected semantic records');
        }
        let manifests = [];
        if (plan.selected_manifest_refs.length > 0) {
            const manifestItems = await this.loadExact(plan.selected_manifest_refs.map((item) => item.path), 12_000);
            manifests = manifestItems.map((item, index) => {
                const ref = plan.selected_manifest_refs[index];
                if (item.checksum !== ref.digest)
                    throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Manifest digest does not match');
                const manifest = validateContract('queryable-canonical-document', bodyJson(parseRenderedRecord(item.content).body));
                if (manifest.document_id !== ref.document_id)
                    throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Manifest identity does not match');
                return manifest;
            });
            const chunks = new Map(manifests.flatMap((manifest) => manifest.chunks.map((chunk) => [chunk.chunk_id, chunk])));
            for (const ref of plan.selected_chunk_refs) {
                const descriptor = chunks.get(ref.chunk_id);
                if (descriptor === undefined || descriptor.record_path !== ref.path || descriptor.chunk_digest !== ref.digest) {
                    throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'planned Chunk is absent or changed in Manifest');
                }
            }
            if (plan.document_mode === 'full_explicit') {
                for (const manifest of manifests) {
                    const required = manifest.chunks.map((chunk) => chunk.chunk_id).sort();
                    const selected = plan.selected_chunk_refs
                        .filter((ref) => required.includes(ref.chunk_id)).map((ref) => ref.chunk_id).sort();
                    if (selected.length !== required.length || selected.some((id, index) => id !== required[index])) {
                        throw new HarnessError('CONTRACT_INVALID', 'full_explicit requires every Manifest Chunk');
                    }
                }
            }
        }
        if (plan.selected_chunk_refs.length > 0) {
            const chunkItems = await this.loadExact(plan.selected_chunk_refs.map((item) => item.path), 12_000);
            let reconstructedChars = 0;
            const chunkBodies = new Map();
            chunkItems.forEach((item, index) => {
                const ref = plan.selected_chunk_refs[index];
                const body = parseRenderedRecord(item.content).body;
                if (sha256Bytes(Buffer.from(body, 'utf8')) !== ref.digest) {
                    throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Chunk content digest does not match');
                }
                reconstructedChars += body.length;
                chunkBodies.set(ref.chunk_id, body);
                contextItems.push({
                    context_ref: `chunk:${ref.chunk_id}`, relative_path: item.path, content_digest: ref.digest,
                    content: body, source_layer: 'document_chunk', classification: 'data_only',
                    sanitized: item.sanitized, risk_flags: item.risk_flags
                });
            });
            if (reconstructedChars > plan.budgets.max_reconstructed_document_chars) {
                throw new HarnessError('CONTRACT_INVALID', 'context_budget_exceeded');
            }
            if (plan.document_mode === 'full_explicit') {
                for (const manifest of manifests) {
                    const body = [...manifest.chunks].sort((left, right) => left.ordinal - right.ordinal)
                        .map((chunk) => chunkBodies.get(chunk.chunk_id) ?? '').join('');
                    if (body.length > plan.budgets.max_reconstructed_document_chars ||
                        sha256Bytes(Buffer.from(body, 'utf8')) !== manifest.full_content_digest) {
                        throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'full document reconstruction digest does not match');
                    }
                }
            }
        }
        return this.persistSnapshot(plan, {
            index_refs: [
                plan.catalog_ref,
                ...plan.selected_shard_refs.map((item) => ({
                    path: item.path, digest: item.digest, generation: item.generation
                }))
            ],
            context_items: contextItems,
            selected_summary_refs: plan.selected_record_refs.map((item) => item.ref),
            selected_record_refs: plan.selected_record_refs,
            selected_evidence_refs: sortedUnique(plan.selected_record_refs.flatMap((item) => item.evidence_refs)),
            risk_flags: sortedUnique(contextItems.flatMap((item) => item.risk_flags)),
            query_status: contextItems.length > 0 ? 'loaded' : 'empty', runtime_version: runtimeVersion
        });
    }
    async review(queryId, input) {
        const snapshot = await this.store.readJson(this.snapshotPath(queryId));
        const review = createResearchContextReview(snapshot, {
            review_id: this.ids.reviewId?.() ?? `review_${randomUUID().replaceAll('-', '')}`,
            ...input
        });
        await this.store.writeNew(this.reviewPath(queryId), review);
        const status = await this.status(queryId);
        await this.writeStatus({ ...status, phase: 'reviewed', review_digest: review.review_digest, updated_at: this.now().toISOString() });
        return review;
    }
    async bindPackage(queryId, draft) {
        const [snapshot, review] = await Promise.all([
            this.store.readJson(this.snapshotPath(queryId)),
            this.store.readJson(this.reviewPath(queryId))
        ]);
        const bound = bindResearchMemoryContext(draft, snapshot, review);
        const status = await this.status(queryId);
        await this.writeStatus({ ...status, phase: 'package_bound', updated_at: this.now().toISOString() });
        return bound;
    }
    status(queryId) {
        return this.store.readJson(this.statusPath(queryId));
    }
    async loadExact(paths, maxItemChars) {
        const result = await this.runtime.loadPaths({
            paths, max_items: paths.length, max_item_chars: maxItemChars,
            max_total_chars: Math.max(maxItemChars, maxItemChars * paths.length)
        });
        if (result.status !== 'loaded' || result.items.length !== paths.length) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'exact Runtime paths were not fully loaded');
        }
        const byPath = new Map(result.items.map((item) => [item.path, item]));
        if (byPath.size !== paths.length || paths.some((path) => !byPath.has(path))) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Runtime returned an unplanned or duplicate path');
        }
        return paths.map((path) => byPath.get(path));
    }
    async persistSnapshot(plan, value) {
        const snapshot = createResearchContextSnapshot({
            snapshot_id: this.ids.snapshotId?.() ?? `snapshot_${randomUUID().replaceAll('-', '')}`,
            query_plan_digest: plan.plan_digest, query_id: plan.query_id, query_intent: plan.query_intent,
            track_id: plan.track_id, view: plan.view, index_refs: value.index_refs,
            selected_summary_refs: value.selected_summary_refs, selected_record_refs: value.selected_record_refs,
            selected_evidence_refs: value.selected_evidence_refs, context_items: value.context_items,
            risk_flags: value.risk_flags, budgets: plan.budgets,
            selection_rationale: plan.selection_rationale, query_status: value.query_status,
            runtime_version: value.runtime_version, created_at: this.now().toISOString()
        });
        await this.store.writeNew(this.snapshotPath(plan.query_id), snapshot);
        const status = await this.status(plan.query_id);
        await this.writeStatus({
            ...status, phase: 'executed', snapshot_digest: snapshot.snapshot_digest,
            updated_at: this.now().toISOString()
        });
        return snapshot;
    }
    writeStatus(value) {
        return this.store.replaceAtomic(this.statusPath(value.query_id), value);
    }
}
//# sourceMappingURL=progressive-research-query-service.js.map