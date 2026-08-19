import { createPublicationPlanV2 } from '../../harnesses/research-publishing/core/publication-plan-v2.js';

export function publicationPlanV2Fixture() {
  return createPublicationPlanV2({
    planId: 'plan_browser_1',
    runId: 'run_browser_1',
    targetAccount: '@runtime_ai',
    adapter: 'browser',
    mode: 'thread',
    targetPost: null,
    media: [],
    items: [
      { ordinal: 1, text: 'Runtime boundaries matter.' },
      { ordinal: 2, text: 'Evidence must survive.', reply_to: 'previous' }
    ],
    plannedAt: '2026-08-19T01:00:00.000Z',
    provenance: { draft_digest: `sha256:${'a'.repeat(64)}` }
  });
}
