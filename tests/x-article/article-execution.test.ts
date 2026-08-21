import { describe, expect, it } from 'vitest';

import {
  createXArticleExecutionEvent,
  transitionXArticleExecution
} from '../../harnesses/research-publishing/core/x-article-execution.js';

describe('X Article execution state machine', () => {
  it('allows the successful editor and publish path', () => {
    expect(transitionXArticleExecution('draft_created', 'content_filling')).toBe('content_filling');
    expect(transitionXArticleExecution('content_filling', 'content_partially_verified')).toBe('content_partially_verified');
    expect(transitionXArticleExecution('preview_verified', 'publish_armed')).toBe('publish_armed');
  });

  it('never returns from publish_attempted to a submitting state', () => {
    expect(() => transitionXArticleExecution('publish_attempted', 'publish_armed'))
      .toThrowError(expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' }));
  });

  it('creates a versioned append-only transition event', () => {
    expect(createXArticleExecutionEvent({
      eventId: 'event_1', executionId: 'execution_1', sequence: 3,
      previousState: 'content_filling', nextState: 'content_partially_verified',
      eventType: 'article_prefix_verified', occurredAt: '2026-08-21T09:00:00.000Z',
      draftId: '2090731994279755776', commandId: 'command_1'
    })).toMatchObject({
      schema_version: '1.0', sequence: 3,
      previous_state: 'content_filling', next_state: 'content_partially_verified'
    });
  });
});
