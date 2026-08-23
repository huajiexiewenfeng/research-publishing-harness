import { describe, expect, it } from 'vitest';

import {
  initialResearchPromotionState,
  transitionResearchPromotion
} from '../../harnesses/research-publishing/core/research-promotion-state.js';

describe('research promotion state', () => {
  it('requires review, plan, approval and execution before Catalog commit', () => {
    let state = initialResearchPromotionState();
    for (const event of ['review', 'plan', 'approve', 'start', 'catalog_commit', 'complete'] as const) {
      state = transitionResearchPromotion(state, event);
    }
    expect(state).toEqual({ phase: 'complete', catalog_committed: true, reconciliation_required: false });
  });

  it('does not allow complete before Catalog commit', () => {
    let state = initialResearchPromotionState();
    for (const event of ['review', 'plan', 'approve', 'start'] as const) {
      state = transitionResearchPromotion(state, event);
    }
    expect(() => transitionResearchPromotion(state, 'complete')).toThrowError(/catalog/i);
  });

  it('allows partial resume but makes reconciliation and stale approval terminal', () => {
    let state = initialResearchPromotionState();
    for (const event of ['review', 'plan', 'approve', 'start', 'partial', 'resume'] as const) {
      state = transitionResearchPromotion(state, event);
    }
    expect(state.phase).toBe('executing');
    const uncertain = transitionResearchPromotion(state, 'require_reconciliation');
    expect(uncertain).toMatchObject({ phase: 'reconciliation_required', reconciliation_required: true });
    expect(() => transitionResearchPromotion(uncertain, 'resume')).toThrowError();

    state = initialResearchPromotionState();
    for (const event of ['review', 'plan', 'stale'] as const) state = transitionResearchPromotion(state, event);
    expect(() => transitionResearchPromotion(state, 'approve')).toThrowError();
  });
});
