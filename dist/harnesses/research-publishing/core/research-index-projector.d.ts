import type { ProjectResearchIndexInput, ResearchIndexProjectionV1 } from './research-index-types.js';
interface IndexProjectionPolicy {
    readonly shard_entry_threshold: number;
    readonly shard_byte_threshold: number;
    readonly max_chars_per_index_record: number;
}
export declare class ResearchIndexProjector {
    private readonly policy;
    constructor(policy?: Partial<IndexProjectionPolicy>);
    project(input: ProjectResearchIndexInput): ResearchIndexProjectionV1;
    private renderShard;
    private describeShard;
}
export {};
