import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';

export type XArticleExecutionState =
  | 'created'
  | 'preflight'
  | 'account_verified'
  | 'draft_create_armed'
  | 'draft_created'
  | 'draft_identity_unknown'
  | 'content_filling'
  | 'content_partially_verified'
  | 'content_verified'
  | 'materialization_reconciling'
  | 'draft_reconciled'
  | 'materialization_blocked'
  | 'confirmation_pending'
  | 'preview_verified'
  | 'publish_armed'
  | 'publish_attempted'
  | 'outcome_resolving'
  | 'public_verifying'
  | 'finalized'
  | 'pre_publish_failed'
  | 'cancelled_before_publish'
  | 'published_unverified'
  | 'outcome_unknown'
  | 'verification_conflict'
  | 'failed_after_publish';

const TRANSITIONS: Readonly<Record<XArticleExecutionState, readonly XArticleExecutionState[]>> = {
  created: ['preflight', 'materialization_blocked', 'pre_publish_failed', 'cancelled_before_publish'],
  preflight: ['account_verified', 'materialization_blocked', 'pre_publish_failed', 'cancelled_before_publish'],
  account_verified: ['draft_create_armed', 'draft_created', 'materialization_blocked', 'pre_publish_failed', 'cancelled_before_publish'],
  draft_create_armed: ['draft_created', 'draft_identity_unknown', 'materialization_blocked', 'pre_publish_failed'],
  draft_created: ['content_filling', 'content_verified', 'materialization_reconciling', 'materialization_blocked', 'pre_publish_failed', 'cancelled_before_publish'],
  draft_identity_unknown: ['draft_created', 'cancelled_before_publish'],
  content_filling: ['content_partially_verified', 'content_verified', 'pre_publish_failed', 'cancelled_before_publish'],
  content_partially_verified: ['content_filling', 'content_verified', 'pre_publish_failed', 'cancelled_before_publish'],
  content_verified: ['preview_verified', 'pre_publish_failed', 'cancelled_before_publish'],
  materialization_reconciling: ['draft_reconciled', 'confirmation_pending', 'materialization_blocked', 'pre_publish_failed', 'cancelled_before_publish'],
  draft_reconciled: [],
  materialization_blocked: ['cancelled_before_publish'],
  confirmation_pending: ['publish_armed', 'cancelled_before_publish'],
  preview_verified: ['publish_armed', 'pre_publish_failed', 'cancelled_before_publish'],
  publish_armed: ['publish_attempted', 'pre_publish_failed', 'cancelled_before_publish'],
  publish_attempted: ['outcome_resolving'],
  outcome_resolving: ['public_verifying', 'published_unverified', 'outcome_unknown', 'verification_conflict', 'failed_after_publish'],
  public_verifying: ['finalized', 'published_unverified', 'outcome_unknown', 'verification_conflict'],
  published_unverified: ['public_verifying'],
  outcome_unknown: ['public_verifying'],
  pre_publish_failed: ['preflight', 'content_filling', 'materialization_reconciling', 'materialization_blocked', 'cancelled_before_publish'],
  finalized: [],
  cancelled_before_publish: [],
  verification_conflict: [],
  failed_after_publish: []
};

export function transitionXArticleExecution(
  from: XArticleExecutionState,
  to: XArticleExecutionState
): XArticleExecutionState {
  if (!TRANSITIONS[from].includes(to)) {
    throw new HarnessError(
      'STATE_TRANSITION_INVALID',
      `invalid X Article execution transition: ${from} -> ${to}`,
      { from, to }
    );
  }
  return to;
}

export interface XArticleExecutionSnapshotV1 {
  readonly schema_version: '1.0';
  readonly execution_id: string;
  readonly run_id: string;
  readonly plan_id: string;
  readonly state: XArticleExecutionState;
  readonly sequence: number;
  readonly draft_id: string | null;
  readonly attempt_id: string | null;
  readonly publish_command_count: number;
  readonly latest_command_id: string | null;
  readonly latest_observation_id: string | null;
  readonly latest_receipt_path: string | null;
  readonly updated_at: string;
}

export interface XArticleExecutionEventV1 {
  readonly schema_version: '1.0';
  readonly event_id: string;
  readonly execution_id: string;
  readonly sequence: number;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly previous_state: XArticleExecutionState;
  readonly next_state: XArticleExecutionState;
  readonly draft_id: string | null;
  readonly command_id: string | null;
}

export interface CreateXArticleExecutionEventInput {
  readonly eventId: string;
  readonly executionId: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly previousState: XArticleExecutionState;
  readonly nextState: XArticleExecutionState;
  readonly draftId: string | null;
  readonly commandId: string | null;
}

export function createXArticleExecutionEvent(
  input: CreateXArticleExecutionEventInput
): XArticleExecutionEventV1 {
  transitionXArticleExecution(input.previousState, input.nextState);
  return validateContract<XArticleExecutionEventV1>('x-article-execution-event', {
    schema_version: '1.0', event_id: input.eventId, execution_id: input.executionId,
    sequence: input.sequence, event_type: input.eventType, occurred_at: input.occurredAt,
    previous_state: input.previousState, next_state: input.nextState,
    draft_id: input.draftId, command_id: input.commandId
  });
}
