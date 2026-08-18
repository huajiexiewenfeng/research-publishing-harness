import type { PublicationPlan } from '../../harnesses/research-publishing/branches/x-harness/x-service.js';
import { computePublicationDigest } from '../../harnesses/research-publishing/core/approval.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';

export function publicationPlanFixture(): PublicationPlan {
  const unlocked = {
    schema_version: '1.0' as const,
    run_id: 'x_reply_lock',
    target_account: '@runtime_ai',
    adapter: 'manual' as const,
    target_post_id: '1900000000000000000',
    target_post: {
      id: '1900000000000000000',
      url: 'https://x.com/example/status/1900000000000000000',
      author: '@example',
      snapshot_digest: `sha256:${'a'.repeat(64)}`
    },
    items: [
      { ordinal: 1, text: 'Evidence boundaries belong in runtime contracts.', digest: sha256('Evidence boundaries belong in runtime contracts.'), reply_to: 'target' as const },
      { ordinal: 2, text: 'A second locked item.', digest: sha256('A second locked item.'), reply_to: 'previous' as const }
    ],
    planned_at: '2026-08-18T15:00:00.000Z'
  };
  return { ...unlocked, publication_digest: computePublicationDigest(unlocked) };
}
