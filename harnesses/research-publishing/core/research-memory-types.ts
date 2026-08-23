import type { ClaimStatus } from './types.js';
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
  | 'candidate_insight_created';

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

export interface PublicationExpressionV1 {
  readonly schema_version: 'publication-expression/v1';
  readonly expression_id: StableId;
  readonly increment_ref: StableRef;
  readonly channel: 'article' | 'x_article' | 'x_thread' | 'x_single' | 'x_reply' | 'gist' | 'github_article';
  readonly language: string;
  readonly derivation_type: 'original' | 'translation' | 'compression' | 'adaptation';
  readonly claim_refs: readonly StableRef[];
  readonly visual_refs: readonly StableRef[];
  readonly intended_content: Readonly<Record<string, unknown>>;
  readonly observed_content: Readonly<Record<string, unknown>> | null;
  readonly verification_level: 'planned' | 'manual_recorded' | 'public_verified' | 'outcome_unknown' | 'conflict';
  readonly platform_refs: readonly StableRef[];
  readonly publication_receipt_ref: StableRef | null;
  readonly published_at: string | null;
  readonly expression_digest: Digest;
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
