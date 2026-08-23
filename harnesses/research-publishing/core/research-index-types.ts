import type { Digest } from './memory-types.js';
import type { ClaimStatus } from './types.js';
import type { ResearchIndexView, ResearchLifecycleState } from './research-memory-types.js';

export interface ResearchIndexSourceRecordV1 {
  readonly ref: string;
  readonly record_path: string;
  readonly record_digest: Digest;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly category: 'semantic' | 'publication' | 'feedback';
  readonly claim_status: ClaimStatus | null;
  readonly lifecycle_status: ResearchLifecycleState;
  readonly evolution_target: string | null;
  readonly updated_at: string;
  readonly accepted_at: string | null;
  readonly published_at: string | null;
  readonly evidence_available: boolean;
  readonly document_manifest_available: boolean;
}

export type ResearchIndexEntryV1 = ResearchIndexSourceRecordV1;

export interface ResearchIndexShardV1 {
  readonly schema_version: 'research-index-shard/v1';
  readonly shard_id: string;
  readonly track_id: string;
  readonly generation: string;
  readonly view: ResearchIndexView;
  readonly quarter: string;
  readonly part: number;
  readonly entries: readonly ResearchIndexEntryV1[];
  readonly entry_count: number;
  readonly status_tags: readonly string[];
  readonly category_tags: readonly string[];
  readonly shard_digest: Digest;
}

export interface ResearchIndexShardDescriptorV1 {
  readonly shard_id: string;
  readonly path: string;
  readonly digest: Digest;
  readonly generation: string;
  readonly topic_summary: string;
  readonly time_start: string;
  readonly time_end: string;
  readonly entry_count: number;
  readonly status_tags: readonly string[];
  readonly category_tags: readonly string[];
}

export interface ResearchIndexCatalogViewV1 {
  readonly generation: string;
  readonly shards: readonly ResearchIndexShardDescriptorV1[];
}

export interface ResearchIndexCatalogV1 {
  readonly schema_version: 'research-index-catalog/v1';
  readonly index_id: string;
  readonly track_id: string;
  readonly generation: string;
  readonly index_policy_version: 'research-index-policy/v1';
  readonly views: Readonly<Record<ResearchIndexView, ResearchIndexCatalogViewV1>>;
  readonly catalog_digest: Digest;
}

export interface ProjectResearchIndexInput {
  readonly track_id: string;
  readonly prior_catalog: ResearchIndexCatalogV1 | null;
  readonly records: readonly ResearchIndexSourceRecordV1[];
}

export interface ResearchIndexProjectionV1 {
  readonly generation: string;
  readonly catalog: ResearchIndexCatalogV1;
  readonly catalog_path: string;
  readonly catalog_content: string;
  readonly catalog_content_digest: Digest;
  readonly shards: ReadonlyArray<{
    readonly record: ResearchIndexShardV1;
    readonly path: string;
    readonly content: string;
    readonly content_digest: Digest;
  }>;
}
