import { sha256 } from '../../../core/digest.js';
import type { ErrorCode } from '../../../core/errors.js';
import type { XArticlePublicationPlanV1 } from '../../../core/x-article-publication-plan.js';
import type {
  XArticleMaterializationPlanV1
} from '../../../core/x-article-materialization.js';
import type {
  XArticleBrowserObservation,
  XArticleDraftReconciliationV1,
  XArticleEditorObservation,
  XArticleVisualObservation
} from './article-browser-protocol.js';
import type {
  IssueXArticleBrowserCommandInput
} from './article-command-broker.js';
import {
  createXArticleImportTemplate,
  type XArticleVisualAnchorV1
} from './article-import-template.js';
import type { XArticlePageContract } from './article-page-contract.js';

export type XArticleImportStrategy = 'bulk_document' | 'incremental_blocks';

export interface XArticleEditorContext {
  readonly plan: XArticlePublicationPlanV1;
  readonly draft_id: string;
  readonly import_strategy: XArticleImportStrategy;
  readonly bulk_import_issued: boolean;
}

export type XArticleEditorDecision =
  | { readonly kind: 'command'; readonly input: IssueXArticleBrowserCommandInput }
  | { readonly kind: 'complete' }
  | { readonly kind: 'blocked'; readonly code: ErrorCode; readonly message: string };

export interface XArticleMaterializationEditorContext {
  readonly plan: XArticlePublicationPlanV1;
  readonly materialization_plan: XArticleMaterializationPlanV1;
  readonly draft_id: string;
}

export function nextMaterializationEditorDecision(
  context: XArticleMaterializationEditorContext,
  observation: XArticleBrowserObservation,
  reconciliation: XArticleDraftReconciliationV1,
  contract: XArticlePageContract
): XArticleEditorDecision {
  if (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable') {
    return blocked('ARTICLE_MATERIALIZATION_DRIFT', 'X Article Draft cannot be reconciled safely');
  }
  if (reconciliation.kind === 'empty') {
    return command(context, observation, 'import_article_document', 'import_article_document', {
      kind: 'import_article_document',
      target_ref: contract.detectControl(observation, 'body').ref,
      package_root: context.plan.intent.article_package.root,
      package_digest: context.plan.intent.article_package.digest,
      template: createXArticleImportTemplate(context.plan.intent.document)
    });
  }
  if (reconciliation.kind === 'recoverable_partial') {
    if (reconciliation.next_action === 'reconcile_final') {
      return command(context, observation, 'reconcile_article_import_completion', 'observe_article_page', {
        kind: 'observe_article_page', scope: 'editor'
      }, 'read');
    }
    const anchor = context.materialization_plan.visual_anchors.find(
      (candidate) => candidate.anchor_id === reconciliation.next_anchor_id
    );
    const templateAnchor = createXArticleImportTemplate(context.plan.intent.document).anchors.find(
      (candidate) => candidate.anchor_id === reconciliation.next_anchor_id
    );
    const binding = anchor === undefined ? undefined : context.plan.intent.visuals.find((candidate) =>
      candidate.placement.kind === 'block'
      && candidate.placement.block_ordinal === anchor.block_ordinal
      && candidate.asset.asset_id === anchor.asset_id
    );
    if (anchor === undefined || templateAnchor === undefined || binding === undefined) {
      return blocked('ARTICLE_ASSET_MISMATCH', 'reconciled X Article anchor has no locked visual binding');
    }
    return command(
      context,
      observation,
      `replace_article_visual_anchor_${anchor.block_ordinal}`,
      'replace_article_visual_anchor',
      {
        kind: 'replace_article_visual_anchor',
        target_ref: contract.detectControl(observation, 'body').ref,
        anchor: templateAnchor,
        package_root: context.plan.intent.article_package.root,
        package_digest: context.plan.intent.article_package.digest,
        asset: binding.asset
      }
    );
  }
  return command(context, observation, 'open_article_preview', 'open_article_preview', {
    kind: 'open_article_preview', target_ref: contract.detectControl(observation, 'preview').ref
  });
}

type XArticleCommandBinding = IssueXArticleBrowserCommandInput extends infer Input
  ? Input extends IssueXArticleBrowserCommandInput
    ? Pick<Input, 'kind' | 'payload' | 'side_effect'>
    : never
  : never;

type XArticleCommandArguments = XArticleCommandBinding extends infer Binding
  ? Binding extends XArticleCommandBinding
    ? [
        kind: Binding['kind'],
        payload: Binding['payload'],
        sideEffect?: Binding['side_effect']
      ]
    : never
  : never;

export function nextArticleEditorDecision(
  context: XArticleEditorContext,
  observation: XArticleBrowserObservation,
  contract: XArticlePageContract
): XArticleEditorDecision {
  try {
    const page = contract.detectPage(observation);
    if (page.kind !== 'article_editor' || page.draft_id !== context.draft_id) {
      return blocked('ARTICLE_DRAFT_CONFLICT', 'active X Article draft identity differs from the execution');
    }
    const editor = contract.detectEditor(observation);
    const document = context.plan.intent.document;
    if (editor.title !== '' && editor.title !== document.title) {
      return blocked('ARTICLE_CONTENT_MISMATCH', 'X Article title differs from the Plan');
    }
    if (context.import_strategy === 'bulk_document' && context.bulk_import_issued !== true) {
      const importState = contract.readEditorImportState(observation);
      if (importState !== null || editor.blocks.length > 0 || editor.visuals.length > 0) {
        return blocked(
          'ARTICLE_CONTENT_MISMATCH',
          'X Article editor contains content before bulk import issuance'
        );
      }
    }
    if (editor.title === '') {
      return command(context, observation, 'set_article_title', 'set_article_title', {
        kind: 'set_article_title',
        target_ref: contract.detectControl(observation, 'title').ref,
        title: document.title
      });
    }

    if (context.import_strategy === 'bulk_document') {
      return nextBulkDocumentDecision(context, observation, contract, editor);
    }

    return nextIncrementalBlocksDecision(context, observation, contract, editor);
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
      return blocked((error as { code: ErrorCode }).code, String((error as { message: unknown }).message));
    }
    throw error;
  }
}

function nextBulkDocumentDecision(
  context: XArticleEditorContext,
  observation: XArticleBrowserObservation,
  contract: XArticlePageContract,
  editor: XArticleEditorObservation
): XArticleEditorDecision {
  const document = context.plan.intent.document;
  const template = createXArticleImportTemplate(document);
  const importState = contract.readEditorImportState(observation);

  if (context.bulk_import_issued !== true) {
    if (importState === null && editor.blocks.length === 0 && editor.visuals.length === 0) {
      return command(context, observation, 'import_article_document', 'import_article_document', {
        kind: 'import_article_document',
        target_ref: contract.detectControl(observation, 'body').ref,
        package_root: context.plan.intent.article_package.root,
        package_digest: context.plan.intent.article_package.digest,
        template
      });
    }
    return blocked(
      'ARTICLE_CONTENT_MISMATCH',
      'X Article editor contains content before bulk import issuance'
    );
  }

  if (importState === null && editor.blocks.length === 0 && editor.visuals.length === 0) {
    if (document.blocks.length > 0) {
      return blocked(
        'ARTICLE_CONTENT_MISMATCH',
        'issued X Article import produced an empty editor for a non-empty Plan document'
      );
    }
  }

  if (importState !== null) {
    if (
      importState.template_digest !== template.template_digest ||
      importState.source_document_digest !== template.source_document_digest
    ) {
      return blocked('ARTICLE_CONTENT_MISMATCH', 'X Article import digests differ from the Plan');
    }

    const unresolvedCount = importState.unresolved_anchors.length;
    const resolvedCount = template.anchors.length - unresolvedCount;
    if (
      resolvedCount < 0 ||
      sha256(importState.unresolved_anchors) !== sha256(template.anchors.slice(resolvedCount))
    ) {
      return blocked('ARTICLE_CONTENT_MISMATCH', 'X Article import anchors differ from the Plan');
    }

    const resolvedAnchors = template.anchors.slice(0, resolvedCount);
    const unresolvedOrdinals = new Set(
      importState.unresolved_anchors.map((anchor) => anchor.block_ordinal)
    );
    const expectedBlocks = document.blocks.filter((block, index) =>
      block.kind !== 'image' || !unresolvedOrdinals.has(index + 1)
    );
    if (sha256(editor.blocks) !== sha256(expectedBlocks)) {
      return blocked('ARTICLE_CONTENT_MISMATCH', 'X Article imported blocks differ from the Plan');
    }
    const importedVisualMismatch = verifyBulkVisuals(context, editor.visuals, resolvedAnchors, false);
    if (importedVisualMismatch !== null) return importedVisualMismatch;

    const nextAnchor = importState.unresolved_anchors[0];
    if (nextAnchor !== undefined) {
      const binding = context.plan.intent.visuals.find((candidate) =>
        candidate.placement.kind === 'block' &&
        candidate.placement.block_ordinal === nextAnchor.block_ordinal &&
        candidate.asset.asset_id === nextAnchor.asset_id
      );
      if (binding === undefined) {
        return blocked('ARTICLE_ASSET_MISMATCH', 'Article import anchor has no exact Plan visual binding');
      }
      return command(
        context,
        observation,
        `replace_article_visual_anchor_${nextAnchor.block_ordinal}`,
        'replace_article_visual_anchor',
        {
          kind: 'replace_article_visual_anchor',
          target_ref: contract.detectControl(observation, 'body').ref,
          anchor: nextAnchor,
          package_root: context.plan.intent.article_package.root,
          package_digest: context.plan.intent.article_package.digest,
          asset: binding.asset
        }
      );
    }

    return command(context, observation, 'wait_for_article_import_completion', 'observe_article_page', {
      kind: 'observe_article_page', scope: 'editor'
    }, 'read');
  }

  const coverDecision = nextCoverDecision(context, observation, contract, editor);
  if (coverDecision !== null) return coverDecision;

  if (sha256(contract.readEditorDocument(observation)) !== sha256(document)) {
    return blocked('ARTICLE_CONTENT_MISMATCH', 'X Article final document differs from the Plan');
  }
  const finalVisualMismatch = verifyBulkVisuals(context, editor.visuals, template.anchors, true);
  if (finalVisualMismatch !== null) return finalVisualMismatch;
  if (editor.autosave_state !== 'saved') {
    return command(context, observation, 'wait_for_article_autosave', 'observe_article_page', {
      kind: 'observe_article_page', scope: 'editor'
    }, 'read');
  }
  return command(context, observation, 'open_article_preview', 'open_article_preview', {
    kind: 'open_article_preview', target_ref: contract.detectControl(observation, 'preview').ref
  });
}

function nextIncrementalBlocksDecision(
  context: XArticleEditorContext,
  observation: XArticleBrowserObservation,
  contract: XArticlePageContract,
  editor: XArticleEditorObservation
): XArticleEditorDecision {
  const document = context.plan.intent.document;

  const coverDecision = nextCoverDecision(context, observation, contract, editor);
  if (coverDecision !== null) return coverDecision;

  if (editor.blocks.length > document.blocks.length) {
    return blocked('ARTICLE_CONTENT_MISMATCH', 'editor contains extra Article blocks');
  }
  for (let index = 0; index < editor.blocks.length; index += 1) {
    if (sha256(editor.blocks[index]) !== sha256(document.blocks[index])) {
      return blocked('ARTICLE_CONTENT_MISMATCH', `Article block ${index + 1} differs from the Plan`);
    }
  }
  if (editor.blocks.length < document.blocks.length) {
    const index = editor.blocks.length;
    const block = document.blocks[index]!;
    if (block.kind === 'image') {
      const binding = context.plan.intent.visuals.find((candidate) =>
        candidate.placement.kind === 'block' && candidate.placement.block_ordinal === index + 1
      );
      if (binding === undefined) return blocked('ARTICLE_ASSET_MISMATCH', 'planned Article image has no asset binding');
      return command(context, observation, `insert_article_image_${index + 1}`, 'insert_article_image', {
        kind: 'insert_article_image', target_ref: contract.detectControl(observation, 'body').ref,
        block_ordinal: index + 1, package_root: context.plan.intent.article_package.root,
        package_digest: context.plan.intent.article_package.digest, asset: binding.asset
      });
    }
    return command(context, observation, `insert_article_block_${index + 1}`, 'insert_article_block', {
      kind: 'insert_article_block', target_ref: contract.detectControl(observation, 'body').ref,
      block_ordinal: index + 1, block
    });
  }
  if (editor.autosave_state !== 'saved') {
    return command(context, observation, 'wait_for_article_autosave', 'observe_article_page', {
      kind: 'observe_article_page', scope: 'editor'
    }, 'read');
  }
  return command(context, observation, 'open_article_preview', 'open_article_preview', {
    kind: 'open_article_preview', target_ref: contract.detectControl(observation, 'preview').ref
  });
}

function nextCoverDecision(
  context: XArticleEditorContext,
  observation: XArticleBrowserObservation,
  contract: XArticlePageContract,
  editor: XArticleEditorObservation
): XArticleEditorDecision | null {
  const coverBinding = context.plan.intent.visuals.find((binding) => binding.placement.kind === 'cover');
  const observedCover = editor.visuals.find((visual) => visual.kind === 'cover');
  if (coverBinding !== undefined && observedCover === undefined) {
    return command(context, observation, 'upload_article_cover', 'upload_article_cover', {
      kind: 'upload_article_cover', package_root: context.plan.intent.article_package.root,
      package_digest: context.plan.intent.article_package.digest, asset: coverBinding.asset
    });
  }
  if (coverBinding === undefined && observedCover !== undefined) {
    return blocked('ARTICLE_ASSET_MISMATCH', 'editor contains an unexpected cover');
  }
  if (coverBinding !== undefined && observedCover !== undefined) {
    if (!observedCover.owned_by_execution || observedCover.asset_id !== coverBinding.asset.asset_id) {
      return blocked('ARTICLE_ASSET_MISMATCH', 'editor cover differs from the Plan');
    }
    if (observedCover.status === 'failed') {
      return blocked('ARTICLE_ASSET_MISMATCH', 'planned Article cover upload failed');
    }
    if (observedCover.status === 'processing') {
      return command(context, observation, 'wait_for_article_cover_upload', 'observe_article_page', {
        kind: 'observe_article_page', scope: 'editor'
      }, 'read');
    }
    if (
      contract.media_alt_capabilities.cover === 'editable' &&
      observedCover.alt_text !== coverBinding.asset.alt_text
    ) {
      return command(context, observation, 'set_cover_alt_text', 'set_article_image_alt', {
        kind: 'set_article_image_alt', visual_ref: observedCover.ref, alt_text: coverBinding.asset.alt_text
      });
    }
  }
  return null;
}

function verifyBulkVisuals(
  context: XArticleEditorContext,
  visuals: readonly XArticleVisualObservation[],
  resolvedAnchors: readonly XArticleVisualAnchorV1[],
  allowPlannedCover: boolean
): XArticleEditorDecision | null {
  const covers = visuals.filter((visual) => visual.kind === 'cover');
  if (!allowPlannedCover && covers.length > 0) {
    return blocked('ARTICLE_ASSET_MISMATCH', 'editor contains a cover before Article import completion');
  }
  const inlineVisuals = visuals.filter((visual) => visual.kind === 'inline');
  if (inlineVisuals.length !== resolvedAnchors.length) {
    return blocked('ARTICLE_ASSET_MISMATCH', 'editor inline visual count differs from resolved import anchors');
  }
  for (const anchor of resolvedAnchors) {
    const binding = context.plan.intent.visuals.find((candidate) =>
      candidate.placement.kind === 'block' &&
      candidate.placement.block_ordinal === anchor.block_ordinal &&
      candidate.asset.asset_id === anchor.asset_id
    );
    const matches = inlineVisuals.filter((visual) => visual.block_ordinal === anchor.block_ordinal);
    if (binding === undefined || matches.length !== 1) {
      return blocked('ARTICLE_ASSET_MISMATCH', 'resolved Article import anchor differs from the Plan');
    }
    const observed = matches[0]!;
    if (
      !observed.owned_by_execution ||
      observed.status !== 'uploaded' ||
      observed.asset_id !== binding.asset.asset_id ||
      observed.alt_text !== binding.asset.alt_text
    ) {
      return blocked('ARTICLE_ASSET_MISMATCH', 'resolved Article visual differs from the Plan');
    }
  }
  return null;
}

function command(
  context: Pick<XArticleEditorContext, 'plan' | 'draft_id'>,
  observation: XArticleBrowserObservation,
  purpose: string,
  ...[kind, payload, sideEffect = 'write']: XArticleCommandArguments
): XArticleEditorDecision {
  return {
    kind: 'command',
    input: {
      execution_id: observation.execution_id,
      run_id: context.plan.run_id,
      draft_id: context.draft_id,
      kind,
      purpose,
      expected_page_revision: observation.page_revision,
      allowed_origin: 'https://x.com',
      side_effect: sideEffect,
      payload
    } as IssueXArticleBrowserCommandInput
  };
}

function blocked(code: ErrorCode, message: string): XArticleEditorDecision {
  return { kind: 'blocked', code, message };
}
