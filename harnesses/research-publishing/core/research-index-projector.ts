import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import type {
  ProjectResearchIndexInput,
  ResearchIndexCatalogV1,
  ResearchIndexEntryV1,
  ResearchIndexProjectionV1,
  ResearchIndexShardDescriptorV1,
  ResearchIndexShardV1,
  ResearchIndexSourceRecordV1
} from './research-index-types.js';
import { RESEARCH_MEMORY_POLICY_V1 } from './research-memory-policy.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import type { ResearchIndexView } from './research-memory-types.js';
import { renderResearchRecord } from './research-record-renderer.js';
import { validateContract } from './schema-validator.js';

interface IndexProjectionPolicy {
  readonly shard_entry_threshold: number;
  readonly shard_byte_threshold: number;
  readonly max_chars_per_index_record: number;
}

const VIEWS = ['mainline', 'history', 'working', 'publication', 'feedback'] as const;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function recordViews(record: ResearchIndexSourceRecordV1): readonly ResearchIndexView[] {
  if (record.category === 'publication') return ['publication'];
  if (record.category === 'feedback') return ['feedback'];
  if (record.lifecycle_status === 'working') return ['working'];
  if (record.lifecycle_status === 'accepted' || record.lifecycle_status === 'published') {
    return ['mainline', 'history'];
  }
  return ['history'];
}

function recordDate(record: ResearchIndexSourceRecordV1): string {
  return record.published_at ?? record.accepted_at ?? record.updated_at;
}

function quarter(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    throw new HarnessError('CONTRACT_INVALID', 'Index record timestamps must be valid ISO dates');
  }
  return `${date.getUTCFullYear()}-q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function stableEntry(record: ResearchIndexSourceRecordV1): ResearchIndexEntryV1 {
  if (
    record.ref.length === 0 || record.record_path.length === 0 || record.title.trim().length === 0 ||
    record.summary.trim().length === 0
  ) {
    throw new HarnessError('CONTRACT_INVALID', 'Index entries require stable refs and Human-promoted text');
  }
  return {
    ref: record.ref,
    record_path: record.record_path.replaceAll('\\', '/'),
    record_digest: record.record_digest,
    title: record.title,
    summary: record.summary,
    tags: sortedUnique(record.tags),
    category: record.category,
    claim_status: record.claim_status,
    lifecycle_status: record.lifecycle_status,
    evolution_target: record.evolution_target,
    updated_at: record.updated_at,
    accepted_at: record.accepted_at,
    published_at: record.published_at,
    evidence_available: record.evidence_available,
    document_manifest_available: record.document_manifest_available
  };
}

export class ResearchIndexProjector {
  private readonly policy: IndexProjectionPolicy;

  constructor(policy: Partial<IndexProjectionPolicy> = {}) {
    this.policy = {
      shard_entry_threshold: policy.shard_entry_threshold ?? RESEARCH_MEMORY_POLICY_V1.shard_entry_threshold,
      shard_byte_threshold: policy.shard_byte_threshold ?? RESEARCH_MEMORY_POLICY_V1.shard_byte_threshold,
      max_chars_per_index_record: policy.max_chars_per_index_record ?? RESEARCH_MEMORY_POLICY_V1.max_chars_per_index_record
    };
    if (Object.values(this.policy).some((value) => !Number.isInteger(value) || value < 1)) {
      throw new HarnessError('CONTRACT_INVALID', 'Index projection thresholds must be positive integers');
    }
  }

  project(input: ProjectResearchIndexInput): ResearchIndexProjectionV1 {
    if (!STABLE_ID_PATTERN.test(input.track_id)) {
      throw new HarnessError('CONTRACT_INVALID', 'Index Track id must be stable');
    }
    if (
      input.prior_catalog !== null &&
      (input.prior_catalog.track_id !== input.track_id ||
        input.prior_catalog.index_id !== `${input.track_id}:research`)
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'prior Catalog belongs to a different Track');
    }
    const ordered = [...input.records]
      .map(stableEntry)
      .sort((left, right) => left.ref.localeCompare(right.ref));
    if (new Set(ordered.map((record) => record.ref)).size !== ordered.length) {
      throw new HarnessError('CONTRACT_INVALID', 'Index source refs must be unique');
    }
    const generationDigest = sha256({
      policy_version: 'research-index-policy/v1', track_id: input.track_id,
      records: ordered, thresholds: this.policy
    });
    const generation = `g_${generationDigest.slice('sha256:'.length, 'sha256:'.length + 24)}`;

    const buckets = new Map<string, { view: ResearchIndexView; quarter: string; entries: ResearchIndexEntryV1[] }>();
    for (const entry of ordered) {
      for (const view of recordViews(entry)) {
        const period = quarter(recordDate(entry));
        const key = `${view}|${period}`;
        const bucket = buckets.get(key) ?? { view, quarter: period, entries: [] };
        bucket.entries.push(entry);
        buckets.set(key, bucket);
      }
    }

    const shards: ResearchIndexProjectionV1['shards'][number][] = [];
    const descriptors = new Map<ResearchIndexView, ResearchIndexShardDescriptorV1[]>(
      VIEWS.map((view) => [view, []])
    );
    const orderedBuckets = [...buckets.values()].sort((left, right) => {
      const viewOrder = VIEWS.indexOf(left.view) - VIEWS.indexOf(right.view);
      return viewOrder === 0 ? left.quarter.localeCompare(right.quarter) : viewOrder;
    });
    for (const bucket of orderedBuckets) {
      let part = 1;
      let current: ResearchIndexEntryV1[] = [];
      const flush = (): void => {
        if (current.length === 0) return;
        const projected = this.renderShard(input.track_id, generation, bucket.view, bucket.quarter, part, current);
        shards.push(projected);
        descriptors.get(bucket.view)!.push(this.describeShard(projected));
        current = [];
        part += 1;
      };
      for (const entry of bucket.entries) {
        const candidate = [...current, entry];
        const rendered = this.renderShard(input.track_id, generation, bucket.view, bucket.quarter, part, candidate);
        if (
          current.length > 0 &&
          (candidate.length > this.policy.shard_entry_threshold ||
            rendered.content.length > this.policy.max_chars_per_index_record ||
            Buffer.byteLength(rendered.content, 'utf8') > this.policy.shard_byte_threshold)
        ) {
          flush();
        }
        const singleOrCurrent = [...current, entry];
        const bounded = this.renderShard(input.track_id, generation, bucket.view, bucket.quarter, part, singleOrCurrent);
        if (
          bounded.content.length > this.policy.max_chars_per_index_record ||
          Buffer.byteLength(bounded.content, 'utf8') > this.policy.shard_byte_threshold
        ) {
          throw new HarnessError('CONTRACT_INVALID', 'one promoted Index entry exceeds the record budget');
        }
        current.push(entry);
        if (current.length === this.policy.shard_entry_threshold) flush();
      }
      flush();
    }

    const views: ResearchIndexCatalogV1['views'] = {
      mainline: { generation, shards: descriptors.get('mainline')! },
      history: { generation, shards: descriptors.get('history')! },
      working: { generation, shards: descriptors.get('working')! },
      publication: { generation, shards: descriptors.get('publication')! },
      feedback: { generation, shards: descriptors.get('feedback')! }
    };
    const catalogBody = {
      schema_version: 'research-index-catalog/v1' as const,
      index_id: `${input.track_id}:research`,
      track_id: input.track_id,
      generation,
      index_policy_version: 'research-index-policy/v1' as const,
      views
    };
    const catalog = validateContract<ResearchIndexCatalogV1>('research-index-catalog', {
      ...catalogBody,
      catalog_digest: sha256(catalogBody)
    });
    const catalogContent = renderResearchRecord({
      record_type: 'research_index_catalog',
      frontmatter: {
        index_id: catalog.index_id, track_id: catalog.track_id,
        generation: catalog.generation, catalog_digest: catalog.catalog_digest
      },
      body: `# Research index catalog\n\n${JSON.stringify(catalog.views)}\n`
    });
    if (catalogContent.length > this.policy.max_chars_per_index_record) {
      throw new HarnessError('CONTRACT_INVALID', 'Catalog exceeds the Index record budget');
    }
    return {
      generation,
      catalog,
      catalog_path: `domains/research-publishing/tracks/${input.track_id}/indexes/catalog.md`,
      catalog_content: catalogContent,
      catalog_content_digest: sha256Bytes(Buffer.from(catalogContent, 'utf8')),
      shards
    };
  }

  private renderShard(
    trackId: string,
    generation: string,
    view: ResearchIndexView,
    period: string,
    part: number,
    entries: readonly ResearchIndexEntryV1[]
  ): ResearchIndexProjectionV1['shards'][number] {
    const shardId = `shard_${view}_${period.replace('-', '_')}_${part}`;
    const content = renderResearchRecord({
      record_type: 'research_index_shard',
      frontmatter: {
        shard_id: shardId, track_id: trackId, generation, view,
        quarter: period, part, entry_count: entries.length,
        index_policy_version: 'research-index-policy/v1'
      },
      body: `# ${view} index\n\n${entries.map((entry) => `- ${JSON.stringify(entry)}`).join('\n')}\n`
    });
    const contentDigest = sha256Bytes(Buffer.from(content, 'utf8'));
    const record = validateContract<ResearchIndexShardV1>('research-index-shard', {
      schema_version: 'research-index-shard/v1',
      shard_id: shardId,
      track_id: trackId,
      generation,
      view,
      quarter: period,
      part,
      entries,
      entry_count: entries.length,
      status_tags: sortedUnique(entries.map((entry) => entry.lifecycle_status)),
      category_tags: sortedUnique(entries.map((entry) => entry.category)),
      shard_digest: contentDigest
    });
    const hex = contentDigest.slice('sha256:'.length);
    return {
      record,
      path: `domains/research-publishing/tracks/${trackId}/indexes/generations/${generation}/${view}/shards/${shardId}-${hex}.md`,
      content,
      content_digest: contentDigest
    };
  }

  private describeShard(
    shard: ResearchIndexProjectionV1['shards'][number]
  ): ResearchIndexShardDescriptorV1 {
    const entries = shard.record.entries;
    const dates = entries.map(recordDate).sort();
    const tags = sortedUnique(entries.flatMap((entry) => entry.tags));
    return {
      shard_id: shard.record.shard_id,
      path: shard.path,
      digest: shard.content_digest,
      generation: shard.record.generation,
      topic_summary: tags.length > 0 ? tags.join(', ') : entries[0]!.summary,
      time_start: dates[0]!,
      time_end: dates.at(-1)!,
      entry_count: shard.record.entry_count,
      status_tags: shard.record.status_tags,
      category_tags: shard.record.category_tags
    };
  }
}
