import type { MemoryIngestState, MemoryQueryState } from './memory-types.js';
export declare function transitionMemoryQueryState(from: MemoryQueryState, to: MemoryQueryState): MemoryQueryState;
export declare function transitionMemoryIngestState(from: MemoryIngestState, to: MemoryIngestState): MemoryIngestState;
