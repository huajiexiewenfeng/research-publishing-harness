import { HarnessError } from './errors.js';
import type { PackageState, RunState } from './types.js';

const PACKAGE_TRANSITIONS: Readonly<Record<PackageState, readonly PackageState[]>> = {
  draft: ['evidence_ready'],
  evidence_ready: ['reviewed'],
  reviewed: ['frozen'],
  frozen: []
};

const RUN_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
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

function transition<TState extends string>(
  kind: 'package' | 'run',
  from: TState,
  to: TState,
  allowed: Readonly<Record<TState, readonly TState[]>>
): TState {
  if (!allowed[from].includes(to)) {
    throw new HarnessError(
      'STATE_TRANSITION_INVALID',
      `cannot transition ${kind} from ${from} to ${to}`,
      { kind, from, to }
    );
  }
  return to;
}

export function transitionPackageState(
  from: PackageState,
  to: PackageState
): PackageState {
  return transition('package', from, to, PACKAGE_TRANSITIONS);
}

export function transitionRunState(from: RunState, to: RunState): RunState {
  return transition('run', from, to, RUN_TRANSITIONS);
}
