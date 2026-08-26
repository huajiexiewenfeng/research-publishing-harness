import { HarnessError } from './errors.js';
const TRANSITIONS = {
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
export function transitionBrowserExecution(from, to) {
    if (!TRANSITIONS[from].includes(to)) {
        throw new HarnessError('STATE_TRANSITION_INVALID', `invalid browser execution transition: ${from} -> ${to}`, { from, to });
    }
    return to;
}
//# sourceMappingURL=browser-execution.js.map