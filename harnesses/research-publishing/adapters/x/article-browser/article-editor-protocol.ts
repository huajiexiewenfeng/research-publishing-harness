import { sha256 } from '../../../core/digest.js';
import type { ErrorCode } from '../../../core/errors.js';
import type { XArticlePublicationPlanV1 } from '../../../core/x-article-publication-plan.js';
import type { XArticleBrowserObservation } from './article-browser-protocol.js';
import type {
  IssueXArticleBrowserCommandInput,
  XArticleBrowserCommandPayload
} from './article-command-broker.js';
import type { XArticlePageContract } from './article-page-contract.js';

export interface XArticleEditorContext {
  readonly plan: XArticlePublicationPlanV1;
  readonly draft_id: string;
}

export type XArticleEditorDecision =
  | { readonly kind: 'command'; readonly input: IssueXArticleBrowserCommandInput }
  | { readonly kind: 'complete' }
  | { readonly kind: 'blocked'; readonly code: ErrorCode; readonly message: string };

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
    if (editor.title === '') {
      return command(context, observation, 'set_article_title', 'set_article_title', {
        kind: 'set_article_title',
        target_ref: contract.detectControl(observation, 'title').ref,
        title: document.title
      });
    }

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
      if (observedCover.alt_text !== coverBinding.asset.alt_text) {
        return command(context, observation, 'set_cover_alt_text', 'set_article_image_alt', {
          kind: 'set_article_image_alt', visual_ref: observedCover.ref, alt_text: coverBinding.asset.alt_text
        });
      }
    }

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
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error) {
      return blocked((error as { code: ErrorCode }).code, String((error as { message: unknown }).message));
    }
    throw error;
  }
}

function command(
  context: XArticleEditorContext,
  observation: XArticleBrowserObservation,
  purpose: string,
  kind: IssueXArticleBrowserCommandInput['kind'],
  payload: XArticleBrowserCommandPayload,
  sideEffect: IssueXArticleBrowserCommandInput['side_effect'] = 'write'
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
    }
  };
}

function blocked(code: ErrorCode, message: string): XArticleEditorDecision {
  return { kind: 'blocked', code, message };
}
