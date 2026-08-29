import type { ReviewDeltaInput, SemanticMemoryDeltaInput, SemanticMemoryDeltaV1, SemanticPromotionReviewV1 } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export declare class SemanticDeltaService {
    private readonly store;
    private readonly ids;
    private readonly evidence;
    constructor(store: WorkspaceStore, ids?: Readonly<{
        now?: () => Date;
    }>);
    propose(input: SemanticMemoryDeltaInput): Promise<SemanticMemoryDeltaV1>;
    review(deltaId: string, input: ReviewDeltaInput): Promise<SemanticPromotionReviewV1>;
}
