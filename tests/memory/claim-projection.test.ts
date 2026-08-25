import { describe, expect, it } from 'vitest';

import { projectPackageClaimStatus } from '../../harnesses/research-publishing/core/research-bridge-contracts.js';
import type { ClaimBoundaryStatus } from '../../harnesses/research-publishing/core/research-program-types.js';

const packageStatuses: readonly ClaimBoundaryStatus[] = [
  'validated', 'shipped', 'observed', 'exploring', 'planned', 'hypothesis'
];

describe('Package Claim Projection', () => {
  it.each([
    ['validated', 'verified'],
    ['shipped', 'observed'],
    ['observed', 'observed'],
    ['exploring', 'hypothesis'],
    ['planned', 'planned'],
    ['hypothesis', 'hypothesis']
  ] as const)('projects %s to %s', (source, projected) => {
    expect(projectPackageClaimStatus(source)).toBe(projected);
  });

  it('never produces inferred automatically', () => {
    for (const status of packageStatuses) {
      expect(projectPackageClaimStatus(status)).not.toBe('inferred');
    }
  });
});
