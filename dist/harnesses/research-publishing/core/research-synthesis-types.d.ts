import type { PrivacyClassification } from './research-memory-types.js';
import type { ResearchArtifactRefV1 } from './research-program-types.js';
export declare const SYNTHESIS_BUDGET_V1: {
    readonly max_items: 24;
    readonly max_total_chars: 64000;
    readonly max_item_chars: 12000;
};
export type SynthesisDisposition = 'material_update' | 'conflicting_evidence' | 'no_material_change' | 'insufficient_evidence';
export type SynthesisMemoryContextStatus = 'loaded' | 'empty' | 'unavailable';
export interface SynthesisContextItemV1 {
    readonly ref: ResearchArtifactRefV1;
    readonly role: 'outcome' | 'package' | 'article' | 'expression' | 'evidence' | 'feedback' | 'prior_synthesis' | 'runtime_context';
    readonly media_type: string;
    readonly privacy_classification: Exclude<PrivacyClassification, 'restricted'>;
    readonly content: string;
    readonly original_chars: number;
    readonly included_chars: number;
    readonly truncated: boolean;
}
export interface SynthesisRuntimeContextV1 {
    readonly status: SynthesisMemoryContextStatus;
    readonly query_plan_ref: ResearchArtifactRefV1 | null;
    readonly context_snapshot_ref: ResearchArtifactRefV1 | null;
    readonly review_ref: ResearchArtifactRefV1 | null;
    readonly selected_context_refs: readonly string[];
    readonly limitation: string | null;
}
export interface SynthesisInputSnapshotV1 {
    readonly schema_version: 'synthesis-input-snapshot/v1';
    readonly snapshot_id: string;
    readonly trigger: {
        readonly kind: 'important_evidence' | 'article_finalized' | 'weekly_outcome' | 'selected_feedback' | 'human_request';
        readonly reason: string;
    };
    readonly source_items: readonly SynthesisContextItemV1[];
    readonly evidence_refs: readonly string[];
    readonly prior_synthesis_ref: ResearchArtifactRefV1 | null;
    readonly runtime_context: SynthesisRuntimeContextV1;
    readonly budgets: typeof SYNTHESIS_BUDGET_V1;
    readonly policy_version: 'research-synthesis-input/v1';
    readonly generator_request: {
        readonly purpose: 'research_synthesis';
        readonly output_schema: 'research-synthesis-candidate/v1';
    };
    readonly created_at: string;
    readonly snapshot_digest: `sha256:${string}`;
}
export interface ResearchSynthesisInsightV1 {
    readonly insight_id: string;
    readonly kind: 'conclusion' | 'hypothesis' | 'correction' | 'contradiction' | 'architecture_connection' | 'proposed_decision' | 'open_question';
    readonly epistemic_status: 'observation' | 'inference' | 'hypothesis' | 'proposed_decision';
    readonly statement: string;
    readonly rationale: string;
    readonly evidence_refs: readonly string[];
    readonly prior_semantic_refs: readonly string[];
    readonly confidence: number;
    readonly confidence_rationale: string;
    readonly falsification_condition: string;
    readonly missing_evidence: readonly string[];
    readonly potential_mainline_impact: string;
}
export interface ResearchSynthesisCandidateV1 {
    readonly schema_version: 'research-synthesis-candidate/v1';
    readonly disposition: SynthesisDisposition;
    readonly insights: readonly ResearchSynthesisInsightV1[];
    readonly summary: string;
    readonly limitations: readonly string[];
    readonly memory_context_status: SynthesisMemoryContextStatus;
    readonly generator_provenance: {
        readonly provider: string;
        readonly model: string;
        readonly invocation_id: string | null;
    };
}
export interface ResearchSynthesisAttemptV1 {
    readonly schema_version: 'research-synthesis-attempt/v1';
    readonly synthesis_id: string;
    readonly attempt_ordinal: number;
    readonly input_snapshot_ref: ResearchArtifactRefV1;
    readonly candidate_digest: `sha256:${string}`;
    readonly status: 'accepted' | 'rejected';
    readonly error_codes: readonly string[];
    readonly attempted_at: string;
    readonly attempt_digest: `sha256:${string}`;
}
export interface ResearchSynthesisRevisionV1 extends Omit<ResearchSynthesisCandidateV1, 'schema_version'> {
    readonly schema_version: 'research-synthesis-revision/v1';
    readonly synthesis_id: string;
    readonly revision: number;
    readonly previous_revision_ref: ResearchArtifactRefV1 | null;
    readonly input_snapshot_ref: ResearchArtifactRefV1;
    readonly recorded_at: string;
    readonly revision_digest: `sha256:${string}`;
}
export type ResearchContinuationKind = 'deepen_question' | 'test_hypothesis' | 'address_contradiction' | 'revise_thesis' | 'continue_topic' | 'reframe_topic' | 'split_topic' | 'merge_topic' | 'pause_topic' | 'run_experiment' | 'inspect_code' | 'draft_article_direction';
export interface ResearchContinuationCandidateV1 {
    readonly candidate_id: string;
    readonly kind: ResearchContinuationKind;
    readonly proposal: string;
    readonly rationale: string;
    readonly origin_refs: readonly string[];
    readonly uncertainties: readonly string[];
}
export interface ResearchContinuationProposalV1 {
    readonly schema_version: 'research-continuation-proposal/v1';
    readonly proposal_id: string;
    readonly synthesis_ref: ResearchArtifactRefV1;
    readonly candidates: readonly ResearchContinuationCandidateV1[];
    readonly authority: 'non_authoritative';
    readonly proposed_at: string;
    readonly proposal_digest: `sha256:${string}`;
}
export interface ResearchSynthesisStatusV1 {
    readonly schema_version: 'research-synthesis-status/v1';
    readonly synthesis_id: string;
    readonly phase: 'not_requested' | 'planned' | 'recorded' | 'blocked';
    readonly input_snapshot_ref: ResearchArtifactRefV1 | null;
    readonly latest_revision_ref: ResearchArtifactRefV1 | null;
    readonly attempt_count: number;
    readonly blocked_reason: string | null;
    readonly updated_at: string;
    readonly projection_digest: `sha256:${string}`;
}
export type CreateSynthesisInputSnapshotInput = Omit<SynthesisInputSnapshotV1, 'schema_version' | 'budgets' | 'policy_version' | 'generator_request' | 'snapshot_digest'>;
export type CreateResearchSynthesisAttemptInput = Omit<ResearchSynthesisAttemptV1, 'schema_version' | 'attempt_digest'>;
export type CreateResearchSynthesisRevisionInput = Omit<ResearchSynthesisRevisionV1, 'schema_version' | 'revision_digest'>;
export type CreateResearchContinuationProposalInput = Omit<ResearchContinuationProposalV1, 'schema_version' | 'authority' | 'proposal_digest'>;
export type CreateResearchSynthesisStatusInput = Omit<ResearchSynthesisStatusV1, 'schema_version' | 'projection_digest'>;
