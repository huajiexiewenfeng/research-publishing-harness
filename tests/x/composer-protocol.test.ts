import { describe, expect, it } from 'vitest';

import {
  type BrowserNodeObservation,
  type BrowserObservation,
  type BrowserObservationInput,
  type BrowserPublicPostObservation,
  computePageRevision
} from '../../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import {
  type ComposerContext,
  nextComposerDecision
} from '../../harnesses/research-publishing/adapters/x/browser/composer-protocol.js';
import { XWeb202608Contract } from '../../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { createPublicationPlanV2 } from '../../harnesses/research-publishing/core/publication-plan-v2.js';
import { createPublicationPlanV2_1 } from '../../harnesses/research-publishing/core/publication-plan-v2-1.js';
import { visualAssetFixture } from '../fixtures/publication-plan-v2-1.js';
import { activeDraft, emptyComposer, loggedIn } from '../fixtures/x-browser-observations.js';

const contract = new XWeb202608Contract();

function visualPlan() {
  return createPublicationPlanV2_1({
    planId: 'plan_visual_single', runId: 'run_1', targetAccount: '@runtime_ai',
    mode: 'single', targetPost: null,
    items: [{ ordinal: 1, text: 'Visual locked item', attachments: [visualAssetFixture] }],
    articlePackage: { root: 'articles/visual/run_1', digest: `sha256:${'a'.repeat(64)}` },
    authorizedAsset: visualAssetFixture, plannedAt: '2026-08-20T03:00:00.000Z',
    provenance: { handoff_id: 'handoff_1' }
  });
}

function plan(mode: 'single' | 'thread', texts: readonly string[]) {
  return createPublicationPlanV2({
    planId: `plan_${mode}`,
    runId: 'run_1',
    targetAccount: '@runtime_ai',
    adapter: 'browser',
    mode,
    targetPost: null,
    media: [],
    items: texts.map((text, index) => ({
      ordinal: index + 1,
      text,
      ...(index === 0 ? {} : { reply_to: 'previous' as const })
    })),
    plannedAt: '2026-08-19T05:00:00.000Z',
    provenance: { draft_digest: `sha256:${'a'.repeat(64)}` }
  });
}

function context(publication = plan('single', ['First locked item'])): ComposerContext {
  return {
    plan: publication,
    expected_account: '@runtime_ai',
    created_item_refs: [],
    next_ordinal: 1,
    add_retry_count: 0,
    last_page_revision: null
  };
}

function revise(
  base: BrowserObservation,
  nodes: readonly BrowserNodeObservation[],
  id: string,
  publicPosts = base.public_posts,
  url = base.canonical_url
): BrowserObservation {
  const input: BrowserObservationInput = {
    schema_version: '2.0',
    observation_id: id,
    execution_id: base.execution_id,
    command_id: `cmd_${id}`,
    origin: 'https://x.com',
    canonical_url: url,
    observed_at: '2026-08-19T05:01:00.000Z',
    nodes,
    public_posts: publicPosts
  };
  return { ...input, page_revision: computePageRevision(input) };
}

function setItem(base: BrowserObservation, ordinal: number, text: string, id: string) {
  return revise(
    base,
    base.nodes.map((node) =>
      node.test_id === `tweetTextarea_${ordinal - 1}` ? { ...node, text } : node
    ),
    id
  );
}

function addItem(base: BrowserObservation, ordinal: number, id: string) {
  const submit = base.nodes.filter((node) => node.test_id !== 'tweetButton');
  return revise(
    base,
    [
      ...submit,
      {
        ref: `item_${ordinal}`,
        role: 'textbox',
        name: 'Post text',
        text: '',
        test_id: `tweetTextarea_${ordinal - 1}`,
        editable: true,
        disabled: false,
        parent_ref: null
      },
      {
        ref: 'submit_all',
        role: 'button',
        name: 'Post all',
        text: 'Post all',
        test_id: 'tweetButton',
        editable: false,
        disabled: true,
        parent_ref: null
      }
    ],
    id
  );
}

describe('nextComposerDecision', () => {
  it('prepares and verifies a Single without emitting Submit', () => {
    const first = nextComposerDecision(context(), emptyComposer, contract);
    expect(first).toMatchObject({ kind: 'command', input: { kind: 'set_text' } });
    if (first.kind !== 'command') throw new Error('expected command');
    const filled = setItem(emptyComposer, 1, 'First locked item', 'single_filled');
    const enabled = revise(
      filled,
      filled.nodes.map((node) =>
        node.test_id === 'tweetButton' ? { ...node, disabled: false } : node
      ),
      'single_enabled'
    );
    const final = nextComposerDecision(first.next_context, enabled, contract);
    expect(final).toMatchObject({ kind: 'verified', submit_ref: 'submit_one' });
  });

  it('builds a three-item Thread deterministically', () => {
    const publication = plan('thread', [
      'First locked item',
      'Second locked item',
      'Third locked item'
    ]);
    const setFirst = nextComposerDecision(context(publication), emptyComposer, contract);
    if (setFirst.kind !== 'command') throw new Error('expected first set');
    const one = setItem(emptyComposer, 1, 'First locked item', 'thread_one');
    const addSecond = nextComposerDecision(setFirst.next_context, one, contract);
    expect(addSecond).toMatchObject({ kind: 'command', input: { purpose: 'add_thread_item' } });
    if (addSecond.kind !== 'command') throw new Error('expected add second');
    const twoEmpty = addItem(one, 2, 'thread_two_empty');
    const setSecond = nextComposerDecision(addSecond.next_context, twoEmpty, contract);
    if (setSecond.kind !== 'command') throw new Error('expected second set');
    const two = setItem(twoEmpty, 2, 'Second locked item', 'thread_two');
    const addThird = nextComposerDecision(setSecond.next_context, two, contract);
    if (addThird.kind !== 'command') throw new Error('expected add third');
    const threeEmpty = addItem(two, 3, 'thread_three_empty');
    const setThird = nextComposerDecision(addThird.next_context, threeEmpty, contract);
    if (setThird.kind !== 'command') throw new Error('expected third set');
    const three = setItem(threeEmpty, 3, 'Third locked item', 'thread_three');
    const enabled = revise(
      three,
      three.nodes.map((node) =>
        node.test_id === 'tweetButton' ? { ...node, disabled: false } : node
      ),
      'thread_enabled'
    );
    expect(nextComposerDecision(setThird.next_context, enabled, contract)).toMatchObject({
      kind: 'verified',
      submit_ref: 'submit_all'
    });
  });

  it('navigates to and validates a locked Reply target before opening Composer', () => {
    const target: BrowserPublicPostObservation = {
      post_id: '200',
      canonical_url: 'https://x.com/target_ai/status/200',
      author_handle: '@target_ai',
      text: 'Target post',
      links: [],
      published_at: '2026-08-19T04:50:00.000Z',
      reply_to_id: null
    };
    const publication = createPublicationPlanV2({
      planId: 'plan_reply',
      runId: 'run_1',
      targetAccount: '@runtime_ai',
      adapter: 'browser',
      mode: 'reply',
      targetPost: {
        id: target.post_id,
        url: target.canonical_url,
        author: target.author_handle,
        snapshot_digest: sha256(target)
      },
      media: [],
      items: [{ ordinal: 1, text: 'Locked reply', reply_to: 'target' }],
      plannedAt: '2026-08-19T05:00:00.000Z',
      provenance: { draft_digest: `sha256:${'b'.repeat(64)}` }
    });
    const initial = nextComposerDecision(context(publication), loggedIn, contract);
    expect(initial).toMatchObject({ kind: 'command', input: { kind: 'navigate' } });
    const targetPage = revise(
      loggedIn,
      [
        ...loggedIn.nodes,
        {
          ref: 'reply_open', role: 'button', name: 'Reply', text: 'Reply', test_id: null,
          editable: false, disabled: false, parent_ref: null
        }
      ],
      'reply_target',
      [target],
      target.canonical_url
    );
    const open = nextComposerDecision(initial.kind === 'command' ? initial.next_context : context(publication), targetPage, contract);
    expect(open).toMatchObject({ kind: 'command', input: { purpose: 'open_reply_composer' } });
  });

  it('blocks conflicts, mismatches, stale revisions, and unsafe Add outcomes', () => {
    expect(nextComposerDecision(context(), activeDraft, contract)).toMatchObject({
      kind: 'blocked', code: 'DRAFT_CONFLICT'
    });
    expect(
      nextComposerDecision({ ...context(), last_page_revision: `sha256:${'f'.repeat(64)}` }, emptyComposer, contract)
    ).toMatchObject({ kind: 'blocked', code: 'STALE_PAGE_REVISION' });

    const wrongAccount = revise(
      emptyComposer,
      emptyComposer.nodes.map((node) =>
        node.ref === 'account_switcher' ? { ...node, text: '@different_ai' } : node
      ),
      'wrong_account'
    );
    expect(nextComposerDecision(context(), wrongAccount, contract)).toMatchObject({
      kind: 'blocked', code: 'X_ACCOUNT_MISMATCH'
    });

    const wrongText = setItem(emptyComposer, 1, 'Changed after approval', 'wrong_text');
    expect(
      nextComposerDecision(
        { ...context(), created_item_refs: ['item_1'], next_ordinal: 2 },
        wrongText,
        contract
      )
    ).toMatchObject({ kind: 'blocked', code: 'COMPOSER_CONTENT_MISMATCH' });

    const publication = plan('thread', ['First locked item', 'Second locked item']);
    const pendingAdd: ComposerContext = {
      ...context(publication),
      created_item_refs: ['item_1'],
      next_ordinal: 2,
      add_retry_count: 1
    };
    const one = setItem(emptyComposer, 1, 'First locked item', 'uncertain_one');
    expect(nextComposerDecision(pendingAdd, one, contract)).toMatchObject({
      kind: 'command', input: { purpose: 'retry_add_thread_item' }
    });
    const unexpected = addItem(addItem(one, 2, 'unexpected_two'), 3, 'unexpected_three');
    expect(nextComposerDecision(pendingAdd, unexpected, contract)).toMatchObject({
      kind: 'blocked', code: 'COMPOSER_ITEM_COUNT_MISMATCH'
    });
    expect(
      nextComposerDecision({ ...pendingAdd, add_retry_count: 2 }, one, contract)
    ).toMatchObject({ kind: 'blocked', code: 'COMPOSER_ITEM_COUNT_MISMATCH' });

    const lockedPost: BrowserPublicPostObservation = {
      post_id: '300',
      canonical_url: 'https://x.com/target_ai/status/300',
      author_handle: '@target_ai',
      text: 'Locked target',
      links: [],
      published_at: '2026-08-19T04:50:00.000Z',
      reply_to_id: null
    };
    const replyPlan = createPublicationPlanV2({
      planId: 'plan_stale_reply', runId: 'run_1', targetAccount: '@runtime_ai',
      adapter: 'browser', mode: 'reply',
      targetPost: {
        id: lockedPost.post_id,
        url: lockedPost.canonical_url,
        author: lockedPost.author_handle,
        snapshot_digest: sha256(lockedPost)
      },
      media: [],
      items: [{ ordinal: 1, text: 'Reply', reply_to: 'target' }],
      plannedAt: '2026-08-19T05:00:00.000Z',
      provenance: { draft_digest: `sha256:${'c'.repeat(64)}` }
    });
    const staleTarget = revise(
      loggedIn,
      [
        ...loggedIn.nodes,
        {
          ref: 'reply_open', role: 'button', name: 'Reply', text: 'Reply', test_id: null,
          editable: false, disabled: false, parent_ref: null
        }
      ],
      'stale_reply',
      [{ ...lockedPost, text: 'Target changed' }],
      lockedPost.canonical_url
    );
    expect(nextComposerDecision(context(replyPlan), staleTarget, contract)).toMatchObject({
      kind: 'blocked', code: 'REPLY_TARGET_STALE'
    });
  });

  it('uploads the exact V2.1 asset, sets exact Alt Text, then verifies the Composer', () => {
    const publication = visualPlan();
    const filled = revise(emptyComposer, emptyComposer.nodes.map((node) =>
      node.test_id === 'tweetTextarea_0'
        ? { ...node, text: publication.items[0]!.text }
        : node.test_id === 'tweetButton'
          ? { ...node, disabled: false }
          : node
    ), 'visual_filled');
    const visualContext = {
      ...context(publication as never),
      created_item_refs: ['item_1'],
      next_ordinal: publication.items.length + 1
    };
    const upload = nextComposerDecision(visualContext, { ...filled, composer_attachments: [] } as never, contract);
    expect(upload).toMatchObject({
      kind: 'command',
      input: {
        kind: 'upload_attachment', side_effect: 'write',
        payload: { kind: 'upload_attachment', target_ordinal: 1, package_root: 'articles/visual/run_1' }
      }
    });
    if (upload.kind !== 'command') throw new Error('expected upload');
    const attachment = {
      ref: 'attachment_1', ordinal: 1, kind: 'image' as const, mime_type: 'image/png' as const,
      alt_text: null, status: 'uploaded' as const, owned_by_execution: true
    };
    const setAlt = nextComposerDecision(upload.next_context, { ...filled, composer_attachments: [attachment] } as never, contract);
    expect(setAlt).toMatchObject({ kind: 'command', input: { kind: 'set_attachment_alt_text', payload: { alt_text: publication.items[0]!.attachments[0]!.alt_text } } });
    if (setAlt.kind !== 'command') throw new Error('expected Alt Text command');
    const verified = nextComposerDecision(setAlt.next_context, {
      ...filled,
      composer_attachments: [{ ...attachment, alt_text: publication.items[0]!.attachments[0]!.alt_text }]
    } as never, contract);
    expect(verified).toMatchObject({ kind: 'verified', submit_ref: 'submit_one' });
  });

  it('fails closed when the Composer contains an unknown attachment', () => {
    const publication = visualPlan();
    const filled = revise(emptyComposer, emptyComposer.nodes.map((node) =>
      node.test_id === 'tweetTextarea_0' ? { ...node, text: publication.items[0]!.text } : node
    ), 'visual_conflict');
    const decision = nextComposerDecision({
      ...context(publication as never), created_item_refs: ['item_1'], next_ordinal: publication.items.length + 1
    }, {
      ...filled,
      composer_attachments: [{
        ref: 'unknown', ordinal: 1, kind: 'image', mime_type: 'image/png', alt_text: null,
        status: 'uploaded', owned_by_execution: false
      }]
    } as never, contract);
    expect(decision).toMatchObject({ kind: 'blocked', code: 'X_ATTACHMENT_CONFLICT' });
  });
});
