export type Digest = `sha256:${string}`;

export type MemoryQueryState =
  | 'created'
  | 'config_resolved'
  | 'query_planned'
  | 'context_loaded'
  | 'context_reviewed'
  | 'package_bound'
  | 'memory_unavailable'
  | 'memory_not_applied'
  | 'query_failed';

export type MemoryIngestState =
  | 'publication_captured'
  | 'feedback_captured'
  | 'insight_proposed'
  | 'evidence_reviewed'
  | 'ingest_previewed'
  | 'ingest_approved'
  | 'source_copied'
  | 'records_written'
  | 'artifacts_registered'
  | 'log_appended'
  | 'finalized'
  | 'partial_failure'
  | 'failed'
  | 'approval_stale';

export type MemoryContextV1 = Readonly<{
  query_plan_digest: Digest | null;
  context_snapshot_digest: Digest | null;
  context_refs: readonly string[];
  status: 'applied' | 'reviewed_not_applied' | 'memory_unavailable' | 'not_configured';
  reviewer: string | null;
  reviewed_at: string | null;
}>;

export type MemoryContextV2 = Readonly<{
  schema_version: 'memory-context/v2';
  research_query_plan_digest: Digest;
  research_context_snapshot_digest: Digest;
  context_refs: readonly string[];
  status: 'applied' | 'reviewed_not_applied';
  reviewer: string;
  reviewed_at: string;
}>;

export interface MemoryQueryPlanInput {
  readonly research_track: string;
  readonly purpose: 'candidate_enrichment' | 'feedback_followup';
  readonly primary_domain: 'research-publishing';
  readonly allowed_paths: readonly string[];
  readonly query_terms: readonly string[];
  readonly context_budget: Readonly<{
    max_items: number;
    max_chars: number;
    max_item_chars: number;
  }>;
  readonly ordering_policy: 'path_asc';
  readonly profile_digest: Digest;
  readonly scp_digest: Digest;
  readonly runtime_requirement: Readonly<{
    name: 'llm-wiki-runtime';
    version: '0.2.0';
  }>;
}

export interface MemoryQueryPlanV1 extends MemoryQueryPlanInput {
  readonly schema_version: 'memory-query-plan/v1';
  readonly query_id: string;
  readonly run_id: string;
  readonly action: 'query_once';
  readonly created_at: string;
  readonly plan_digest: Digest;
}

export interface RuntimeContextItem {
  readonly path: string;
  readonly checksum: Digest;
  readonly content: string;
  readonly instruction_policy: 'data_only';
  readonly sanitized: boolean;
  readonly risk_flags: readonly string[];
}

export interface RuntimeContextResult {
  readonly status: 'loaded' | 'empty' | 'unavailable' | 'failed';
  readonly runtime_version: '0.2.0' | null;
  readonly items: readonly RuntimeContextItem[];
  readonly excluded_count: number;
  readonly truncated_count: number;
}

export interface ContextSnapshotItemV1 {
  readonly ordinal: number;
  readonly context_ref: string;
  readonly relative_path: string;
  readonly content_checksum: Digest;
  readonly excerpt_checksum: Digest;
  readonly excerpt: string;
  readonly classification: 'data_only';
  readonly sanitized: boolean;
  readonly risk_flags: readonly string[];
}

export interface ContextSnapshotV1 {
  readonly schema_version: 'context-snapshot/v1';
  readonly snapshot_id: string;
  readonly query_plan_digest: Digest;
  readonly runtime_version: '0.2.0' | null;
  readonly status: RuntimeContextResult['status'];
  readonly items: readonly ContextSnapshotItemV1[];
  readonly excluded_count: number;
  readonly truncated_count: number;
  readonly total_chars: number;
  readonly snapshot_digest: Digest;
}

export interface PublicationFeedbackSnapshotV1 {
  readonly schema_version: 'publication-feedback-snapshot/v1';
  readonly feedback_snapshot_id: string;
  readonly publication_receipt_id: string;
  readonly publication_receipt_digest: Digest;
  readonly publication_kind: 'x_single' | 'x_thread' | 'x_reply' | 'x_article' | 'article';
  readonly public_url: string;
  readonly account: string;
  readonly observed_at: string;
  readonly selection_actor: string;
  readonly selection_reason: string;
  readonly entries: ReadonlyArray<{
    readonly ordinal: number;
    readonly public_url: string;
    readonly platform_id: string;
    readonly author: string;
    readonly observed_text: string;
    readonly observed_text_checksum: Digest;
    readonly observed_metrics: Readonly<Record<string, number>>;
    readonly data_classification: 'data_only';
  }>;
  readonly snapshot_digest: Digest;
}

export interface CandidateInsightProposalV1 {
  readonly schema_version: 'candidate-insight-proposal/v1';
  readonly proposal_id: string;
  readonly research_track: string;
  readonly insight_type:
    | 'counterexample'
    | 'research_question'
    | 'claim_candidate'
    | 'audience_signal'
    | 'format_signal'
    | 'visual_signal';
  readonly proposition: string;
  readonly source_refs: readonly string[];
  readonly affected_claim_refs: readonly string[];
  readonly evidence_strength: 'anecdotal' | 'repeated_observation' | 'reproducible';
  readonly confidence: number;
  readonly boundary_note: string;
  readonly alternative_explanations: readonly string[];
  readonly recommended_disposition: 'investigate' | 'preserve_as_signal' | 'reject' | 'defer';
  readonly created_by_skill: 'article-publishing-copilot' | 'x-publishing-copilot';
  readonly proposal_digest: Digest;
}

export interface MemoryArtifactRefV1 {
  readonly relative_path: string;
  readonly digest: Digest;
}

export interface MemoryIngestPlanV1 {
  readonly schema_version: 'memory-ingest-plan/v1';
  readonly ingest_id: string;
  readonly ingest_kind: 'publication_checkpoint' | 'feedback_insight';
  readonly research_track: string;
  readonly source_publication_receipt_digest: Digest;
  readonly source_feedback_snapshot_digest: Digest | null;
  readonly candidate_insight_digests: readonly Digest[];
  readonly target_domain: 'research-publishing';
  readonly target_profile: 'research-publishing';
  readonly workspace_identity_digest: Digest;
  readonly runtime_version: '0.2.0';
  readonly record_operations: ReadonlyArray<{
    readonly operation_id: string;
    readonly record_type: 'publication_evidence' | 'feedback_snapshot' | 'candidate_insight';
    readonly variables: Readonly<Record<string, string>>;
    readonly refs: Readonly<Record<string, string>>;
    readonly content_artifact: MemoryArtifactRefV1;
  }>;
  readonly source_artifact: MemoryArtifactRefV1;
  readonly artifact_operation: Readonly<{
    artifact_type: 'publication_receipt' | 'memory_ingest_receipt';
    artifact_id: string;
  }>;
  readonly log_event: Readonly<{
    log_type: 'memory_event';
    event_id: string;
  }>;
  readonly mapping_digest: Digest;
  readonly profile_digest: Digest;
  readonly scp_digest: Digest;
  readonly action: 'ingest_confirmed';
  readonly plan_digest: Digest;
}

export interface MemoryIngestApprovalV1 {
  readonly schema_version: 'memory-ingest-approval/v1';
  readonly approval_id: string;
  readonly ingest_plan_digest: Digest;
  readonly workspace_identity_digest: Digest;
  readonly target_domain: 'research-publishing';
  readonly target_profile: 'research-publishing';
  readonly approved_action: 'ingest_confirmed';
  readonly approved_by: string;
  readonly approved_at: string;
  readonly expires_at: string;
  readonly approval_digest: Digest;
}

export type MemoryIngestStepName =
  | 'validate_mapping'
  | 'copy_source'
  | 'write_records'
  | 'register_artifact'
  | 'append_log';

export interface MemoryIngestReceiptV1 {
  readonly schema_version: 'memory-ingest-receipt/v1';
  readonly receipt_id: string;
  readonly ingest_plan_digest: Digest;
  readonly approval_digest: Digest;
  readonly runtime_version: '0.2.0';
  readonly status: 'succeeded' | 'already_exists' | 'partial' | 'failed';
  readonly steps: ReadonlyArray<{
    readonly name: MemoryIngestStepName;
    readonly status: 'pending' | 'succeeded' | 'already_exists' | 'failed';
    readonly artifact_ref: string | null;
    readonly checksum: Digest | null;
    readonly error_code: string | null;
  }>;
  readonly records: readonly MemoryArtifactRefV1[];
  readonly log_event_ref: string | null;
  readonly resume_cursor: MemoryIngestStepName | null;
  readonly receipt_digest: Digest;
}
