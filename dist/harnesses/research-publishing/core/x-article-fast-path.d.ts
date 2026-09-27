import { type XArticlePublicationPlanV1 } from './x-article-publication-plan.js';
import { type XArticlePublicationPreflightV1 } from '../branches/x-article-harness/article-publication-preflight.js';
export type XArticleFastPathDraftTargetV1 = {
    readonly kind: 'new';
} | {
    readonly kind: 'existing';
    readonly draft_id: string;
};
export interface XArticleFastPathAuditV1 {
    readonly schema_version: 'x-article-fast-path-audit/v1';
    readonly protocol: 'x-article-materialization/v3.4';
    readonly target_account: string;
    readonly draft_target: XArticleFastPathDraftTargetV1;
    readonly preflight: XArticlePublicationPreflightV1;
    readonly publication_plan: XArticlePublicationPlanV1;
    readonly time_budget_seconds: 600 | 900;
    readonly recovery_budget_seconds: 120;
    readonly audit_digest: `sha256:${string}`;
}
export interface XArticleFastPathConfirmationV1 {
    readonly schema_version: 'x-article-fast-path-confirmation/v1';
    readonly scope: 'materialize_draft_once';
    readonly audit_digest: `sha256:${string}`;
    readonly target_account: string;
    readonly confirmed_by: string;
    readonly confirmed_at: string;
    readonly expires_at: string;
    readonly confirmation_digest: `sha256:${string}`;
}
export interface CreateXArticleFastPathAuditInput {
    readonly preflight: XArticlePublicationPreflightV1;
    readonly publication_plan: XArticlePublicationPlanV1;
    readonly draft_target: XArticleFastPathDraftTargetV1;
}
export declare function assertXArticleFastPathAudit(audit: XArticleFastPathAuditV1): void;
export declare function createXArticleFastPathAudit(input: CreateXArticleFastPathAuditInput): XArticleFastPathAuditV1;
export declare function confirmXArticleFastPath(audit: XArticleFastPathAuditV1, confirmedBy: string, ttlMs: number, now?: Date): XArticleFastPathConfirmationV1;
export declare function verifyXArticleFastPathConfirmation(audit: XArticleFastPathAuditV1, confirmation: XArticleFastPathConfirmationV1, now?: Date): void;
