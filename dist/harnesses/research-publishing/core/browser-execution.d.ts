export type BrowserExecutionState = 'created' | 'preflight' | 'account_verified' | 'composer_prepared' | 'composer_verified' | 'submit_armed' | 'submit_attempted' | 'outcome_resolving' | 'public_verifying' | 'finalized' | 'pre_submit_failed' | 'cancelled_before_submit' | 'published_unverified' | 'outcome_unknown' | 'partial' | 'failed_after_submit' | 'verification_conflict';
export declare function transitionBrowserExecution(from: BrowserExecutionState, to: BrowserExecutionState): BrowserExecutionState;
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
