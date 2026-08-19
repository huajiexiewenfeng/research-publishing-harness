import { describe, expect, it } from 'vitest';

import {
  createPublicationPlanV2,
  normalizePublicationText
} from '../../harnesses/research-publishing/core/publication-plan-v2.js';

describe('PublicationPlanV2', () => {
  it('keeps the plan digest stable when only planning metadata changes', () => {
    const base = {
      planId: 'plan_1',
      runId: 'run_1',
      targetAccount: '@runtime_ai',
      adapter: 'browser' as const,
      mode: 'thread' as const,
      targetPost: null,
      media: [],
      items: [
        { ordinal: 1, text: 'Runtime boundaries matter.\r\nEvidence must survive.' },
        { ordinal: 2, text: 'What would you extract next?', reply_to: 'previous' as const }
      ],
      provenance: { draft_digest: `sha256:${'a'.repeat(64)}` }
    };
    const first = createPublicationPlanV2({
      ...base,
      plannedAt: '2026-08-19T01:00:00.000Z'
    });
    const second = createPublicationPlanV2({
      ...base,
      planId: 'plan_2',
      plannedAt: '2026-08-19T02:00:00.000Z'
    });

    expect(first.plan_digest).toBe(second.plan_digest);
    expect(first.items[0]?.text).toBe('Runtime boundaries matter.\nEvidence must survive.');
    expect(first.items[0]?.digest).toBe(second.items[0]?.digest);
  });

  it('normalizes only Unicode NFC and line endings', () => {
    expect(normalizePublicationText('Cafe\u0301\r\n two  spaces ')).toBe(
      'Café\n two  spaces '
    );
  });
});
