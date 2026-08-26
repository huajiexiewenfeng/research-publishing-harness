import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
function expectedTransition(input) {
    switch (input.event_type) {
        case 'working_checkpointed':
            return input.prior_state === null && input.resulting_state === 'working';
        case 'package_finalized':
            return input.prior_state === 'working' && input.resulting_state === 'working';
        case 'accepted':
            return input.prior_state === 'working' && input.resulting_state === 'accepted';
        case 'publication_attached':
            return (input.prior_state === 'accepted' || input.prior_state === 'published') &&
                input.resulting_state === 'published';
        case 'superseded':
            return (input.prior_state === 'accepted' || input.prior_state === 'published') &&
                input.resulting_state === 'superseded';
        case 'retracted':
            return input.prior_state !== null && input.prior_state !== 'retracted' &&
                input.resulting_state === 'retracted';
    }
}
export function createResearchLifecycleEvent(input) {
    if (!expectedTransition(input)) {
        throw new HarnessError('STATE_TRANSITION_INVALID', 'research lifecycle transition is invalid');
    }
    if ((input.event_type === 'accepted' || input.event_type === 'retracted') && input.approval_ref === null) {
        throw new HarnessError('CONTRACT_INVALID', `${input.event_type} lifecycle event requires approval`);
    }
    if (input.event_type === 'publication_attached' && input.receipt_ref === null) {
        throw new HarnessError('CONTRACT_INVALID', 'publication lifecycle event requires a terminal receipt');
    }
    const body = {
        schema_version: 'research-lifecycle-event/v1',
        ...input
    };
    return validateContract('research-lifecycle-event', {
        ...body,
        event_digest: sha256(body)
    });
}
export function deriveResearchLifecycle(events) {
    if (events.length === 0) {
        throw new HarnessError('STATE_TRANSITION_INVALID', 'research lifecycle requires at least one event');
    }
    const ordered = [...events].sort((left, right) => left.event_seq - right.event_seq);
    let prior = null;
    for (const event of ordered) {
        const expectedSeq = prior === null ? 1 : prior.event_seq + 1;
        const expectedPrevious = prior === null
            ? null
            : `lifecycle:${prior.event_id}@${prior.event_digest}`;
        if (event.event_seq !== expectedSeq || event.previous_event_ref !== expectedPrevious) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'research lifecycle event sequence must be monotonic and unbranched');
        }
        if (prior !== null &&
            (event.increment_ref !== prior.increment_ref || event.prior_state !== prior.resulting_state)) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'research lifecycle chain identity or prior state does not match');
        }
        prior = event;
    }
    const latest = prior;
    return {
        increment_ref: latest.increment_ref,
        state: latest.resulting_state,
        latest_event_ref: `lifecycle:${latest.event_id}@${latest.event_digest}`,
        next_event_seq: latest.event_seq + 1
    };
}
//# sourceMappingURL=research-lifecycle.js.map