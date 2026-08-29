import type { ResearchArtifactRefV1, ResearchStreamId } from './research-program-types.js';
export interface WeeklyPublishedChildV1 {
    readonly plan_ref: ResearchArtifactRefV1;
    readonly receipt_ref: ResearchArtifactRefV1;
    readonly public_url: string;
    readonly published_at: string;
    readonly verification_status: string;
    readonly limitations: readonly string[];
}
export interface WeeklyPublicationOutcomeV1 {
    readonly schema_version: 'weekly-publication-outcome/v1';
    readonly outcome_id: string;
    readonly cycle_ref: ResearchArtifactRefV1;
    readonly roadmap_ref: ResearchArtifactRefV1;
    readonly topic_ref: ResearchArtifactRefV1;
    readonly selection_ref: ResearchArtifactRefV1;
    readonly research_content_package_ref: ResearchArtifactRefV1;
    readonly weekly_article_ref: ResearchArtifactRefV1;
    readonly article_package_ref: ResearchArtifactRefV1;
    readonly bundle_plan_ref: ResearchArtifactRefV1;
    readonly bundle_approval_ref: ResearchArtifactRefV1;
    readonly bundle_receipt_ref: ResearchArtifactRefV1;
    readonly article: WeeklyPublishedChildV1;
    readonly single: WeeklyPublishedChildV1;
    readonly public_urls: readonly [string, string];
    readonly research_stream_ids: readonly ResearchStreamId[];
    readonly package_claim_refs: readonly string[];
    readonly package_evidence_refs: readonly string[];
    readonly package_boundary_refs: readonly string[];
    readonly package_open_question_refs: readonly string[];
    readonly issued_at: string;
    readonly outcome_digest: `sha256:${string}`;
}
export interface WeeklyOutcomeClosureV1 {
    readonly schema_version: 'weekly-outcome-closure/v1';
    readonly outcome_ref: ResearchArtifactRefV1;
    readonly released_topic_ref: ResearchArtifactRefV1;
    readonly status: 'complete';
    readonly closed_at: string;
    readonly closure_digest: `sha256:${string}`;
}
export type WeeklyOutcomePhase = 'pending' | 'complete' | 'conflict';
export interface WeeklyOutcomeStatusV1 {
    readonly schema_version: 'weekly-outcome-status/v1';
    readonly cycle_id: string;
    readonly phase: WeeklyOutcomePhase;
    readonly outcome_ref: ResearchArtifactRefV1 | null;
    readonly released_topic_ref: ResearchArtifactRefV1 | null;
    readonly blocked_reason: string | null;
    readonly updated_at: string;
    readonly projection_digest: `sha256:${string}`;
}
export interface AssembleWeeklyOutcomeInput {
    readonly cycle_id: string;
}
export interface ResumeWeeklyOutcomeInput {
    readonly cycle_id: string;
}
export type CreateWeeklyPublicationOutcomeInput = Omit<WeeklyPublicationOutcomeV1, 'schema_version' | 'public_urls' | 'outcome_digest'>;
export type CreateWeeklyOutcomeClosureInput = Omit<WeeklyOutcomeClosureV1, 'schema_version' | 'status' | 'closure_digest'>;
export type CreateWeeklyOutcomeStatusInput = Omit<WeeklyOutcomeStatusV1, 'schema_version' | 'projection_digest'>;
