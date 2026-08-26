import { describe, expect, it } from 'vitest';

import type { XArticleDocumentV1 } from '../../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import type { XArticleEditorObservation } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { reconcileXArticleDraft } from '../../harnesses/research-publishing/adapters/x/article-browser/article-draft-reconciler.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import type {
  XArticleMaterializationCheckpointV1,
  XArticleMaterializationPlanV1
} from '../../harnesses/research-publishing/core/x-article-materialization.js';

const document: XArticleDocumentV1 = {
  schema_version: '1.0',
  title: 'Caf\u00e9 control plane',
  cover_asset_id: null,
  blocks: [
    {
      kind: 'paragraph',
      runs: [{ text: 'Read the source.', marks: ['bold'], link: 'https://example.com/source' }]
    },
    { kind: 'image', asset_id: 'asset_alpha', alt_text: 'Alpha diagram' },
    { kind: 'heading', runs: [{ text: 'Approval', marks: [], link: null }] },
    { kind: 'image', asset_id: 'asset_beta', alt_text: 'Beta diagram' },
    { kind: 'paragraph', runs: [{ text: 'Publish once.', marks: ['italic'], link: null }] },
    { kind: 'image', asset_id: 'asset_gamma', alt_text: 'Gamma diagram' }
  ]
};

const template = createXArticleImportTemplate(document);
const planBody = {
  schema_version: 'x-article-materialization-plan/v1' as const,
  execution_id: 'execution_1',
  publication_plan_digest: sha256({ publication: 'locked' }),
  target_account: '@Glen56121',
  strategy: 'rich_text_anchor_import/v1' as const,
  document_digest: sha256(document),
  import_template_digest: template.template_digest as `sha256:${string}`,
  visual_anchors: template.anchors.map((anchor) => ({
    anchor_id: anchor.anchor_id,
    asset_id: anchor.asset_id,
    block_ordinal: anchor.block_ordinal,
    asset_digest: sha256({ asset: anchor.asset_id }),
    alt_text: (document.blocks[anchor.block_ordinal - 1] as { readonly alt_text: string }).alt_text,
    context_digest: sha256({
      previous_block: template.blocks[anchor.block_ordinal - 2] ?? null,
      anchor_block: template.blocks[anchor.block_ordinal - 1] ?? null,
      next_block: template.blocks[anchor.block_ordinal] ?? null
    })
  })),
  expected_command_ceiling: 12 + template.anchors.length,
  expected_observation_ceiling: 9 + template.anchors.length,
  budget: { fixed_seconds: 180, per_inline_visual_seconds: 60, no_progress_seconds: 20 } as const
};
const plan: XArticleMaterializationPlanV1 = {
  ...planBody,
  materialization_digest: sha256(planBody)
};

function checkpoint(completedCount: number): XArticleMaterializationCheckpointV1 {
  return {
    schema_version: 'x-article-materialization-checkpoint/v1',
    execution_id: plan.execution_id,
    draft_id: '2090731994279755776',
    materialization_digest: plan.materialization_digest,
    revision: completedCount + 1,
    phase: completedCount === plan.visual_anchors.length ? 'draft_reconciled' : 'media_materializing',
    body: { status: 'verified', observed_digest: plan.import_template_digest },
    media: plan.visual_anchors.map((anchor, index) => ({
      anchor_id: anchor.anchor_id,
      asset_id: anchor.asset_id,
      block_ordinal: anchor.block_ordinal,
      asset_digest: anchor.asset_digest,
      status: index < completedCount ? 'completed' : 'pending',
      observed_media_ref: index < completedCount ? `media_${index + 1}` : null,
      observed_context_digest: index < completedCount ? anchor.context_digest : null
    })),
    last_editor_revision: null,
    publish_confirmation: 'absent',
    updated_at: '2026-08-26T09:00:00.000Z'
  };
}

const initialCheckpoint: XArticleMaterializationCheckpointV1 = {
  ...checkpoint(0),
  revision: 0,
  phase: 'draft_bound',
  body: { status: 'pending', observed_digest: null }
};

function editor(completedCount: number): XArticleEditorObservation {
  const completed = new Set(plan.visual_anchors.slice(0, completedCount).map((anchor) => anchor.anchor_id));
  return {
    draft_id: '2090731994279755776',
    title: document.title,
    blocks: document.blocks.filter((block, index) => {
      if (block.kind !== 'image') return true;
      const anchor = template.anchors.find((candidate) => candidate.block_ordinal === index + 1);
      return anchor !== undefined && completed.has(anchor.anchor_id);
    }),
    visuals: plan.visual_anchors.slice(0, completedCount).map((anchor, index) => ({
      ref: `media_${index + 1}`,
      asset_id: anchor.asset_id,
      kind: 'inline',
      block_ordinal: anchor.block_ordinal,
      alt_text: anchor.alt_text,
      status: 'uploaded',
      owned_by_execution: true
    })),
    import_state: completedCount === plan.visual_anchors.length ? null : {
      template_digest: template.template_digest,
      source_document_digest: template.source_document_digest,
      unresolved_anchors: template.anchors.slice(completedCount)
    },
    has_unknown_content: false,
    autosave_state: 'saved'
  };
}

const emptyEditor: XArticleEditorObservation = {
  draft_id: '2090731994279755776',
  title: '',
  blocks: [],
  visuals: [],
  import_state: null,
  has_unknown_content: false,
  autosave_state: 'saved'
};

function input(
  editorObservation: XArticleEditorObservation,
  checkpointValue: XArticleMaterializationCheckpointV1 = checkpoint(0)
) {
  return { plan, checkpoint: checkpointValue, document, editor: editorObservation };
}

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function deepClone<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>;
}

describe('reconcileXArticleDraft', () => {
  it.each([
    ['empty', emptyEditor, initialCheckpoint, 'empty'],
    ['template', editor(0), checkpoint(0), 'recoverable_partial'],
    ['one image', editor(1), checkpoint(1), 'recoverable_partial'],
    ['final', editor(3), checkpoint(3), 'exact']
  ])('classifies %s', (_name, editorObservation, checkpointValue, kind) => {
    expect(reconcileXArticleDraft(input(editorObservation, checkpointValue)).kind).toBe(kind);
  });

  it('returns the exact completed prefix and deterministic next action', () => {
    expect(reconcileXArticleDraft(input(editor(1), checkpoint(1)))).toEqual({
      kind: 'recoverable_partial',
      completed_anchor_ids: [plan.visual_anchors[0]!.anchor_id],
      next_anchor_id: plan.visual_anchors[1]!.anchor_id,
      next_action: 'replace_anchor'
    });

    const finalImportState = { ...editor(3), import_state: { ...editor(2).import_state!, unresolved_anchors: [] } };
    expect(reconcileXArticleDraft(input(finalImportState, checkpoint(3)))).toEqual({
      kind: 'recoverable_partial',
      completed_anchor_ids: plan.visual_anchors.map((anchor) => anchor.anchor_id),
      next_anchor_id: null,
      next_action: 'reconcile_final'
    });
  });

  it('limits semantic equivalence to NFC normalization', () => {
    const nfcEquivalent = deepClone(editor(3));
    nfcEquivalent.title = 'Cafe\u0301 control plane';
    nfcEquivalent.blocks[0] = {
      kind: 'paragraph',
      runs: [{ text: 'Read the source.', marks: ['bold'], link: 'https://example.com/source' }]
    };
    expect(reconcileXArticleDraft(input(nfcEquivalent, checkpoint(3))).kind)
      .toBe('semantically_equivalent');
  });

  it.each([
    {
      name: 'a changed link',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) {
        editorObservation.blocks[0] = {
          kind: 'paragraph',
          runs: [{ text: 'Read the source.', marks: ['bold'], link: 'https://example.com/other' }]
        };
      }
    },
    {
      name: 'changed marks',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) {
        editorObservation.blocks[0] = {
          kind: 'paragraph',
          runs: [{ text: 'Read the source.', marks: ['italic'], link: 'https://example.com/source' }]
        };
      }
    },
    {
      name: 'an extra block',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) {
        editorObservation.blocks = [...editorObservation.blocks, {
          kind: 'paragraph', runs: [{ text: 'Human addition', marks: [], link: null }]
        }];
      }
    },
    {
      name: 'a changed block',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) {
        editorObservation.blocks[2] = {
          kind: 'heading', runs: [{ text: 'Changed approval', marks: [], link: null }]
        };
      }
    }
  ])('classifies $name as content drift', ({ mutate }) => {
    const changed = deepClone(editor(3));
    mutate(changed);
    const result = reconcileXArticleDraft(input(changed, checkpoint(3)));
    expect(result.kind).toBe('content_drift');
    expect(result).toMatchObject({ differences: expect.arrayContaining([
      expect.objectContaining({ observed_digest: expect.stringMatching(/^sha256:/) })
    ]) });
  });

  it('fails closed on a missing middle visual instead of accepting a non-prefix', () => {
    const missingMiddle = deepClone(editor(3));
    missingMiddle.blocks = missingMiddle.blocks.filter((block) =>
      block.kind !== 'image' || block.asset_id !== 'asset_beta'
    );
    missingMiddle.visuals = missingMiddle.visuals.filter((visual) => visual.asset_id !== 'asset_beta');
    missingMiddle.import_state = {
      template_digest: template.template_digest,
      source_document_digest: template.source_document_digest,
      unresolved_anchors: [template.anchors[1]!]
    };
    const result = reconcileXArticleDraft(input(missingMiddle, checkpoint(3)));
    expect(result).toMatchObject({ kind: 'content_drift' });
  });

  it.each([
    {
      name: 'duplicate visuals',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) {
        editorObservation.visuals = [...editorObservation.visuals, editorObservation.visuals[0]!];
      }
    },
    {
      name: 'reordered visuals',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) {
        editorObservation.visuals = [editorObservation.visuals[1]!, editorObservation.visuals[0]!, editorObservation.visuals[2]!];
      }
    },
    {
      name: 'reordered image blocks',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) {
        const first = editorObservation.blocks[1]!;
        editorObservation.blocks[1] = editorObservation.blocks[3]!;
        editorObservation.blocks[3] = first;
      }
    }
  ])('classifies $name as content drift', ({ mutate }) => {
    const changed = deepClone(editor(3));
    mutate(changed);
    expect(reconcileXArticleDraft(input(changed, checkpoint(3))).kind).toBe('content_drift');
  });

  it.each([
    {
      name: 'unknown editor content',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) { editorObservation.has_unknown_content = true; }
    },
    {
      name: 'unknown media asset',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) { editorObservation.visuals[0]!.asset_id = null; }
    },
    {
      name: 'unknown media ref',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) { editorObservation.visuals[0]!.ref = ''; }
    },
    {
      name: 'unowned media',
      mutate(editorObservation: Mutable<XArticleEditorObservation>) { editorObservation.visuals[0]!.owned_by_execution = false; }
    },
    {
      name: 'ambiguous checkpoint media',
      mutate(
        _editorObservation: Mutable<XArticleEditorObservation>,
        checkpointValue: Mutable<XArticleMaterializationCheckpointV1>
      ) {
        checkpointValue.media[0]!.status = 'ambiguous';
      }
    }
  ])('classifies $name as unverifiable', ({ mutate }) => {
    const editorObservation = deepClone(editor(3));
    const checkpointValue = deepClone(checkpoint(3));
    mutate(editorObservation, checkpointValue);
    expect(reconcileXArticleDraft(input(editorObservation, checkpointValue)))
      .toMatchObject({ kind: 'unverifiable', reasons: expect.any(Array) });
  });

  it.each([
    {
      name: 'checkpoint execution',
      mutate(
        _planValue: Mutable<XArticleMaterializationPlanV1>,
        checkpointValue: Mutable<XArticleMaterializationCheckpointV1>
      ) {
        checkpointValue.execution_id = 'execution_other';
      }
    },
    {
      name: 'checkpoint plan digest',
      mutate(
        _planValue: Mutable<XArticleMaterializationPlanV1>,
        checkpointValue: Mutable<XArticleMaterializationCheckpointV1>
      ) {
        checkpointValue.materialization_digest = sha256({ other: true });
      }
    },
    {
      name: 'document digest',
      mutate(planValue: Mutable<XArticleMaterializationPlanV1>) {
        planValue.document_digest = sha256({ other: true });
      }
    },
    {
      name: 'plan self digest',
      mutate(planValue: Mutable<XArticleMaterializationPlanV1>) {
        planValue.materialization_digest = sha256({ forged: true });
      }
    },
    {
      name: 'checkpoint body digest',
      mutate(
        _planValue: Mutable<XArticleMaterializationPlanV1>,
        checkpointValue: Mutable<XArticleMaterializationCheckpointV1>
      ) {
        checkpointValue.body.observed_digest = sha256({ other: true });
      }
    },
    {
      name: 'checkpoint media context',
      mutate(
        _planValue: Mutable<XArticleMaterializationPlanV1>,
        checkpointValue: Mutable<XArticleMaterializationCheckpointV1>
      ) {
        checkpointValue.media[0]!.observed_context_digest = sha256({ other: true });
      }
    }
  ])('fails closed on $name identity mismatch', ({ mutate }) => {
    const planValue = deepClone(plan);
    const checkpointValue = deepClone(checkpoint(3));
    mutate(planValue, checkpointValue);
    expect(reconcileXArticleDraft({ plan: planValue, checkpoint: checkpointValue, document, editor: editor(3) }).kind)
      .toBe('unverifiable');
  });

  it('fails closed on editor draft identity mismatch', () => {
    const otherDraft = { ...editor(3), draft_id: '2090731994279755777' };
    expect(reconcileXArticleDraft(input(otherDraft, checkpoint(3))).kind).toBe('unverifiable');
  });

  it('does not re-import an empty editor after the body command was already issued', () => {
    const issued = {
      ...deepClone(initialCheckpoint),
      body: { status: 'issued' as const, observed_digest: null }
    };
    expect(reconcileXArticleDraft(input(emptyEditor, issued))).toMatchObject({ kind: 'unverifiable' });
  });

  it('fails closed when checkpoint media identity is reordered or changed', () => {
    const reordered = deepClone(checkpoint(3));
    reordered.media = [reordered.media[1]!, reordered.media[0]!, reordered.media[2]!];
    expect(reconcileXArticleDraft(input(editor(3), reordered)).kind).toBe('unverifiable');

    const changed = deepClone(checkpoint(3));
    changed.media[0]!.asset_digest = sha256({ changed: true });
    expect(reconcileXArticleDraft(input(editor(3), changed)).kind).toBe('unverifiable');
  });

  it('reconciles the approved cover identity without treating it as an inline anchor', () => {
    const coveredDocument = { ...deepClone(document), cover_asset_id: 'asset_cover' };
    const coveredTemplate = createXArticleImportTemplate(coveredDocument);
    const coveredPlanBody = {
      ...deepClone(planBody),
      document_digest: sha256(coveredDocument),
      import_template_digest: coveredTemplate.template_digest as `sha256:${string}`
    };
    const coveredPlan: XArticleMaterializationPlanV1 = {
      ...coveredPlanBody,
      materialization_digest: sha256(coveredPlanBody)
    };
    const coveredCheckpoint = {
      ...deepClone(checkpoint(3)),
      materialization_digest: coveredPlan.materialization_digest,
      body: { status: 'verified' as const, observed_digest: coveredPlan.import_template_digest }
    };
    const coveredEditor = deepClone(editor(3));
    coveredEditor.visuals = [{
      ref: 'cover_1', asset_id: 'asset_cover', kind: 'cover', block_ordinal: null,
      alt_text: null, status: 'uploaded', owned_by_execution: true
    }, ...coveredEditor.visuals];

    expect(reconcileXArticleDraft({
      plan: coveredPlan, checkpoint: coveredCheckpoint, document: coveredDocument, editor: coveredEditor
    }).kind).toBe('exact');
  });

  it('does not mutate any input graph', () => {
    const value = input(editor(1), checkpoint(1));
    const before = deepClone(value);
    reconcileXArticleDraft(value);
    expect(value).toEqual(before);
  });
});
