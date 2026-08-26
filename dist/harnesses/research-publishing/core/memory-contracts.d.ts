import type { ContextSnapshotV1, MemoryQueryPlanInput, MemoryQueryPlanV1, RuntimeContextResult } from './memory-types.js';
export declare function createMemoryQueryPlan(input: MemoryQueryPlanInput, ids?: Readonly<{
    queryId?: () => string;
    runId?: () => string;
    now?: () => Date;
}>): MemoryQueryPlanV1;
export declare function createContextSnapshot(plan: MemoryQueryPlanV1, result: RuntimeContextResult, ids?: Readonly<{
    snapshotId?: () => string;
}>): ContextSnapshotV1;
