import type { ClaimStatus } from './types.js';

const ALLOWED_EXPRESSION_STATUS: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  verified: ['verified', 'observed', 'inferred', 'hypothesis'],
  shipped: ['shipped', 'observed', 'exploring', 'hypothesis'],
  validated: ['validated', 'observed', 'exploring', 'hypothesis'],
  observed: ['observed', 'exploring', 'hypothesis'],
  inferred: ['inferred', 'hypothesis'],
  exploring: ['exploring', 'hypothesis'],
  planned: ['planned', 'exploring', 'hypothesis'],
  hypothesis: ['hypothesis']
};

export function canExpressClaimAs(source: ClaimStatus, target: ClaimStatus): boolean {
  return ALLOWED_EXPRESSION_STATUS[source].includes(target);
}
