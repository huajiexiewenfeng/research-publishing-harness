import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { XArticleBrowserAdapter } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
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
        'observe_article_page', 'create_article_draft', 'import_article_document',
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
