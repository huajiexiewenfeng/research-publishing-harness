import { HarnessError } from './errors.js';

export type BrowserExecutionState =
  | 'created'
  | 'preflight'
  | 'account_verified'
  | 'composer_prepared'
  | 'composer_verified'
  | 'submit_armed'
  | 'submit_attempted'
  | 'outcome_resolving'
  | 'public_verifying'
  | 'finalized'
  | 'pre_submit_failed'
  | 'cancelled_before_submit'
  | 'published_unverified'
  | 'outcome_unknown'
  | 'partial'
  | 'failed_after_submit'
  | 'verification_conflict';

const TRANSITIONS: Readonly<Record<BrowserExecutionState, readonly BrowserExecutionState[]>> = {
  created: ['preflight', 'pre_submit_failed', 'cancelled_before_submit'],
  preflight: ['account_verified', 'pre_submit_failed', 'cancelled_before_submit'],
  account_verified: ['composer_prepared', 'pre_submit_failed', 'cancelled_before_submit'],
  composer_prepared: ['composer_verified', 'pre_submit_failed', 'cancelled_before_submit'],
  composer_verified: ['submit_armed', 'pre_submit_failed', 'cancelled_before_submit'],
  submit_armed: ['submit_attempted', 'pre_submit_failed', 'cancelled_before_submit'],
  submit_attempted: ['outcome_resolving'],
  outcome_resolving: [
    'public_verifying',
    'partial',
    'published_unverified',
    'outcome_unknown',
    'failed_after_submit',
    'verification_conflict'
  ],
  public_verifying: [
    'finalized',
    'partial',
    'published_unverified',
    'outcome_unknown',
    'verification_conflict'
  ],
  published_unverified: ['public_verifying'],
  outcome_unknown: ['public_verifying'],
  pre_submit_failed: ['preflight', 'cancelled_before_submit'],
  finalized: [],
  cancelled_before_submit: [],
  partial: [],
  failed_after_submit: [],
  verification_conflict: []
};

export function transitionBrowserExecution(
  from: BrowserExecutionState,
  to: BrowserExecutionState
): BrowserExecutionState {
  if (!TRANSITIONS[from].includes(to)) {
    throw new HarnessError(
      'STATE_TRANSITION_INVALID',
      `invalid browser execution transition: ${from} -> ${to}`,
      { from, to }
    );
  }
  return to;
}

export interface BrowserExecutionEventV2 {
  readonly schema_version: '2.0';
  readonly event_id: string;
  readonly execution_id: string;
  readonly attempt_id: string | null;
  readonly sequence: number;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly previous_state: BrowserExecutionState;
  readonly next_state: BrowserExecutionState;
  readonly command_id?: string;
  readonly evidence_digest?: string;
  readonly submit_command_count?: number;
  readonly latest_observation_id?: string;
}

export interface BrowserExecutionSnapshot {
  readonly schema_version: '2.0';
  readonly execution_id: string;
  readonly run_id: string;
  readonly plan_id: string;
  readonly state: BrowserExecutionState;
  readonly sequence: number;
  readonly attempt_id: string | null;
  readonly submit_command_count: number;
  readonly latest_command_id: string | null;
  readonly latest_observation_id: string | null;
  readonly updated_at: string;
}

export interface CreateBrowserExecutionInput {
  readonly execution_id: string;
  readonly run_id: string;
  readonly plan_id: string;
  readonly created_at: string;
}

export interface TransitionEvidence {
  readonly event_type: string;
  readonly attempt_id?: string;
  readonly command_id?: string;
  readonly evidence_digest?: string;
  readonly submit_command_count?: number;
  readonly latest_observation_id?: string;
}
