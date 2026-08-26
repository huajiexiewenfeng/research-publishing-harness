import { HarnessError } from './errors.js';
const PACKAGE_TRANSITIONS = {
    draft: ['evidence_ready'],
    evidence_ready: ['reviewed'],
    reviewed: ['frozen'],
    frozen: []
};
const RUN_TRANSITIONS = {
    created: ['generation_ready', 'failed', 'cancelled'],
    generation_ready: ['drafted', 'failed', 'cancelled'],
    drafted: ['reviewed', 'failed', 'cancelled'],
    reviewed: ['approval_pending', 'finalized', 'failed', 'cancelled'],
    approval_pending: ['approved', 'failed', 'cancelled'],
    approved: ['handed_off', 'finalized', 'failed', 'cancelled'],
    handed_off: [],
    finalized: [],
    failed: [],
    cancelled: []
};
function transition(kind, from, to, allowed) {
    if (!allowed[from].includes(to)) {
        throw new HarnessError('STATE_TRANSITION_INVALID', `cannot transition ${kind} from ${from} to ${to}`, { kind, from, to });
    }
    return to;
}
export function transitionPackageState(from, to) {
    return transition('package', from, to, PACKAGE_TRANSITIONS);
}
export function transitionRunState(from, to) {
    return transition('run', from, to, RUN_TRANSITIONS);
}
//# sourceMappingURL=state-machine.js.map