import { describe, expect, it } from 'vitest';

import { RESEARCH_MEMORY_POLICY_V1 } from '../../harnesses/research-publishing/core/research-memory-policy.js';
import { ResearchIndexProjector } from '../../harnesses/research-publishing/core/research-index-projector.js';
import type { ResearchIndexSourceRecordV1 } from '../../harnesses/research-publishing/core/research-index-types.js';
import { researchIndexRecords } from '../fixtures/research-index-records.js';

const digest = `sha256:${'f'.repeat(64)}` as const;

describe('five-view research index projector', () => {
  it('projects every view under one generation and excludes retracted records from mainline', () => {
    const projection = new ResearchIndexProjector().project({
      track_id: 'enterprise-agent-runtime', prior_catalog: null, records: researchIndexRecords
    });
    const generations = Object.values(projection.catalog.views)
      .flatMap((view) => view.shards.map((shard) => shard.generation));
    expect(new Set(generations)).toEqual(new Set([projection.generation]));
    const refs = (view: keyof typeof projection.catalog.views) => projection.shards
      .filter((shard) => shard.record.view === view)
      .flatMap((shard) => shard.record.entries.map((entry) => entry.ref));
    expect(refs('mainline')).toContain('increment:runtime:accepted@1');
    expect(refs('mainline')).not.toContain('increment:runtime:retracted@1');
    expect(refs('history')).toContain('increment:runtime:retracted@1');
    expect(refs('working')).toContain('increment:runtime:working@1');
    expect(refs('publication')).toContain('publication:x:001');
    expect(refs('feedback')).toContain('feedback:x:001');
  });

  it('is byte-for-byte deterministic for equivalent shuffled record sets', () => {
    const projector = new ResearchIndexProjector();
    const first = projector.project({ track_id: 'enterprise-agent-runtime', prior_catalog: null, records: researchIndexRecords });
    const second = projector.project({ track_id: 'enterprise-agent-runtime', prior_catalog: null, records: [...researchIndexRecords].reverse() });
    expect(second).toEqual(first);
  });

  it('splits at 64 entries, bounds rendered chars, and counts UTF-8 bytes', () => {
    expect(RESEARCH_MEMORY_POLICY_V1).toMatchObject({
      shard_entry_threshold: 64, shard_byte_threshold: 96_000, max_chars_per_index_record: 12_000
    });
    const base = researchIndexRecords[0]!;
    const records: ResearchIndexSourceRecordV1[] = Array.from({ length: 65 }, (_, index) => ({
      ...base,
      ref: `increment:runtime:item_${String(index).padStart(3, '0')}@1`,
      record_path: `records/item_${index}.md`, record_digest: digest,
      title: `条目 ${index}`, summary: `人工摘要 ${index}`
    }));
    const projection = new ResearchIndexProjector({
      max_chars_per_index_record: 100_000,
      shard_byte_threshold: 500_000
    }).project({
      track_id: 'enterprise-agent-runtime', prior_catalog: null, records
    });
    const mainline = projection.shards.filter((shard) => shard.record.view === 'mainline');
    expect(mainline).toHaveLength(2);
    expect(mainline.map((shard) => shard.record.entry_count)).toEqual([64, 1]);
    for (const shard of projection.shards) {
      expect(shard.path).toMatch(new RegExp(`${shard.content_digest.slice(7)}\\.md$`));
    }
    const bounded = new ResearchIndexProjector().project({
      track_id: 'enterprise-agent-runtime', prior_catalog: null,
      records: [{ ...base, title: '中文标题', summary: '人工摘要'.repeat(100) }]
    });
    expect(bounded.shards[0]!.content.length).toBeLessThanOrEqual(12_000);
    expect(Buffer.byteLength(bounded.shards[0]!.content, 'utf8')).toBeLessThanOrEqual(96_000);
  });

  it('contains only promoted summaries and never copies canonical full text', () => {
    const projection = new ResearchIndexProjector().project({
      track_id: 'enterprise-agent-runtime', prior_catalog: null,
      records: [{ ...researchIndexRecords[0]!, summary: 'Reviewed summary only.' }]
    });
    expect(projection.shards[0]!.content).toContain('Reviewed summary only.');
    expect(projection.shards[0]!.content).not.toContain('canonical_full_text_marker');
  });

  it('keeps shard paths within the Windows atomic-write budget', () => {
    const projection = new ResearchIndexProjector().project({
      track_id: 'enterprise-agent-runtime', prior_catalog: null, records: researchIndexRecords
    });
    const runtimeRootBudget = 48;
    const separatorBudget = 1;
    const atomicSuffixBudget = 37;
    for (const shard of projection.shards) {
      expect(runtimeRootBudget + separatorBudget + shard.path.length + atomicSuffixBudget)
        .toBeLessThanOrEqual(260);
    }
  });
});
