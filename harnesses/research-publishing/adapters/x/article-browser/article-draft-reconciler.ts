import type {
  XArticleBlockV1,
  XArticleDocumentV1,
  XArticleInlineRunV1
} from '../../../branches/x-article-harness/article-document.js';
import { sha256 } from '../../../core/digest.js';
import type {
  XArticleMaterializationCheckpointV1,
  XArticleMaterializationPlanV1
} from '../../../core/x-article-materialization.js';
import type {
  XArticleDraftReconciliationV1,
  XArticleEditorObservation,
  XArticleSemanticDifferenceV1,
  XArticleVisualObservation
} from './article-browser-protocol.js';
import { createXArticleImportTemplate } from './article-import-template.js';

export interface ReconcileXArticleDraftInput {
  readonly plan: XArticleMaterializationPlanV1;
  readonly checkpoint: XArticleMaterializationCheckpointV1;
  readonly document: XArticleDocumentV1;
  readonly editor: XArticleEditorObservation;
}

type Digest = `sha256:${string}`;

function planWithoutDigest(plan: XArticleMaterializationPlanV1): object {
  return Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== 'materialization_digest')
  );
}

function normalizeRun(run: XArticleInlineRunV1): XArticleInlineRunV1 {
  return {
    text: run.text.normalize('NFC'),
    marks: run.marks,
    link: run.link?.normalize('NFC') ?? null
  };
}

function normalizeBlock(block: XArticleBlockV1): XArticleBlockV1 {
  if (block.kind === 'image') {
    return { ...block, alt_text: block.alt_text.normalize('NFC') };
  }
  if ('items' in block) {
    return { ...block, items: block.items.map((item) => item.map(normalizeRun)) };
  }
  return { ...block, runs: block.runs.map(normalizeRun) };
}

function normalizedDigest(value: XArticleBlockV1 | readonly XArticleBlockV1[]): Digest {
  if (Array.isArray(value)) return sha256(value.map(normalizeBlock));
  return sha256(normalizeBlock(value as XArticleBlockV1));
}

function rawBlocksEqual(expected: readonly XArticleBlockV1[], observed: readonly XArticleBlockV1[]): boolean {
  return sha256(expected) === sha256(observed);
}

function normalizedBlocksEqual(
  expected: readonly XArticleBlockV1[],
  observed: readonly XArticleBlockV1[]
): boolean {
  return normalizedDigest(expected) === normalizedDigest(observed);
}

function difference(
  path: string,
  expected: unknown,
  observed: unknown,
  reason: XArticleSemanticDifferenceV1['reason']
): XArticleSemanticDifferenceV1 {
  return {
    path,
    expected_digest: expected === undefined ? null : sha256(expected),
    observed_digest: observed === undefined ? null : sha256(observed),
    reason
  };
}

function blockDifferences(
  expected: readonly XArticleBlockV1[],
  observed: readonly XArticleBlockV1[]
): readonly XArticleSemanticDifferenceV1[] {
  const differences: XArticleSemanticDifferenceV1[] = [];
  const expectedDigests = expected.map((block) => normalizedDigest(block));
  const observedDigests = observed.map((block) => normalizedDigest(block));
  const length = Math.max(expected.length, observed.length);
  for (let index = 0; index < length; index += 1) {
    const expectedBlock = expected[index];
    const observedBlock = observed[index];
    if (expectedBlock === undefined) {
      differences.push(difference(`editor.blocks[${index}]`, undefined, observedBlock, 'extra'));
      continue;
    }
    if (observedBlock === undefined) {
      differences.push(difference(`editor.blocks[${index}]`, expectedBlock, undefined, 'missing'));
      continue;
    }
    if (expectedDigests[index] === observedDigests[index]) continue;
    const reordered = observedDigests.includes(expectedDigests[index]!)
      || expectedDigests.includes(observedDigests[index]!);
    differences.push(difference(
      `editor.blocks[${index}]`, expectedBlock, observedBlock, reordered ? 'reordered' : 'changed'
    ));
  }
  return differences;
}

function expectedBlocksForPrefix(
  document: XArticleDocumentV1,
  plan: XArticleMaterializationPlanV1,
  completedCount: number
): readonly XArticleBlockV1[] {
  const completedOrdinals = new Set(
    plan.visual_anchors.slice(0, completedCount).map((anchor) => anchor.block_ordinal)
  );
  return document.blocks.filter((block, index) => block.kind !== 'image' || completedOrdinals.has(index + 1));
}

function observedPrefix(
  editor: XArticleEditorObservation,
  plan: XArticleMaterializationPlanV1,
  document: XArticleDocumentV1
): number | null {
  const matches: number[] = [];
  for (let completedCount = 0; completedCount <= plan.visual_anchors.length; completedCount += 1) {
    if (normalizedBlocksEqual(expectedBlocksForPrefix(document, plan, completedCount), editor.blocks)) {
      matches.push(completedCount);
    }
  }
  return matches.length === 1 ? matches[0]! : null;
}

function checkpointIdentityReasons(
  plan: XArticleMaterializationPlanV1,
  checkpoint: XArticleMaterializationCheckpointV1,
  document: XArticleDocumentV1,
  editor: XArticleEditorObservation
): readonly string[] {
  const reasons: string[] = [];
  const template = createXArticleImportTemplate(document);
  if (plan.materialization_digest !== sha256(planWithoutDigest(plan))) {
    reasons.push('materialization plan digest does not match the plan body');
  }
  if (plan.document_digest !== sha256(document)) {
    reasons.push('materialization plan document identity does not match the approved document');
  }
  if (plan.import_template_digest !== template.template_digest) {
    reasons.push('materialization plan import-template identity does not match the approved document');
  }
  if (checkpoint.execution_id !== plan.execution_id) {
    reasons.push('checkpoint execution identity does not match the materialization plan');
  }
  if (checkpoint.materialization_digest !== plan.materialization_digest) {
    reasons.push('checkpoint materialization identity does not match the materialization plan');
  }
  if (
    (checkpoint.body.status === 'verified'
      && checkpoint.body.observed_digest !== plan.import_template_digest)
    || (checkpoint.body.status !== 'verified' && checkpoint.body.observed_digest !== null)
  ) {
    reasons.push('checkpoint body observation does not match the materialization plan');
  }
  if (checkpoint.draft_id === null || checkpoint.draft_id !== editor.draft_id) {
    reasons.push('editor draft identity does not match the checkpoint');
  }
  if (checkpoint.media.length !== plan.visual_anchors.length) {
    reasons.push('checkpoint media identity count does not match the materialization plan');
  }
  const anchorCount = Math.max(checkpoint.media.length, plan.visual_anchors.length);
  for (let index = 0; index < anchorCount; index += 1) {
    const expected = plan.visual_anchors[index];
    const observed = checkpoint.media[index];
    if (
      expected === undefined
      || observed === undefined
      || observed.anchor_id !== expected.anchor_id
      || observed.asset_id !== expected.asset_id
      || observed.block_ordinal !== expected.block_ordinal
      || observed.asset_digest !== expected.asset_digest
    ) {
      reasons.push(`checkpoint media identity differs at index ${index}`);
      continue;
    }
    if (
      (observed.status === 'completed'
        && (observed.observed_media_ref === null
          || observed.observed_context_digest !== expected.context_digest))
      || (observed.status === 'pending'
        && (observed.observed_media_ref !== null || observed.observed_context_digest !== null))
    ) {
      reasons.push(`checkpoint media observation differs at index ${index}`);
    }
  }
  if (plan.visual_anchors.length !== template.anchors.length) {
    reasons.push('materialization plan anchor count does not match the approved document');
  }
  for (let index = 0; index < Math.max(plan.visual_anchors.length, template.anchors.length); index += 1) {
    const planned = plan.visual_anchors[index];
    const canonical = template.anchors[index];
    const block = canonical === undefined ? undefined : document.blocks[canonical.block_ordinal - 1];
    const contextDigest = canonical === undefined ? null : sha256({
      previous_block: template.blocks[canonical.block_ordinal - 2] ?? null,
      anchor_block: template.blocks[canonical.block_ordinal - 1] ?? null,
      next_block: template.blocks[canonical.block_ordinal] ?? null
    });
    if (
      planned === undefined
      || canonical === undefined
      || block?.kind !== 'image'
      || planned.anchor_id !== canonical.anchor_id
      || planned.asset_id !== canonical.asset_id
      || planned.block_ordinal !== canonical.block_ordinal
      || planned.alt_text !== block.alt_text
      || planned.context_digest !== contextDigest
    ) {
      reasons.push(`materialization plan anchor identity differs at index ${index}`);
    }
  }
  return reasons;
}

function mediaUnverifiableReasons(
  editor: XArticleEditorObservation,
  checkpoint: XArticleMaterializationCheckpointV1,
  plan: XArticleMaterializationPlanV1,
  document: XArticleDocumentV1
): readonly string[] {
  const reasons: string[] = [];
  if (editor.has_unknown_content) reasons.push('editor reports unknown content');
  const knownAssets = new Set(plan.visual_anchors.map((anchor) => anchor.asset_id));
  if (document.cover_asset_id !== null) knownAssets.add(document.cover_asset_id);
  for (let index = 0; index < editor.visuals.length; index += 1) {
    const visual = editor.visuals[index]!;
    if (visual.ref.length === 0) reasons.push(`media reference is unknown at index ${index}`);
    if (visual.asset_id === null || !knownAssets.has(visual.asset_id)) {
      reasons.push(`media asset identity is unknown at index ${index}`);
    }
    if (!visual.owned_by_execution) reasons.push(`media ownership is unverifiable at index ${index}`);
    if (visual.status !== 'uploaded') reasons.push(`media upload state is unverifiable at index ${index}`);
  }
  for (let index = 0; index < checkpoint.media.length; index += 1) {
    const media = checkpoint.media[index]!;
    if (media.status === 'ambiguous') reasons.push(`checkpoint media is ambiguous at index ${index}`);
    if (media.status !== 'pending' && media.status !== 'completed' && media.status !== 'ambiguous') {
      reasons.push(`checkpoint media is incomplete at index ${index}`);
    }
  }
  return reasons;
}

function checkpointCompletedPrefix(checkpoint: XArticleMaterializationCheckpointV1): number | null {
  let completedCount = 0;
  let observedPending = false;
  for (const media of checkpoint.media) {
    if (media.status === 'completed') {
      if (observedPending) return null;
      completedCount += 1;
    } else if (media.status === 'pending') {
      observedPending = true;
    }
  }
  return completedCount;
}

function visualDifferences(
  editor: XArticleEditorObservation,
  checkpoint: XArticleMaterializationCheckpointV1,
  plan: XArticleMaterializationPlanV1,
  document: XArticleDocumentV1,
  completedCount: number
): readonly XArticleSemanticDifferenceV1[] {
  const differences: XArticleSemanticDifferenceV1[] = [];
  const inlineVisuals = editor.visuals.filter((visual) => visual.kind === 'inline');
  const coverVisuals = editor.visuals.filter((visual) => visual.kind === 'cover');
  if (document.cover_asset_id === null) {
    for (let index = 0; index < coverVisuals.length; index += 1) {
      differences.push(difference(`editor.visuals.cover[${index}]`, undefined, coverVisuals[index], 'extra'));
    }
  } else {
    const cover = coverVisuals[0];
    if (cover === undefined) {
      differences.push(difference(
        'editor.visuals.cover[0]', { asset_id: document.cover_asset_id }, undefined, 'missing'
      ));
    } else if (
      cover.asset_id !== document.cover_asset_id
      || cover.block_ordinal !== null
    ) {
      differences.push(difference(
        'editor.visuals.cover[0]',
        { asset_id: document.cover_asset_id, block_ordinal: null },
        { asset_id: cover.asset_id, block_ordinal: cover.block_ordinal },
        'changed'
      ));
    }
    for (let index = 1; index < coverVisuals.length; index += 1) {
      differences.push(difference(`editor.visuals.cover[${index}]`, undefined, coverVisuals[index], 'extra'));
    }
  }
  const expected = plan.visual_anchors.slice(0, completedCount);
  const length = Math.max(expected.length, inlineVisuals.length);
  for (let index = 0; index < length; index += 1) {
    const anchor = expected[index];
    const visual = inlineVisuals[index];
    if (anchor === undefined) {
      differences.push(difference(`editor.visuals.inline[${index}]`, undefined, visual, 'extra'));
      continue;
    }
    if (visual === undefined) {
      differences.push(difference(`editor.visuals.inline[${index}]`, anchor, undefined, 'missing'));
      continue;
    }
    const expectedVisual = {
      ref: checkpoint.media[index]!.observed_media_ref,
      asset_id: anchor.asset_id,
      kind: 'inline' as const,
      block_ordinal: anchor.block_ordinal,
      alt_text: anchor.alt_text.normalize('NFC'),
      status: 'uploaded' as const,
      owned_by_execution: true
    };
    const normalizedVisual = { ...visual, alt_text: visual.alt_text?.normalize('NFC') ?? null };
    if (sha256(expectedVisual) !== sha256(normalizedVisual)) {
      const reordered = expected.some((candidate) => candidate.asset_id === visual.asset_id)
        && anchor.asset_id !== visual.asset_id;
      differences.push(difference(
        `editor.visuals.inline[${index}]`, expectedVisual, normalizedVisual, reordered ? 'reordered' : 'changed'
      ));
    }
  }
  return differences;
}

function importStateMatches(
  editor: XArticleEditorObservation,
  document: XArticleDocumentV1,
  anchorCount: number,
  completedCount: number
): boolean {
  if (editor.import_state === null) return completedCount === anchorCount;
  const template = createXArticleImportTemplate(document);
  return editor.import_state.template_digest === template.template_digest
    && editor.import_state.source_document_digest === template.source_document_digest
    && sha256(editor.import_state.unresolved_anchors) === sha256(template.anchors.slice(completedCount));
}

function editorIsEmpty(editor: XArticleEditorObservation): boolean {
  return editor.title.length === 0
    && editor.blocks.length === 0
    && editor.visuals.length === 0
    && editor.import_state === null
    && !editor.has_unknown_content;
}

export function reconcileXArticleDraft(input: ReconcileXArticleDraftInput): XArticleDraftReconciliationV1 {
  const { plan, checkpoint, document, editor } = input;
  const identityReasons = checkpointIdentityReasons(plan, checkpoint, document, editor);
  const unverifiableReasons = [
    ...identityReasons,
    ...mediaUnverifiableReasons(editor, checkpoint, plan, document)
  ];
  if (unverifiableReasons.length > 0) {
    return { kind: 'unverifiable', reasons: unverifiableReasons };
  }

  const checkpointPrefix = checkpointCompletedPrefix(checkpoint);
  if (checkpointPrefix === null) {
    return { kind: 'unverifiable', reasons: ['checkpoint completed media is not an ordered prefix'] };
  }
  if (editorIsEmpty(editor)) {
    if (checkpointPrefix === 0 && checkpoint.body.status === 'pending') {
      return { kind: 'empty', next_action: 'import_body' };
    }
    return { kind: 'unverifiable', reasons: ['empty editor conflicts with the checkpoint body or media state'] };
  }
  if (checkpoint.body.status !== 'verified') {
    return { kind: 'unverifiable', reasons: ['populated editor conflicts with an unverified checkpoint body'] };
  }

  const prefix = observedPrefix(editor, plan, document);
  if (prefix === null) {
    const expected = expectedBlocksForPrefix(document, plan, checkpointPrefix);
    const differences = blockDifferences(expected, editor.blocks);
    return {
      kind: 'content_drift',
      differences: differences.length > 0
        ? differences
        : [difference('editor.blocks', expected, editor.blocks, 'ambiguous')]
    };
  }
  if (prefix !== checkpointPrefix) {
    return { kind: 'unverifiable', reasons: ['checkpoint and editor completed-anchor prefixes differ'] };
  }

  const differences: XArticleSemanticDifferenceV1[] = [];
  const normalizedTitleMatches = document.title.normalize('NFC') === editor.title.normalize('NFC');
  if (!normalizedTitleMatches) differences.push(difference('editor.title', document.title, editor.title, 'changed'));
  differences.push(...visualDifferences(editor, checkpoint, plan, document, prefix));
  if (!importStateMatches(editor, document, plan.visual_anchors.length, prefix)) {
    differences.push(difference(
      'editor.import_state',
      prefix === plan.visual_anchors.length ? null : createXArticleImportTemplate(document).anchors.slice(prefix),
      editor.import_state,
      'changed'
    ));
  }
  if (differences.length > 0) return { kind: 'content_drift', differences };

  if (prefix < plan.visual_anchors.length || editor.import_state !== null) {
    return {
      kind: 'recoverable_partial',
      completed_anchor_ids: plan.visual_anchors.slice(0, prefix).map((anchor) => anchor.anchor_id),
      next_anchor_id: plan.visual_anchors[prefix]?.anchor_id ?? null,
      next_action: prefix < plan.visual_anchors.length ? 'replace_anchor' : 'reconcile_final'
    };
  }

  const exact = document.title === editor.title
    && rawBlocksEqual(document.blocks, editor.blocks)
    && plan.visual_anchors.every((anchor, index) => {
      const visual = editor.visuals.filter((candidate) => candidate.kind === 'inline')[index] as
        XArticleVisualObservation | undefined;
      return visual?.alt_text === anchor.alt_text;
    });
  return { kind: exact ? 'exact' : 'semantically_equivalent', next_action: 'open_preview' };
}
