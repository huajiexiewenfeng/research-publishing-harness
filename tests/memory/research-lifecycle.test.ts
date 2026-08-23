import { describe, expect, it } from 'vitest';

import {
  createResearchLifecycleEvent,
  deriveResearchLifecycle
} from '../../harnesses/research-publishing/core/research-lifecycle.js';

const digest = (seed: string) => `sha256:${seed.repeat(64).slice(0, 64)}` as const;

describe('Research Increment lifecycle', () => {
  it('derives state from a monotonic previous-event chain, not timestamps', () => {
    const first = createResearchLifecycleEvent({
      event_id: 'event_increment_001_1',
      increment_ref: 'increment:increment_001@1',
      event_seq: 1,
      previous_event_ref: null,
      event_type: 'working_checkpointed',
      prior_state: null,
      resulting_state: 'working',
      evidence_refs: ['evidence:snapshot_001'],
      approval_ref: null,
      receipt_ref: null,
      occurred_at: '2026-08-23T10:00:00.000Z'
    });
    const accepted = createResearchLifecycleEvent({
      event_id: 'event_increment_001_2',
      increment_ref: 'increment:increment_001@1',
      event_seq: 2,
      previous_event_ref: `lifecycle:${first.event_id}@${first.event_digest}`,
      event_type: 'accepted',
      prior_state: 'working',
      resulting_state: 'accepted',
      evidence_refs: ['evidence:snapshot_001'],
      approval_ref: `approval:promotion_001@${digest('a')}`,
      receipt_ref: null,
      occurred_at: '2026-08-23T09:00:00.000Z'
    });
    expect(deriveResearchLifecycle([accepted, first])).toEqual({
      increment_ref: 'increment:increment_001@1',
      state: 'accepted',
      latest_event_ref: `lifecycle:${accepted.event_id}@${accepted.event_digest}`,
      next_event_seq: 3
    });
  });

  it('rejects sequence gaps and forked previous-event references', () => {
    const first = createResearchLifecycleEvent({
      event_id: 'event_increment_002_1',
      increment_ref: 'increment:increment_002@1',
      event_seq: 1,
      previous_event_ref: null,
      event_type: 'working_checkpointed',
      prior_state: null,
      resulting_state: 'working',
      evidence_refs: ['evidence:snapshot_002'],
      approval_ref: null,
      receipt_ref: null,
      occurred_at: '2026-08-23T10:00:00.000Z'
    });
    const third = createResearchLifecycleEvent({
      event_id: 'event_increment_002_3',
      increment_ref: 'increment:increment_002@1',
      event_seq: 3,
      previous_event_ref: `lifecycle:${first.event_id}@${first.event_digest}`,
      event_type: 'accepted',
      prior_state: 'working',
      resulting_state: 'accepted',
      evidence_refs: ['evidence:snapshot_002'],
      approval_ref: `approval:promotion_002@${digest('b')}`,
      receipt_ref: null,
      occurred_at: '2026-08-23T11:00:00.000Z'
    });
    expect(() => deriveResearchLifecycle([first, third])).toThrowError(/monotonic/);
  });

  it('requires approval for acceptance and a terminal receipt for publication', () => {
    expect(() => createResearchLifecycleEvent({
      event_id: 'event_increment_003_1',
      increment_ref: 'increment:increment_003@1',
      event_seq: 1,
      previous_event_ref: null,
      event_type: 'accepted',
      prior_state: 'working',
      resulting_state: 'accepted',
      evidence_refs: ['evidence:snapshot_003'],
      approval_ref: null,
      receipt_ref: null,
      occurred_at: '2026-08-23T10:00:00.000Z'
    })).toThrowError(/approval/);

    expect(() => createResearchLifecycleEvent({
      event_id: 'event_increment_003_2',
      increment_ref: 'increment:increment_003@1',
      event_seq: 2,
      previous_event_ref: `lifecycle:event_increment_003_1@${digest('c')}`,
      event_type: 'publication_attached',
      prior_state: 'accepted',
      resulting_state: 'published',
      evidence_refs: ['evidence:snapshot_003'],
      approval_ref: null,
      receipt_ref: null,
      occurred_at: '2026-08-23T11:00:00.000Z'
    })).toThrowError(/receipt/);
  });
});
