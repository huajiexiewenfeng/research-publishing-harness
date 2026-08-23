import { HarnessError } from './errors.js';

export type ResearchPromotionPhase =
  | 'delta_proposed'
  | 'reviewed'
  | 'planned'
  | 'approved'
  | 'executing'
  | 'partial'
  | 'reconciliation_required'
  | 'catalog_committed'
  | 'complete'
  | 'failed'
  | 'approval_stale';

export type ResearchPromotionEvent =
  | 'review'
  | 'plan'
  | 'approve'
  | 'start'
  | 'partial'
  | 'resume'
  | 'require_reconciliation'
  | 'catalog_commit'
  | 'complete'
  | 'fail'
  | 'stale';

export interface ResearchPromotionState {
  readonly phase: ResearchPromotionPhase;
  readonly catalog_committed: boolean;
  readonly reconciliation_required: boolean;
}

export function initialResearchPromotionState(): ResearchPromotionState {
  return { phase: 'delta_proposed', catalog_committed: false, reconciliation_required: false };
}

const TRANSITIONS: Readonly<Record<ResearchPromotionPhase, Partial<Record<ResearchPromotionEvent, ResearchPromotionPhase>>>> = {
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

export function transitionResearchPromotion(
  from: ResearchPromotionState,
  event: ResearchPromotionEvent
): ResearchPromotionState {
  const phase = TRANSITIONS[from.phase][event];
  if (phase === undefined) {
    const catalog = event === 'complete' ? ' before Catalog commit' : '';
    throw new HarnessError(
      'STATE_TRANSITION_INVALID',
      `cannot transition research promotion from ${from.phase} with ${event}${catalog}`
    );
  }
  return {
    phase,
    catalog_committed: from.catalog_committed || phase === 'catalog_committed' || phase === 'complete',
    reconciliation_required: from.reconciliation_required || phase === 'reconciliation_required'
  };
}
