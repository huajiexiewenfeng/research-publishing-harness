import { describe, expect, it } from 'vitest';

import {
  createXArticleImportTemplate
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import type {
  XArticleBlockV1,
  XArticleDocumentV1
} from '../../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  createInitialXArticleMaterializationCheckpoint,
  createXArticleMaterializationPlan,
  createXArticleStageProgress
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

function materializationPlan() {
  return createXArticleMaterializationPlan({
    execution_id: 'execution_v32',
    publication_plan: publicationPlan,
    import_template: importTemplate,
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
    expect(result.visual_anchors.every((anchor) => /^sha256:[0-9a-f]{64}$/.test(anchor.context_digest)))
      .toBe(true);
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
    { execution_id: '../escape' },
    { materialization_digest: digest('0') },
    { visual_anchors: [...materializationPlan().visual_anchors].reverse() },
    { expected_command_ceiling: 14 }
  ])('rejects invalid materialization plan values: $override', (override) => {
    expect(() => validateContract('x-article-materialization-plan', {
      ...materializationPlan(),
      ...override
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});
