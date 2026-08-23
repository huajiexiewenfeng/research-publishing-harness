import { describe, expect, it } from 'vitest';

import {
  selectDocumentChunks,
  selectIndexShards,
  selectSemanticRecords
} from '../../harnesses/research-publishing/core/research-query-selector.js';
import type { ResearchIndexEntryV1, ResearchIndexShardDescriptorV1 } from '../../harnesses/research-publishing/core/research-index-types.js';

const digest = (char: string) => `sha256:${char.repeat(64)}` as const;
const shard = (index: number): ResearchIndexShardDescriptorV1 => ({
  shard_id: `shard_${index}`, path: `indexes/shard_${index}.md`, digest: digest(String(index)),
  generation: 'g_001', topic_summary: `Topic ${index}`,
  time_start: '2026-07-01T00:00:00.000Z', time_end: '2026-08-01T00:00:00.000Z',
  entry_count: 1, status_tags: ['accepted'], category_tags: ['semantic']
});
const record = (index: number): ResearchIndexEntryV1 => ({
  ref: `claim:item_${index}@1`, record_path: `claims/item_${index}.md`, record_digest: digest(String(index)),
  title: `Item ${index}`, summary: `Summary ${index}`, tags: [], category: 'semantic',
  claim_status: 'observed', lifecycle_status: 'accepted', evolution_target: null,
  updated_at: '2026-08-01T00:00:00.000Z', accepted_at: '2026-08-01T00:00:00.000Z',
  published_at: null, evidence_available: true, document_manifest_available: false
});

describe('bounded progressive Query selectors', () => {
  it('fails closed when selected Shards exceed policy', () => {
    const candidates = Array.from({ length: 5 }, (_, index) => shard(index + 1));
    expect(() => selectIndexShards({
      candidates, selected_shard_ids: candidates.map((item) => item.shard_id),
      generation: 'g_001', view: 'mainline'
    })).toThrowError(/context_budget_exceeded/);
  });

  it('accepts the exact Shard limit and is stable for shuffled candidates', () => {
    const candidates = Array.from({ length: 4 }, (_, index) => shard(index + 1));
    const selected = candidates.map((item) => item.shard_id).reverse();
    const first = selectIndexShards({
      candidates, selected_shard_ids: selected, generation: 'g_001', view: 'mainline'
    });
    const second = selectIndexShards({
      candidates: [...candidates].reverse(), selected_shard_ids: selected,
      generation: 'g_001', view: 'mainline'
    });
    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
  });

  it('is deterministic for shuffled candidates and deduplicates requested refs', () => {
    const candidates = [record(2), record(1)];
    const selected = ['claim:item_2@1', 'claim:item_1@1', 'claim:item_2@1'];
    expect(selectSemanticRecords({ candidates, selected_record_refs: selected }))
      .toEqual(selectSemanticRecords({ candidates: [...candidates].reverse(), selected_record_refs: selected }));
    expect(selectSemanticRecords({ candidates, selected_record_refs: selected }).map((item) => item.ref))
      .toEqual(['claim:item_1@1', 'claim:item_2@1']);
  });

  it('requires selected refs to resolve and bounds document chunks', () => {
    expect(() => selectSemanticRecords({ candidates: [record(1)], selected_record_refs: ['missing'] }))
      .toThrowError(/selected ref/);
    const candidates = Array.from({ length: 7 }, (_, index) => ({
      chunk_id: `chunk_${index + 1}`, ordinal: index + 1,
      record_path: `documents/doc/chunks/${index + 1}.md`, chunk_digest: digest(String(index + 1)),
      char_start: index * 100, char_end: (index + 1) * 100,
      heading_path: [], byte_size: 100
    }));
    expect(() => selectDocumentChunks({
      candidates, selected_chunk_ids: candidates.map((item) => item.chunk_id),
      document_mode: 'supporting_chunks'
    })).toThrowError(/context_budget_exceeded/);
    expect(selectDocumentChunks({
      candidates: candidates.slice(0, 6).reverse(),
      selected_chunk_ids: candidates.slice(0, 6).map((item) => item.chunk_id),
      document_mode: 'full_explicit'
    }).map((item) => item.ordinal)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('accepts exactly twelve semantic records and rejects thirteen', () => {
    const twelve = Array.from({ length: 12 }, (_, index) => record(index + 1));
    expect(selectSemanticRecords({
      candidates: twelve, selected_record_refs: twelve.map((item) => item.ref)
    })).toHaveLength(12);
    const thirteen = [...twelve, record(13)];
    expect(() => selectSemanticRecords({
      candidates: thirteen, selected_record_refs: thirteen.map((item) => item.ref)
    })).toThrowError(/context_budget_exceeded/);
  });
});
