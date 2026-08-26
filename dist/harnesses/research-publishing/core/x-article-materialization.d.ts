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
export declare function createXArticleMaterializationPlan(input: CreateXArticleMaterializationPlanInput): XArticleMaterializationPlanV1;
export declare function createInitialXArticleMaterializationCheckpoint(input: CreateInitialXArticleMaterializationCheckpointInput): XArticleMaterializationCheckpointV1;
export declare function createXArticleStageProgress(input: CreateXArticleStageProgressInput): XArticleStageProgressV1;
