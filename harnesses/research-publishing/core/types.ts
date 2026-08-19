export const CONTRACT_NAMES = [
  'candidate',
  'research-content-package',
  'generation-task',
  'article-draft',
  'x-draft',
  'review-report',
  'approval',
  'publish-receipt',
  'publication-plan-v2'
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

export interface Candidate {
  readonly schema_version: '1.0';
  readonly candidate_id: string;
  readonly title: string;
  readonly source_type: 'commit' | 'design' | 'failure' | 'eval' | 'discussion' | 'external_signal';
  readonly research_track: string;
  readonly thesis_hint: string;
  readonly novelty_hint?: string;
  readonly source_refs: readonly string[];
  readonly privacy: 'public' | 'needs_review' | 'private';
  readonly status: 'idea' | 'qualifying' | 'evidence_ready' | 'packaged' | 'archived';
  readonly captured_at: string;
}

export interface ResearchContentPackage {
  readonly schema_version: '1.0';
  readonly package_id: string;
  readonly version: number;
  readonly status: PackageState;
  readonly research_track: { readonly id: string; readonly parent?: string };
  readonly topic: string;
  readonly research_question: string;
  readonly content_intent: {
    readonly purpose: string;
    readonly audience: readonly string[];
    readonly desired_discussion: readonly string[];
  };
  readonly thesis: { readonly summary: string; readonly claim_status: ClaimStatus };
  readonly claims: ReadonlyArray<{
    readonly claim_id: string;
    readonly statement: string;
    readonly claim_status: ClaimStatus;
    readonly evidence_refs: readonly string[];
    readonly allowed_language?: Readonly<Record<string, string>>;
    readonly notes?: string;
  }>;
  readonly evidence: ReadonlyArray<{
    readonly evidence_id: string;
    readonly source_ref: string;
    readonly evidence_type: string;
    readonly summary: string;
    readonly supports: readonly string[];
    readonly reproducibility: string;
  }>;
  readonly boundaries: {
    readonly established: readonly string[];
    readonly not_established: readonly string[];
    readonly explicitly_not_claimed: readonly string[];
    readonly planned_work: readonly string[];
  };
  readonly research_lineage: readonly object[];
  readonly open_questions: readonly object[];
  readonly sources: ReadonlyArray<{
    readonly source_id: string;
    readonly source_type: string;
    readonly location: string;
    readonly revision?: string;
    readonly access: string;
    readonly publication_policy: SourcePublicationPolicy;
  }>;
  readonly privacy: {
    readonly contains_private_material: boolean;
    readonly review_required: boolean;
    readonly blocked_items: readonly string[];
  };
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReviewReport {
  readonly schema_version: '1.0';
  readonly run_id: string;
  readonly passed: boolean;
  readonly gates: readonly string[];
  readonly findings: readonly Finding[];
  readonly reviewed_at: string;
}
