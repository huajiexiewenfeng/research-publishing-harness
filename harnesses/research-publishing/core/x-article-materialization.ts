import {
  createXArticleImportTemplate,
  type XArticleImportTemplateV1
} from '../adapters/x/article-browser/article-import-template.js';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import {
  assertXArticlePublicationPlan,
  type XArticlePublicationPlanV1
} from './x-article-publication-plan.js';

export type XArticleMaterializationStrategy =
  | 'rich_text_anchor_import/v1'
  | 'block_materialization/v1';

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
  readonly status:
    | 'pending'
    | 'upload_started'
    | 'inserted'
    | 'alt_verified'
    | 'completed'
    | 'ambiguous';
  readonly observed_media_ref: string | null;
  readonly observed_context_digest: `sha256:${string}` | null;
}

export type XArticleMaterializationPhase =
  | 'preflight_pending'
  | 'preflight_passed'
  | 'draft_bound'
  | 'article_shell_ready'
  | 'body_imported'
  | 'body_verified'
  | 'media_materializing'
  | 'draft_reconciled'
  | 'preview_verified'
  | 'human_confirmed'
  | 'publish_submitted'
  | 'public_verified'
  | 'blocked';

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

export type CreateXArticleStageProgressInput = Omit<
  XArticleStageProgressV1,
  'schema_version'
>;

const MATERIALIZATION_BUDGET = {
  fixed_seconds: 180,
  per_inline_visual_seconds: 60,
  no_progress_seconds: 20
} as const;

function assertImportTemplateMatchesPlan(
  publicationPlan: XArticlePublicationPlanV1,
  importTemplate: XArticleImportTemplateV1
): XArticleImportTemplateV1 {
  const expectedDocumentDigest = sha256(publicationPlan.intent.document);
  const canonicalTemplate = createXArticleImportTemplate(publicationPlan.intent.document);
  const templateBody = Object.fromEntries(
    Object.entries(importTemplate).filter(([key]) => key !== 'template_digest')
  );
  if (
    importTemplate.source_document_digest !== expectedDocumentDigest
    || importTemplate.template_digest !== sha256(templateBody)
    || importTemplate.template_digest !== canonicalTemplate.template_digest
  ) {
    throw new HarnessError(
      'ARTICLE_MATERIALIZATION_DRIFT',
      'X Article import template does not match the locked publication document'
    );
  }
  return canonicalTemplate;
}

function materializationAnchor(
  publicationPlan: XArticlePublicationPlanV1,
  importTemplate: XArticleImportTemplateV1,
  index: number
): XArticleMaterializationAnchorV1 {
  const anchor = importTemplate.anchors[index]!;
  const binding = publicationPlan.intent.visuals.find((candidate) =>
    candidate.placement.kind === 'block'
    && candidate.placement.block_ordinal === anchor.block_ordinal
    && candidate.asset.asset_id === anchor.asset_id
  );
  if (binding === undefined) {
    throw new HarnessError(
      'ARTICLE_ASSET_MISMATCH',
      `X Article materialization anchor ${anchor.anchor_id} has no locked visual binding`
    );
  }

  const templateBlock = importTemplate.blocks[anchor.block_ordinal - 1];
  if (
    templateBlock === undefined
    || templateBlock.kind !== 'visual_anchor'
    || templateBlock.anchor_id !== anchor.anchor_id
    || templateBlock.marker !== anchor.marker
  ) {
    throw new HarnessError(
      'ARTICLE_MATERIALIZATION_DRIFT',
      `X Article import template anchor ${anchor.anchor_id} is inconsistent`
    );
  }

  return {
    anchor_id: anchor.anchor_id,
    asset_id: anchor.asset_id,
    block_ordinal: anchor.block_ordinal,
    asset_digest: binding.asset.digest,
    alt_text: binding.asset.alt_text,
    context_digest: sha256({
      previous_block: importTemplate.blocks[anchor.block_ordinal - 2] ?? null,
      anchor_block: templateBlock,
      next_block: importTemplate.blocks[anchor.block_ordinal] ?? null
    })
  };
}

export function createXArticleMaterializationPlan(
  input: CreateXArticleMaterializationPlanInput
): XArticleMaterializationPlanV1 {
  assertXArticlePublicationPlan(input.publication_plan);
  const canonicalImportTemplate = assertImportTemplateMatchesPlan(
    input.publication_plan,
    input.import_template
  );

  const visualAnchors = canonicalImportTemplate.anchors.map((_anchor, index) =>
    materializationAnchor(input.publication_plan, canonicalImportTemplate, index)
  );
  const body = {
    schema_version: 'x-article-materialization-plan/v1' as const,
    execution_id: input.execution_id,
    publication_plan_digest: input.publication_plan.plan_digest as `sha256:${string}`,
    target_account: input.publication_plan.intent.target_account,
    strategy: input.strategy,
    document_digest: canonicalImportTemplate.source_document_digest as `sha256:${string}`,
    import_template_digest: canonicalImportTemplate.template_digest as `sha256:${string}`,
    visual_anchors: visualAnchors,
    expected_command_ceiling: 12 + visualAnchors.length,
    expected_observation_ceiling: 9 + visualAnchors.length,
    budget: MATERIALIZATION_BUDGET
  };
  return validateContract<XArticleMaterializationPlanV1>('x-article-materialization-plan', {
    ...body,
    materialization_digest: sha256(body)
  });
}

export function createInitialXArticleMaterializationCheckpoint(
  input: CreateInitialXArticleMaterializationCheckpointInput
): XArticleMaterializationCheckpointV1 {
  validateContract<XArticleMaterializationPlanV1>('x-article-materialization-plan', input.plan);
  return validateContract<XArticleMaterializationCheckpointV1>(
    'x-article-materialization-checkpoint',
    {
      schema_version: 'x-article-materialization-checkpoint/v1',
      execution_id: input.plan.execution_id,
      draft_id: null,
      materialization_digest: input.plan.materialization_digest,
      revision: 0,
      phase: 'preflight_pending',
      body: { status: 'pending', observed_digest: null },
      media: input.plan.visual_anchors.map((anchor) => ({
        anchor_id: anchor.anchor_id,
        asset_id: anchor.asset_id,
        block_ordinal: anchor.block_ordinal,
        asset_digest: anchor.asset_digest,
        status: 'pending',
        observed_media_ref: null,
        observed_context_digest: null
      })),
      last_editor_revision: null,
      publish_confirmation: 'absent',
      updated_at: input.updated_at
    }
  );
}

export function createXArticleStageProgress(
  input: CreateXArticleStageProgressInput
): XArticleStageProgressV1 {
  return validateContract<XArticleStageProgressV1>('x-article-materialization-progress', {
    schema_version: 'x-article-materialization-progress/v1',
    ...input
  });
}
