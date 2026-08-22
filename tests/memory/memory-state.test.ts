import { describe, expect, it } from 'vitest';

import {
  transitionMemoryIngestState,
  transitionMemoryQueryState
} from '../../harnesses/research-publishing/core/memory-state.js';

describe('Memory Query state machine', () => {
  it('requires review before binding context to a package', () => {
    expect(transitionMemoryQueryState('context_loaded', 'context_reviewed')).toBe('context_reviewed');
    expect(transitionMemoryQueryState('context_reviewed', 'package_bound')).toBe('package_bound');
    expect(() => transitionMemoryQueryState('context_loaded', 'package_bound')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
  });

  it('makes package_bound and degraded outcomes terminal', () => {
    expect(() => transitionMemoryQueryState('package_bound', 'query_planned')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
    expect(() => transitionMemoryQueryState('memory_unavailable', 'query_planned')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
  });
});

describe('Memory Ingest state machine', () => {
  it('separates publication checkpoints from feedback evidence review', () => {
    expect(transitionMemoryIngestState('publication_captured', 'ingest_previewed')).toBe('ingest_previewed');
    expect(transitionMemoryIngestState('feedback_captured', 'insight_proposed')).toBe('insight_proposed');
    expect(() => transitionMemoryIngestState('feedback_captured', 'ingest_previewed')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
  });

  it('permits a partial receipt to re-enter only through approval validation', () => {
    expect(transitionMemoryIngestState('partial_failure', 'ingest_approved')).toBe('ingest_approved');
    expect(() => transitionMemoryIngestState('partial_failure', 'records_written')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
  });

  it('makes finalized ingest terminal', () => {
    expect(() => transitionMemoryIngestState('finalized', 'ingest_approved')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
  });
});
