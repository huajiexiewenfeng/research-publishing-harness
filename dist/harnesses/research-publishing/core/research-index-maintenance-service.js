import { randomUUID } from 'node:crypto';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { ResearchIndexProjector } from './research-index-projector.js';
import { parseResearchIndexCatalogRecord, parseResearchIndexShardRecord } from './progressive-research-query-service.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
export class ResearchIndexMaintenanceService {
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
    async doctor(trackId) {
        const inspected = await this.inspect(trackId);
        const body = {
            schema_version: 'research-index-doctor-report/v1',
            report_id: this.ids.reportId?.() ?? `doctor_${randomUUID().replaceAll('-', '')}`,
            track_id: trackId, status: inspected.status, catalog_ref: inspected.catalog_ref,
            checked_shard_refs: inspected.shards,
            checked_record_refs: inspected.records.map((item) => ({
                ref: item.ref, path: item.record_path, digest: item.record_digest
            })).sort((left, right) => left.ref.localeCompare(right.ref)),
            findings: inspected.findings, checked_at: this.now().toISOString()
        };
        const report = validateContract('research-index-doctor-report', {
            ...body, report_digest: sha256(body)
        });
        await this.store.writeNew(`memory/index-maintenance/${trackId}/reports/${report.report_id}.json`, report);
        return report;
    }
    async rebuildPlan(trackId) {
        const inspected = await this.inspect(trackId);
        if (inspected.catalog === null || inspected.catalog_ref === null || inspected.records.length === 0) {
            throw new HarnessError('CONTRACT_INVALID', 'Index rebuild requires an existing readable Catalog generation');
        }
        const projection = new ResearchIndexProjector().project({
            track_id: trackId, prior_catalog: inspected.catalog, records: inspected.records
        });
        const body = {
            schema_version: 'research-index-rebuild-plan/v1',
            plan_id: this.ids.planId?.() ?? `rebuild_${randomUUID().replaceAll('-', '')}`,
            track_id: trackId, base_catalog_digest: inspected.catalog_ref.digest,
            source_record_refs: inspected.records.map((item) => ({
                ref: item.ref, path: item.record_path, digest: item.record_digest
            })).sort((left, right) => left.ref.localeCompare(right.ref)),
            proposed_generation: projection.generation,
            proposed_shard_refs: projection.shards.map((item) => ({ path: item.path, digest: item.content_digest })),
            proposed_catalog_ref: { path: projection.catalog_path, digest: projection.catalog_content_digest },
            approval_required: true, planned_at: this.now().toISOString()
        };
        const plan = validateContract('research-index-rebuild-plan', {
            ...body, plan_digest: sha256(body)
        });
        await this.store.writeNew(`memory/index-maintenance/${trackId}/rebuild-plans/${plan.plan_id}.json`, plan);
        return plan;
    }
    async inspect(trackId) {
        if (!STABLE_ID_PATTERN.test(trackId))
            throw new HarnessError('CONTRACT_INVALID', 'Track id must be stable');
        const lookup = await this.runtime.findRecords({
            record_type: 'research_index_catalog', lookup: { index_id: `${trackId}:research` }
        });
        if (lookup.status === 'not_found') {
            return { status: 'legacy_only', catalog: null, catalog_ref: null, shards: [], records: [], findings: [] };
        }
        const matches = lookup.matches;
        if (lookup.status !== 'found' || !Array.isArray(matches) || matches.length !== 1) {
            return {
                status: 'index_rebuild_required', catalog: null, catalog_ref: null, shards: [], records: [],
                findings: [{ code: 'CATALOG_LOOKUP_NOT_EXACT', path: null, message: 'Catalog lookup was not exact.' }]
            };
        }
        const match = matches[0];
        if (typeof match.path !== 'string' || typeof match.checksum !== 'string') {
            throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'Catalog lookup result is invalid');
        }
        const catalogRef = { path: match.path, digest: match.checksum };
        let catalog;
        try {
            const item = await this.loadOne(catalogRef.path);
            if (item.checksum !== catalogRef.digest)
                throw new Error('digest');
            catalog = parseResearchIndexCatalogRecord(item.content);
            if (catalog.track_id !== trackId)
                throw new Error('identity');
        }
        catch {
            return {
                status: 'index_rebuild_required', catalog: null, catalog_ref: catalogRef,
                shards: [], records: [], findings: [{
                        code: 'CATALOG_INVALID', path: catalogRef.path, message: 'Catalog is missing, corrupt or digest-mismatched.'
                    }]
            };
        }
        const descriptors = [...new Map(Object.values(catalog.views).flatMap((view) => view.shards)
                .map((item) => [item.path, item])).values()].sort((left, right) => left.path.localeCompare(right.path));
        const findings = [];
        const checkedShards = [];
        const records = new Map();
        for (const descriptor of descriptors) {
            try {
                const item = await this.loadOne(descriptor.path);
                if (item.checksum !== descriptor.digest)
                    throw new Error('digest');
                const shard = parseResearchIndexShardRecord(item.content, item.checksum);
                checkedShards.push({ path: item.path, digest: item.checksum });
                for (const entry of shard.entries) {
                    const prior = records.get(entry.ref);
                    if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(entry))
                        throw new Error('conflict');
                    records.set(entry.ref, entry);
                }
            }
            catch {
                findings.push({ code: 'SHARD_DIGEST_MISMATCH', path: descriptor.path, message: 'Shard is missing, corrupt or digest-mismatched.' });
            }
        }
        for (const entry of [...records.values()].sort((left, right) => left.ref.localeCompare(right.ref))) {
            try {
                const item = await this.loadOne(entry.record_path);
                if (item.checksum !== entry.record_digest)
                    throw new Error('digest');
            }
            catch {
                findings.push({ code: 'SEMANTIC_DIGEST_MISMATCH', path: entry.record_path, message: 'Semantic record is missing or digest-mismatched.' });
            }
        }
        return {
            status: findings.length === 0 ? 'healthy' : 'index_rebuild_required',
            catalog, catalog_ref: catalogRef, shards: checkedShards,
            records: [...records.values()], findings
        };
    }
    async loadOne(path) {
        const result = await this.runtime.loadPaths({ paths: [path], max_items: 1, max_item_chars: 12_000, max_total_chars: 12_000 });
        if (result.status !== 'loaded' || result.items.length !== 1 || result.items[0].path !== path) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'exact Index path did not load');
        }
        return result.items[0];
    }
}
//# sourceMappingURL=research-index-maintenance-service.js.map