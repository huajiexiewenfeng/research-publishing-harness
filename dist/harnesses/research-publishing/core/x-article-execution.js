import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
const TRANSITIONS = {
    created: ['preflight', 'pre_publish_failed', 'cancelled_before_publish'],
    preflight: ['account_verified', 'pre_publish_failed', 'cancelled_before_publish'],
    account_verified: ['draft_create_armed', 'draft_created', 'pre_publish_failed', 'cancelled_before_publish'],
    draft_create_armed: ['draft_created', 'draft_identity_unknown', 'pre_publish_failed'],
    draft_created: ['content_filling', 'content_verified', 'pre_publish_failed', 'cancelled_before_publish'],
    draft_identity_unknown: ['draft_created', 'cancelled_before_publish'],
    content_filling: ['content_partially_verified', 'content_verified', 'pre_publish_failed', 'cancelled_before_publish'],
    content_partially_verified: ['content_filling', 'content_verified', 'pre_publish_failed', 'cancelled_before_publish'],
    content_verified: ['preview_verified', 'pre_publish_failed', 'cancelled_before_publish'],
    preview_verified: ['publish_armed', 'pre_publish_failed', 'cancelled_before_publish'],
    publish_armed: ['publish_attempted', 'pre_publish_failed', 'cancelled_before_publish'],
    publish_attempted: ['outcome_resolving'],
    outcome_resolving: ['public_verifying', 'published_unverified', 'outcome_unknown', 'verification_conflict', 'failed_after_publish'],
    public_verifying: ['finalized', 'published_unverified', 'outcome_unknown', 'verification_conflict'],
    published_unverified: ['public_verifying'],
    outcome_unknown: ['public_verifying'],
    pre_publish_failed: ['preflight', 'content_filling', 'cancelled_before_publish'],
    finalized: [],
    cancelled_before_publish: [],
    verification_conflict: [],
    failed_after_publish: []
};
export function transitionXArticleExecution(from, to) {
    if (!TRANSITIONS[from].includes(to)) {
        throw new HarnessError('STATE_TRANSITION_INVALID', `invalid X Article execution transition: ${from} -> ${to}`, { from, to });
    }
    return to;
}
export function createXArticleExecutionEvent(input) {
    transitionXArticleExecution(input.previousState, input.nextState);
    return validateContract('x-article-execution-event', {
        schema_version: '1.0', event_id: input.eventId, execution_id: input.executionId,
        sequence: input.sequence, event_type: input.eventType, occurred_at: input.occurredAt,
        previous_state: input.previousState, next_state: input.nextState,
        draft_id: input.draftId, command_id: input.commandId
    });
}
//# sourceMappingURL=x-article-execution.js.map