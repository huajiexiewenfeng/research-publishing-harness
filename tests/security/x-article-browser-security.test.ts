import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import type {
  IssueXArticleBrowserCommandInput,
  XArticleBrowserCommandV1
} from '../../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { approveXArticlePublication } from '../../harnesses/research-publishing/core/x-article-approval.js';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { validateContract } from '../../harnesses/research-publishing/core/schema-validator.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';

const plan = createXArticlePublicationPlan({
  planId: 'plan_secure', runId: 'run_secure', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/safe/article_1', digest: `sha256:${'a'.repeat(64)}` },
  document: { schema_version: '1.0', title: 'Safe', cover_asset_id: null, blocks: [] },
  visuals: [], plannedAt: '2026-08-21T09:00:00.000Z', provenance: {}
});
const approval = approveXArticlePublication(plan, 'human', 60_000, new Date('2026-08-21T09:00:00.000Z'));

const DIGEST_A: `sha256:${string}` = `sha256:${'a'.repeat(64)}`;
const DIGEST_B: `sha256:${string}` = `sha256:${'b'.repeat(64)}`;
const importAnchor = {
  anchor_id: 'anchor_asset_diagram_2', asset_id: 'asset_diagram', block_ordinal: 2,
  marker: 'RPH_VISUAL_ANCHOR:asset_diagram:2'
} as const;
const importTemplate = {
  schema_version: '1.0', source_document_digest: DIGEST_A,
  blocks: [
    { kind: 'paragraph', runs: [{ text: 'Import this article.', marks: [], link: null }] },
    { kind: 'visual_anchor', anchor_id: importAnchor.anchor_id, marker: importAnchor.marker }
  ],
  anchors: [importAnchor], template_digest: DIGEST_B
} as const;
const visualAsset = {
  asset_id: 'asset_diagram', relative_path: 'assets/asset_diagram.png', digest: DIGEST_A,
  mime_type: 'image/png', alt_text: 'Architecture diagram', claim_refs: ['claim_1']
} as const;

const v33Asset = {
  asset_id: 'asset_v33_inline', relative_path: 'assets/v33-inline.png', digest: DIGEST_B,
  mime_type: 'image/png' as const, alt_text: 'Bound V3.3 inline visual', claim_refs: ['claim_v33']
};
const v33Plan = createXArticlePublicationPlan({
  planId: 'plan_v33_security', runId: 'run_v33_security', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/security/v33', digest: DIGEST_A },
  document: {
    schema_version: '1.0', title: 'Bound V3.3 Draft', cover_asset_id: null,
    blocks: [{ kind: 'image', asset_id: v33Asset.asset_id, alt_text: v33Asset.alt_text }]
  },
  visuals: [{ asset: v33Asset, placement: { kind: 'block', block_ordinal: 1 } }],
  plannedAt: '2026-08-26T00:00:00.000Z', provenance: {}
});
const v33SecondAsset = {
  asset_id: 'asset_v33_inline_second', relative_path: 'assets/v33-inline-second.png',
  digest: `sha256:${'c'.repeat(64)}` as const, mime_type: 'image/png' as const,
  alt_text: 'Second bound V3.3 inline visual', claim_refs: ['claim_v33_second']
};
const v33TwoAnchorPlan = createXArticlePublicationPlan({
  planId: 'plan_v33_two_anchor_security', runId: 'run_v33_two_anchor_security',
  targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/security/v33-two-anchor', digest: DIGEST_A },
  document: {
    schema_version: '1.0', title: 'Bound V3.3 two-anchor Draft', cover_asset_id: null,
    blocks: [
      { kind: 'image', asset_id: v33Asset.asset_id, alt_text: v33Asset.alt_text },
      { kind: 'image', asset_id: v33SecondAsset.asset_id, alt_text: v33SecondAsset.alt_text }
    ]
  },
  visuals: [
    { asset: v33Asset, placement: { kind: 'block', block_ordinal: 1 } },
    { asset: v33SecondAsset, placement: { kind: 'block', block_ordinal: 2 } }
  ],
  plannedAt: '2026-08-26T00:00:00.000Z', provenance: {}
});
const v33Capabilities = {
  executor: 'codex-chrome', executor_version: 'offline-security-fixture', browser_family: 'chrome',
  capabilities: [
    'observe_article_page', 'create_article_draft', 'set_article_title',
    'import_article_document', 'replace_article_visual_anchor', 'open_article_preview',
    'open_publish_review', 'publish_article_once'
  ],
  observed_at: '2026-08-26T00:00:00.000Z'
} as const;

type MutableV33Payload = Record<string, unknown> & {
  readonly anchor: Record<string, unknown>;
  readonly asset: Record<string, unknown>;
};

type MutableV33CommandInput = Omit<IssueXArticleBrowserCommandInput, 'payload'> & {
  readonly payload: MutableV33Payload;
};

interface V33SecurityContext extends Record<string, unknown> {
  readonly snapshot: { readonly state: string; readonly sequence: number };
  readonly latest_observation: XArticleBrowserObservation;
  readonly editor_revision: string | null;
  readonly pending_command: XArticleBrowserCommandV1;
  readonly pending_issue: {
    readonly command_id: string;
    readonly input: MutableV33CommandInput;
    readonly input_digest: string;
    readonly checkpoint_revision: number | null;
    readonly action_key: string;
  };
}

type V33InputMutation = (
  input: MutableV33CommandInput
) => MutableV33CommandInput;

const v33BindingMutations: ReadonlyArray<readonly [string, V33InputMutation]> = [
  ['execution', (input) => ({ ...input, execution_id: 'execution_foreign' })],
  ['run', (input) => ({ ...input, run_id: 'run_foreign' })],
  ['Draft', (input) => ({ ...input, draft_id: '2092246293603373999' })],
  ['purpose', (input) => ({ ...input, purpose: 'replace_article_visual_anchor_99' })],
  ['side effect', (input) => ({ ...input, side_effect: 'read' })],
  ['page revision', (input) => ({ ...input, expected_page_revision: DIGEST_B })],
  ['Package root', (input) => ({
    ...input, payload: { ...input.payload, package_root: 'articles/security/foreign' }
  })],
  ['Package digest', (input) => ({
    ...input, payload: { ...input.payload, package_digest: DIGEST_B }
  })],
  ['anchor', (input) => ({
    ...input, payload: {
      ...input.payload,
      anchor: { ...input.payload.anchor, anchor_id: 'anchor_foreign_1' }
    }
  })],
  ['asset', (input) => ({
    ...input, payload: {
      ...input.payload,
      asset: { ...input.payload.asset, digest: `sha256:${'f'.repeat(64)}` }
    }
  })]
];

function importCommand(
  payload: object,
  envelope: Partial<{ readonly kind: string; readonly side_effect: string }> = {}
): object {
  return {
    schema_version: '1.0', command_id: 'command_import_1', execution_id: 'execution_import_1',
    run_id: 'run_import_1', draft_id: '2090731994279755776',
    kind: envelope.kind ?? (payload as { kind: string }).kind, purpose: 'article_import',
    expected_page_revision: DIGEST_A, allowed_origin: 'https://x.com',
    side_effect: envelope.side_effect ?? 'write',
    payload, payload_digest: DIGEST_B, issued_at: '2026-08-21T09:00:00.000Z'
  };
}

function preparedObservation(
  executionId: string,
  commandId: string,
  value: Record<string, unknown>
): XArticleBrowserObservation {
  const input = {
    schema_version: '1.0', observation_id: `obs_${commandId}`, execution_id: executionId,
    command_id: commandId, origin: 'https://x.com', observed_at: '2026-08-26T00:01:00.000Z',
    account_handle: '@Glen56121', controls: [], editor: null, preview: null,
    publish_review: null, public_article: null, ...value
  } as const;
  return {
    ...input,
    page_revision: computeXArticlePageRevision(input)
  } as unknown as XArticleBrowserObservation;
}

function v33EditorObservation(
  executionId: string,
  commandId: string,
  observedAt: string,
  overrides: Record<string, unknown> = {}
): XArticleBrowserObservation {
  const template = createXArticleImportTemplate(v33Plan.intent.document);
  return preparedObservation(executionId, commandId, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
    page_kind: 'article_editor', observed_at: observedAt,
    controls: [
      { ref: 'body_v33', role: 'textbox', name: '', test_id: 'composer', disabled: false }
    ],
    editor: {
      draft_id: '2092246293603373056', title: v33Plan.intent.document.title,
      blocks: [], visuals: [], import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: template.anchors
      }, has_unknown_content: false, autosave_state: 'saved'
    },
    ...overrides
  });
}

function v33TwoAnchorObservation(
  executionId: string,
  commandId: string,
  observedAt: string,
  resolvedCount: number,
  visuals: readonly Record<string, unknown>[] = []
): XArticleBrowserObservation {
  const template = createXArticleImportTemplate(v33TwoAnchorPlan.intent.document);
  return preparedObservation(executionId, commandId, {
    canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
    page_kind: 'article_editor', observed_at: observedAt,
    controls: [
      { ref: 'body_v33_two', role: 'textbox', name: '', test_id: 'composer', disabled: false }
    ],
    editor: {
      draft_id: '2092246293603373056', title: v33TwoAnchorPlan.intent.document.title,
      blocks: v33TwoAnchorPlan.intent.document.blocks.slice(0, resolvedCount), visuals, import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: template.anchors.slice(resolvedCount)
      }, has_unknown_content: false, autosave_state: 'saved'
    }
  });
}

async function createV33SecurityFixture(suffix: string) {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-x-article-v33-${suffix}-`)));
  const executionId = `execution_v33_${suffix}`;
  let commandNumber = 0;
  const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
    executionId: () => executionId,
    commandId: () => `command_v33_${suffix}_${++commandNumber}`,
    eventId: () => `event_v33_${suffix}_${commandNumber}`,
    now: () => new Date('2026-08-26T00:01:00.000Z')
  });
  const source = v33EditorObservation(
    'source_v33_security', `source_command_v33_${suffix}`, '2026-08-26T00:00:00.000Z'
  );
  const execution = await adapter.prepareExistingDraftMedia(v33Plan, source, v33Capabilities);
  const navigating = await adapter.next(execution.execution_id);
  await adapter.claim(navigating.command!);
  await adapter.report({
    command: navigating.command!, status: 'success',
    observation: v33EditorObservation(
      execution.execution_id, navigating.command!.command_id, '2026-08-26T00:01:00.000Z'
    )
  });
  const pending = await adapter.next(execution.execution_id);
  expect(pending.command?.kind).toBe('replace_article_visual_anchor');
  const contextPath = `runs/${executionId}/x-article/browser/adapter-context.json`;
  return { store, adapter, executionId, contextPath, pendingCommand: pending.command! };
}

async function createV33TwoAnchorSecurityFixture(suffix: string) {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-x-article-v33-two-${suffix}-`)));
  const executionId = `execution_v33_two_${suffix}`;
  let commandNumber = 0;
  let currentTime = '2026-08-26T00:00:30.000Z';
  const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
    executionId: () => executionId,
    commandId: () => `command_v33_two_${suffix}_${++commandNumber}`,
    eventId: () => `event_v33_two_${suffix}_${commandNumber}`,
    now: () => new Date(currentTime)
  });
  const source = v33TwoAnchorObservation(
    'source_v33_two_security', `source_command_v33_two_${suffix}`, '2026-08-26T00:00:00.000Z', 0
  );
  const execution = await adapter.prepareExistingDraftMedia(v33TwoAnchorPlan, source, v33Capabilities);
  const navigating = await adapter.next(execution.execution_id);
  const firstPredecessor = v33TwoAnchorObservation(
    execution.execution_id, navigating.command!.command_id, '2026-08-26T00:01:00.000Z', 0
  );
  currentTime = '2026-08-26T00:01:00.000Z';
  await adapter.claim(navigating.command!);
  await adapter.report({ command: navigating.command!, status: 'success', observation: firstPredecessor });

  const first = await adapter.next(execution.execution_id);
  expect(first.command).toMatchObject({
    kind: 'replace_article_visual_anchor', purpose: 'replace_article_visual_anchor_1'
  });
  await adapter.claim(first.command!);
  currentTime = '2026-08-26T00:02:00.000Z';
  await adapter.report({
    command: first.command!, status: 'success',
    observation: v33TwoAnchorObservation(
      execution.execution_id, first.command!.command_id, '2026-08-26T00:02:00.000Z', 1,
      [{
        ref: 'visual_v33_first', asset_id: v33Asset.asset_id, kind: 'inline', block_ordinal: 1,
        alt_text: v33Asset.alt_text, status: 'uploaded', owned_by_execution: true
      }]
    )
  });
  const second = await adapter.next(execution.execution_id);
  expect(second.command).toMatchObject({
    kind: 'replace_article_visual_anchor', purpose: 'replace_article_visual_anchor_2'
  });
  return {
    store, adapter, executionId, pendingCommand: second.command!,
    staleRevision: firstPredecessor.page_revision,
    contextPath: `runs/${executionId}/x-article/browser/adapter-context.json`
  };
}

async function v33CommandCount(store: WorkspaceStore, executionId: string): Promise<number> {
  return (await store.list(`runs/${executionId}/x-article/browser/commands`))
    .filter((entry) => entry.kind === 'directory').length;
}

async function v33CommandKindCount(
  store: WorkspaceStore,
  executionId: string,
  kind: XArticleBrowserCommandV1['kind']
): Promise<number> {
  const entries = await store.list(`runs/${executionId}/x-article/browser/commands`);
  const commands = await Promise.all(entries
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => store.readJson<XArticleBrowserCommandV1>(`${entry.relative_path}/command.json`)));
  return commands.filter((command) => command.kind === kind).length;
}

describe('X Article Browser security', () => {
  it('blocks an observed Human draft without importing over it or issuing Publish', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-human-drift-')));
    const humanPlan = createXArticlePublicationPlan({
      planId: 'plan_human_drift', runId: 'run_human_drift', targetAccount: '@Glen56121',
      articlePackage: {
        root: 'articles/security/human-drift',
        digest: `sha256:${'c'.repeat(64)}`
      },
      document: {
        schema_version: '1.0', title: 'Approved title', cover_asset_id: null,
        blocks: [{
          kind: 'paragraph',
          runs: [{ text: 'Approved body.', marks: [], link: null }]
        }]
      },
      visuals: [], plannedAt: '2026-08-26T00:00:00.000Z', provenance: {}
    });
    let commandNumber = 0;
    let eventNumber = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_human_drift',
      commandId: () => `command_human_drift_${++commandNumber}`,
      eventId: () => `event_human_drift_${++eventNumber}`,
      now: () => new Date('2026-08-26T00:01:00.000Z')
    });
    const execution = await adapter.prepare(humanPlan, {
      executor: 'codex-chrome', executor_version: 'offline-security-fixture', browser_family: 'chrome',
      capabilities: [
        'observe_article_page', 'create_article_draft', 'set_article_title', 'import_article_document',
        'replace_article_visual_anchor', 'open_article_preview', 'open_publish_review',
        'publish_article_once'
      ],
      observed_at: '2026-08-26T00:00:00.000Z'
    });
    let next = await adapter.next(execution.execution_id);
    await adapter.claim(next.command!);
    await adapter.report({
      command: next.command!,
      status: 'success',
      observation: preparedObservation(execution.execution_id, next.command!.command_id, {
        canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
        controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
      })
    });
    next = await adapter.next(execution.execution_id);
    const humanBlocks = [{
      kind: 'paragraph' as const,
      runs: [{ text: 'Human draft must survive recovery.', marks: [] as const, link: null }]
    }];
    const humanObservation = preparedObservation(execution.execution_id, next.command!.command_id, {
      canonical_url: 'https://x.com/compose/articles/edit/2092246293603373056',
      page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false }
      ],
      editor: {
        draft_id: '2092246293603373056', title: 'Human draft', blocks: humanBlocks, visuals: [],
        import_state: null, has_unknown_content: true, autosave_state: 'saved'
      }
    });
    await adapter.claim(next.command!);
    await adapter.report({ command: next.command!, status: 'success', observation: humanObservation });

    await expect(adapter.next(execution.execution_id)).resolves.toMatchObject({
      snapshot: { state: 'materialization_blocked', publish_command_count: 0 },
      command: null
    });
    const entries = await store.list(`runs/${execution.execution_id}/x-article/browser/commands`);
    const commands = await Promise.all(entries
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => store.readJson<XArticleBrowserCommandV1>(`${entry.relative_path}/command.json`)));
    expect(commands.map((command) => command.kind)).toEqual([
      'observe_article_page',
      'create_article_draft'
    ]);
    await expect(store.readJson(
      `runs/${execution.execution_id}/x-article/browser/observations/${humanObservation.observation_id}.json`
    )).resolves.toEqual(humanObservation);
  });

  it.each(v33BindingMutations)(
    'rejects a re-digested V3.3 pending issue with changed %s binding',
    async (name, mutate) => {
    const fixture = await createV33SecurityFixture(`binding_${name.replace(/\W/g, '_')}`);
    const context = await fixture.store.readJson<V33SecurityContext>(fixture.contextPath);
    const input = mutate(structuredClone(context.pending_issue.input));
    const pendingIssue = {
      ...context.pending_issue,
      command_id: `command_v33_tampered_${name.replace(/\W/g, '_')}`,
      input,
      input_digest: sha256(input),
      action_key: sha256({
        checkpoint_revision: context.pending_issue.checkpoint_revision,
        state: context.snapshot.state,
        sequence: context.snapshot.sequence,
        input
      })
    };
    await fixture.store.replaceAtomic(fixture.contextPath, {
      ...context, pending_command: null, pending_issue: pendingIssue
    });
    const before = await v33CommandCount(fixture.store, fixture.executionId);

    await expect(fixture.adapter.next(fixture.executionId))
      .rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
    expect(await v33CommandCount(fixture.store, fixture.executionId)).toBe(before);
    }
  );

  it.each(['kept', 'recomputed'] as const)(
    'rejects a V3.3 issued replacement whose pending issue command id changed with %s action key',
    async (actionKeyMode) => {
      const fixture = await createV33SecurityFixture(`command_id_${actionKeyMode}`);
      const context = await fixture.store.readJson<V33SecurityContext>(fixture.contextPath);
      const commandId = `command_v33_changed_${actionKeyMode}`;
      const pendingIssue = {
        ...context.pending_issue,
        command_id: commandId,
        action_key: actionKeyMode === 'kept'
          ? context.pending_issue.action_key
          : sha256({
              checkpoint_revision: context.pending_issue.checkpoint_revision,
              state: context.snapshot.state,
              sequence: context.snapshot.sequence,
              input: context.pending_issue.input
            })
      };
      await fixture.store.replaceAtomic(fixture.contextPath, {
        ...context, pending_command: null, pending_issue: pendingIssue
      });
      const before = await v33CommandKindCount(
        fixture.store, fixture.executionId, 'replace_article_visual_anchor'
      );

      await expect(fixture.adapter.next(fixture.executionId))
        .rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
      expect(await v33CommandKindCount(
        fixture.store, fixture.executionId, 'replace_article_visual_anchor'
      )).toBe(before);
    }
  );

  it('repairs the original V3.3 issued replacement idempotently after pending-command projection loss', async () => {
    const fixture = await createV33SecurityFixture('command_id_legal_repair');
    const context = await fixture.store.readJson<V33SecurityContext>(fixture.contextPath);
    await fixture.store.replaceAtomic(fixture.contextPath, { ...context, pending_command: null });
    const before = await v33CommandKindCount(
      fixture.store, fixture.executionId, 'replace_article_visual_anchor'
    );

    const repaired = await fixture.adapter.next(fixture.executionId);
    expect(repaired.command?.kind).toBe('observe_article_page');
    const replayed = await fixture.adapter.next(fixture.executionId);
    expect(replayed.command?.command_id).toBe(repaired.command?.command_id);
    expect(await v33CommandKindCount(
      fixture.store, fixture.executionId, 'replace_article_visual_anchor'
    )).toBe(before);
  });

  it.each(['next', 'claim', 'report'] as const)(
    'rejects a V3.3 second inline command rebound to an older valid predecessor before %s',
    async (operation) => {
      const fixture = await createV33TwoAnchorSecurityFixture(`stale_revision_${operation}`);
      const context = await fixture.store.readJson<V33SecurityContext>(fixture.contextPath);
      const command = {
        ...context.pending_command,
        expected_page_revision: fixture.staleRevision
      } as XArticleBrowserCommandV1;
      const input = Object.fromEntries(
        Object.entries(command).filter(([key]) =>
          !['schema_version', 'command_id', 'payload_digest', 'issued_at'].includes(key)
        )
      );
      const pendingIssue = {
        ...context.pending_issue,
        input,
        input_digest: sha256(input),
        action_key: sha256({
          checkpoint_revision: context.pending_issue.checkpoint_revision,
          state: context.snapshot.state,
          sequence: context.snapshot.sequence,
          input
        })
      };
      await fixture.store.replaceAtomic(
        `runs/${fixture.executionId}/x-article/browser/commands/${command.command_id}/command.json`,
        command
      );
      await fixture.store.replaceAtomic(fixture.contextPath, {
        ...context, pending_command: command, pending_issue: pendingIssue
      });
      const before = await v33CommandKindCount(
        fixture.store, fixture.executionId, 'replace_article_visual_anchor'
      );
      const attempted = operation === 'next'
        ? fixture.adapter.next(fixture.executionId)
        : operation === 'claim'
          ? fixture.adapter.claim(command)
          : fixture.adapter.report({ command, status: 'uncertain', observation: null });

      await expect(attempted).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
      expect(await v33CommandKindCount(
        fixture.store, fixture.executionId, 'replace_article_visual_anchor'
      )).toBe(before);
    }
  );

  it('rejects changed V3.3 pending issue and pending command digests before returning or writing', async () => {
    for (const target of ['pending_issue', 'pending_command'] as const) {
      const fixture = await createV33SecurityFixture(`digest_${target}`);
      const context = await fixture.store.readJson<V33SecurityContext>(fixture.contextPath);
      await fixture.store.replaceAtomic(fixture.contextPath, target === 'pending_issue'
        ? {
            ...context,
            pending_command: null,
            pending_issue: { ...context.pending_issue, input_digest: DIGEST_B }
          }
        : {
            ...context,
            pending_command: {
              ...context.pending_command,
              purpose: 'replace_article_visual_anchor_99',
              payload_digest: sha256(context.pending_command.payload)
            }
          });
      const before = await v33CommandCount(fixture.store, fixture.executionId);

      await expect(fixture.adapter.next(fixture.executionId)).rejects.toMatchObject({
        code: expect.stringMatching(/CONTRACT_INVALID|PUBLISH_GATE_BLOCKED|COMMAND_REPLAY_REJECTED/)
      });
      expect(await v33CommandCount(fixture.store, fixture.executionId)).toBe(before);
    }
  });

  it.each(['next', 'claim', 'report'] as const)(
    'validates a re-digested V3.3 pending command again before %s',
    async (operation) => {
      const fixture = await createV33SecurityFixture(`pending_${operation}`);
      const context = await fixture.store.readJson<V33SecurityContext>(fixture.contextPath);
      const payload = {
        ...context.pending_command.payload,
        package_digest: `sha256:${'e'.repeat(64)}`
      };
      const command = {
        ...context.pending_command,
        payload,
        payload_digest: sha256(payload)
      } as XArticleBrowserCommandV1;
      const input = Object.fromEntries(
        Object.entries(command).filter(([key]) =>
          !['schema_version', 'command_id', 'payload_digest', 'issued_at'].includes(key)
        )
      );
      const pendingIssue = {
        ...context.pending_issue,
        input,
        input_digest: sha256(input),
        action_key: sha256({
          checkpoint_revision: context.pending_issue.checkpoint_revision,
          state: context.snapshot.state,
          sequence: context.snapshot.sequence,
          input
        })
      };
      await fixture.store.replaceAtomic(fixture.contextPath, {
        ...context, pending_command: command, pending_issue: pendingIssue
      });
      const before = await v33CommandCount(fixture.store, fixture.executionId);
      const attempted = operation === 'next'
        ? fixture.adapter.next(fixture.executionId)
        : operation === 'claim'
          ? fixture.adapter.claim(command)
          : fixture.adapter.report({ command, status: 'uncertain', observation: null });

      await expect(attempted).rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
      expect(await v33CommandCount(fixture.store, fixture.executionId)).toBe(before);
    }
  );

  it.each([
    ['create_article_draft', 'write', { kind: 'create_article_draft', target_ref: 'create' }],
    ['set_article_title', 'write', { kind: 'set_article_title', target_ref: 'title', title: v33Plan.intent.document.title }],
    ['import_article_document', 'write', {
      kind: 'import_article_document', target_ref: 'body_v33',
      package_root: v33Plan.intent.article_package.root,
      package_digest: v33Plan.intent.article_package.digest,
      template: createXArticleImportTemplate(v33Plan.intent.document)
    }],
    ['insert_article_block', 'write', {
      kind: 'insert_article_block', target_ref: 'body_v33', block_ordinal: 1,
      block: { kind: 'paragraph', runs: [{ text: 'forbidden', marks: [], link: null }] }
    }],
    ['insert_article_image', 'write', {
      kind: 'insert_article_image', target_ref: 'body_v33', block_ordinal: 1,
      package_root: v33Plan.intent.article_package.root,
      package_digest: v33Plan.intent.article_package.digest, asset: v33Asset
    }],
    ['open_article_preview', 'write', { kind: 'open_article_preview', target_ref: 'preview' }],
    ['open_publish_review', 'write', { kind: 'open_publish_review', target_ref: 'publish' }],
    ['publish_article_once', 'submit', { kind: 'publish_article_once', target_ref: 'publish_once' }]
  ] as const)('rejects forbidden V3.3 %s even when the persisted intent is re-digested', async (kind, sideEffect, payload) => {
    const fixture = await createV33SecurityFixture(`forbidden_${kind}`);
    const context = await fixture.store.readJson<V33SecurityContext>(fixture.contextPath);
    const input = {
      ...context.pending_issue.input,
      kind,
      purpose: kind,
      side_effect: sideEffect,
      payload
    };
    const pendingIssue = {
      ...context.pending_issue,
      command_id: `command_v33_forbidden_${kind}`,
      input,
      input_digest: sha256(input),
      action_key: sha256({
        checkpoint_revision: context.pending_issue.checkpoint_revision,
        state: context.snapshot.state,
        sequence: context.snapshot.sequence,
        input
      })
    };
    await fixture.store.replaceAtomic(fixture.contextPath, {
      ...context, pending_command: null, pending_issue: pendingIssue
    });
    const before = await v33CommandCount(fixture.store, fixture.executionId);

    await expect(fixture.adapter.next(fixture.executionId))
      .rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
    expect(await v33CommandCount(fixture.store, fixture.executionId)).toBe(before);
  });

  it.each(['account', 'owned_by_execution'] as const)(
    'rejects a re-digested V3.3 command whose durable %s binding changed',
    async (field) => {
      const fixture = await createV33SecurityFixture(`durable_${field}`);
      const context = await fixture.store.readJson<V33SecurityContext>(fixture.contextPath);
      const latest = structuredClone(context.latest_observation) as XArticleBrowserObservation;
      const changedBody = {
        ...latest,
        ...(field === 'account' ? { account_handle: '@ForeignAccount' } : {}),
        editor: field === 'owned_by_execution' ? {
          ...latest.editor!,
          visuals: [{
            ref: 'visual_unowned', asset_id: v33Asset.asset_id, kind: 'inline', block_ordinal: 1,
            alt_text: 'wrong alt', status: 'uploaded', owned_by_execution: false
          }]
        } : latest.editor
      };
      const revisionBody = Object.fromEntries(
        Object.entries(changedBody).filter(([key]) => key !== 'page_revision')
      );
      const changed = { ...changedBody, page_revision: computeXArticlePageRevision(revisionBody) };
      await fixture.store.replaceAtomic(
        `runs/${fixture.executionId}/x-article/browser/observations/${changed.observation_id}.json`,
        changed
      );
      const input = field === 'owned_by_execution'
        ? {
            ...context.pending_issue.input,
            kind: 'set_article_image_alt', purpose: 'set_inline_alt_text_1',
            expected_page_revision: changed.page_revision,
            side_effect: 'write',
            payload: {
              kind: 'set_article_image_alt', visual_ref: 'visual_unowned', alt_text: v33Asset.alt_text
            }
          }
        : { ...context.pending_issue.input, expected_page_revision: changed.page_revision };
      const pendingIssue = {
        ...context.pending_issue,
        command_id: `command_v33_durable_${field}`,
        input,
        input_digest: sha256(input),
        action_key: sha256({
          checkpoint_revision: context.pending_issue.checkpoint_revision,
          state: context.snapshot.state,
          sequence: context.snapshot.sequence,
          input
        })
      };
      await fixture.store.replaceAtomic(fixture.contextPath, {
        ...context,
        latest_observation: changed,
        editor_revision: changed.page_revision,
        pending_command: null,
        pending_issue: pendingIssue
      });
      const before = await v33CommandCount(fixture.store, fixture.executionId);

      await expect(fixture.adapter.next(fixture.executionId))
        .rejects.toMatchObject({ code: 'PUBLISH_GATE_BLOCKED' });
      expect(await v33CommandCount(fixture.store, fixture.executionId)).toBe(before);
    }
  );

  it('keeps an old blocked V3.3 execution immutable when a different report arrives', async () => {
    const fixture = await createV33SecurityFixture('old_failed_immutable');
    await fixture.adapter.claim(fixture.pendingCommand);
    const observation = v33EditorObservation(
      fixture.executionId,
      fixture.pendingCommand.command_id,
      '2026-08-26T00:01:00.000Z',
      { editor: { ...v33EditorObservation(
        fixture.executionId, fixture.pendingCommand.command_id, '2026-08-26T00:01:00.000Z'
      ).editor!, has_unknown_content: true } }
    );
    await expect(fixture.adapter.report({
      command: fixture.pendingCommand, status: 'success', observation
    })).resolves.toMatchObject({ state: 'materialization_blocked' });
    const contextBefore = await fixture.store.readJson(fixture.contextPath);
    const checkpointPath = `runs/${fixture.executionId}/x-article/browser/materialization-checkpoint.json`;
    const checkpointBefore = await fixture.store.readJson(checkpointPath);

    await expect(fixture.adapter.report({
      command: fixture.pendingCommand, status: 'rejected', observation: null
    })).rejects.toMatchObject({ code: 'CONTRACT_INVALID' });
    await expect(fixture.store.readJson(fixture.contextPath)).resolves.toEqual(contextBefore);
    await expect(fixture.store.readJson(checkpointPath)).resolves.toEqual(checkpointBefore);
  });

  it('rejects malformed and extensible Publish confirmations at the contract boundary', () => {
    const confirmation = {
      schema_version: 'x-article-publish-confirmation/v1',
      confirmation_id: 'confirmation_secure', execution_id: 'execution_secure',
      draft_id: '2090731994279755776', target_account: '@Glen56121', audience: 'everyone',
      scope: 'publish_article_once', plan_digest: DIGEST_A, document_digest: DIGEST_B,
      preview_revision: DIGEST_A, asset_digests: [DIGEST_B], confirmed_by: 'human',
      confirmed_at: '2026-08-26T00:10:00.000Z', confirmation_digest: DIGEST_A
    };

    expect(validateContract('x-article-publish-confirmation', confirmation)).toEqual(confirmation);
    expect(() => validateContract('x-article-publish-confirmation', {
      ...confirmation, confirmation_digest: 'sha256:short'
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
    expect(() => validateContract('x-article-publish-confirmation', {
      ...confirmation, extra_submit: true
    })).toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects an unsafe Package root even when passed as a typed Plan', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-security-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      now: () => new Date('2026-08-21T09:00:10.000Z')
    });
    const unsafe = {
      ...plan,
      intent: { ...plan.intent, article_package: { ...plan.intent.article_package, root: '../escape' } }
    };
    await expect(adapter.start(unsafe, approval, {
      executor: 'codex-chrome', executor_version: 'test', browser_family: 'chrome',
      capabilities: [], observed_at: '2026-08-21T09:00:00.000Z'
    })).rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
  });

  it('rejects a missing semantic Browser capability before creating an execution', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-security-')));
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      now: () => new Date('2026-08-21T09:00:10.000Z')
    });
    await expect(adapter.start(plan, approval, {
      executor: 'codex-chrome', executor_version: 'test', browser_family: 'chrome',
      capabilities: ['observe_article_page'], observed_at: '2026-08-21T09:00:00.000Z'
    })).rejects.toMatchObject({ code: 'BROWSER_EXECUTOR_INCOMPATIBLE' });
  });

  it('accepts versioned article document import and visual anchor replacement commands', () => {
    const importDocument = importCommand({
      kind: 'import_article_document', target_ref: 'article_body', package_root: 'articles/runtime/article_1',
      package_digest: DIGEST_A, template: importTemplate
    });
    const replaceAnchor = importCommand({
      kind: 'replace_article_visual_anchor', target_ref: 'article_body', anchor: importAnchor,
      package_root: 'articles/runtime/article_1', package_digest: DIGEST_A, asset: visualAsset
    });

    expect(validateContract('x-article-browser-command', importDocument)).toEqual(importDocument);
    expect(validateContract('x-article-browser-command', replaceAnchor)).toEqual(replaceAnchor);
  });

  it.each([
    {
      name: 'import payload under a legacy envelope',
      payload: {
        kind: 'import_article_document', target_ref: 'article_body',
        package_root: 'articles/runtime/article_1', package_digest: DIGEST_A,
        template: importTemplate
      },
      envelope: { kind: 'observe_article_page', side_effect: 'read' }
    },
    {
      name: 'legacy payload under an import envelope',
      payload: { kind: 'observe_article_page', scope: 'editor' },
      envelope: { kind: 'import_article_document', side_effect: 'write' }
    },
    {
      name: 'replacement payload under a legacy envelope',
      payload: {
        kind: 'replace_article_visual_anchor', target_ref: 'article_body', anchor: importAnchor,
        package_root: 'articles/runtime/article_1', package_digest: DIGEST_A, asset: visualAsset
      },
      envelope: { kind: 'observe_article_page', side_effect: 'read' }
    },
    {
      name: 'legacy payload under a replacement envelope',
      payload: { kind: 'observe_article_page', scope: 'editor' },
      envelope: { kind: 'replace_article_visual_anchor', side_effect: 'write' }
    },
    {
      name: 'read side effect for document import',
      payload: {
        kind: 'import_article_document', target_ref: 'article_body',
        package_root: 'articles/runtime/article_1', package_digest: DIGEST_A,
        template: importTemplate
      },
      envelope: { kind: 'import_article_document', side_effect: 'read' }
    },
    {
      name: 'submit side effect for anchor replacement',
      payload: {
        kind: 'replace_article_visual_anchor', target_ref: 'article_body', anchor: importAnchor,
        package_root: 'articles/runtime/article_1', package_digest: DIGEST_A, asset: visualAsset
      },
      envelope: { kind: 'replace_article_visual_anchor', side_effect: 'submit' }
    }
  ])('rejects $name', ({ payload, envelope }) => {
    expect(() => validateContract('x-article-browser-command', importCommand(payload, envelope)))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('makes new command discriminants and write effects inseparable in TypeScript', () => {
    const common = {
      execution_id: 'execution_import_1', run_id: 'run_import_1',
      draft_id: '2090731994279755776', purpose: 'article_import',
      expected_page_revision: DIGEST_A, allowed_origin: 'https://x.com' as const
    };
    const importPayload = { kind: 'import_article_document' as const, target_ref: 'article_body', package_root: 'articles/runtime/article_1', package_digest: DIGEST_A, template: importTemplate };
    const replacementPayload = { kind: 'replace_article_visual_anchor' as const, target_ref: 'article_body', anchor: importAnchor, package_root: 'articles/runtime/article_1', package_digest: DIGEST_A, asset: visualAsset };
    const validImport: IssueXArticleBrowserCommandInput = { ...common, kind: 'import_article_document', side_effect: 'write', payload: importPayload };
    const validReplacement: IssueXArticleBrowserCommandInput = { ...common, kind: 'replace_article_visual_anchor', side_effect: 'write', payload: replacementPayload };
    // @ts-expect-error Import payloads cannot be hidden under legacy envelopes.
    const hiddenImport: IssueXArticleBrowserCommandInput = { ...common, kind: 'observe_article_page', side_effect: 'read', payload: importPayload };
    // @ts-expect-error Import envelopes require matching import payloads.
    const mismatchedImport: IssueXArticleBrowserCommandInput = { ...common, kind: 'import_article_document', side_effect: 'write', payload: { kind: 'observe_article_page', scope: 'editor' } };
    // @ts-expect-error Replacement payloads cannot be hidden under legacy envelopes.
    const hiddenReplacement: IssueXArticleBrowserCommandInput = { ...common, kind: 'observe_article_page', side_effect: 'read', payload: replacementPayload };
    // @ts-expect-error Replacement envelopes require matching replacement payloads.
    const mismatchedReplacement: IssueXArticleBrowserCommandInput = { ...common, kind: 'replace_article_visual_anchor', side_effect: 'write', payload: { kind: 'observe_article_page', scope: 'editor' } };
    // @ts-expect-error Document import is always a write command.
    const wrongImportEffect: IssueXArticleBrowserCommandInput = { ...common, kind: 'import_article_document', side_effect: 'read', payload: importPayload };
    // @ts-expect-error Anchor replacement is always a write command.
    const wrongReplacementEffect: IssueXArticleBrowserCommandInput = { ...common, kind: 'replace_article_visual_anchor', side_effect: 'submit', payload: replacementPayload };

    expect([
      validImport, validReplacement, hiddenImport, mismatchedImport, hiddenReplacement,
      mismatchedReplacement, wrongImportEffect, wrongReplacementEffect
    ]).toHaveLength(8);
  });

  it.each([
    {
      name: 'non-increasing block ordinals',
      anchors: [
        { ...importAnchor, anchor_id: 'anchor_asset_diagram_3', block_ordinal: 3 },
        { ...importAnchor, anchor_id: 'anchor_asset_diagram_2', block_ordinal: 2 }
      ]
    },
    {
      name: 'duplicate anchor IDs with otherwise different fields',
      anchors: [
        importAnchor,
        {
          anchor_id: importAnchor.anchor_id, asset_id: 'asset_other', block_ordinal: 4,
          marker: 'RPH_VISUAL_ANCHOR:asset_other:4'
        }
      ]
    }
  ])('rejects import templates with $name', ({ anchors }) => {
    const command = importCommand({
      kind: 'import_article_document', target_ref: 'article_body',
      package_root: 'articles/runtime/article_1', package_digest: DIGEST_A,
      template: { ...importTemplate, anchors }
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects an import command with a malformed template digest', () => {
    const command = importCommand({
      kind: 'import_article_document', target_ref: 'article_body', package_root: 'articles/runtime/article_1',
      package_digest: DIGEST_A, template: { ...importTemplate, template_digest: 'not-a-digest' }
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects a visual anchor replacement command with an unsafe anchor ID', () => {
    const command = importCommand({
      kind: 'replace_article_visual_anchor', target_ref: 'article_body',
      anchor: { ...importAnchor, anchor_id: '../anchor' }, package_root: 'articles/runtime/article_1',
      package_digest: DIGEST_A, asset: visualAsset
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects a visual anchor replacement command with an absolute asset path', () => {
    const command = importCommand({
      kind: 'replace_article_visual_anchor', target_ref: 'article_body', anchor: importAnchor,
      package_root: 'articles/runtime/article_1', package_digest: DIGEST_A,
      asset: { ...visualAsset, relative_path: 'C:/outside/asset_diagram.png' }
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });

  it('rejects an import command without a Package digest', () => {
    const command = importCommand({
      kind: 'import_article_document', target_ref: 'article_body', package_root: 'articles/runtime/article_1',
      template: importTemplate
    });

    expect(() => validateContract('x-article-browser-command', command))
      .toThrowError(expect.objectContaining({ code: 'CONTRACT_INVALID' }));
  });
});
