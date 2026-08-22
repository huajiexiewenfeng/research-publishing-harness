export type XArticleExecutionState = 'created' | 'preflight' | 'account_verified' | 'draft_create_armed' | 'draft_created' | 'draft_identity_unknown' | 'content_filling' | 'content_partially_verified' | 'content_verified' | 'preview_verified' | 'publish_armed' | 'publish_attempted' | 'outcome_resolving' | 'public_verifying' | 'finalized' | 'pre_publish_failed' | 'cancelled_before_publish' | 'published_unverified' | 'outcome_unknown' | 'verification_conflict' | 'failed_after_publish';
export declare function transitionXArticleExecution(from: XArticleExecutionState, to: XArticleExecutionState): XArticleExecutionState;
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
export declare function createXArticleExecutionEvent(input: CreateXArticleExecutionEventInput): XArticleExecutionEventV1;
