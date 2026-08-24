import type { MemoryContextV1, MemoryContextV2 } from './memory-types.js';
import type {
  ClaimBoundaryStatus as ProgramClaimBoundaryStatus,
  ResearchArtifactRefV1
} from './research-program-types.js';

export const CONTRACT_NAMES = [
  'candidate',
  'research-content-package',
  'generation-task',
  'article-draft',
  'x-draft',
  'review-report',
  'approval',
  'publish-receipt',
  'publication-plan-v2',
  'approval-v2',
  'browser-execution-event',
  'browser-command',
  'browser-observation',
  'publish-receipt-v2',
  'visual-asset-ref',
  'visual-manifest',
  'visual-review-report',
  'publication-plan-v2-1',
  'approval-v2-1',
  'publish-receipt-v2-1',
  'x-article-document',
  'x-article-publication-plan',
  'x-article-approval',
  'x-article-browser-observation',
  'x-article-browser-command',
  'x-article-execution-event',
  'x-article-publish-receipt',
  'memory-query-plan',
  'context-snapshot',
  'publication-feedback-snapshot',
  'candidate-insight-proposal',
  'memory-ingest-plan',
  'memory-ingest-approval',
  'memory-ingest-receipt',
  'artifact-ref-v2',
  'research-evidence-snapshot',
  'research-increment-revision',
  'claim-version',
  'research-decision',
  'open-question-version',
  'research-evolution-edge',
  'publication-expression',
  'queryable-canonical-document',
  'research-lifecycle-event',
  'semantic-memory-delta',
  'semantic-promotion-review',
  'memory-promotion-plan-v2',
  'memory-promotion-approval-v2',
  'memory-promotion-receipt-v2',
  'research-index-catalog',
  'research-index-shard',
  'research-query-plan-v2',
  'research-context-snapshot-v2',
  'research-context-review-v2',
  'research-index-doctor-report',
  'research-index-rebuild-plan',
  'research-terminal-hook-receipt',
  'legacy-research-record',
  'research-import-manifest',
  'research-import-gap-report',
  'research-roadmap',
  'research-topic-revision',
  'research-backlog-catalog',
  'monthly-editorial-review',
  'research-program-status',
  'weekly-research-cycle',
  'weekly-candidate-set',
  'weekly-topic-selection',
  'weekly-cycle-cancellation',
  'weekly-cycle-status'
] as const;

export type ContractName = (typeof CONTRACT_NAMES)[number];

export type LegacyClaimStatus =
  | 'verified'
  | 'observed'
  | 'inferred'
  | 'hypothesis'
  | 'planned';

export type ClaimBoundaryStatus = ProgramClaimBoundaryStatus;
export type ClaimStatus = LegacyClaimStatus | ClaimBoundaryStatus;

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

export type GateName =
  | 'research'
  | 'research_lineage'
  | 'evidence'
  | 'claim_boundary'
  | 'privacy'
  | 'publish';

export interface GateResult {
  readonly gate: GateName;
  readonly passed: boolean;
  readonly findings: readonly Finding[];
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

export interface ResearchContentPackageCommon<TClaimStatus extends ClaimStatus> {
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
  readonly thesis: { readonly summary: string; readonly claim_status: TClaimStatus };
  readonly claims: ReadonlyArray<{
    readonly claim_id: string;
    readonly statement: string;
    readonly claim_status: TClaimStatus;
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

export interface ResearchContentPackageV1_0
  extends ResearchContentPackageCommon<LegacyClaimStatus> {
  readonly schema_version: '1.0';
}

export interface ResearchContentPackageV1_1
  extends ResearchContentPackageCommon<LegacyClaimStatus> {
  readonly schema_version: '1.1';
  readonly memory_context: MemoryContextV1 | MemoryContextV2;
}

export interface ResearchProgramBindingV1 {
  readonly roadmap_ref: ResearchArtifactRefV1;
  readonly topic_ref: ResearchArtifactRefV1;
  readonly candidate_set_ref: ResearchArtifactRefV1;
  readonly selection_ref: ResearchArtifactRefV1;
}

export interface ResearchContentPackageV1_2
  extends ResearchContentPackageCommon<ClaimBoundaryStatus> {
  readonly schema_version: '1.2';
  readonly memory_context: MemoryContextV1 | MemoryContextV2;
  readonly research_program_binding: ResearchProgramBindingV1;
}

export type ResearchContentPackageV1_2DraftInput = Omit<
  ResearchContentPackageV1_2,
  'schema_version' | 'memory_context' | 'research_program_binding'
>;

export interface CompileWeeklyPackageInput {
  readonly cycle_id: string;
  readonly selected_brief_id: string;
  readonly candidate_set_digest: `sha256:${string}`;
  readonly selection_digest: `sha256:${string}`;
  readonly package: ResearchContentPackageV1_2DraftInput;
}

export interface WeeklyPackageCompilerPort {
  compile(input: CompileWeeklyPackageInput): Promise<ResearchContentPackageV1_2>;
}

export type ResearchContentPackage =
  | ResearchContentPackageV1_0
  | ResearchContentPackageV1_1
  | ResearchContentPackageV1_2;

export interface ReviewReport {
  readonly schema_version: '1.0';
  readonly run_id: string;
  readonly passed: boolean;
  readonly gates: readonly string[];
  readonly findings: readonly Finding[];
  readonly reviewed_at: string;
}

export interface VisualAssetRef {
  readonly asset_id: string;
  readonly relative_path: string;
  readonly digest: `sha256:${string}`;
  readonly mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly alt_text: string;
  readonly claim_refs: readonly string[];
}

export interface VisualSlot {
  readonly slot_id: string;
  readonly placement:
    | { readonly kind: 'cover' }
    | { readonly kind: 'after_section'; readonly section_id: string };
  readonly purpose: 'cover' | 'explanation' | 'architecture' | 'evidence';
  readonly required: boolean;
  readonly brief: string;
  readonly claim_refs: readonly string[];
}

export interface ArticleVisualManifest {
  readonly schema_version: '1.0';
  readonly article_run_id: string;
  readonly bindings: ReadonlyArray<{
    readonly slot_id: string;
    readonly asset: VisualAssetRef;
    readonly placement_ordinal: number;
    readonly width: number;
    readonly height: number;
    readonly byte_size: number;
    readonly normalization_version: string;
    readonly provenance: {
      readonly method: 'deterministic' | 'generated' | 'manual';
      readonly tool: string | null;
      readonly source_digest: string | null;
    };
    readonly editable_source: {
      readonly relative_path: string;
      readonly digest: `sha256:${string}`;
    } | null;
  }>;
  readonly manifest_digest: `sha256:${string}`;
}

export interface VisualReviewReport {
  readonly schema_version: '1.0';
  readonly article_run_id: string;
  readonly selected_candidates: Readonly<Record<string, string>>;
  readonly claim_alignment: boolean;
  readonly boundary_alignment: boolean;
  readonly mobile_legibility: boolean;
  readonly single_message: boolean;
  readonly privacy_review: boolean;
  readonly reviewed_by: string;
  readonly reviewed_at: string;
  readonly passed: boolean;
  readonly findings: readonly Finding[];
}
