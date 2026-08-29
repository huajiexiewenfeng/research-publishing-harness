import { isDeepStrictEqual } from 'node:util';

import type { XArticleBlockV1 } from '../../../branches/x-article-harness/article-document.js';
import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
import type {
  XArticleMaterializationAnchorV1,
  XArticleMaterializationPlanV1
} from '../../../core/x-article-materialization.js';
import {
  assertXArticlePublicationPlan,
  type XArticlePublicationPlanV1,
  type XArticleVisualBindingV1
} from '../../../core/x-article-publication-plan.js';
import type { XArticleBrowserCommandV1 } from './article-command-broker.js';
import {
  normalizeXArticleHostEditor,
  type XArticleHostEditorBlockV1
} from './article-browser-host-normalizer.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation,
  type XArticleBrowserObservationInput,
  type XArticleControlObservation,
  type XArticleVisualObservation
} from './article-browser-protocol.js';
import {
  createXArticleImportTemplate,
  type XArticleImportTemplateV1,
  type XArticleVisualAnchorV1
} from './article-import-template.js';

export interface XArticleHostMediaV1 {
  readonly ref: string;
  readonly alt_text: string | null;
  readonly status: 'processing' | 'uploaded' | 'failed';
}

export type XArticleHostPageBlockV1 =
  | Exclude<XArticleBlockV1, { readonly kind: 'image' }>
  | { readonly kind: 'visual_anchor'; readonly marker: string }
  | {
      readonly kind: 'media';
      readonly ref: string;
      readonly block_ordinal: number;
      readonly alt_text: string | null;
      readonly status: 'processing' | 'uploaded' | 'failed';
    };

export interface XArticleHostPageSnapshotV1 {
  readonly schema_version: 'x-article-host-page-snapshot/v1';
  readonly canonical_url: string;
  readonly account_handle: string | null;
  readonly page_kind: 'article_editor';
  readonly controls: readonly XArticleControlObservation[];
  readonly editor: {
    readonly draft_id: string;
    readonly title: string;
    readonly blocks: readonly XArticleHostPageBlockV1[];
    readonly cover: XArticleHostMediaV1 | null;
    readonly autosave_state: 'saving' | 'saved' | 'failed';
    readonly has_unknown_content: boolean;
  };
}

export interface XArticleHostObservationContextV1 {
  readonly publication_plan: XArticlePublicationPlanV1;
  readonly materialization_plan: XArticleMaterializationPlanV1;
}

export interface BuildXArticleHostObservationInputV1 {
  readonly command: XArticleBrowserCommandV1;
  readonly context: XArticleHostObservationContextV1;
  readonly page_snapshot: XArticleHostPageSnapshotV1;
  readonly previous_observation: XArticleBrowserObservation | null;
  readonly observation_id: string;
  readonly observed_at: string;
}

type MediaTarget =
  | { readonly kind: 'cover'; readonly asset_id: string; readonly block_ordinal: null }
  | { readonly kind: 'inline'; readonly asset_id: string; readonly block_ordinal: number };

interface BoundPlans {
  readonly publication: XArticlePublicationPlanV1;
  readonly materialization: XArticleMaterializationPlanV1;
  readonly template: XArticleImportTemplateV1;
}

type BlockVisualBinding = XArticleVisualBindingV1 & {
  readonly placement: { readonly kind: 'block'; readonly block_ordinal: number };
};

function rejectDraft(message: string, details?: unknown): never {
  throw new HarnessError('ARTICLE_DRAFT_CONFLICT', message, details);
}

function rejectMaterialization(message: string, details?: unknown): never {
  throw new HarnessError('ARTICLE_MATERIALIZATION_DRIFT', message, details);
}

function rejectAsset(message: string, details?: unknown): never {
  throw new HarnessError('ARTICLE_ASSET_MISMATCH', message, details);
}

function rejectMedia(message: string, details?: unknown): never {
  throw new HarnessError('ARTICLE_MEDIA_AMBIGUOUS', message, details);
}

function expectedMaterializationAnchor(
  publication: XArticlePublicationPlanV1,
  template: XArticleImportTemplateV1,
  anchor: XArticleVisualAnchorV1
): XArticleMaterializationAnchorV1 {
  const binding = publication.intent.visuals.find((candidate) =>
    candidate.placement.kind === 'block'
    && candidate.placement.block_ordinal === anchor.block_ordinal
    && candidate.asset.asset_id === anchor.asset_id
  );
  const templateBlock = template.blocks[anchor.block_ordinal - 1];
  if (
    binding === undefined
    || templateBlock === undefined
    || templateBlock.kind !== 'visual_anchor'
    || templateBlock.anchor_id !== anchor.anchor_id
    || templateBlock.marker !== anchor.marker
  ) {
    rejectMaterialization(
      `X Article materialization anchor ${anchor.anchor_id} differs from the publication plan`
    );
  }
  return {
    anchor_id: anchor.anchor_id,
    asset_id: anchor.asset_id,
    block_ordinal: anchor.block_ordinal,
    asset_digest: binding.asset.digest as `sha256:${string}`,
    alt_text: binding.asset.alt_text,
    context_digest: sha256({
      previous_block: template.blocks[anchor.block_ordinal - 2] ?? null,
      anchor_block: templateBlock,
      next_block: template.blocks[anchor.block_ordinal] ?? null
    })
  };
}

function bindPlans(context: XArticleHostObservationContextV1): BoundPlans {
  assertXArticlePublicationPlan(context.publication_plan);
  const publication = structuredClone(context.publication_plan);
  const materialization = validateContract<XArticleMaterializationPlanV1>(
    'x-article-materialization-plan',
    structuredClone(context.materialization_plan)
  );
  const template = createXArticleImportTemplate(publication.intent.document);
  const expectedAnchors = template.anchors.map((anchor) =>
    expectedMaterializationAnchor(publication, template, anchor)
  );

  if (materialization.publication_plan_digest !== publication.plan_digest) {
    rejectMaterialization('X Article materialization publication plan digest changed');
  }
  if (
    materialization.target_account !== publication.intent.target_account
    || materialization.document_digest !== template.source_document_digest
    || materialization.import_template_digest !== template.template_digest
    || !isDeepStrictEqual(materialization.visual_anchors, expectedAnchors)
  ) {
    rejectMaterialization('X Article materialization plan differs from its locked publication inputs');
  }
  return { publication, materialization, template };
}

function validateCommand(commandValue: XArticleBrowserCommandV1): XArticleBrowserCommandV1 {
  const command = validateContract<XArticleBrowserCommandV1>(
    'x-article-browser-command',
    structuredClone(commandValue)
  );
  if (
    command.payload_digest !== sha256(command.payload)
    || command.payload.kind !== command.kind
  ) {
    throw new HarnessError('CONTRACT_INVALID', 'X Article Host command payload binding changed');
  }
  return command;
}

function blockBinding(
  publication: XArticlePublicationPlanV1,
  blockOrdinal: number,
  assetId: string
): BlockVisualBinding {
  const matches = publication.intent.visuals.filter((candidate) =>
    candidate.placement.kind === 'block'
    && candidate.placement.block_ordinal === blockOrdinal
    && candidate.asset.asset_id === assetId
  );
  if (matches.length !== 1 || matches[0]?.placement.kind !== 'block') {
    rejectAsset(`X Article media ordinal ${blockOrdinal} has no unique publication binding`);
  }
  return matches[0] as BlockVisualBinding;
}

function coverBinding(publication: XArticlePublicationPlanV1): XArticleVisualBindingV1 | null {
  const matches = publication.intent.visuals.filter((candidate) =>
    candidate.placement.kind === 'cover'
  );
  if (matches.length > 1) rejectAsset('X Article publication plan has duplicate cover bindings');
  return matches[0] ?? null;
}

function commandTarget(command: XArticleBrowserCommandV1, plans: BoundPlans): MediaTarget | null {
  const articlePackage = plans.publication.intent.article_package;
  if (command.kind === 'replace_article_visual_anchor') {
    const plannedAnchor = plans.template.anchors.find((candidate) =>
      candidate.anchor_id === command.payload.anchor.anchor_id
      && candidate.asset_id === command.payload.anchor.asset_id
      && candidate.block_ordinal === command.payload.anchor.block_ordinal
      && candidate.marker === command.payload.anchor.marker
    );
    const binding = blockBinding(
      plans.publication,
      command.payload.anchor.block_ordinal,
      command.payload.anchor.asset_id
    );
    if (
      plannedAnchor === undefined
      || command.payload.package_root !== articlePackage.root
      || command.payload.package_digest !== articlePackage.digest
      || !isDeepStrictEqual(command.payload.asset, binding.asset)
    ) {
      rejectAsset('X Article command asset or anchor differs from the locked plan');
    }
    return {
      kind: 'inline',
      asset_id: binding.asset.asset_id,
      block_ordinal: command.payload.anchor.block_ordinal
    };
  }
  if (
    command.kind === 'upload_article_cover'
    && command.payload.kind === 'upload_article_cover'
  ) {
    const binding = coverBinding(plans.publication);
    if (
      binding === null
      || command.payload.package_root !== articlePackage.root
      || command.payload.package_digest !== articlePackage.digest
      || !isDeepStrictEqual(command.payload.asset, binding.asset)
    ) {
      rejectAsset('X Article cover command asset differs from the locked plan');
    }
    return { kind: 'cover', asset_id: binding.asset.asset_id, block_ordinal: null };
  }
  if (command.kind === 'import_article_document') {
    if (
      command.payload.package_root !== articlePackage.root
      || command.payload.package_digest !== articlePackage.digest
      || !isDeepStrictEqual(command.payload.template, plans.template)
    ) {
      rejectMaterialization('X Article import command differs from the locked materialization plan');
    }
  }
  return null;
}

function assertPageIdentity(
  input: BuildXArticleHostObservationInputV1,
  command: XArticleBrowserCommandV1,
  plans: BoundPlans,
  previous: XArticleBrowserObservation | null
): void {
  const page = input.page_snapshot;
  let url: URL;
  try {
    url = new URL(page.canonical_url);
  } catch {
    rejectDraft('X Article Host canonical URL is invalid');
  }
  if (
    page.schema_version !== 'x-article-host-page-snapshot/v1'
    || page.page_kind !== 'article_editor'
    || url.origin !== 'https://x.com'
    || url.pathname !== `/compose/articles/edit/${page.editor.draft_id}`
    || page.account_handle !== plans.publication.intent.target_account
    || page.editor.title !== plans.publication.intent.document.title
    || command.allowed_origin !== 'https://x.com'
    || command.execution_id !== plans.materialization.execution_id
    || command.run_id !== plans.publication.run_id
    || command.draft_id !== page.editor.draft_id
  ) {
    rejectDraft('X Article Host page, command, or publication identity changed');
  }
  if (
    plans.materialization.draft_binding !== null
    && plans.materialization.draft_binding.draft_id !== page.editor.draft_id
  ) {
    rejectDraft('X Article Host page differs from the adopted Draft binding');
  }
  if (
    previous !== null
    && (
      command.expected_page_revision !== previous.page_revision
      || previous.execution_id !== command.execution_id
      || previous.account_handle !== page.account_handle
      || previous.editor?.draft_id !== page.editor.draft_id
    )
  ) {
    rejectDraft('X Article Host predecessor Observation binding changed');
  }
}

function observationWithoutRevision(observation: XArticleBrowserObservation): object {
  return Object.fromEntries(
    Object.entries(observation).filter(([key]) => key !== 'page_revision')
  );
}

function pageStateBody(input: Pick<
  XArticleBrowserObservationInput,
  | 'origin'
  | 'canonical_url'
  | 'account_handle'
  | 'page_kind'
  | 'controls'
  | 'editor'
  | 'preview'
  | 'publish_review'
  | 'public_article'
>): object {
  return {
    schema_version: 'x-article-page-state/v1',
    origin: input.origin,
    canonical_url: input.canonical_url,
    account_handle: input.account_handle,
    page_kind: input.page_kind,
    controls: input.controls,
    editor: input.editor,
    preview: input.preview,
    publish_review: input.publish_review,
    public_article: input.public_article
  };
}

export function computeXArticlePageStateRevision(input: Parameters<typeof pageStateBody>[0]): `sha256:${string}` {
  return sha256(pageStateBody(input));
}

function validatePreviousObservation(
  previousValue: XArticleBrowserObservation | null
): XArticleBrowserObservation | null {
  if (previousValue === null) return null;
  const previous = validateContract<XArticleBrowserObservation>(
    'x-article-browser-observation',
    structuredClone(previousValue)
  );
  if (previous.page_revision !== computeXArticlePageRevision(observationWithoutRevision(previous))) {
    throw new HarnessError('CONTRACT_INVALID', 'Previous X Article Observation revision changed');
  }
  if (
    previous.page_state_revision !== undefined
    && previous.page_state_revision !== computeXArticlePageStateRevision(previous)
  ) {
    throw new HarnessError('CONTRACT_INVALID', 'Previous X Article page state revision changed');
  }
  return previous;
}

function previousVisual(
  previous: XArticleBrowserObservation | null,
  ref: string,
  expected: Omit<XArticleVisualObservation, 'ref' | 'alt_text' | 'status' | 'owned_by_execution'>
): XArticleVisualObservation | null {
  const matches = previous?.editor?.visuals.filter((visual) => visual.ref === ref) ?? [];
  if (matches.length > 1) rejectMedia(`X Article media ref ${ref} is duplicated in predecessor evidence`);
  const visual = matches[0] ?? null;
  if (
    visual !== null
    && (
      visual.asset_id !== expected.asset_id
      || visual.kind !== expected.kind
      || visual.block_ordinal !== expected.block_ordinal
    )
  ) {
    rejectMedia(`X Article media ref ${ref} changed semantic ownership`);
  }
  return visual;
}

function ownedByExecution(input: {
  readonly previous: XArticleBrowserObservation | null;
  readonly target: MediaTarget | null;
  readonly ref: string;
  readonly kind: 'cover' | 'inline';
  readonly asset_id: string;
  readonly block_ordinal: number | null;
}): boolean {
  const prior = previousVisual(input.previous, input.ref, {
    kind: input.kind,
    asset_id: input.asset_id,
    block_ordinal: input.block_ordinal
  });
  if (prior !== null) return prior.owned_by_execution;
  return input.target !== null
    && input.target.kind === input.kind
    && input.target.asset_id === input.asset_id
    && input.target.block_ordinal === input.block_ordinal;
}

function bindEditor(input: {
  readonly page: XArticleHostPageSnapshotV1;
  readonly plans: BoundPlans;
  readonly previous: XArticleBrowserObservation | null;
  readonly target: MediaTarget | null;
}) {
  const observedMediaRefs = new Set<string>();
  const observedMediaOrdinals = new Set<number>();
  if (input.page.editor.cover !== null) {
    observedMediaRefs.add(input.page.editor.cover.ref);
  }
  for (const rawBlock of input.page.editor.blocks) {
    if (rawBlock.kind !== 'media') continue;
    if (observedMediaRefs.has(rawBlock.ref)) {
      rejectMedia(`X Article media ref ${rawBlock.ref} is duplicated`);
    }
    if (observedMediaOrdinals.has(rawBlock.block_ordinal)) {
      rejectMedia(`X Article media ordinal ${rawBlock.block_ordinal} is duplicated`);
    }
    observedMediaRefs.add(rawBlock.ref);
    observedMediaOrdinals.add(rawBlock.block_ordinal);
  }

  if (input.page.editor.blocks.length !== input.plans.template.blocks.length) {
    rejectDraft('X Article Host block count changed, so media ordinals are unsafe');
  }
  const blocks: XArticleHostEditorBlockV1[] = [];
  const visuals: XArticleVisualObservation[] = [];
  const mediaRefs = new Set<string>();
  const mediaOrdinals = new Set<number>();

  const addMediaRef = (ref: string): void => {
    if (mediaRefs.has(ref)) rejectMedia(`X Article media ref ${ref} is duplicated`);
    mediaRefs.add(ref);
  };

  const cover = input.page.editor.cover;
  if (cover !== null) {
    const binding = coverBinding(input.plans.publication);
    if (binding === null) rejectAsset('X Article Host observed an unplanned cover');
    addMediaRef(cover.ref);
    visuals.push({
      ref: cover.ref,
      asset_id: binding.asset.asset_id,
      kind: 'cover',
      block_ordinal: null,
      alt_text: cover.alt_text,
      status: cover.status,
      owned_by_execution: ownedByExecution({
        previous: input.previous,
        target: input.target,
        ref: cover.ref,
        kind: 'cover',
        asset_id: binding.asset.asset_id,
        block_ordinal: null
      })
    });
  }

  for (const [index, rawBlock] of input.page.editor.blocks.entries()) {
    const blockOrdinal = index + 1;
    const templateBlock = input.plans.template.blocks[index];

    if (rawBlock.kind === 'visual_anchor') {
      const anchor = input.plans.template.anchors.find((candidate) =>
        candidate.block_ordinal === blockOrdinal
      );
      if (
        anchor === undefined
        || templateBlock?.kind !== 'visual_anchor'
        || rawBlock.marker !== anchor.marker
      ) {
        rejectDraft(`X Article Host observed a foreign visual anchor at ordinal ${blockOrdinal}`);
      }
      blocks.push({
        kind: 'visual_anchor',
        anchor_id: anchor.anchor_id,
        marker: anchor.marker
      });
      continue;
    }

    if (rawBlock.kind === 'media') {
      if (mediaOrdinals.has(rawBlock.block_ordinal)) {
        rejectMedia(`X Article media ordinal ${rawBlock.block_ordinal} is duplicated`);
      }
      mediaOrdinals.add(rawBlock.block_ordinal);
      if (rawBlock.block_ordinal !== blockOrdinal) {
        rejectMedia(
          `X Article media ordinal ${rawBlock.block_ordinal} differs from observed ordinal ${blockOrdinal}`
        );
      }
      const anchors = input.plans.materialization.visual_anchors.filter((candidate) =>
        candidate.block_ordinal === blockOrdinal
      );
      if (anchors.length !== 1 || templateBlock?.kind !== 'visual_anchor') {
        rejectMedia(`X Article media ordinal ${blockOrdinal} has no unique planned anchor`);
      }
      const anchor = anchors[0]!;
      const binding = blockBinding(input.plans.publication, blockOrdinal, anchor.asset_id);
      addMediaRef(rawBlock.ref);
      blocks.push({
        kind: 'image',
        asset_id: binding.asset.asset_id,
        alt_text: binding.asset.alt_text
      });
      visuals.push({
        ref: rawBlock.ref,
        asset_id: binding.asset.asset_id,
        kind: 'inline',
        block_ordinal: blockOrdinal,
        alt_text: rawBlock.alt_text,
        status: rawBlock.status,
        owned_by_execution: ownedByExecution({
          previous: input.previous,
          target: input.target,
          ref: rawBlock.ref,
          kind: 'inline',
          asset_id: binding.asset.asset_id,
          block_ordinal: blockOrdinal
        })
      });
      continue;
    }

    if (templateBlock?.kind === 'visual_anchor') {
      rejectDraft(`X Article visual anchor or media is missing at ordinal ${blockOrdinal}`);
    }
    blocks.push(structuredClone(rawBlock));
  }

  return normalizeXArticleHostEditor({
    editor: {
      draft_id: input.page.editor.draft_id,
      title: input.page.editor.title,
      blocks,
      visuals,
      has_unknown_content: input.page.editor.has_unknown_content,
      autosave_state: input.page.editor.autosave_state
    },
    template: input.plans.template
  });
}

export function buildXArticleHostObservation(
  input: BuildXArticleHostObservationInputV1
): XArticleBrowserObservation {
  const plans = bindPlans(input.context);
  const command = validateCommand(input.command);
  const previous = validatePreviousObservation(input.previous_observation);
  assertPageIdentity(input, command, plans, previous);
  const target = commandTarget(command, plans);
  const editor = bindEditor({ page: input.page_snapshot, plans, previous, target });

  const semanticFields = {
    origin: 'https://x.com' as const,
    canonical_url: input.page_snapshot.canonical_url,
    account_handle: input.page_snapshot.account_handle,
    page_kind: 'article_editor' as const,
    controls: structuredClone(input.page_snapshot.controls),
    editor,
    preview: null,
    publish_review: null,
    public_article: null
  };
  const observation: XArticleBrowserObservationInput = {
    schema_version: '1.0',
    observation_id: input.observation_id,
    execution_id: command.execution_id,
    command_id: command.command_id,
    ...semanticFields,
    page_state_revision: computeXArticlePageStateRevision(semanticFields),
    observed_at: input.observed_at
  };
  return validateContract<XArticleBrowserObservation>('x-article-browser-observation', {
    ...observation,
    page_revision: computeXArticlePageRevision(observation)
  });
}
