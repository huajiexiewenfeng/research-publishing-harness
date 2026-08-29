export declare const RESEARCH_MEMORY_POLICY_V1: Readonly<{
    readonly policy_version: "research-memory-policy/v1";
    readonly default_track_id: "enterprise-agent-runtime";
    readonly max_chars_per_chunk: 3000;
    readonly max_chars_per_index_record: 12000;
    readonly max_shards_per_query: 4;
    readonly max_semantic_records_per_query: 12;
    readonly max_document_chunks_per_query: 6;
    readonly max_reconstructed_document_chars: 60000;
    readonly shard_entry_threshold: 64;
    readonly shard_byte_threshold: 96000;
    readonly runtime_requirement: Readonly<{
        name: "llm-wiki-runtime";
        version: "0.2.0";
    }>;
}>;
export type ResearchMemoryPolicyV1 = typeof RESEARCH_MEMORY_POLICY_V1;
