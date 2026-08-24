import { HarnessError } from './errors.js';
import type { PublicationBundlePhase } from './publication-bundle-types.js';

const TRANSITIONS: Readonly<Record<PublicationBundlePhase, readonly PublicationBundlePhase[]>> = {
  planned: ['approved'],
  approved: ['article_authorized', 'approval_expired'],
  article_authorized: ['article_in_progress', 'approval_expired'],
  article_in_progress: [
    'article_outcome_unknown',
    'article_verification_conflict',
    'article_terminal_failure',
    'article_verified'
  ],
  article_outcome_unknown: ['article_in_progress'],
  article_verification_conflict: [],
  article_terminal_failure: [],
  article_verified: ['single_materialized', 'approval_expired'],
  single_materialized: ['single_authorized', 'approval_expired'],
  single_authorized: ['single_in_progress', 'approval_expired'],
  single_in_progress: [
    'single_outcome_unknown',
    'single_verification_conflict',
    'single_terminal_failure',
    'completed'
  ],
  single_outcome_unknown: ['single_in_progress'],
  single_verification_conflict: [],
  single_terminal_failure: [],
  approval_expired: [],
  completed: []
};

export function transitionPublicationBundle(
  from: PublicationBundlePhase,
  to: PublicationBundlePhase
): PublicationBundlePhase {
  if (!TRANSITIONS[from].includes(to)) {
    throw new HarnessError(
      'STATE_TRANSITION_INVALID',
      `invalid Publication Bundle transition: ${from} -> ${to}`,
      { from, to }
    );
  }
  return to;
}

export function isTerminalPublicationBundlePhase(phase: PublicationBundlePhase): boolean {
  return TRANSITIONS[phase].length === 0;
}
