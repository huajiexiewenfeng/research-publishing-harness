export const CONTRACT_NAMES = [
  'candidate',
  'research-content-package',
  'generation-task',
  'article-draft',
  'x-draft',
  'review-report',
  'approval',
  'publish-receipt'
] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

export type ClaimStatus =
  | 'verified'
  | 'observed'
  | 'inferred'
  | 'hypothesis'
  | 'planned';

export type SourcePublicationPolicy =
  | 'cite'
  | 'paraphrase_only'
  | 'internal_only';

export type PackageState =
  | 'draft'
  | 'evidence_ready'
  | 'reviewed'
  | 'frozen';

export type RunState =
  | 'created'
  | 'generation_ready'
  | 'drafted'
  | 'reviewed'
  | 'approval_pending'
  | 'approved'
  | 'handed_off'
  | 'finalized'
  | 'failed'
  | 'cancelled';

export interface Finding {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  path?: string;
}

export interface GateResult {
  gate: 'research' | 'evidence' | 'privacy' | 'publish';
  passed: boolean;
  findings: Finding[];
}
