import { HarnessError } from './errors.js';
import type { MemoryIngestState, MemoryQueryState } from './memory-types.js';

const QUERY_TRANSITIONS: Readonly<Record<MemoryQueryState, readonly MemoryQueryState[]>> = {
  created: ['config_resolved', 'memory_unavailable', 'query_failed'],
  config_resolved: ['query_planned', 'memory_unavailable', 'query_failed'],
  query_planned: ['context_loaded', 'memory_unavailable', 'query_failed'],
  context_loaded: ['context_reviewed', 'memory_not_applied', 'query_failed'],
  context_reviewed: ['package_bound', 'memory_not_applied'],
  package_bound: [],
  memory_unavailable: [],
  memory_not_applied: [],
  query_failed: []
};

const INGEST_TRANSITIONS: Readonly<Record<MemoryIngestState, readonly MemoryIngestState[]>> = {
  publication_captured: ['ingest_previewed', 'failed'],
  feedback_captured: ['insight_proposed', 'failed'],
  insight_proposed: ['evidence_reviewed', 'failed'],
  evidence_reviewed: ['ingest_previewed', 'failed'],
  ingest_previewed: ['ingest_approved', 'approval_stale', 'failed'],
  ingest_approved: ['source_copied', 'partial_failure', 'approval_stale', 'failed'],
  source_copied: ['records_written', 'partial_failure', 'failed'],
  records_written: ['artifacts_registered', 'partial_failure', 'failed'],
  artifacts_registered: ['log_appended', 'partial_failure', 'failed'],
  log_appended: ['finalized', 'partial_failure', 'failed'],
  finalized: [],
  partial_failure: ['ingest_approved', 'approval_stale', 'failed'],
  failed: [],
  approval_stale: []
};

function transition<TState extends string>(
  kind: 'memory_query' | 'memory_ingest',
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

export function transitionMemoryQueryState(
  from: MemoryQueryState,
  to: MemoryQueryState
): MemoryQueryState {
  return transition('memory_query', from, to, QUERY_TRANSITIONS);
}

export function transitionMemoryIngestState(
  from: MemoryIngestState,
  to: MemoryIngestState
): MemoryIngestState {
  return transition('memory_ingest', from, to, INGEST_TRANSITIONS);
}
