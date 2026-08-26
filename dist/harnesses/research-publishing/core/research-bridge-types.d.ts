import type { ResearchArtifactRefV1, ClaimBoundaryStatus } from './research-program-types.js';
import type { LegacyClaimStatus } from './types.js';
export interface ClaimProjectionItemV1 {
    readonly source_claim_ref: string;
    readonly source_claim_id: string;
    readonly statement_digest: `sha256:${string}`;
    readonly source_status: ClaimBoundaryStatus;
    readonly candidate_claim_ref: string;
    readonly candidate_status: LegacyClaimStatus;
    readonly evidence_refs: readonly string[];
    readonly projection_rule: 'package-to-memory-claim/v1';
    readonly loss_note: string;
}
export interface ClaimProjectionV1 {
    readonly schema_version: 'claim-projection/v1';
    readonly projection_id: string;
    readonly outcome_ref: ResearchArtifactRefV1;
    readonly package_ref: ResearchArtifactRefV1;
    readonly items: readonly ClaimProjectionItemV1[];
    readonly projected_at: string;
    readonly projection_digest: `sha256:${string}`;
}
export interface WeeklyResearchIncrementBindingV1 {
    readonly schema_version: 'weekly-research-increment-binding/v1';
    readonly cycle_id: string;
    readonly outcome_ref: ResearchArtifactRefV1;
    readonly claim_projection_ref: ResearchArtifactRefV1;
    readonly track_id: string;
    readonly increment_id: string;
    readonly increment_ref: string;
    readonly increment_revision_ref: ResearchArtifactRefV1;
    readonly binding_policy: 'one-outcome-one-increment/v1';
    readonly bound_at: string;
    readonly binding_digest: `sha256:${string}`;
}
export type WeeklyResearchBridgePhase = 'pending' | 'in_progress' | 'complete' | 'blocked';
export interface WeeklyResearchBridgeStatusV1 {
    readonly schema_version: 'weekly-research-bridge-status/v1';
    readonly cycle_id: string;
    readonly phase: WeeklyResearchBridgePhase;
    readonly outcome_ref: ResearchArtifactRefV1;
    readonly claim_projection_ref: ResearchArtifactRefV1 | null;
    readonly increment_binding_ref: ResearchArtifactRefV1 | null;
    readonly article_expression_ref: ResearchArtifactRefV1 | null;
    readonly article_evidence_ref: string | null;
    readonly single_expression_ref: ResearchArtifactRefV1 | null;
    readonly single_evidence_ref: string | null;
    readonly blocked_reason: string | null;
    readonly updated_at: string;
    readonly projection_digest: `sha256:${string}`;
}
export type CreateClaimProjectionInput = Omit<ClaimProjectionV1, 'schema_version' | 'projection_digest'>;
export type CreateWeeklyResearchIncrementBindingInput = Omit<WeeklyResearchIncrementBindingV1, 'schema_version' | 'binding_policy' | 'binding_digest'>;
export type CreateWeeklyResearchBridgeStatusInput = Omit<WeeklyResearchBridgeStatusV1, 'schema_version' | 'projection_digest'>;
