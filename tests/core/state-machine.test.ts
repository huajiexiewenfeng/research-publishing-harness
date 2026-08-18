import { describe, expect, it } from 'vitest';

import {
  transitionPackageState,
  transitionRunState
} from '../../harnesses/research-publishing/core/state-machine.js';

describe('package state machine', () => {
  it('allows the evidence-ready lifecycle transition', () => {
    expect(transitionPackageState('draft', 'evidence_ready')).toBe(
      'evidence_ready'
    );
  });

  it('rejects skipping review before freeze', () => {
    expect(() => transitionPackageState('draft', 'frozen')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
  });
});

describe('run state machine', () => {
  it('allows a run to become generation ready', () => {
    expect(transitionRunState('created', 'generation_ready')).toBe(
      'generation_ready'
    );
  });

  it('rejects publishing without review and approval', () => {
    expect(() => transitionRunState('drafted', 'handed_off')).toThrowError(
      expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
    );
  });
});
