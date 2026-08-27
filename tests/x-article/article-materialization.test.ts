import { describe, expect, it } from 'vitest';

import {
  createXArticleImportTemplate,
  type XArticleImportTemplateV1
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { computeXArticlePageRevision } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import type {
  XArticleBlockV1,
  XArticleDocumentV1
} from '../../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { createXArticleExistingDraftBinding } from '../../harnesses/research-publishing/core/x-article-existing-draft-binding.js';
import {
  createAdoptedXArticleMaterializationCheckpoint,
  createInitialXArticleMaterializationCheckpoint,
  createSupersedingXArticleMaterializationReceipt,
  createXArticleMaterializationReceipt,
  createXArticleMaterializationStartEvidence,
  createXArticleMaterializationPlan,
  createXArticleStageProgress,
  type XArticleMaterializationCheckpointV1,
  type XArticleMaterializationPlanV1,
  type XArticleStageProgressV1
} from '../../harnesses/research-publishing/core/x-article-materialization.js';
import {
  createXArticlePublicationPlan
} from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import type { VisualAssetRef } from '../../harnesses/research-publishing/core/types.js';

const digest = (character: string): `sha256:${string}` =>
  `sha256:${character.repeat(64)}`;

function paragraph(text: string): XArticleBlockV1 {
  return { kind: 'paragraph', runs: [{ text, marks: [], link: null }] };
}

const inlineVisuals = [
  { asset_id: 'domain-runtime-boundary', ordinal: 2, digest: digest('a') },
  { asset_id: 'bottom-up-extraction', ordinal: 4, digest: digest('b') },
  { asset_id: 'runtime-research-boundaries', ordinal: 6, digest: digest('c') }
] as const;

const document: XArticleDocumentV1 = {
  schema_version: '1.0',
  title: 'Runtime boundaries',
  cover_asset_id: null,
  blocks: [
    paragraph('A governed runtime starts with an explicit boundary.'),
    { kind: 'image', asset_id: inlineVisuals[0].asset_id, alt_text: 'The runtime boundary.' },
    paragraph('Evidence is extracted from the bottom up.'),
    { kind: 'image', asset_id: inlineVisuals[1].asset_id, alt_text: 'Bottom-up extraction.' },
    paragraph('Publication does not widen the research boundary.'),
    { kind: 'image', asset_id: inlineVisuals[2].asset_id, alt_text: 'Research boundaries.' }
  ]
};

function asset(
  assetId: string,
  assetDigest: `sha256:${string}`,
  altText: string
): VisualAssetRef {
  return {
    asset_id: assetId,
    relative_path: `assets/${assetId}.png`,
    digest: assetDigest,
    mime_type: 'image/png',
    alt_text: altText,
    claim_refs: ['claim_runtime_boundary']
  };
}

const publicationPlan = createXArticlePublicationPlan({
  planId: 'plan_v32',
  runId: 'run_v32',
  targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/v32', digest: digest('f') },
  document,
  visuals: inlineVisuals.map((visual) => ({
    asset: asset(visual.asset_id, visual.digest, (document.blocks[visual.ordinal - 1] as Extract<XArticleBlockV1, { kind: 'image' }>).alt_text),
    placement: { kind: 'block' as const, block_ordinal: visual.ordinal }
  })),
  plannedAt: '2026-08-26T08:00:00.000Z',
  provenance: { article_run_id: 'article_v32' }
});

const importTemplate = createXArticleImportTemplate(document);

function existingDraftObservation(
  observationId = 'observation_existing_body',
  executionId = 'source_execution',
  commandId = 'source_command',
  observedAt = '2026-08-27T05:56:04.000Z'
) {
  const body = {
    schema_version: '1.0' as const,
    observation_id: observationId,
    execution_id: executionId,
    command_id: commandId,
    origin: 'https://x.com' as const,
    canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
    observed_at: observedAt,
    account_handle: publicationPlan.intent.target_account,
    page_kind: 'article_editor' as const,
    controls: [],
    editor: {
      draft_id: '2092851979932647424',
      title: publicationPlan.intent.document.title,
      blocks: publicationPlan.intent.document.blocks.filter((block) => block.kind !== 'image'),
      visuals: [],
      import_state: {
        template_digest: importTemplate.template_digest,
        source_document_digest: importTemplate.source_document_digest,
        unresolved_anchors: importTemplate.anchors
      },
      has_unknown_content: false,
      autosave_state: 'saved' as const
    },
    preview: null,
    publish_review: null,
    public_article: null
  };
  return { ...body, page_revision: computeXArticlePageRevision(body) };
}

function freshExistingDraftObservation(executionId: string, commandId = 'command_adopt_existing') {
  return existingDraftObservation(
    'observation_existing_body_fresh',
    executionId,
    commandId,
    '2026-08-27T06:00:00.000Z'
  );
}

const existingDraftBinding = createXArticleExistingDraftBinding({
  publication_plan: publicationPlan,
  observation: existingDraftObservation()
});

function materializationPlan() {
  return createXArticleMaterializationPlan({
    execution_id: 'execution_v32',
    publication_plan: publicationPlan,
    import_template: importTemplate,
    strategy: 'rich_text_anchor_import/v1'
  });
}

function resignImportTemplate(
  override: Partial<Omit<XArticleImportTemplateV1, 'template_digest'>>
): XArticleImportTemplateV1 {
  const body = {
    schema_version: importTemplate.schema_version,
    source_document_digest: importTemplate.source_document_digest,
    blocks: importTemplate.blocks,
    anchors: importTemplate.anchors,
    ...override
  };
  return { ...body, template_digest: sha256(body) };
}

function createWithImportTemplate(forgedTemplate: XArticleImportTemplateV1) {
  return createXArticleMaterializationPlan({
    execution_id: 'execution_v32',
    publication_plan: publicationPlan,
    import_template: forgedTemplate,
    strategy: 'rich_text_anchor_import/v1'
  });
}

describe('X Article materialization contracts', () => {
  it('creates a deterministic, budgeted plan for three inline visuals', () => {
    const result = materializationPlan();

    expect(result).toMatchObject({
      schema_version: 'x-article-materialization-plan/v1',
      execution_id: 'execution_v32',
      publication_plan_digest: publicationPlan.plan_digest,
      target_account: '@Glen56121',
      strategy: 'rich_text_anchor_import/v1',
      document_digest: sha256(document),
      import_template_digest: importTemplate.template_digest,
      expected_command_ceiling: 15,
      expected_observation_ceiling: 12,
      budget: {
        fixed_seconds: 180,
        per_inline_visual_seconds: 60,
        no_progress_seconds: 20
      }
    });
    expect(result.visual_anchors).toHaveLength(3);
    expect(result.visual_anchors[0]).toMatchObject({
      anchor_id: importTemplate.anchors[0]!.anchor_id,
      asset_id: inlineVisuals[0].asset_id,
      block_ordinal: inlineVisuals[0].ordinal,
      asset_digest: inlineVisuals[0].digest,
      alt_text: 'The runtime boundary.'
    });
    expect(result.visual_anchors.map((anchor) => anchor.context_digest)).toEqual([
      sha256({
        previous_block: importTemplate.blocks[0],
        anchor_block: importTemplate.blocks[1],
        next_block: importTemplate.blocks[2]
      }),
      sha256({
        previous_block: importTemplate.blocks[2],
        anchor_block: importTemplate.blocks[3],
        next_block: importTemplate.blocks[4]
      }),
      sha256({
        previous_block: importTemplate.blocks[4],
        anchor_block: importTemplate.blocks[5],
        next_block: null
      })
    ]);
    expect(result.materialization_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(materializationPlan()).toEqual(result);
  });

  it('binds the materialization digest to every non-digest field', () => {
    const result = materializationPlan();
    const body = Object.fromEntries(
      Object.entries(result).filter(([key]) => key !== 'materialization_digest')
    );

    expect(result.materialization_digest).toBe(sha256(body));
  });

  it('creates a deterministic initial checkpoint from the plan', () => {
    const plan = materializationPlan();
    const checkpoint = createInitialXArticleMaterializationCheckpoint({
      plan,
      updated_at: '2026-08-26T08:01:00.000Z'
    });

    expect(checkpoint).toEqual({
      schema_version: 'x-article-materialization-checkpoint/v1',
      execution_id: 'execution_v32',
      draft_id: null,
      draft_origin: 'created_new',
      source_execution_id: null,
      materialization_digest: plan.materialization_digest,
      revision: 0,
      phase: 'preflight_pending',
      body: { status: 'pending', observed_digest: null },
      media: plan.visual_anchors.map((anchor) => ({
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
      updated_at: '2026-08-26T08:01:00.000Z'
    });
    expect(validateContract('x-article-materialization-checkpoint', checkpoint)).toEqual(checkpoint);
  });

  it('creates an adopted-body checkpoint bound to the locked Draft snapshot', () => {
    const plan = createXArticleMaterializationPlan({
      execution_id: 'execution_existing_media',
      publication_plan: publicationPlan,
      import_template: importTemplate,
      strategy: 'rich_text_anchor_import/v1',
      draft_binding: existingDraftBinding
    });
    const observation = freshExistingDraftObservation(plan.execution_id);
    const checkpoint = createAdoptedXArticleMaterializationCheckpoint({
      plan,
      publication_plan: publicationPlan,
      observation,
      updated_at: '2026-08-27T06:00:00.000Z'
    });

    expect(plan.draft_binding).toEqual(existingDraftBinding);
    expect(checkpoint).toMatchObject({
      draft_id: existingDraftBinding.draft_id,
      draft_origin: 'adopted_existing',
      source_execution_id: null,
      phase: 'body_verified',
      body: { status: 'adopted_verified', observed_digest: plan.import_template_digest },
      last_editor_revision: observation.page_revision,
      publish_confirmation: 'absent'
    });
    expect(checkpoint.media.every((entry) => entry.status === 'pending')).toBe(true);
  });

  it('preserves the V3.2 initial checkpoint for a null binding', () => {
    const plan = createXArticleMaterializationPlan({
      execution_id: 'execution_new_draft',
      publication_plan: publicationPlan,
      import_template: importTemplate,
      strategy: 'rich_text_anchor_import/v1',
      draft_binding: null
    });

    expect(createInitialXArticleMaterializationCheckpoint({
      plan,
      updated_at: '2026-08-27T06:00:00.000Z'
    })).toMatchObject({
      draft_id: null,
      draft_origin: 'created_new',
      source_execution_id: null,
      phase: 'preflight_pending',
      body: { status: 'pending', observed_digest: null }
    });
  });

  it('rejects creating a V3.2 initial checkpoint from an existing-Draft Plan', () => {
    const plan = createXArticleMaterializationPlan({
      execution_id: 'execution_existing_initial',
      publication_plan: publicationPlan,
      import_template: importTemplate,
      strategy: 'rich_text_anchor_import/v1',
      draft_binding: existingDraftBinding
    });

    expect(() => createInitialXArticleMaterializationCheckpoint({
      plan,
      updated_at: '2026-08-27T06:00:00.000Z'
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_DRAFT_CONFLICT' }));
  });

  it('rejects an adopted checkpoint with a foreign Draft observation', () => {
    const plan = createXArticleMaterializationPlan({
      execution_id: 'execution_foreign_observation',
      publication_plan: publicationPlan,
      import_template: importTemplate,
      strategy: 'rich_text_anchor_import/v1',
      draft_binding: existingDraftBinding
    });
    const observed = freshExistingDraftObservation(plan.execution_id);
    const body = {
      ...observed,
      canonical_url: 'https://x.com/compose/articles/edit/2092851979932647425',
      editor: { ...observed.editor!, draft_id: '2092851979932647425' }
    };
    const foreignObservation = {
      ...body,
      page_revision: computeXArticlePageRevision(body)
    };

    expect(() => createAdoptedXArticleMaterializationCheckpoint({
      plan,
      publication_plan: publicationPlan,
      observation: foreignObservation,
      updated_at: '2026-08-27T06:00:00.000Z'
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_DRAFT_CONFLICT' }));
  });

  it.each([
    {
      case: 'binding digest changed',
      strategy: 'rich_text_anchor_import/v1' as const,
      draft_binding: { ...existingDraftBinding, binding_digest: digest('0') }
    },
    {
      case: 'block materialization strategy',
      strategy: 'block_materialization/v1' as const,
      draft_binding: existingDraftBinding
    }
  ])('rejects a Draft binding with $case', ({ strategy, draft_binding }) => {
    expect(() => createXArticleMaterializationPlan({
      execution_id: 'execution_invalid_existing_draft',
      publication_plan: publicationPlan,
      import_template: importTemplate,
      strategy,
      draft_binding
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_DRAFT_CONFLICT' }));
  });

  it('rejects an untrusted block-materialization Plan carrying a Draft binding', () => {
    const adoptedPlan = createXArticleMaterializationPlan({
      execution_id: 'execution_untrusted_existing_draft',
      publication_plan: publicationPlan,
      import_template: importTemplate,
      strategy: 'rich_text_anchor_import/v1',
      draft_binding: existingDraftBinding
    });
    const body = {
      ...adoptedPlan,
      strategy: 'block_materialization/v1' as const
    };

    expect(() => validateContract('x-article-materialization-plan', {
      ...body,
      materialization_digest: sha256(Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== 'materialization_digest')
      ))
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it.each([
    {
      case: 'replayed source observation',
      plan_execution_id: 'source_execution',
      error_code: 'ARTICLE_DRAFT_CONFLICT',
      observation: () => existingDraftObservation()
    },
    {
      case: 'forged page revision',
      plan_execution_id: 'execution_forged_revision',
      error_code: 'ARTICLE_DRAFT_CONFLICT',
      observation: () => ({
        ...freshExistingDraftObservation('execution_forged_revision'),
        page_revision: digest('0')
      })
    },
    {
      case: 'time-reversed observation',
      plan_execution_id: 'execution_reversed_observation',
      error_code: 'ARTICLE_DRAFT_CONFLICT',
      observation: () => existingDraftObservation(
        'observation_time_reversed',
        'execution_reversed_observation',
        'command_time_reversed',
        existingDraftBinding.observed_at
      )
    },
    {
      case: 'foreign execution identity',
      plan_execution_id: 'execution_current_identity',
      error_code: 'ARTICLE_DRAFT_CONFLICT',
      observation: () => freshExistingDraftObservation('execution_foreign_identity')
    },
    {
      case: 'malformed command identity',
      plan_execution_id: 'execution_command_identity',
      error_code: 'CONTRACT_INVALID',
      observation: () => freshExistingDraftObservation('execution_command_identity', '')
    }
  ])('rejects a $case when adopting an existing Draft', ({ plan_execution_id, observation, error_code }) => {
    const plan = createXArticleMaterializationPlan({
      execution_id: plan_execution_id,
      publication_plan: publicationPlan,
      import_template: importTemplate,
      strategy: 'rich_text_anchor_import/v1',
      draft_binding: existingDraftBinding
    });

    expect(() => createAdoptedXArticleMaterializationCheckpoint({
      plan,
      publication_plan: publicationPlan,
      observation: observation(),
      updated_at: '2026-08-27T06:01:00.000Z'
    })).toThrowError(expect.objectContaining({ code: error_code }));
  });

  it.each([
    ['account', { expected_account: '@Foreign' }],
    ['document', { expected_document_digest: digest('0') }],
    ['template', { expected_import_template_digest: digest('1') }]
  ])('rejects a re-digested inner binding with %s identity drift', (_kind, override) => {
    const adoptedPlan = createXArticleMaterializationPlan({
      execution_id: 'execution_inner_binding_drift',
      publication_plan: publicationPlan,
      import_template: importTemplate,
      strategy: 'rich_text_anchor_import/v1',
      draft_binding: existingDraftBinding
    });
    const bindingBody = { ...existingDraftBinding, ...override };
    const binding = {
      ...bindingBody,
      binding_digest: sha256(Object.fromEntries(
        Object.entries(bindingBody).filter(([key]) => key !== 'binding_digest')
      ))
    };
    const body = { ...adoptedPlan, draft_binding: binding };

    expect(() => validateContract('x-article-materialization-plan', {
      ...body,
      materialization_digest: sha256(Object.fromEntries(
        Object.entries(body).filter(([key]) => key !== 'materialization_digest')
      ))
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('records stage progress without consulting wall-clock time', () => {
    const progress = createXArticleStageProgress({
      execution_id: 'execution_v32',
      stage: 'inline_visual_upload',
      asset_id: inlineVisuals[0].asset_id,
      elapsed_seconds: 17,
      waiting_for: 'editor_media_insert',
      retry_count: 1,
      observed_effect: 'partial',
      recorded_at: '2026-08-26T08:02:00.000Z'
    });

    expect(progress).toEqual({
      schema_version: 'x-article-materialization-progress/v1',
      execution_id: 'execution_v32',
      stage: 'inline_visual_upload',
      asset_id: inlineVisuals[0].asset_id,
      elapsed_seconds: 17,
      waiting_for: 'editor_media_insert',
      retry_count: 1,
      observed_effect: 'partial',
      recorded_at: '2026-08-26T08:02:00.000Z'
    });
    expect(validateContract('x-article-materialization-progress', progress)).toEqual(progress);
  });

  it.each([
    {
      case: 'removed final block and anchor',
      template: resignImportTemplate({
        blocks: importTemplate.blocks.slice(0, -1),
        anchors: importTemplate.anchors.slice(0, -1)
      })
    },
    {
      case: 'reordered non-anchor blocks',
      template: resignImportTemplate({
        blocks: importTemplate.blocks.map((block, index) => {
          if (index === 0) return importTemplate.blocks[2]!;
          if (index === 2) return importTemplate.blocks[0]!;
          return block;
        })
      })
    },
    {
      case: 'altered anchor marker',
      template: resignImportTemplate({
        blocks: importTemplate.blocks.map((block, index) => index === 1
          ? { ...block, marker: `${importTemplate.anchors[0]!.marker}:forged` }
          : block),
        anchors: importTemplate.anchors.map((anchor, index) => index === 0
          ? { ...anchor, marker: `${anchor.marker}:forged` }
          : anchor)
      })
    }
  ])('rejects attacker-recomputed import templates with $case', ({ template }) => {
    expect(() => createWithImportTemplate(template))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_MATERIALIZATION_DRIFT' }));
  });

  it.each([
    { execution_id: '../escape' },
    { materialization_digest: digest('0') },
    { visual_anchors: [...materializationPlan().visual_anchors].reverse() },
    { expected_command_ceiling: 14 },
    { expected_observation_ceiling: 11 },
    { budget: { ...materializationPlan().budget, fixed_seconds: 179 } }
  ])('rejects invalid materialization plan values: $override', (override) => {
    expect(() => validateContract('x-article-materialization-plan', {
      ...materializationPlan(),
      ...override
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});

function materializationPlanWithVisualCount(count: number): XArticleMaterializationPlanV1 {
  const original = materializationPlan();
  const visualAnchors = Array.from({ length: count }, (_value, index) => ({
    anchor_id: `anchor_${index + 1}`,
    asset_id: `asset_${index + 1}`,
    block_ordinal: index + 1,
    asset_digest: digest(((index + 1) % 10).toString()),
    alt_text: `Visual ${index + 1}`,
    context_digest: digest(((index + 2) % 10).toString())
  }));
  const body = {
    ...original,
    visual_anchors: visualAnchors,
    expected_command_ceiling: 12 + count,
    expected_observation_ceiling: 9 + count
  };
  return validateContract<XArticleMaterializationPlanV1>('x-article-materialization-plan', {
    ...body,
    materialization_digest: sha256(Object.fromEntries(
      Object.entries(body).filter(([key]) => key !== 'materialization_digest')
    ))
  });
}

function previewCheckpoint(
  plan: XArticleMaterializationPlanV1,
  override: Partial<XArticleMaterializationCheckpointV1> = {}
): XArticleMaterializationCheckpointV1 {
  return {
    schema_version: 'x-article-materialization-checkpoint/v1',
    execution_id: plan.execution_id,
    draft_id: 'draft_v32',
    draft_origin: 'created_new',
    source_execution_id: null,
    materialization_digest: plan.materialization_digest,
    revision: 7,
    phase: 'preview_verified',
    body: { status: 'verified', observed_digest: plan.import_template_digest },
    media: plan.visual_anchors.map((anchor) => ({
      anchor_id: anchor.anchor_id,
      asset_id: anchor.asset_id,
      block_ordinal: anchor.block_ordinal,
      asset_digest: anchor.asset_digest,
      status: 'completed',
      observed_media_ref: `media_${anchor.asset_id}`,
      observed_context_digest: anchor.context_digest
    })),
    last_editor_revision: digest('d'),
    publish_confirmation: 'absent',
    updated_at: '2026-08-26T00:03:47.000Z',
    ...override
  };
}

function receiptProgress(
  plan: XArticleMaterializationPlanV1,
  override: Partial<XArticleStageProgressV1> = {}
): XArticleStageProgressV1[] {
  return [createXArticleStageProgress({
    execution_id: plan.execution_id,
    stage: 'body_import',
    asset_id: null,
    elapsed_seconds: 107,
    waiting_for: null,
    retry_count: 1,
    observed_effect: 'complete',
    recorded_at: '2026-08-26T00:01:47.000Z',
    ...override
  })];
}

function createReceiptFor(
  plan: XArticleMaterializationPlanV1,
  override: Partial<Parameters<typeof createXArticleMaterializationReceipt>[0] & {
    readonly cover_asset_id: string | null;
  }> = {}
) {
  return createXArticleMaterializationReceipt({
    plan,
    checkpoint: previewCheckpoint(plan),
    progress: receiptProgress(plan),
    cover_asset_id: null,
    body_block_count: 6,
    command_count: Math.min(11, plan.expected_command_ceiling),
    observation_count: Math.min(9, plan.expected_observation_ceiling),
    automation_started_at: '2026-08-26T00:00:00.000Z',
    preview_verified_at: '2026-08-26T00:03:47.000Z',
    human_wait_seconds: 900,
    preview_revision: digest('e'),
    issued_at: '2026-08-26T00:03:47.000Z',
    ...override
  });
}

describe('X Article materialization performance receipts', () => {
  it('creates a deterministic schema-valid receipt with separate automation and human wait', () => {
    const plan = materializationPlan();
    const receipt = createReceiptFor(plan);

    expect(receipt).toMatchObject({
      schema_version: 'x-article-materialization-receipt/v1',
      execution_id: plan.execution_id,
      draft_id: 'draft_v32',
      materialization_digest: plan.materialization_digest,
      strategy: plan.strategy,
      body_block_count: 6,
      inline_image_count: 3,
      stage_seconds: { body_import: 107 },
      automation_seconds: 227,
      human_wait_seconds: 900,
      command_count: 11,
      command_ceiling: 15,
      observation_count: 9,
      observation_ceiling: 12,
      retry_count: 1,
      recovery_count: 0,
      within_budget: true,
      preview_revision: digest('e'),
      supersedes_receipt_digest: null,
      issued_at: '2026-08-26T00:03:47.000Z'
    });
    expect(receipt.receipt_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(validateContract('x-article-materialization-receipt', receipt)).toEqual(receipt);
    expect(createReceiptFor(plan)).toEqual(receipt);
  });

  it.each([0, 3, 10])('computes the exact 180 + 60*N budget for %i inline visuals', (count) => {
    const plan = materializationPlanWithVisualCount(count);
    const budget = 180 + (60 * count);
    const startedAt = Date.parse('2026-08-26T00:00:00.000Z');
    const boundaryAt = new Date(startedAt + (budget * 1000)).toISOString();
    const overAt = new Date(startedAt + ((budget + 1) * 1000)).toISOString();
    const atBoundary = createReceiptFor(plan, {
      checkpoint: previewCheckpoint(plan, { updated_at: boundaryAt }), progress: receiptProgress(plan),
      preview_verified_at: boundaryAt,
      issued_at: boundaryAt
    });
    const overBudget = createReceiptFor(plan, {
      checkpoint: previewCheckpoint(plan, { updated_at: overAt }), progress: receiptProgress(plan),
      preview_verified_at: overAt,
      issued_at: overAt
    });

    expect(atBoundary.automation_seconds).toBe(budget);
    expect(atBoundary.within_budget).toBe(true);
    expect(overBudget.within_budget).toBe(false);
  });

  it('rejects a silent slow stage but permits the boundary and an explicit waiting reason', () => {
    const plan = materializationPlan();
    expect(() => createReceiptFor(plan, { progress: receiptProgress(plan, {
      elapsed_seconds: 21, waiting_for: null, observed_effect: 'unknown'
    }) })).toThrowError(expect.objectContaining({ code: 'ARTICLE_MATERIALIZATION_NO_PROGRESS' }));
    expect(() => createReceiptFor(plan, { progress: receiptProgress(plan, {
      elapsed_seconds: 20, waiting_for: null, observed_effect: 'unknown'
    }) })).not.toThrow();
    expect(() => createReceiptFor(plan, { progress: receiptProgress(plan, {
      elapsed_seconds: 21, waiting_for: 'browser_effect_reconciliation', observed_effect: 'unknown'
    }) })).not.toThrow();
  });

  it.each([{ command_count: 16 }, { observation_count: 13 }])(
    'rejects trusted activity counts above their ceiling: $override',
    (override) => {
      expect(() => createReceiptFor(materializationPlan(), override))
        .toThrowError(expect.objectContaining({ code: 'ARTICLE_MATERIALIZATION_TIMEOUT' }));
    }
  );

  it.each([
    { human_wait_seconds: -1 }, { human_wait_seconds: Number.NaN },
    { body_block_count: -1 }, { command_count: 1.5 },
    { automation_started_at: 'not-a-time' },
    { automation_started_at: '2026-08-26T00:03:48.000Z' }
  ])('rejects invalid numeric or reversed timing evidence: $override', (override) => {
    expect(() => createReceiptFor(materializationPlan(), override))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects disordered, foreign, or unknown-asset progress evidence', () => {
    const plan = materializationPlan();
    const first = receiptProgress(plan)[0]!;
    const later = createXArticleStageProgress({
      ...first,
      stage: 'inline_visual',
      asset_id: plan.visual_anchors[0]!.asset_id,
      recorded_at: '2026-08-26T00:02:00.000Z'
    });
    const cases = [
      [later, first],
      [{ ...first, execution_id: 'foreign_execution' }],
      [{ ...first, asset_id: 'unknown_asset' }]
    ];
    for (const progress of cases) {
      expect(() => createReceiptFor(plan, { progress: progress as XArticleStageProgressV1[] }))
        .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
    }
  });

  it('accepts the exact planned cover beside inline progress without counting it as inline media', () => {
    const plan = materializationPlanWithVisualCount(1);
    const body = receiptProgress(plan)[0]!;
    const cover = createXArticleStageProgress({
      ...body,
      stage: 'upload_article_cover#command_cover',
      asset_id: 'asset_cover',
      elapsed_seconds: 7,
      recorded_at: '2026-08-26T00:01:50.000Z'
    });
    const inline = createXArticleStageProgress({
      ...body,
      stage: 'replace_article_visual_anchor_1#command_inline',
      asset_id: plan.visual_anchors[0]!.asset_id,
      elapsed_seconds: 13,
      recorded_at: '2026-08-26T00:02:00.000Z'
    });

    const receipt = createReceiptFor(plan, {
      cover_asset_id: 'asset_cover',
      progress: [body, cover, inline]
    });

    expect(receipt.inline_image_count).toBe(1);
    expect(receipt.body_block_count).toBe(6);
    expect(receipt.stage_seconds).toEqual({
      body_import: 107,
      upload_article_cover: 7,
      replace_article_visual_anchor_1: 13
    });
  });

  it('rejects a tampered cover progress asset even when another cover is planned', () => {
    const plan = materializationPlanWithVisualCount(0);
    expect(() => createReceiptFor(plan, {
      cover_asset_id: 'asset_cover',
      progress: receiptProgress(plan, {
        stage: 'upload_article_cover#command_cover',
        asset_id: 'asset_cover_tampered'
      })
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects a planned cover identity that collides with an inline anchor', () => {
    const plan = materializationPlanWithVisualCount(1);
    const sharedAssetId = plan.visual_anchors[0]!.asset_id;
    expect(() => createReceiptFor(plan, {
      cover_asset_id: sharedAssetId,
      progress: receiptProgress(plan, {
        stage: 'upload_article_cover#command_cover',
        asset_id: sharedAssetId
      })
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('fails closed when the validation-only cover identity boundary is omitted', () => {
    const plan = materializationPlanWithVisualCount(0);
    expect(() => createXArticleMaterializationReceipt({
      plan,
      checkpoint: previewCheckpoint(plan),
      progress: receiptProgress(plan),
      body_block_count: 0,
      command_count: 0,
      observation_count: 0,
      automation_started_at: '2026-08-26T00:00:00.000Z',
      preview_verified_at: '2026-08-26T00:03:47.000Z',
      human_wait_seconds: 0,
      preview_revision: digest('e'),
      issued_at: '2026-08-26T00:03:47.000Z'
    } as never)).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it.each([
    { phase: 'draft_reconciled' },
    { draft_id: null },
    { body: { status: 'issued', observed_digest: null } },
    { materialization_digest: digest('0') },
    { media: [] },
    { last_editor_revision: null }
  ])('rejects incomplete or mismatched Preview checkpoint evidence: $override', (override) => {
    const plan = materializationPlan();
    expect(() => createReceiptFor(plan, {
      checkpoint: previewCheckpoint(plan, override as never)
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_CHECKPOINT_CONFLICT' }));
  });

  it('rejects malformed Preview revision and creates immutable digest-linked supersession', () => {
    const preview = createReceiptFor(materializationPlan());
    expect(() => createReceiptFor(materializationPlan(), {
      preview_revision: 'sha256:nope' as never
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));

    const publicReceipt = createSupersedingXArticleMaterializationReceipt({
      preview_receipt: preview,
      expected_preview_receipt_digest: preview.receipt_digest,
      human_wait_seconds: 120,
      issued_at: '2026-08-26T00:06:00.000Z'
    });
    expect(publicReceipt).toMatchObject({
      human_wait_seconds: 120,
      supersedes_receipt_digest: preview.receipt_digest
    });
    expect(publicReceipt.receipt_digest).not.toBe(preview.receipt_digest);
    expect(preview.supersedes_receipt_digest).toBeNull();
    expect(validateContract('x-article-materialization-receipt', publicReceipt)).toEqual(publicReceipt);
  });

  it('reserves supersession authority for the dedicated bound factory', () => {
    const preview = createReceiptFor(materializationPlan());
    expect(() => createXArticleMaterializationReceipt({
      ...{
        plan: materializationPlan(), checkpoint: previewCheckpoint(materializationPlan()),
        progress: receiptProgress(materializationPlan()), cover_asset_id: null, body_block_count: 6,
        command_count: 11, observation_count: 9,
        automation_started_at: '2026-08-26T00:00:00.000Z',
        preview_verified_at: '2026-08-26T00:03:47.000Z', human_wait_seconds: 0,
        preview_revision: digest('e'), issued_at: '2026-08-26T00:03:47.000Z',
        supersedes_receipt_digest: digest('a')
      }
    } as never)).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));

    const changedBody = { ...preview, draft_id: 'foreign_draft' };
    const redigested = {
      ...changedBody,
      receipt_digest: sha256(Object.fromEntries(
        Object.entries(changedBody).filter(([key]) => key !== 'receipt_digest')
      ))
    };
    expect(() => createSupersedingXArticleMaterializationReceipt({
      preview_receipt: redigested,
      expected_preview_receipt_digest: preview.receipt_digest,
      human_wait_seconds: 120,
      issued_at: '2026-08-26T00:06:00.000Z'
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('creates canonical start evidence bound to the immutable materialization plan', () => {
    const plan = materializationPlan();
    const evidence = createXArticleMaterializationStartEvidence({
      plan,
      started_at: '2026-08-26T00:00:00.000Z'
    });
    expect(evidence).toMatchObject({
      schema_version: 'x-article-materialization-start/v1',
      execution_id: plan.execution_id,
      publication_plan_digest: plan.publication_plan_digest,
      materialization_digest: plan.materialization_digest,
      started_at: '2026-08-26T00:00:00.000Z'
    });
    expect(evidence.start_digest).toMatch(/^sha256:/);
  });

  it('requires the checkpoint Preview time to equal the injected verified boundary', () => {
    const plan = materializationPlan();
    expect(() => createReceiptFor(plan, {
      checkpoint: previewCheckpoint(plan, { updated_at: '2026-08-26T00:03:46.000Z' })
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});
