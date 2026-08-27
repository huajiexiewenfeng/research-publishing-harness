import { describe, expect, it } from 'vitest';

import type { XArticleDocumentV1 } from '../../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation,
  type XArticleBrowserObservationInput,
  type XArticleEditorObservation
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
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
  draft_binding: null,
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
    draft_origin: 'created_new',
    source_execution_id: null,
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

function observationFor(
  editorObservation: XArticleEditorObservation,
  observationOverrides: Partial<XArticleBrowserObservationInput> = {}
): XArticleBrowserObservation {
  const observationInput: XArticleBrowserObservationInput = {
    schema_version: '1.0',
    observation_id: 'observation_1',
    execution_id: plan.execution_id,
    command_id: 'command_1',
    origin: 'https://x.com',
    canonical_url: `https://x.com/compose/articles/edit/${editorObservation.draft_id}`,
    observed_at: '2026-08-26T09:00:01.000Z',
    account_handle: plan.target_account,
    page_kind: 'article_editor',
    controls: [],
    editor: editorObservation,
    preview: null,
    publish_review: null,
    public_article: null,
    ...observationOverrides
  };
  const observation: XArticleBrowserObservation = {
    ...observationInput,
    page_revision: computeXArticlePageRevision(observationInput)
  };
  return observation;
}

function input(
  editorObservation: XArticleEditorObservation,
  checkpointValue: XArticleMaterializationCheckpointV1 = checkpoint(0),
  observationOverrides: Partial<XArticleBrowserObservationInput> = {}
) {
  const observation = observationFor(editorObservation, observationOverrides);
  const boundCheckpoint = checkpointValue.body.status === 'verified'
    && checkpointValue.last_editor_revision === null
    ? { ...checkpointValue, last_editor_revision: observation.page_revision }
    : checkpointValue;
  return {
    plan,
    checkpoint: boundCheckpoint,
    document,
    observation
  };
}

type Mutable<T> = T extends readonly (infer Item)[]
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function deepClone<T>(value: T): Mutable<T> {
  return JSON.parse(JSON.stringify(value)) as Mutable<T>;
}

function materializationPlanFor(documentValue: XArticleDocumentV1): XArticleMaterializationPlanV1 {
  const importTemplate = createXArticleImportTemplate(documentValue);
  const body = {
    ...deepClone(planBody),
    document_digest: sha256(documentValue),
    import_template_digest: importTemplate.template_digest as `sha256:${string}`,
    draft_binding: null,
    visual_anchors: importTemplate.anchors.map((anchor) => {
      const block = documentValue.blocks[anchor.block_ordinal - 1];
      if (block?.kind !== 'image') throw new Error('test fixture anchor is not an image');
      return {
        anchor_id: anchor.anchor_id,
        asset_id: anchor.asset_id,
        block_ordinal: anchor.block_ordinal,
        asset_digest: sha256({ asset: anchor.asset_id }),
        alt_text: block.alt_text,
        context_digest: sha256({
          previous_block: importTemplate.blocks[anchor.block_ordinal - 2] ?? null,
          anchor_block: importTemplate.blocks[anchor.block_ordinal - 1] ?? null,
          next_block: importTemplate.blocks[anchor.block_ordinal] ?? null
        })
      };
    }),
    expected_command_ceiling: 12 + importTemplate.anchors.length,
    expected_observation_ceiling: 9 + importTemplate.anchors.length
  };
  return { ...body, materialization_digest: sha256(body) };
}

function checkpointForPlan(
  planValue: XArticleMaterializationPlanV1,
  phase: XArticleMaterializationCheckpointV1['phase'],
  observation: XArticleBrowserObservation
): XArticleMaterializationCheckpointV1 {
  return {
    ...deepClone(checkpoint(0)),
    materialization_digest: planValue.materialization_digest,
    phase,
    body: { status: 'verified', observed_digest: planValue.import_template_digest },
    media: planValue.visual_anchors.map((anchor) => ({
      anchor_id: anchor.anchor_id,
      asset_id: anchor.asset_id,
      block_ordinal: anchor.block_ordinal,
      asset_digest: anchor.asset_digest,
      status: 'pending',
      observed_media_ref: null,
      observed_context_digest: null
    })),
    last_editor_revision: observation.page_revision
  };
}

function createdShellInput(
  editorOverrides: Partial<XArticleEditorObservation> = {},
  checkpointOverrides: Partial<XArticleMaterializationCheckpointV1> = {}
) {
  const editorObservation: XArticleEditorObservation = {
    ...emptyEditor,
    title: document.title,
    ...editorOverrides
  };
  const observation = observationFor(editorObservation);
  return {
    plan,
    checkpoint: {
      ...deepClone(initialCheckpoint),
      last_editor_revision: observation.page_revision,
      ...checkpointOverrides
    },
    document,
    observation
  };
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

  it.each([
    ['matching bound revision', () => createdShellInput(), 'empty'],
    ['null revision', () => {
      const value = createdShellInput();
      return { ...value, checkpoint: { ...value.checkpoint, last_editor_revision: null } };
    }, 'unverifiable'],
    ['stale revision', () => {
      const value = createdShellInput();
      return {
        ...value,
        checkpoint: { ...value.checkpoint, last_editor_revision: sha256({ stale: true }) }
      };
    }, 'unverifiable'],
    ['forged revision', () => {
      const value = createdShellInput();
      const forgedRevision = sha256({ forged: true });
      return {
        ...value,
        checkpoint: { ...value.checkpoint, last_editor_revision: forgedRevision },
        observation: { ...value.observation, page_revision: forgedRevision }
      };
    }, 'unverifiable'],
    ['changed title', () => createdShellInput({ title: 'Human changed title' }), 'unverifiable'],
    ['unknown content', () => createdShellInput({ has_unknown_content: true }), 'unverifiable'],
    ['nonempty block', () => createdShellInput({
      blocks: [{ kind: 'paragraph', runs: [{ text: 'Human body', marks: [], link: null }] }]
    }), 'unverifiable'],
    ['nonempty visual', () => createdShellInput({
      visuals: [{
        ref: 'media_created_shell',
        asset_id: plan.visual_anchors[0]!.asset_id,
        kind: 'inline',
        block_ordinal: plan.visual_anchors[0]!.block_ordinal,
        alt_text: plan.visual_anchors[0]!.alt_text,
        status: 'uploaded',
        owned_by_execution: true
      }]
    }), 'unverifiable'],
    ['non-null import state', () => createdShellInput({
      import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: template.anchors
      }
    }), 'unverifiable'],
    ['phase drift', () => createdShellInput({}, { phase: 'preflight_passed' }), 'unverifiable'],
    ['checkpoint drift', () => createdShellInput({}, {
      body: { status: 'issued', observed_digest: null }
    }), 'unverifiable']
  ] as const)(
    'classifies an exact-titled bodyless created shell with $0 as $2',
    (_name, build, expectedKind) => {
      const result = reconcileXArticleDraft(build());
      if (expectedKind === 'empty') {
        expect(result).toEqual({ kind: 'empty', next_action: 'import_body' });
      } else {
        expect(result).toMatchObject({ kind: 'unverifiable', reasons: expect.any(Array) });
      }
    }
  );

  it('returns the exact completed prefix and deterministic next action', () => {
    expect(reconcileXArticleDraft(input(editor(1), checkpoint(1)))).toEqual({
      kind: 'recoverable_partial',
      completed_anchor_ids: [plan.visual_anchors[0]!.anchor_id],
      next_anchor_id: plan.visual_anchors[1]!.anchor_id,
      next_action: 'replace_anchor'
    });

    const finalImportState = { ...editor(3), import_state: { ...editor(2).import_state!, unresolved_anchors: [] } };
    const materializingFinal = { ...checkpoint(3), phase: 'media_materializing' as const };
    expect(reconcileXArticleDraft(input(finalImportState, materializingFinal))).toEqual({
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
        editorObservation.visuals = [
          ...editorObservation.visuals,
          { ...editorObservation.visuals[0]!, ref: 'duplicate_visual_ref' }
        ];
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
    expect(reconcileXArticleDraft({ ...input(editor(3), checkpointValue), plan: planValue }).kind)
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

    const coveredObservation = observationFor(coveredEditor);
    expect(reconcileXArticleDraft({
      plan: coveredPlan,
      checkpoint: { ...coveredCheckpoint, last_editor_revision: coveredObservation.page_revision },
      document: coveredDocument,
      observation: coveredObservation
    }).kind).toBe('exact');
  });

  it.each([
    ['execution', { execution_id: 'execution_other' }],
    ['account', { account_handle: '@OtherAccount' }],
    ['page kind', { page_kind: 'article_preview' as const }],
    ['editor presence', { editor: null }]
  ])('fails closed on observation %s mismatch', (_name, overrides) => {
    expect(reconcileXArticleDraft(input(editor(3), checkpoint(3), overrides)).kind)
      .toBe('unverifiable');
  });

  it('requires the checkpoint to bind the exact stable editor revision after body import', () => {
    const value = input(editor(1), checkpoint(1));
    expect(reconcileXArticleDraft({
      ...value,
      checkpoint: { ...value.checkpoint, last_editor_revision: sha256({ stale: true }) }
    }).kind).toBe('unverifiable');
    expect(reconcileXArticleDraft({
      ...value,
      checkpoint: { ...value.checkpoint, last_editor_revision: null }
    }).kind).toBe('unverifiable');
    const forgedRevision = sha256({ forged_observation: true });
    expect(reconcileXArticleDraft({
      ...value,
      observation: { ...value.observation, page_revision: forgedRevision },
      checkpoint: { ...value.checkpoint, last_editor_revision: forgedRevision }
    }).kind).toBe('unverifiable');
  });

  it.each(['saving', 'failed'] as const)(
    'never authorizes a next action while editor autosave is %s',
    (autosaveState) => {
      expect(reconcileXArticleDraft(input({ ...editor(3), autosave_state: autosaveState }, checkpoint(3))).kind)
        .toBe('unverifiable');
    }
  );

  it.each([
    'preflight_pending',
    'preflight_passed',
    'preview_verified',
    'human_confirmed',
    'publish_submitted',
    'public_verified',
    'blocked'
  ] as const)('never authorizes draft continuation from %s', (phase) => {
    expect(reconcileXArticleDraft(input(editor(3), { ...checkpoint(3), phase })).kind)
      .toBe('unverifiable');
  });

  it('allows empty import only from a bound shell with pending body', () => {
    expect(reconcileXArticleDraft(input(emptyEditor, {
      ...initialCheckpoint, phase: 'article_shell_ready'
    }))).toEqual({ kind: 'empty', next_action: 'import_body' });
    expect(reconcileXArticleDraft(input(emptyEditor, {
      ...initialCheckpoint, phase: 'preflight_passed'
    })).kind).toBe('unverifiable');
  });

  it('fails closed on body/media phase and publish-confirmation contradictions', () => {
    expect(reconcileXArticleDraft(input(editor(1), {
      ...checkpoint(1), phase: 'body_imported'
    })).kind).toBe('unverifiable');
    expect(reconcileXArticleDraft(input(editor(1), {
      ...checkpoint(1), phase: 'draft_reconciled'
    })).kind).toBe('unverifiable');
    expect(reconcileXArticleDraft(input(editor(1), {
      ...checkpoint(1), phase: 'draft_bound'
    })).kind).toBe('unverifiable');
    expect(reconcileXArticleDraft(input(editor(0), {
      ...checkpoint(0), phase: 'body_imported',
      body: { status: 'pending', observed_digest: null }
    })).kind).toBe('unverifiable');
    for (const confirmation of ['armed', 'consumed'] as const) {
      expect(reconcileXArticleDraft(input(editor(3), {
        ...checkpoint(3), publish_confirmation: confirmation
      })).kind).toBe('unverifiable');
    }
  });

  it('rejects duplicate checkpoint and editor media references as ambiguous', () => {
    const duplicateCheckpointRefs = deepClone(checkpoint(3));
    duplicateCheckpointRefs.media[1]!.observed_media_ref = duplicateCheckpointRefs.media[0]!.observed_media_ref;
    expect(reconcileXArticleDraft(input(editor(3), duplicateCheckpointRefs)).kind).toBe('unverifiable');

    const duplicateEditorRefs = deepClone(editor(3));
    duplicateEditorRefs.visuals[1]!.ref = duplicateEditorRefs.visuals[0]!.ref;
    expect(reconcileXArticleDraft(input(duplicateEditorRefs, checkpoint(3))).kind).toBe('unverifiable');
  });

  it('rejects cover-inline shared refs and changed non-empty refs as unverifiable', () => {
    const coveredDocument = { ...deepClone(document), cover_asset_id: 'asset_cover' };
    const coveredPlan = materializationPlanFor(coveredDocument);
    const coveredEditor = deepClone(editor(3));
    coveredEditor.visuals = [{
      ref: coveredEditor.visuals[0]!.ref,
      asset_id: 'asset_cover', kind: 'cover', block_ordinal: null,
      alt_text: null, status: 'uploaded', owned_by_execution: true
    }, ...coveredEditor.visuals];
    const coveredObservation = observationFor(coveredEditor);
    const coveredCheckpoint = {
      ...deepClone(checkpoint(3)),
      materialization_digest: coveredPlan.materialization_digest,
      body: { status: 'verified' as const, observed_digest: coveredPlan.import_template_digest },
      last_editor_revision: coveredObservation.page_revision
    };
    expect(reconcileXArticleDraft({
      plan: coveredPlan, checkpoint: coveredCheckpoint, document: coveredDocument,
      observation: coveredObservation
    }).kind).toBe('unverifiable');

    const changedRef = deepClone(editor(3));
    changedRef.visuals[0]!.ref = 'different_non_empty_ref';
    expect(reconcileXArticleDraft(input(changedRef, checkpoint(3))).kind).toBe('unverifiable');

    const changedCheckpointRef = deepClone(checkpoint(3));
    changedCheckpointRef.media[0]!.observed_media_ref = 'different_checkpoint_ref';
    expect(reconcileXArticleDraft(input(editor(3), changedCheckpointRef)).kind).toBe('unverifiable');
  });

  it('reports deterministic like-for-like import-state differences', () => {
    const expectedState = editor(1).import_state!;
    const missing = reconcileXArticleDraft(input({ ...editor(1), import_state: null }, checkpoint(1)));
    expect(missing).toEqual({
      kind: 'content_drift',
      differences: [{
        path: 'editor.import_state', expected_digest: sha256(expectedState),
        observed_digest: null, reason: 'missing'
      }]
    });

    const changedDigest = sha256({ changed_template: true });
    const changed = reconcileXArticleDraft(input({
      ...editor(1), import_state: { ...expectedState, template_digest: changedDigest }
    }, checkpoint(1)));
    expect(changed).toEqual({
      kind: 'content_drift',
      differences: [{
        path: 'editor.import_state.template_digest',
        expected_digest: sha256(expectedState.template_digest),
        observed_digest: sha256(changedDigest),
        reason: 'changed'
      }]
    });

    const unexpectedState = { ...editor(2).import_state!, unresolved_anchors: [] };
    const extra = reconcileXArticleDraft(input({ ...editor(3), import_state: unexpectedState }, checkpoint(3)));
    expect(extra).toEqual({
      kind: 'content_drift',
      differences: [{
        path: 'editor.import_state', expected_digest: null,
        observed_digest: sha256(unexpectedState), reason: 'extra'
      }]
    });
  });

  it('handles zero-inline exact and imported states deterministically', () => {
    const zeroDocument: XArticleDocumentV1 = {
      schema_version: '1.0', title: 'No inline media', cover_asset_id: null,
      blocks: [{ kind: 'paragraph', runs: [{ text: 'Body', marks: [], link: null }] }]
    };
    const zeroPlan = materializationPlanFor(zeroDocument);
    const zeroTemplate = createXArticleImportTemplate(zeroDocument);
    const zeroEditor: XArticleEditorObservation = {
      draft_id: emptyEditor.draft_id, title: zeroDocument.title, blocks: zeroDocument.blocks,
      visuals: [], import_state: null, has_unknown_content: false, autosave_state: 'saved'
    };
    const exactObservation = observationFor(zeroEditor);
    expect(reconcileXArticleDraft({
      plan: zeroPlan,
      checkpoint: checkpointForPlan(zeroPlan, 'draft_reconciled', exactObservation),
      document: zeroDocument,
      observation: exactObservation
    }).kind).toBe('exact');

    const importedEditor = {
      ...zeroEditor,
      import_state: {
        template_digest: zeroTemplate.template_digest,
        source_document_digest: zeroTemplate.source_document_digest,
        unresolved_anchors: []
      }
    };
    const importedObservation = observationFor(importedEditor);
    expect(reconcileXArticleDraft({
      plan: zeroPlan,
      checkpoint: checkpointForPlan(zeroPlan, 'body_imported', importedObservation),
      document: zeroDocument,
      observation: importedObservation
    })).toEqual({
      kind: 'recoverable_partial', completed_anchor_ids: [], next_anchor_id: null,
      next_action: 'reconcile_final'
    });
  });

  it('handles an exact cover-only document with no inline anchors', () => {
    const coverDocument: XArticleDocumentV1 = {
      schema_version: '1.0', title: 'Cover only', cover_asset_id: 'asset_cover', blocks: []
    };
    const coverPlan = materializationPlanFor(coverDocument);
    const coverEditor: XArticleEditorObservation = {
      draft_id: emptyEditor.draft_id, title: coverDocument.title, blocks: [],
      visuals: [{
        ref: 'cover_1', asset_id: 'asset_cover', kind: 'cover', block_ordinal: null,
        alt_text: null, status: 'uploaded', owned_by_execution: true
      }],
      import_state: null, has_unknown_content: false, autosave_state: 'saved'
    };
    const observation = observationFor(coverEditor);
    expect(reconcileXArticleDraft({
      plan: coverPlan,
      checkpoint: checkpointForPlan(coverPlan, 'draft_reconciled', observation),
      document: coverDocument,
      observation
    }).kind).toBe('exact');
  });

  it('does not mutate any input graph', () => {
    const value = input(editor(1), checkpoint(1));
    const before = deepClone(value);
    reconcileXArticleDraft(value);
    expect(value).toEqual(before);
  });
});
