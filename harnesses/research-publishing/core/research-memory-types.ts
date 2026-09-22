import type { LegacyClaimStatus as ClaimStatus } from './types.js';
import type { Digest } from './memory-types.js';

export type StableId = string;
export type StableRef = string;
export type PrivacyClassification = 'public' | 'internal' | 'restricted' | 'data_only';

export type ArtifactRole =
  | 'canonical_article'
  | 'research_package'
  | 'claim_map'
  | 'sources'
  | 'boundary'
  | 'lineage'
  | 'article_metadata'
  | 'review_report'
  | 'visual_review_report'
  | 'visual_asset'
  | 'publication_plan'
  | 'publication_receipt'
  | 'publication_expression'
  | 'feedback_snapshot'
  | 'candidate_insight';

export interface ArtifactRefV2Input {
  readonly role: ArtifactRole;
  readonly workspace_relative_path: string;
  readonly digest: Digest;
  readonly media_type: string;
  readonly byte_size: number;
  readonly canonical: boolean;
  readonly privacy_classification: PrivacyClassification;
}

export interface ArtifactRefV2 extends ArtifactRefV2Input {
  readonly schema_version: '2.3';
  readonly object_path: string;
}

export type ResearchEvidenceCaptureEvent =
  | 'working_checkpoint'
  | 'research_package_finalized'
  | 'article_finalized'
  | 'publication_intent_approved'
  | 'publication_receipt_terminal'
  | 'feedback_selected'
  | 'candidate_insight_created'
  | 'research_increment_imported';

export interface ResearchEvidenceSnapshotV1 {
  readonly schema_version: 'research-evidence-snapshot/v1';
  readonly evidence_snapshot_id: StableId;
  readonly increment_id: StableId;
  readonly increment_revision: number;
  readonly capture_event: ResearchEvidenceCaptureEvent;
  readonly capture_kind: 'automatic_terminal' | 'explicit_working_checkpoint' | 'explicit_import';
  readonly workspace_identity_digest: Digest;
  readonly artifact_refs: readonly ArtifactRefV2[];
  readonly source_refs: readonly StableRef[];
  readonly privacy_classification: PrivacyClassification;
  readonly capture_policy_version: 'research-evidence-capture/v1';
  readonly captured_at: string;
  readonly snapshot_digest: Digest;
}

export interface ResearchIncrementRevisionInput {
  readonly increment_id: StableId;
  readonly revision: number;
  readonly track_id: StableId;
  readonly title: string;
  readonly research_question: string;
  readonly thesis: string;
  readonly summary: string;
  readonly document_manifest_refs: readonly StableRef[];
  readonly tags: readonly string[];
  readonly claim_refs: readonly StableRef[];
  readonly decision_refs: readonly StableRef[];
  readonly boundary_refs: readonly StableRef[];
  readonly open_question_refs: readonly StableRef[];
  readonly source_refs: readonly StableRef[];
  readonly evidence_snapshot_refs: readonly StableRef[];
  readonly predecessor_refs: readonly StableRef[];
  readonly created_at: string;
}

export interface ResearchIncrementRevisionV1 extends ResearchIncrementRevisionInput {
  readonly schema_version: 'research-increment-revision/v1';
  readonly content_digest: Digest;
}

export interface ClaimVersionInput {
  readonly claim_id: StableId;
  readonly version: number;
  readonly statement: string;
  readonly claim_status: ClaimStatus;
  readonly canonical_claim_status: ClaimStatus;
  readonly evidence_refs: readonly StableRef[];
  readonly boundary_refs: readonly StableRef[];
  readonly increment_ref: StableRef;
  readonly evolution_refs: readonly StableRef[];
  readonly summary: string;
}

export interface ClaimVersionV1 extends Omit<ClaimVersionInput, 'canonical_claim_status'> {
  readonly schema_version: 'claim-version/v1';
  readonly claim_digest: Digest;
}

export interface ResearchDecisionV1 {
  readonly schema_version: 'research-decision/v1';
  readonly decision_id: StableId;
  readonly statement: string;
  readonly rationale: string;
  readonly alternatives: readonly string[];
  readonly evidence_refs: readonly StableRef[];
  readonly increment_ref: StableRef;
  readonly status: 'active' | 'superseded' | 'retracted';
  readonly decision_digest: Digest;
}

export interface OpenQuestionVersionV1 {
  readonly schema_version: 'open-question-version/v1';
  readonly question_id: StableId;
  readonly version: number;
  readonly question: string;
  readonly why_it_matters: string;
  readonly origin_refs: readonly StableRef[];
  readonly candidate_next_actions: readonly string[];
  readonly status: 'open' | 'investigating' | 'answered' | 'deferred' | 'closed';
  readonly answered_by_ref: StableRef | null;
  readonly question_digest: Digest;
}

export interface ResearchEvolutionEdgeV1 {
  readonly schema_version: 'research-evolution-edge/v1';
  readonly edge_id: StableId;
  readonly from_ref: StableRef;
  readonly to_ref: StableRef;
  readonly relationship: 'supersedes' | 'refines' | 'contradicts' | 'validates' | 'retracts' | 'informed_by';
  readonly rationale: string;
  readonly evidence_refs: readonly StableRef[];
  readonly reviewed_by: string;
  readonly reviewed_at: string;
  readonly edge_digest: Digest;
}

export type PublicationChannel =
  | 'article'
  | 'x_article'
  | 'x_thread'
  | 'x_single'
  | 'x_reply'
  | 'gist'
  | 'github_article';

export interface PublicationIntendedContentV1 {
  readonly approved_plan_ref: StableRef;
  readonly approved_plan_digest: Digest;
  readonly local_content_path: string;
  readonly content_digest: Digest;
  readonly expected_item_order: readonly number[];
  readonly link_refs: readonly StableRef[];
  readonly visual_refs: readonly StableRef[];
}

export interface PublicationObservedContentV1 {
  readonly source: 'public_page' | 'user_report';
  readonly public_url: string;
  readonly platform_ids: readonly StableRef[];
  readonly observed_digest: Digest;
  readonly actual_item_order: readonly number[];
  readonly media_verification: 'matched' | 'unverified' | 'mismatch';
  readonly link_verification: 'matched' | 'unverified' | 'mismatch';
  readonly missing_content: readonly StableRef[];
  readonly unexpected_content: readonly StableRef[];
  readonly mismatches: readonly StableRef[];
}

export interface PublicationExpressionV1 {
  readonly schema_version: 'publication-expression/v1';
  readonly expression_id: StableId;
  readonly increment_ref: StableRef;
  readonly channel: PublicationChannel;
  readonly language: string;
  readonly derivation_type: 'original' | 'translation' | 'compression' | 'adaptation';
  readonly claim_refs: readonly StableRef[];
  readonly visual_refs: readonly StableRef[];
  readonly evidence_snapshot_refs: readonly StableRef[];
  readonly intended_content: PublicationIntendedContentV1;
  readonly observed_content: PublicationObservedContentV1 | null;
  readonly verification_level: 'planned' | 'manual_recorded' | 'public_verified' | 'outcome_unknown' | 'conflict';
  readonly platform_refs: readonly StableRef[];
  readonly publication_receipt_ref: StableRef | null;
  readonly published_at: string | null;
  readonly expression_digest: Digest;
}

export interface OpenQuestionCandidateV1 {
  readonly candidate_id: StableId;
  readonly increment_ref: StableRef;
  readonly question: string;
  readonly rationale: string;
  readonly origin_refs: readonly StableRef[];
  readonly evidence_strength: 'anecdotal' | 'repeated_observation' | 'reproducible';
  readonly limitations: readonly string[];
  readonly data_classification: 'data_only';
}

export interface CanonicalDocumentChunkDescriptorV1 {
  readonly chunk_id: StableId;
  readonly ordinal: number;
  readonly record_path: string;
  readonly chunk_digest: Digest;
  readonly char_start: number;
  readonly char_end: number;
  readonly heading_path: readonly string[];
  readonly byte_size: number;
}

export interface QueryableCanonicalDocumentV1 {
  readonly schema_version: 'queryable-canonical-document/v1';
  readonly document_id: StableId;
  readonly document_role: ArtifactRole;
  readonly increment_ref: StableRef;
  readonly artifact_ref: ArtifactRefV2;
  readonly full_content_digest: Digest;
  readonly chunk_policy_version: 'canonical-markdown-chunks/v1';
  readonly chunks: readonly CanonicalDocumentChunkDescriptorV1[];
  readonly language: string;
  readonly privacy_classification: PrivacyClassification;
  readonly instruction_policy: 'data_only';
  readonly manifest_digest: Digest;
}

export type ResearchLifecycleState = 'working' | 'accepted' | 'published' | 'superseded' | 'retracted';
export type ResearchLifecycleEventType =
  | 'working_checkpointed'
  | 'package_finalized'
  | 'accepted'
  | 'publication_attached'
  | 'superseded'
  | 'retracted';

export interface ResearchLifecycleEventInput {
  readonly event_id: StableId;
  readonly increment_ref: StableRef;
  readonly event_seq: number;
  readonly previous_event_ref: StableRef | null;
  readonly event_type: ResearchLifecycleEventType;
  readonly prior_state: ResearchLifecycleState | null;
  readonly resulting_state: ResearchLifecycleState;
  readonly evidence_refs: readonly StableRef[];
  readonly approval_ref: StableRef | null;
  readonly receipt_ref: StableRef | null;
  readonly occurred_at: string;
}

export interface ResearchLifecycleEventV1 extends ResearchLifecycleEventInput {
  readonly schema_version: 'research-lifecycle-event/v1';
  readonly event_digest: Digest;
}

export interface DerivedResearchLifecycleV1 {
  readonly increment_ref: StableRef;
  readonly state: ResearchLifecycleState;
  readonly latest_event_ref: StableRef;
  readonly next_event_seq: number;
}

export type ResearchIndexView = 'mainline' | 'history' | 'working' | 'publication' | 'feedback';
export type ResearchQueryView = ResearchIndexView;
export type DocumentLoadMode = 'none' | 'supporting_chunks' | 'full_explicit';
export type SemanticOperationType =
  | 'add_record'
  | 'add_revision'
  | 'add_edge'
  | 'change_lifecycle'
  | 'attach_publication'
  | 'attach_feedback'
  | 'open_question'
  | 'close_question'
  | 'retract_record';

export type ResearchRuntimeRecordType =
  | 'research_increment'
  | 'claim_version'
  | 'research_decision'
  | 'open_question'
  | 'publication_expression'
  | 'research_evolution_edge'
  | 'canonical_document_manifest'
  | 'canonical_document_chunk'
  | 'research_lifecycle_event'
  | 'research_index_catalog'
  | 'research_index_shard';

export interface SemanticMemoryOperationV1 {
  readonly operation_id: StableId;
  readonly operation_type: SemanticOperationType;
  readonly target_id: StableId;
  readonly record_type: ResearchRuntimeRecordType;
  readonly target_content: Readonly<Record<string, unknown>>;
  readonly target_content_digest: Digest;
  readonly evidence_refs: readonly StableRef[];
  readonly evidence_privacy_classification: PrivacyClassification;
  readonly target_privacy_classification: PrivacyClassification;
  readonly index_impact: readonly ResearchIndexView[];
}

export interface SemanticMemoryDeltaInput {
  readonly delta_id: StableId;
  readonly increment_ref: StableRef;
  readonly base_catalog_digest: Digest;
  readonly evidence_snapshot_refs: readonly StableRef[];
  readonly proposed_operations: readonly SemanticMemoryOperationV1[];
  readonly generated_by: string;
  readonly generated_at: string;
  readonly policy_version: 'semantic-promotion/v1';
}

export interface SemanticMemoryDeltaV1 extends SemanticMemoryDeltaInput {
  readonly schema_version: 'semantic-memory-delta/v1';
  readonly delta_digest: Digest;
}

export interface SemanticOperationReplacementV1 {
  readonly operation_id: StableId;
  readonly claim_status?: ClaimStatus;
  readonly evidence_refs: readonly StableRef[];
}

export interface SemanticPromotionRejectionV1 {
  readonly operation_id: StableId;
  readonly reason: string;
}

export interface ReviewDeltaInput {
  readonly review_id: StableId;
  readonly accepted_operation_ids: readonly StableId[];
  readonly rejected_operation_ids: readonly StableId[];
  readonly rejection_reasons: readonly SemanticPromotionRejectionV1[];
  readonly operation_replacements: readonly SemanticOperationReplacementV1[];
  readonly reviewer: string;
  readonly reviewed_at: string;
}

export interface SemanticPromotionReviewV1 extends ReviewDeltaInput {
  readonly schema_version: 'semantic-promotion-review/v1';
  readonly delta_id: StableId;
  readonly delta_digest: Digest;
  readonly review_digest: Digest;
}

export interface PromotionArtifactRefV2 {
  readonly relative_path: string;
  readonly digest: Digest;
}

export interface PromotionRecordOperationV2 {
  readonly operation_id: StableId;
  readonly record_type: ResearchRuntimeRecordType;
  readonly variables: Readonly<Record<string, string>>;
  readonly refs: Readonly<Record<string, string>>;
  readonly content_artifact: PromotionArtifactRefV2;
  readonly expected_digest: Digest;
  readonly write_mode: 'create_only' | 'update_allowed';
}

export type ResearchPromotionAction =
  | 'validate_mapping'
  | 'verify_evidence'
  | 'copy_source'
  | 'write_semantic_records'
  | 'write_document_records'
  | 'register_artifact'
  | 'append_log'
  | 'write_index_shards'
  | 'recheck_base_catalog'
  | 'commit_catalog';

export interface MemoryPromotionPlanV2 {
  readonly schema_version: 'memory-promotion-plan/v2';
  readonly kind: 'research_increment_promotion';
  readonly plan_id: StableId;
  readonly track_id: StableId;
  readonly workspace_identity_digest: Digest;
  readonly runtime_requirement: Readonly<{ name: 'llm-wiki-runtime'; version: '0.2.0' | '0.3.0' }>;
  readonly profile_digest: Digest;
  readonly mapping_digest: Digest;
  readonly scp_digests: readonly Digest[];
  readonly evidence_snapshots: ReadonlyArray<{ readonly ref: StableRef; readonly digest: Digest }>;
  readonly delta_ref: StableRef;
  readonly delta_digest: Digest;
  readonly review_ref: StableRef;
  readonly review_digest: Digest;
  readonly base_catalog_ref: StableRef | null;
  readonly base_catalog_digest: Digest;
  readonly source_artifact: PromotionArtifactRefV2;
  readonly immutable_record_operations: readonly PromotionRecordOperationV2[];
  readonly document_record_operations: readonly PromotionRecordOperationV2[];
  readonly index_shard_operations: readonly PromotionRecordOperationV2[];
  readonly catalog_operation: PromotionRecordOperationV2;
  readonly artifact_operation: Readonly<{ artifact_id: StableId; artifact_type: 'research_promotion' }>;
  readonly log_event: Readonly<{ event_id: StableId; log_type: 'memory_event' }>;
  readonly action_sequence: readonly ResearchPromotionAction[];
  readonly expected_final_catalog_digest: Digest;
  readonly planned_at: string;
  readonly plan_digest: Digest;
}

export interface MemoryPromotionApprovalV2 {
  readonly schema_version: 'memory-promotion-approval/v2';
  readonly approval_id: StableId;
  readonly plan_id: StableId;
  readonly plan_digest: Digest;
  readonly review_digest: Digest;
  readonly workspace_identity_digest: Digest;
  readonly confirmation_text: string;
  readonly approved_action: 'promote_once';
  readonly approved_by: string;
  readonly approved_at: string;
  readonly expires_at: string;
  readonly approval_digest: Digest;
}

export type MemoryPromotionStepStatus =
  | 'pending'
  | 'started'
  | 'succeeded'
  | 'already_exists'
  | 'failed'
  | 'uncertain';

export interface MemoryPromotionReceiptV2 {
  readonly schema_version: 'memory-promotion-receipt/v2';
  readonly receipt_id: StableId;
  readonly plan_id: StableId;
  readonly plan_digest: Digest;
  readonly approval_digest: Digest;
  readonly runtime_version: '0.2.0' | '0.3.0';
  readonly status: 'complete' | 'partial' | 'failed' | 'reconciliation_required';
  readonly steps: ReadonlyArray<{
    readonly name: ResearchPromotionAction;
    readonly status: MemoryPromotionStepStatus;
    readonly artifact_ref: StableRef | null;
    readonly checksum: Digest | null;
    readonly error_code: string | null;
    readonly runtime_status: string | null;
  }>;
  readonly record_refs: readonly StableRef[];
  readonly prior_catalog_digest: Digest;
  readonly final_catalog_digest: Digest | null;
  readonly reconciliation_required: boolean;
  readonly resume_cursor: ResearchPromotionAction | null;
  readonly receipt_digest: Digest;
}
