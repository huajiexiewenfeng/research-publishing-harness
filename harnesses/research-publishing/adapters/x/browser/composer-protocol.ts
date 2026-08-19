import { sha256 } from '../../../core/digest.js';
import { HarnessError, type ErrorCode } from '../../../core/errors.js';
import {
  normalizePublicationText,
  type PublicationPlanV2
} from '../../../core/publication-plan-v2.js';
import type {
  BrowserObservation,
  IssueBrowserCommandInput
} from './browser-protocol.js';
import type { XPageContract } from './page-contract.js';

export interface ComposerContext {
  readonly plan: PublicationPlanV2;
  readonly expected_account: string;
  readonly created_item_refs: readonly string[];
  readonly next_ordinal: number;
  readonly add_retry_count: number;
  readonly last_page_revision: string | null;
}

export type ComposerDecision =
  | {
      readonly kind: 'command';
      readonly input: IssueBrowserCommandInput;
      readonly next_context: ComposerContext;
    }
  | { readonly kind: 'verified'; readonly page_revision: string; readonly submit_ref: string }
  | { readonly kind: 'blocked'; readonly code: ErrorCode; readonly message: string };

export function nextComposerDecision(
  context: ComposerContext,
  observation: BrowserObservation,
  contract: XPageContract
): ComposerDecision {
  if (
    context.last_page_revision !== null &&
    context.last_page_revision !== observation.page_revision
  ) {
    return blocked('STALE_PAGE_REVISION', 'composer observation does not match the required page revision');
  }

  try {
    const account = contract.detectAccount(observation);
    if (account.handle.toLowerCase() !== context.expected_account.toLowerCase()) {
      return blocked('X_ACCOUNT_MISMATCH', 'the active X account does not match the approved account');
    }

    if (context.plan.intent.mode === 'reply') {
      const replyDecision = decideReplyEntry(context, observation, contract);
      if (replyDecision !== null) return replyDecision;
    }

    const composer = contract.detectComposer(observation);
    const items = composer.items;
    if (context.created_item_refs.length === 0) {
      if (items.length !== 1) {
        return blocked(
          'COMPOSER_ITEM_COUNT_MISMATCH',
          'a new publication requires exactly one empty composer item'
        );
      }
      if (normalizePublicationText(items[0]!.text).length !== 0) {
        return blocked('DRAFT_CONFLICT', 'the initial composer contains an existing draft');
      }
      return setItemDecision(context, observation, items[0]!.ref, 1, [items[0]!.ref]);
    }

    if (context.add_retry_count > 0) {
      return decidePendingAdd(context, observation, contract);
    }

    if (items.length !== context.created_item_refs.length) {
      return blocked('COMPOSER_ITEM_COUNT_MISMATCH', 'composer item count changed unexpectedly');
    }
    const mismatch = verifyCreatedItems(context, items);
    if (mismatch !== null) return mismatch;

    if (context.next_ordinal <= context.plan.items.length) {
      if (composer.add_control_ref === null) {
        return blocked('PAGE_CONTRACT_UNSUPPORTED', 'Add post control is unavailable');
      }
      return addItemDecision(context, observation, composer.add_control_ref, false);
    }

    if (items.length !== context.plan.items.length) {
      return blocked('COMPOSER_ITEM_COUNT_MISMATCH', 'composer contains extra or missing items');
    }
    const submit = contract.detectSubmitControl(observation);
    const expectedLabel =
      context.plan.intent.mode === 'thread'
        ? 'Post all'
        : context.plan.intent.mode === 'reply'
          ? 'Reply'
          : 'Post';
    if (!submit.enabled || submit.label !== expectedLabel) {
      return blocked('PAGE_CONTRACT_UNSUPPORTED', 'the expected enabled submit control is unavailable');
    }
    return {
      kind: 'verified',
      page_revision: observation.page_revision,
      submit_ref: submit.ref
    };
  } catch (error) {
    if (error instanceof HarnessError) return blocked(error.code, error.message);
    throw error;
  }
}

function decideReplyEntry(
  context: ComposerContext,
  observation: BrowserObservation,
  contract: XPageContract
): ComposerDecision | null {
  const target = context.plan.intent.target_post;
  if (target === null) return blocked('REPLY_TARGET_STALE', 'Reply plan has no locked target');
  let targetUrl: URL;
  try {
    targetUrl = new URL(target.url);
  } catch {
    return blocked('REPLY_TARGET_STALE', 'Reply target URL is invalid');
  }
  if (targetUrl.origin.toLowerCase() !== 'https://x.com') {
    return blocked('REPLY_TARGET_STALE', 'Reply target is outside x.com');
  }
  if (observation.canonical_url !== target.url && contract.readComposerItems(observation).length === 0) {
    return command(
      context,
      observation,
      'navigate_reply_target',
      'navigate',
      'write',
      { kind: 'navigate', url: target.url }
    );
  }

  const composerItems = contract.readComposerItems(observation);
  if (composerItems.length > 0) return null;
  const observedTarget = observation.public_posts.find((post) => post.post_id === target.id);
  if (
    observedTarget === undefined ||
    observedTarget.canonical_url !== target.url ||
    observedTarget.author_handle.toLowerCase() !== target.author.toLowerCase() ||
    sha256(observedTarget) !== target.snapshot_digest
  ) {
    return blocked('REPLY_TARGET_STALE', 'Reply target no longer matches its approved snapshot');
  }
  const replyControl = contract.detectSubmitControl(observation);
  if (replyControl.label !== 'Reply' || !replyControl.enabled) {
    return blocked('PAGE_CONTRACT_UNSUPPORTED', 'Reply control is unavailable on the locked target');
  }
  return command(
    context,
    observation,
    'open_reply_composer',
    'click',
    'write',
    { kind: 'click', target_ref: replyControl.ref }
  );
}

function decidePendingAdd(
  context: ComposerContext,
  observation: BrowserObservation,
  contract: XPageContract
): ComposerDecision {
  const composer = contract.detectComposer(observation);
  const items = composer.items;
  const existingCount = context.created_item_refs.length;
  if (items.length === existingCount + 1) {
    const priorMismatch = verifyCreatedItems(context, items.slice(0, existingCount));
    if (priorMismatch !== null) return priorMismatch;
    const added = items[existingCount]!;
    if (normalizePublicationText(added.text).length !== 0) {
      return blocked('DRAFT_CONFLICT', 'new Thread item contains unexpected content');
    }
    return setItemDecision(
      { ...context, add_retry_count: 0 },
      observation,
      added.ref,
      context.next_ordinal,
      [...context.created_item_refs, added.ref]
    );
  }
  if (items.length === existingCount && context.add_retry_count < 2) {
    const mismatch = verifyCreatedItems(context, items);
    if (mismatch !== null) return mismatch;
    if (composer.add_control_ref === null) {
      return blocked('PAGE_CONTRACT_UNSUPPORTED', 'Add post control is unavailable for safe retry');
    }
    return addItemDecision(context, observation, composer.add_control_ref, true);
  }
  return blocked(
    'COMPOSER_ITEM_COUNT_MISMATCH',
    'uncertain Add action produced an unsafe composer item count'
  );
}

function verifyCreatedItems(
  context: ComposerContext,
  items: readonly { readonly ref: string; readonly text: string }[]
): ComposerDecision | null {
  for (const [index, ref] of context.created_item_refs.entries()) {
    const observed = items[index];
    const planned = context.plan.items[index];
    if (observed?.ref !== ref) {
      return blocked('COMPOSER_ITEM_COUNT_MISMATCH', 'composer item identity or order changed');
    }
    if (
      planned === undefined ||
      normalizePublicationText(observed.text) !== normalizePublicationText(planned.text)
    ) {
      return blocked('COMPOSER_CONTENT_MISMATCH', `composer item ${index + 1} differs from the plan`);
    }
  }
  return null;
}

function setItemDecision(
  context: ComposerContext,
  observation: BrowserObservation,
  targetRef: string,
  ordinal: number,
  refs: readonly string[]
): ComposerDecision {
  const item = context.plan.items[ordinal - 1];
  if (item === undefined) {
    return blocked('COMPOSER_ITEM_COUNT_MISMATCH', `planned item ${ordinal} is missing`);
  }
  return command(
    {
      ...context,
      created_item_refs: refs,
      next_ordinal: ordinal + 1,
      add_retry_count: 0
    },
    observation,
    `set_composer_item_${ordinal}`,
    'set_text',
    'write',
    { kind: 'set_text', target_ref: targetRef, text: item.text }
  );
}

function addItemDecision(
  context: ComposerContext,
  observation: BrowserObservation,
  targetRef: string,
  retry: boolean
): ComposerDecision {
  return command(
    { ...context, add_retry_count: context.add_retry_count + 1 },
    observation,
    retry ? 'retry_add_thread_item' : 'add_thread_item',
    'click',
    'write',
    { kind: 'click', target_ref: targetRef }
  );
}

function command(
  context: ComposerContext,
  observation: BrowserObservation,
  purpose: string,
  kind: IssueBrowserCommandInput['kind'],
  sideEffect: IssueBrowserCommandInput['side_effect'],
  payload: IssueBrowserCommandInput['payload']
): ComposerDecision {
  return {
    kind: 'command',
    input: {
      execution_id: observation.execution_id,
      run_id: context.plan.run_id,
      kind,
      purpose,
      expected_page_revision: observation.page_revision,
      allowed_origin: 'https://x.com',
      side_effect: sideEffect,
      payload
    },
    next_context: { ...context, last_page_revision: null }
  };
}

function blocked(code: ErrorCode, message: string): ComposerDecision {
  return { kind: 'blocked', code, message };
}
