export type ResearchPromotionPhase = 'delta_proposed' | 'reviewed' | 'planned' | 'approved' | 'executing' | 'partial' | 'reconciliation_required' | 'catalog_committed' | 'complete' | 'failed' | 'approval_stale';
export type ResearchPromotionEvent = 'review' | 'plan' | 'approve' | 'start' | 'partial' | 'resume' | 'require_reconciliation' | 'catalog_commit' | 'complete' | 'fail' | 'stale';
export interface ResearchPromotionState {
    readonly phase: ResearchPromotionPhase;
    readonly catalog_committed: boolean;
    readonly reconciliation_required: boolean;
}
export declare function initialResearchPromotionState(): ResearchPromotionState;
export declare function transitionResearchPromotion(from: ResearchPromotionState, event: ResearchPromotionEvent): ResearchPromotionState;
