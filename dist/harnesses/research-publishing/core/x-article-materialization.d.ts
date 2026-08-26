import { type XArticleImportTemplateV1 } from '../adapters/x/article-browser/article-import-template.js';
import { type XArticlePublicationPlanV1 } from './x-article-publication-plan.js';
export type XArticleMaterializationStrategy = 'rich_text_anchor_import/v1' | 'block_materialization/v1';
export interface XArticleMaterializationPlanV1 {
    readonly schema_version: 'x-article-materialization-plan/v1';
    readonly execution_id: string;
    readonly publication_plan_digest: `sha256:${string}`;
    readonly target_account: string;
    readonly strategy: XArticleMaterializationStrategy;
    readonly document_digest: `sha256:${string}`;
    readonly import_template_digest: `sha256:${string}`;
    readonly visual_anchors: readonly XArticleMaterializationAnchorV1[];
    readonly expected_command_ceiling: number;
    readonly expected_observation_ceiling: number;
    readonly budget: {
        readonly fixed_seconds: 180;
        readonly per_inline_visual_seconds: 60;
        readonly no_progress_seconds: 20;
    };
    readonly materialization_digest: `sha256:${string}`;
}
export interface XArticleMaterializationAnchorV1 {
    readonly anchor_id: string;
    readonly asset_id: string;
    readonly block_ordinal: number;
    readonly asset_digest: `sha256:${string}`;
    readonly alt_text: string;
    readonly context_digest: `sha256:${string}`;
}
export interface XArticleMediaCheckpointV1 {
    readonly anchor_id: string;
    readonly asset_id: string;
    readonly block_ordinal: number;
    readonly asset_digest: `sha256:${string}`;
    readonly status: 'pending' | 'upload_started' | 'inserted' | 'alt_verified' | 'completed' | 'ambiguous';
    readonly observed_media_ref: string | null;
    readonly observed_context_digest: `sha256:${string}` | null;
}
export type XArticleMaterializationPhase = 'preflight_pending' | 'preflight_passed' | 'draft_bound' | 'article_shell_ready' | 'body_imported' | 'body_verified' | 'media_materializing' | 'draft_reconciled' | 'preview_verified' | 'human_confirmed' | 'publish_submitted' | 'public_verified' | 'blocked';
export interface XArticleMaterializationCheckpointV1 {
    readonly schema_version: 'x-article-materialization-checkpoint/v1';
    readonly execution_id: string;
    readonly draft_id: string | null;
    readonly materialization_digest: `sha256:${string}`;
    readonly revision: number;
    readonly phase: XArticleMaterializationPhase;
    readonly body: {
        readonly status: 'pending' | 'issued' | 'verified';
        readonly observed_digest: `sha256:${string}` | null;
    };
    readonly media: readonly XArticleMediaCheckpointV1[];
    readonly last_editor_revision: `sha256:${string}` | null;
    readonly publish_confirmation: 'absent' | 'armed' | 'consumed';
    readonly updated_at: string;
}
export interface XArticleStageProgressV1 {
    readonly schema_version: 'x-article-materialization-progress/v1';
    readonly execution_id: string;
    readonly stage: string;
    readonly asset_id: string | null;
    readonly elapsed_seconds: number;
    readonly waiting_for: string | null;
    readonly retry_count: number;
    readonly observed_effect: 'none' | 'partial' | 'complete' | 'unknown';
    readonly recorded_at: string;
}
export interface XArticleMaterializationReceiptV1 {
    readonly schema_version: 'x-article-materialization-receipt/v1';
    readonly execution_id: string;
    readonly draft_id: string;
    readonly materialization_digest: `sha256:${string}`;
    readonly strategy: XArticleMaterializationStrategy;
    readonly body_block_count: number;
    readonly inline_image_count: number;
    readonly stage_seconds: Readonly<Record<string, number>>;
    readonly automation_seconds: number;
    readonly human_wait_seconds: number;
    readonly command_count: number;
    readonly command_ceiling: number;
    readonly observation_count: number;
    readonly observation_ceiling: number;
    readonly retry_count: number;
    readonly recovery_count: number;
    readonly within_budget: boolean;
    readonly preview_revision: `sha256:${string}`;
    readonly supersedes_receipt_digest: `sha256:${string}` | null;
    readonly issued_at: string;
    readonly receipt_digest: `sha256:${string}`;
}
export interface XArticleMaterializationStartEvidenceV1 {
    readonly schema_version: 'x-article-materialization-start/v1';
    readonly execution_id: string;
    readonly publication_plan_digest: `sha256:${string}`;
    readonly materialization_digest: `sha256:${string}`;
    readonly started_at: string;
    readonly start_digest: `sha256:${string}`;
}
export interface CreateXArticleMaterializationPlanInput {
    readonly execution_id: string;
    readonly publication_plan: XArticlePublicationPlanV1;
    readonly import_template: XArticleImportTemplateV1;
    readonly strategy: XArticleMaterializationStrategy;
}
export interface CreateInitialXArticleMaterializationCheckpointInput {
    readonly plan: XArticleMaterializationPlanV1;
    readonly updated_at: string;
}
export type CreateXArticleStageProgressInput = Omit<XArticleStageProgressV1, 'schema_version'>;
export interface CreateXArticleMaterializationReceiptInput {
    readonly plan: XArticleMaterializationPlanV1;
    readonly checkpoint: XArticleMaterializationCheckpointV1;
    readonly progress: readonly XArticleStageProgressV1[];
    readonly cover_asset_id: string | null;
    readonly body_block_count: number;
    readonly command_count: number;
    readonly observation_count: number;
    readonly automation_started_at: string;
    readonly preview_verified_at: string;
    readonly human_wait_seconds: number;
    readonly preview_revision: `sha256:${string}`;
    readonly issued_at: string;
}
export interface CreateSupersedingXArticleMaterializationReceiptInput {
    readonly preview_receipt: XArticleMaterializationReceiptV1;
    readonly expected_preview_receipt_digest: `sha256:${string}`;
    readonly human_wait_seconds: number;
    readonly issued_at: string;
}
export interface CreateXArticleMaterializationStartEvidenceInput {
    readonly plan: XArticleMaterializationPlanV1;
    readonly started_at: string;
}
export declare function createXArticleMaterializationPlan(input: CreateXArticleMaterializationPlanInput): XArticleMaterializationPlanV1;
export declare function createInitialXArticleMaterializationCheckpoint(input: CreateInitialXArticleMaterializationCheckpointInput): XArticleMaterializationCheckpointV1;
export declare function createXArticleStageProgress(input: CreateXArticleStageProgressInput): XArticleStageProgressV1;
export declare function createXArticleMaterializationStartEvidence(input: CreateXArticleMaterializationStartEvidenceInput): XArticleMaterializationStartEvidenceV1;
export declare function verifyXArticleMaterializationStartEvidence(evidence: XArticleMaterializationStartEvidenceV1, plan: XArticleMaterializationPlanV1): XArticleMaterializationStartEvidenceV1;
export declare function createXArticleMaterializationReceipt(input: CreateXArticleMaterializationReceiptInput): XArticleMaterializationReceiptV1;
export declare function createSupersedingXArticleMaterializationReceipt(input: CreateSupersedingXArticleMaterializationReceiptInput): XArticleMaterializationReceiptV1;
