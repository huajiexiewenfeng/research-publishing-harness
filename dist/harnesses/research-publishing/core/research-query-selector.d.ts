import type { CanonicalDocumentChunkDescriptorV1 } from './research-memory-types.js';
import type { ResearchIndexEntryV1, ResearchIndexShardDescriptorV1 } from './research-index-types.js';
import { type CanonicalChunkRefV1, type DocumentLoadMode, type ResearchIndexShardRefV1, type ResearchQueryView, type ResearchRecordRefV1 } from './research-query-types.js';
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
export declare function selectIndexShards(input: SelectIndexShardsInput): readonly ResearchIndexShardRefV1[];
export declare function selectSemanticRecords(input: SelectSemanticRecordsInput): readonly ResearchRecordRefV1[];
export declare function selectDocumentChunks(input: SelectDocumentChunksInput): readonly CanonicalChunkRefV1[];
