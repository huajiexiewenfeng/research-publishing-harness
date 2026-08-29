import { describe, expect, it } from 'vitest';

import { evaluateXArticleFastPathDeadline } from '../../harnesses/research-publishing/core/x-article-fast-path-deadline.js';

describe('X Article Fast Path deadline', () => {
  const startedAt = '2026-08-29T08:00:00.000Z';

  it('keeps authorization open before the time budget', () => {
    expect(evaluateXArticleFastPathDeadline({
      started_at: startedAt,
      time_budget_seconds: 900,
      now: '2026-08-29T08:14:59.000Z'
    })).toEqual({ elapsed_seconds: 899, exceeded: false });
  });

  it('closes authorization exactly at the time budget', () => {
    expect(evaluateXArticleFastPathDeadline({
      started_at: startedAt,
      time_budget_seconds: 900,
      now: '2026-08-29T08:15:00.000Z'
    })).toEqual({ elapsed_seconds: 900, exceeded: true });
  });

  it('rejects an invalid timestamp', () => {
    expect(() => evaluateXArticleFastPathDeadline({
      started_at: 'not-a-time',
      time_budget_seconds: 900,
      now: '2026-08-29T08:15:00.000Z'
    })).toThrow(/timestamp/i);
  });

  it('rejects a clock earlier than the start', () => {
    expect(() => evaluateXArticleFastPathDeadline({
      started_at: startedAt,
      time_budget_seconds: 900,
      now: '2026-08-29T07:59:59.000Z'
    })).toThrow(/timestamp/i);
  });
});
