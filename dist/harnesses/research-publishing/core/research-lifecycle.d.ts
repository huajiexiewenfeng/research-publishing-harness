import type { DerivedResearchLifecycleV1, ResearchLifecycleEventInput, ResearchLifecycleEventV1 } from './research-memory-types.js';
export declare function createResearchLifecycleEvent(input: ResearchLifecycleEventInput): ResearchLifecycleEventV1;
export declare function deriveResearchLifecycle(events: readonly ResearchLifecycleEventV1[]): DerivedResearchLifecycleV1;
