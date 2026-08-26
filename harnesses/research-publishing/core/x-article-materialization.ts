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

export interface CreateXArticleMaterializationReceiptInput {
  readonly plan: XArticleMaterializationPlanV1;
  readonly checkpoint: XArticleMaterializationCheckpointV1;
  readonly progress: readonly XArticleStageProgressV1[];
  readonly body_block_count: number;
  readonly command_count: number;
  readonly observation_count: number;
  readonly automation_started_at: string;
  readonly preview_verified_at: string;
  readonly human_wait_seconds: number;
  readonly preview_revision: `sha256:${string}`;
  readonly supersedes_receipt_digest: `sha256:${string}` | null;
  readonly issued_at: string;
}

export interface CreateSupersedingXArticleMaterializationReceiptInput {
  readonly preview_receipt: XArticleMaterializationReceiptV1;
  readonly human_wait_seconds: number;
  readonly issued_at: string;
}

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

function finiteNonnegative(value: number, label: string, integer = false): void {
  if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    throw new HarnessError('CONTRACT_INVALID', `${label} must be a finite nonnegative${integer ? ' integer' : ''}`);
  }
}

function receiptBody(
  receipt: XArticleMaterializationReceiptV1
): Omit<XArticleMaterializationReceiptV1, 'receipt_digest'> {
  return Object.fromEntries(
    Object.entries(receipt).filter(([key]) => key !== 'receipt_digest')
  ) as Omit<XArticleMaterializationReceiptV1, 'receipt_digest'>;
}

function validatePreviewEvidence(
  plan: XArticleMaterializationPlanV1,
  checkpoint: XArticleMaterializationCheckpointV1
): void {
  const mediaMatches = checkpoint.media.length === plan.visual_anchors.length
    && checkpoint.media.every((entry, index) => {
      const anchor = plan.visual_anchors[index];
      return anchor !== undefined
        && entry.anchor_id === anchor.anchor_id
        && entry.asset_id === anchor.asset_id
        && entry.block_ordinal === anchor.block_ordinal
        && entry.asset_digest === anchor.asset_digest
        && entry.status === 'completed'
        && entry.observed_media_ref !== null
        && entry.observed_context_digest === anchor.context_digest;
    });
  const mediaRefs = checkpoint.media.map((entry) => entry.observed_media_ref);
  if (
    checkpoint.execution_id !== plan.execution_id
    || checkpoint.materialization_digest !== plan.materialization_digest
    || checkpoint.draft_id === null
    || checkpoint.phase !== 'preview_verified'
    || checkpoint.body.status !== 'verified'
    || checkpoint.body.observed_digest !== plan.import_template_digest
    || checkpoint.last_editor_revision === null
    || checkpoint.publish_confirmation !== 'absent'
    || !mediaMatches
    || new Set(mediaRefs).size !== mediaRefs.length
  ) {
    throw new HarnessError(
      'ARTICLE_CHECKPOINT_CONFLICT',
      'X Article materialization receipt lacks complete Preview checkpoint evidence'
    );
  }
}

function progressSummary(
  plan: XArticleMaterializationPlanV1,
  progress: readonly XArticleStageProgressV1[],
  startedAt: number,
  verifiedAt: number
): { stageSeconds: Record<string, number>; retryCount: number; recoveryCount: number } {
  const assetIds = new Set(plan.visual_anchors.map((anchor) => anchor.asset_id));
  const stageSeconds: Record<string, number> = {};
  let previous = startedAt;
  let retryCount = 0;
  let recoveryCount = 0;
  for (const event of progress) {
    validateContract<XArticleStageProgressV1>('x-article-materialization-progress', event);
    const recordedAt = Date.parse(event.recorded_at);
    finiteNonnegative(event.elapsed_seconds, 'progress elapsed_seconds');
    finiteNonnegative(event.retry_count, 'progress retry_count', true);
    if (
      event.execution_id !== plan.execution_id
      || (event.asset_id !== null && !assetIds.has(event.asset_id))
      || !Number.isFinite(recordedAt)
      || recordedAt < previous
      || recordedAt > verifiedAt
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'X Article materialization progress is unordered or foreign');
    }
    if (
      event.elapsed_seconds > plan.budget.no_progress_seconds
      && event.waiting_for === null
      && event.observed_effect === 'unknown'
    ) {
      throw new HarnessError(
        'ARTICLE_MATERIALIZATION_NO_PROGRESS',
        'slow stage lacks a progress reason',
        event
      );
    }
    const stage = event.stage.split('#', 1)[0]!;
    stageSeconds[stage] = (stageSeconds[stage] ?? 0) + event.elapsed_seconds;
    retryCount += event.retry_count;
    if (event.observed_effect === 'unknown' || event.observed_effect === 'partial') recoveryCount += 1;
    previous = recordedAt;
  }
  return { stageSeconds, retryCount, recoveryCount };
}

export function createXArticleMaterializationReceipt(
  input: CreateXArticleMaterializationReceiptInput
): XArticleMaterializationReceiptV1 {
  const plan = validateContract<XArticleMaterializationPlanV1>(
    'x-article-materialization-plan', structuredClone(input.plan)
  );
  const checkpoint = validateContract<XArticleMaterializationCheckpointV1>(
    'x-article-materialization-checkpoint', structuredClone(input.checkpoint)
  );
  validatePreviewEvidence(plan, checkpoint);
  finiteNonnegative(input.body_block_count, 'body_block_count', true);
  finiteNonnegative(input.command_count, 'command_count', true);
  finiteNonnegative(input.observation_count, 'observation_count', true);
  finiteNonnegative(input.human_wait_seconds, 'human_wait_seconds');
  const startedAt = Date.parse(input.automation_started_at);
  const verifiedAt = Date.parse(input.preview_verified_at);
  const issuedAt = Date.parse(input.issued_at);
  if (
    !Number.isFinite(startedAt)
    || !Number.isFinite(verifiedAt)
    || !Number.isFinite(issuedAt)
    || startedAt > verifiedAt
    || verifiedAt > issuedAt
  ) {
    throw new HarnessError('CONTRACT_INVALID', 'X Article materialization receipt timestamps are invalid or reversed');
  }
  if (
    input.command_count > plan.expected_command_ceiling
    || input.observation_count > plan.expected_observation_ceiling
  ) {
    throw new HarnessError(
      'ARTICLE_MATERIALIZATION_TIMEOUT',
      'X Article materialization activity exceeded its trusted ceiling'
    );
  }
  const progress = input.progress.map((event) => structuredClone(event));
  const summary = progressSummary(plan, progress, startedAt, verifiedAt);
  const automationSeconds = (verifiedAt - startedAt) / 1000;
  finiteNonnegative(automationSeconds, 'automation_seconds');
  const body = {
    schema_version: 'x-article-materialization-receipt/v1' as const,
    execution_id: plan.execution_id,
    draft_id: checkpoint.draft_id!,
    materialization_digest: plan.materialization_digest,
    strategy: plan.strategy,
    body_block_count: input.body_block_count,
    inline_image_count: plan.visual_anchors.length,
    stage_seconds: Object.freeze({ ...summary.stageSeconds }),
    automation_seconds: automationSeconds,
    human_wait_seconds: input.human_wait_seconds,
    command_count: input.command_count,
    command_ceiling: plan.expected_command_ceiling,
    observation_count: input.observation_count,
    observation_ceiling: plan.expected_observation_ceiling,
    retry_count: summary.retryCount,
    recovery_count: summary.recoveryCount,
    within_budget: automationSeconds <= (
      plan.budget.fixed_seconds
      + (plan.budget.per_inline_visual_seconds * plan.visual_anchors.length)
    ),
    preview_revision: input.preview_revision,
    supersedes_receipt_digest: input.supersedes_receipt_digest,
    issued_at: input.issued_at
  };
  const receipt = validateContract<XArticleMaterializationReceiptV1>(
    'x-article-materialization-receipt',
    { ...body, receipt_digest: sha256(body) }
  );
  return Object.freeze(receipt);
}

export function createSupersedingXArticleMaterializationReceipt(
  input: CreateSupersedingXArticleMaterializationReceiptInput
): XArticleMaterializationReceiptV1 {
  const preview = validateContract<XArticleMaterializationReceiptV1>(
    'x-article-materialization-receipt', structuredClone(input.preview_receipt)
  );
  if (
    preview.receipt_digest !== sha256(receiptBody(preview))
    || preview.supersedes_receipt_digest !== null
  ) {
    throw new HarnessError('CONTRACT_INVALID', 'Preview materialization receipt is corrupt or already superseding');
  }
  finiteNonnegative(input.human_wait_seconds, 'human_wait_seconds');
  const issuedAt = Date.parse(input.issued_at);
  if (!Number.isFinite(issuedAt) || issuedAt < Date.parse(preview.issued_at)) {
    throw new HarnessError('CONTRACT_INVALID', 'superseding materialization receipt timestamp is invalid');
  }
  const body = {
    ...receiptBody(preview),
    stage_seconds: Object.freeze({ ...preview.stage_seconds }),
    human_wait_seconds: input.human_wait_seconds,
    supersedes_receipt_digest: preview.receipt_digest,
    issued_at: input.issued_at
  };
  const receipt = validateContract<XArticleMaterializationReceiptV1>(
    'x-article-materialization-receipt',
    { ...body, receipt_digest: sha256(body) }
  );
  return Object.freeze(receipt);
}
