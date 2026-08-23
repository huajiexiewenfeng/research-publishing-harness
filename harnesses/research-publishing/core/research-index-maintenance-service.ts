import { randomUUID } from 'node:crypto';

import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { ResearchIndexProjector } from './research-index-projector.js';
import type { ResearchIndexCatalogV1, ResearchIndexEntryV1 } from './research-index-types.js';
import {
  parseResearchIndexCatalogRecord,
  parseResearchIndexShardRecord
} from './progressive-research-query-service.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

interface IndexMaintenanceRuntime {
  findRecords(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  loadPaths(input: Readonly<{
    paths: readonly string[]; max_items: number; max_item_chars: number; max_total_chars: number;
  }>): Promise<Readonly<{
    status: string;
    items: readonly Readonly<{
      path: string; checksum: `sha256:${string}`; content: string;
    }>[];
  }>>;
}

export interface ResearchIndexFindingV1 {
  readonly code: string;
  readonly path: string | null;
  readonly message: string;
}

export interface ResearchIndexDoctorReportV1 {
  readonly schema_version: 'research-index-doctor-report/v1';
  readonly report_id: string;
  readonly track_id: string;
  readonly status: 'healthy' | 'legacy_only' | 'index_rebuild_required';
  readonly catalog_ref: Readonly<{ path: string; digest: `sha256:${string}` }> | null;
  readonly checked_shard_refs: ReadonlyArray<{ path: string; digest: `sha256:${string}` }>;
  readonly checked_record_refs: ReadonlyArray<{ ref: string; path: string; digest: `sha256:${string}` }>;
  readonly findings: readonly ResearchIndexFindingV1[];
  readonly checked_at: string;
  readonly report_digest: `sha256:${string}`;
}

export interface ResearchIndexRebuildPlanV1 {
  readonly schema_version: 'research-index-rebuild-plan/v1';
  readonly plan_id: string;
  readonly track_id: string;
  readonly base_catalog_digest: `sha256:${string}`;
  readonly source_record_refs: ReadonlyArray<{ ref: string; path: string; digest: `sha256:${string}` }>;
  readonly proposed_generation: string;
  readonly proposed_shard_refs: ReadonlyArray<{ path: string; digest: `sha256:${string}` }>;
  readonly proposed_catalog_ref: Readonly<{ path: string; digest: `sha256:${string}` }>;
  readonly approval_required: true;
  readonly planned_at: string;
  readonly plan_digest: `sha256:${string}`;
}

interface Inspection {
  readonly status: ResearchIndexDoctorReportV1['status'];
  readonly catalog: ResearchIndexCatalogV1 | null;
  readonly catalog_ref: ResearchIndexDoctorReportV1['catalog_ref'];
  readonly shards: ResearchIndexDoctorReportV1['checked_shard_refs'];
  readonly records: readonly ResearchIndexEntryV1[];
  readonly findings: readonly ResearchIndexFindingV1[];
}

interface MaintenanceIds {
  readonly reportId?: () => string;
  readonly planId?: () => string;
  readonly now?: () => Date;
}

export class ResearchIndexMaintenanceService {
  private readonly now: () => Date;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly runtime: IndexMaintenanceRuntime,
    private readonly ids: MaintenanceIds = {}
  ) { this.now = ids.now ?? (() => new Date()); }

  async doctor(trackId: string): Promise<ResearchIndexDoctorReportV1> {
    const inspected = await this.inspect(trackId);
    const body = {
      schema_version: 'research-index-doctor-report/v1' as const,
      report_id: this.ids.reportId?.() ?? `doctor_${randomUUID().replaceAll('-', '')}`,
      track_id: trackId, status: inspected.status, catalog_ref: inspected.catalog_ref,
      checked_shard_refs: inspected.shards,
      checked_record_refs: inspected.records.map((item) => ({
        ref: item.ref, path: item.record_path, digest: item.record_digest
      })).sort((left, right) => left.ref.localeCompare(right.ref)),
      findings: inspected.findings, checked_at: this.now().toISOString()
    };
    const report = validateContract<ResearchIndexDoctorReportV1>('research-index-doctor-report', {
      ...body, report_digest: sha256(body)
    });
    await this.store.writeNew(`memory/index-maintenance/${trackId}/reports/${report.report_id}.json`, report);
    return report;
  }

  async rebuildPlan(trackId: string): Promise<ResearchIndexRebuildPlanV1> {
    const inspected = await this.inspect(trackId);
    if (inspected.catalog === null || inspected.catalog_ref === null || inspected.records.length === 0) {
      throw new HarnessError('CONTRACT_INVALID', 'Index rebuild requires an existing readable Catalog generation');
    }
    const projection = new ResearchIndexProjector().project({
      track_id: trackId, prior_catalog: inspected.catalog, records: inspected.records
    });
    const body = {
      schema_version: 'research-index-rebuild-plan/v1' as const,
      plan_id: this.ids.planId?.() ?? `rebuild_${randomUUID().replaceAll('-', '')}`,
      track_id: trackId, base_catalog_digest: inspected.catalog_ref.digest,
      source_record_refs: inspected.records.map((item) => ({
        ref: item.ref, path: item.record_path, digest: item.record_digest
      })).sort((left, right) => left.ref.localeCompare(right.ref)),
      proposed_generation: projection.generation,
      proposed_shard_refs: projection.shards.map((item) => ({ path: item.path, digest: item.content_digest })),
      proposed_catalog_ref: { path: projection.catalog_path, digest: projection.catalog_content_digest },
      approval_required: true as const, planned_at: this.now().toISOString()
    };
    const plan = validateContract<ResearchIndexRebuildPlanV1>('research-index-rebuild-plan', {
      ...body, plan_digest: sha256(body)
    });
    await this.store.writeNew(`memory/index-maintenance/${trackId}/rebuild-plans/${plan.plan_id}.json`, plan);
    return plan;
  }

  private async inspect(trackId: string): Promise<Inspection> {
    if (!STABLE_ID_PATTERN.test(trackId)) throw new HarnessError('CONTRACT_INVALID', 'Track id must be stable');
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
    const match = matches[0] as Record<string, unknown>;
    if (typeof match.path !== 'string' || typeof match.checksum !== 'string') {
      throw new HarnessError('MEMORY_RUNTIME_PROTOCOL_ERROR', 'Catalog lookup result is invalid');
    }
    const catalogRef = { path: match.path, digest: match.checksum as `sha256:${string}` };
    let catalog: ResearchIndexCatalogV1;
    try {
      const item = await this.loadOne(catalogRef.path);
      if (item.checksum !== catalogRef.digest) throw new Error('digest');
      catalog = parseResearchIndexCatalogRecord(item.content);
      if (catalog.track_id !== trackId) throw new Error('identity');
    } catch {
      return {
        status: 'index_rebuild_required', catalog: null, catalog_ref: catalogRef,
        shards: [], records: [], findings: [{
          code: 'CATALOG_INVALID', path: catalogRef.path, message: 'Catalog is missing, corrupt or digest-mismatched.'
        }]
      };
    }
    const descriptors = [...new Map(Object.values(catalog.views).flatMap((view) => view.shards)
      .map((item) => [item.path, item])).values()].sort((left, right) => left.path.localeCompare(right.path));
    const findings: ResearchIndexFindingV1[] = [];
    const checkedShards: Array<{ path: string; digest: `sha256:${string}` }> = [];
    const records = new Map<string, ResearchIndexEntryV1>();
    for (const descriptor of descriptors) {
      try {
        const item = await this.loadOne(descriptor.path);
        if (item.checksum !== descriptor.digest) throw new Error('digest');
        const shard = parseResearchIndexShardRecord(item.content, item.checksum);
        checkedShards.push({ path: item.path, digest: item.checksum });
        for (const entry of shard.entries) {
          const prior = records.get(entry.ref);
          if (prior !== undefined && JSON.stringify(prior) !== JSON.stringify(entry)) throw new Error('conflict');
          records.set(entry.ref, entry);
        }
      } catch {
        findings.push({ code: 'SHARD_DIGEST_MISMATCH', path: descriptor.path, message: 'Shard is missing, corrupt or digest-mismatched.' });
      }
    }
    for (const entry of [...records.values()].sort((left, right) => left.ref.localeCompare(right.ref))) {
      try {
        const item = await this.loadOne(entry.record_path);
        if (item.checksum !== entry.record_digest) throw new Error('digest');
      } catch {
        findings.push({ code: 'SEMANTIC_DIGEST_MISMATCH', path: entry.record_path, message: 'Semantic record is missing or digest-mismatched.' });
      }
    }
    return {
      status: findings.length === 0 ? 'healthy' : 'index_rebuild_required',
      catalog, catalog_ref: catalogRef, shards: checkedShards,
      records: [...records.values()], findings
    };
  }

  private async loadOne(path: string) {
    const result = await this.runtime.loadPaths({ paths: [path], max_items: 1, max_item_chars: 12_000, max_total_chars: 12_000 });
    if (result.status !== 'loaded' || result.items.length !== 1 || result.items[0]!.path !== path) {
      throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'exact Index path did not load');
    }
    return result.items[0]!;
  }
}
