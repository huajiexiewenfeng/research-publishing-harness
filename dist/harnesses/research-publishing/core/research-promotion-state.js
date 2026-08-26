import { HarnessError } from './errors.js';
export function initialResearchPromotionState() {
    return { phase: 'delta_proposed', catalog_committed: false, reconciliation_required: false };
}
const TRANSITIONS = {
    delta_proposed: { review: 'reviewed', fail: 'failed' },
    reviewed: { plan: 'planned', fail: 'failed' },
    planned: { approve: 'approved', stale: 'approval_stale', fail: 'failed' },
    approved: { start: 'executing', stale: 'approval_stale', fail: 'failed' },
    executing: {
        partial: 'partial', require_reconciliation: 'reconciliation_required',
        catalog_commit: 'catalog_committed', fail: 'failed'
    },
    partial: { resume: 'executing', stale: 'approval_stale', fail: 'failed' },
    reconciliation_required: {},
    catalog_committed: { complete: 'complete' },
    complete: {},
    failed: {},
    approval_stale: {}
};
export function transitionResearchPromotion(from, event) {
    const phase = TRANSITIONS[from.phase][event];
    if (phase === undefined) {
        const catalog = event === 'complete' ? ' before Catalog commit' : '';
        throw new HarnessError('STATE_TRANSITION_INVALID', `cannot transition research promotion from ${from.phase} with ${event}${catalog}`);
    }
    return {
        phase,
        catalog_committed: from.catalog_committed || phase === 'catalog_committed' || phase === 'complete',
        reconciliation_required: from.reconciliation_required || phase === 'reconciliation_required'
    };
}
//# sourceMappingURL=research-promotion-state.js.map