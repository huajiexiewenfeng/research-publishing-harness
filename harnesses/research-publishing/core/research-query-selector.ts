import { HarnessError } from './errors.js';
import type { CanonicalDocumentChunkDescriptorV1 } from './research-memory-types.js';
import type { ResearchIndexEntryV1, ResearchIndexShardDescriptorV1 } from './research-index-types.js';
import { RESEARCH_QUERY_BUDGETS_V2, type CanonicalChunkRefV1, type DocumentLoadMode, type ResearchIndexShardRefV1, type ResearchQueryView, type ResearchRecordRefV1 } from './research-query-types.js';

export interface SelectIndexShardsInput {
  readonly candidates: readonly ResearchIndexShardDescriptorV1[];
  readonly selected_shard_ids: readonly string[];
  readonly generation: string;
  readonly view: ResearchQueryView;
}

export interface SelectSemanticRecordsInput {
  readonly candidates: readonly ResearchIndexEntryV1[];
  readonly selected_record_refs: readonly string[];
}

export interface SelectDocumentChunksInput {
  readonly candidates: readonly CanonicalDocumentChunkDescriptorV1[];
  readonly selected_chunk_ids: readonly string[];
  readonly document_mode: DocumentLoadMode;
}

function selectedUnique<T>(
  candidates: readonly T[], selected: readonly string[], key: (value: T) => string,
  limit: number, label: string
): T[] {
  const requested = new Set(selected);
  if (requested.size > limit) throw new HarnessError('CONTRACT_INVALID', 'context_budget_exceeded');
  const byKey = new Map<string, T>();
  for (const candidate of candidates) {
    const id = key(candidate);
    if (byKey.has(id)) throw new HarnessError('CONTRACT_INVALID', `${label} candidates must be unique`);
    byKey.set(id, candidate);
  }
  if ([...requested].some((id) => !byKey.has(id))) {
    throw new HarnessError('CONTRACT_INVALID', `selected ref is absent from ${label} candidates`);
  }
  return [...requested].sort((left, right) => left.localeCompare(right)).map((id) => byKey.get(id)!);
}

export function selectIndexShards(input: SelectIndexShardsInput): readonly ResearchIndexShardRefV1[] {
  return selectedUnique(
    input.candidates, input.selected_shard_ids, (item) => item.shard_id,
    RESEARCH_QUERY_BUDGETS_V2.max_shards, 'Shard'
  ).map((item) => {
    if (item.generation !== input.generation) {
      throw new HarnessError('CONTRACT_INVALID', 'selected Shard belongs to another generation');
    }
    return {
      shard_id: item.shard_id, path: item.path, digest: item.digest,
      generation: item.generation, view: input.view
    };
  });
}

export function selectSemanticRecords(input: SelectSemanticRecordsInput): readonly ResearchRecordRefV1[] {
  return selectedUnique(
    input.candidates, input.selected_record_refs, (item) => item.ref,
    RESEARCH_QUERY_BUDGETS_V2.max_records, 'record'
  ).map((item) => ({
    ref: item.ref, path: item.record_path, digest: item.record_digest,
    evidence_refs: [], document_manifest_ref: null
  }));
}

export function selectDocumentChunks(input: SelectDocumentChunksInput): readonly CanonicalChunkRefV1[] {
  if (input.document_mode === 'none' && input.selected_chunk_ids.length > 0) {
    throw new HarnessError('CONTRACT_INVALID', 'document_mode none cannot select Chunks');
  }
  return selectedUnique(
    input.candidates, input.selected_chunk_ids, (item) => item.chunk_id,
    RESEARCH_QUERY_BUDGETS_V2.max_chunks, 'Chunk'
  ).sort((left, right) => left.ordinal - right.ordinal || left.chunk_id.localeCompare(right.chunk_id))
    .map((item) => ({
      chunk_id: item.chunk_id, path: item.record_path, digest: item.chunk_digest,
      ordinal: item.ordinal, char_start: item.char_start, char_end: item.char_end
    }));
}
