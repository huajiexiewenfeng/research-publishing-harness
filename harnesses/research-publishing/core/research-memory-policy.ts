export const RESEARCH_MEMORY_POLICY_V1 = Object.freeze({
  policy_version: 'research-memory-policy/v1',
  default_track_id: 'enterprise-agent-runtime',
  max_chars_per_chunk: 3_000,
  max_chars_per_index_record: 12_000,
  max_shards_per_query: 4,
  max_semantic_records_per_query: 12,
  max_document_chunks_per_query: 6,
  max_reconstructed_document_chars: 60_000,
  shard_entry_threshold: 64,
  shard_byte_threshold: 96_000,
  runtime_requirement: Object.freeze({
    name: 'llm-wiki-runtime',
    version: '0.2.0'
  })
} as const);

export type ResearchMemoryPolicyV1 = typeof RESEARCH_MEMORY_POLICY_V1;
