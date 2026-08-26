import type { ContextSnapshotV1 } from './memory-types.js';
import type { ResearchContextReviewV2, ResearchContextSnapshotV2 } from './research-query-types.js';
import type { ResearchContentPackage, ResearchContentPackageV1_1, ResearchContentPackageV1_2 } from './types.js';
type MemoryBindablePackage = ResearchContentPackageV1_1 | ResearchContentPackageV1_2;
export declare function validatePackageMemoryBinding<T extends ResearchContentPackage>(packageValue: T): T;
export declare function bindResearchMemoryContext<T extends MemoryBindablePackage>(packageDraft: T, snapshot: ResearchContextSnapshotV2, review: ResearchContextReviewV2): T;
export declare function bindMemoryContext<T extends MemoryBindablePackage>(packageDraft: T, snapshot: ContextSnapshotV1, selectedRefs: readonly string[], reviewer: string, now: Date): T;
export {};
