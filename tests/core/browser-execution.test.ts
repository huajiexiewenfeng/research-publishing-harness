import { describe, expect, it } from 'vitest';

import {
  type BrowserExecutionState,
  transitionBrowserExecution
} from '../../harnesses/research-publishing/core/browser-execution.js';

describe('BrowserExecution state machine', () => {
  it('allows the complete success path', () => {
    const path = [
      'preflight',
      'account_verified',
      'composer_prepared',
      'composer_verified',
      'submit_armed',
      'submit_attempted',
      'outcome_resolving',
      'public_verifying',
      'finalized'
    ] as const;
    let state: BrowserExecutionState = 'created';
    for (const next of path) state = transitionBrowserExecution(state, next);
    expect(state).toBe('finalized');
  });

  it('never allows a post-submit state to return to submit_armed', () => {
    expect(() => transitionBrowserExecution('outcome_unknown', 'submit_armed')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
  });

  it('allows unknown outcomes to resume read-only verification', () => {
    expect(transitionBrowserExecution('outcome_unknown', 'public_verifying')).toBe(
      'public_verifying'
    );
  });
});
