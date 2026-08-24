import { describe, expect, it } from 'vitest';

import { canExpressClaimAs } from '../../harnesses/research-publishing/core/claim-boundary.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import type { ClaimBoundaryStatus, ResearchContentPackageV1_2 } from '../../harnesses/research-publishing/core/types.js';
import { researchPackage } from '../fixtures/research-package.js';

const digest = (char: string) => `sha256:${char.repeat(64)}` as const;

function packageV1_2(claimStatus: ClaimBoundaryStatus): ResearchContentPackageV1_2 {
  return {
    ...researchPackage,
    schema_version: '1.2',
    thesis: { ...researchPackage.thesis, claim_status: claimStatus },
    claims: researchPackage.claims.map((claim) => ({ ...claim, claim_status: claimStatus })),
    memory_context: {
      schema_version: 'memory-context/v2', research_query_plan_digest: digest('a'),
      research_context_snapshot_digest: digest('b'), context_refs: ['claim:runtime_boundary@1'],
      status: 'applied', reviewer: 'human', reviewed_at: '2026-08-24T09:00:00.000Z'
    },
    research_program_binding: {
      roadmap_ref: { path: 'program/roadmaps/runtime/revisions/1.json', digest: digest('c') },
      topic_ref: { path: 'program/backlog/topics/runtime/revisions/1.json', digest: digest('d') },
      candidate_set_ref: { path: 'program/weeks/week_01/candidates.json', digest: digest('e') },
      selection_ref: { path: 'program/weeks/week_01/selection.json', digest: digest('f') }
    }
  };
}

describe('V1.2 claim boundary', () => {
  it('keeps V1.0 and V1.1 package shapes valid', () => {
    expect(() => validateContract('research-content-package', researchPackage)).not.toThrow();
    expect(() => validateContract('research-content-package', {
      ...researchPackage,
      schema_version: '1.1',
      memory_context: {
        query_plan_digest: null, context_snapshot_digest: null, context_refs: [],
        status: 'not_configured', reviewer: null, reviewed_at: null
      }
    })).not.toThrow();
  });

  it.each(['shipped', 'validated', 'observed', 'exploring', 'planned', 'hypothesis'] as const)(
    'accepts V1.2 claim status %s',
    (claimStatus) => {
      expect(() => validateContract('research-content-package', packageV1_2(claimStatus)))
        .not.toThrow();
    }
  );

  it('does not treat shipped as proof of validation or production impact', () => {
    expect(canExpressClaimAs('shipped', 'validated')).toBe(false);
    expect(canExpressClaimAs('shipped', 'observed')).toBe(true);
  });

  it('never strengthens exploring language into shipped', () => {
    expect(canExpressClaimAs('exploring', 'shipped')).toBe(false);
  });
});
