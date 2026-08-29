import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { XArticleBrowserAdapter } from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation
} from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import type { XArticleBrowserCommandV1 } from '../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import { createXArticleImportTemplate } from '../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { XArticleWeb2026_08Contract } from '../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import type { XArticleBlockV1 } from '../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import { createXArticlePublicationPreflight } from '../harnesses/research-publishing/branches/x-article-harness/article-publication-preflight.js';
import { sha256 } from '../harnesses/research-publishing/core/digest.js';
import {
  confirmXArticleFastPath,
  createXArticleFastPathAudit
} from '../harnesses/research-publishing/core/x-article-fast-path.js';
import type { XArticleFastPathReleaseSetV1 } from '../harnesses/research-publishing/core/x-article-fast-path-release.js';
import {
  createXArticlePublicationPlan,
  type XArticlePublicationPlanV1,
  type XArticleVisualBindingV1
} from '../harnesses/research-publishing/core/x-article-publication-plan.js';
import { WorkspaceStore } from '../harnesses/research-publishing/core/workspace-store.js';

const protocol = 'x-article-materialization/v3.4' as const;
const releaseSet: XArticleFastPathReleaseSetV1 = {
  harness_protocol: protocol,
  registry_protocol: protocol,
  skill_protocol: protocol,
  browser_host_protocol: protocol
};
const capabilities = {
  executor: 'codex-chrome',
  executor_version: 'fast-path-acceptance-host',
  browser_family: 'chrome',
  capabilities: [
    'observe_article_page', 'create_article_draft', 'set_article_title',
    'import_article_document', 'replace_article_visual_anchor', 'upload_article_cover',
    'open_article_preview', 'open_publish_review', 'publish_article_once'
  ],
  observed_at: '2026-08-29T00:00:00.000Z'
} as const;
const draftId = '2092851979932647424';
const editorialMetadata =
  'Status: X Article Draft (v0.1) · Derived from a longer evidence note · Evidence review date: 2026-08-25';

export interface XArticleFastPathAcceptanceScenario {
  readonly name: '0' | '1' | '3' | '10' | 'disconnect_recovery';
  readonly ok: boolean;
  readonly confirmation_count: 1;
  readonly human_browser_operation_count: 0;
  readonly terminal_state: 'draft_reconciled';
  readonly elapsed_seconds: number;
  readonly cover: { readonly expected: 1; readonly completed: number };
  readonly inline_images: { readonly expected: number; readonly completed: number };
  readonly alt: { readonly expected: number; readonly completed: number };
  readonly removed_editorial_metadata_absent: boolean;
  readonly visual_anchors_absent: boolean;
  readonly recovery_count: 0 | 1;
  readonly duplicate_draft_count: number;
  readonly duplicate_upload_count: number;
  readonly duplicate_write_count: number;
  readonly preview_command_count: number;
  readonly publish_command_count: number;
}

export interface XArticleFastPathAcceptanceMatrix {
  readonly ok: boolean;
  readonly protocol: typeof protocol;
  readonly network: 'unused';
  readonly scenarios: readonly XArticleFastPathAcceptanceScenario[];
}

function asset(id: string, suffix: string) {
  return {
    asset_id: id,
    relative_path: `assets/${id}.png`,
    digest: sha256({ id, suffix }),
    mime_type: 'image/png' as const,
    alt_text: `Approved Alt for ${id}.`,
    claim_refs: [`claim:${id}`]
  };
}

function fixture(inlineCount: number, suffix: string) {
  const cover = asset(`cover_${suffix}`, suffix);
  const blocks: XArticleBlockV1[] = [{
    kind: 'paragraph',
    runs: [{ text: 'Domain semantics belong in the Skill.', marks: [], link: null }]
  }];
  const visuals: XArticleVisualBindingV1[] = [{ asset: cover, placement: { kind: 'cover' } }];
  for (let index = 0; index < inlineCount; index += 1) {
    const inline = asset(`inline_${suffix}_${index + 1}`, suffix);
    blocks.push({ kind: 'image', asset_id: inline.asset_id, alt_text: inline.alt_text });
    visuals.push({ asset: inline, placement: { kind: 'block', block_ordinal: blocks.length } });
    blocks.push({
      kind: 'paragraph',
      runs: [{ text: `Evidence-backed explanation ${index + 1}.`, marks: [], link: null }]
    });
  }
  blocks.push({
    kind: 'paragraph',
    runs: [{ text: editorialMetadata, marks: ['italic'], link: null }]
  });
  const rawDocument = {
    schema_version: '1.0' as const,
    title: `Fast Path acceptance ${suffix}`,
    cover_asset_id: cover.asset_id,
    blocks
  };
  const preflight = createXArticlePublicationPreflight({ document: rawDocument, visuals });
  const plan = createXArticlePublicationPlan({
    planId: `plan_fast_path_${suffix}`,
    runId: `run_fast_path_${suffix}`,
    targetAccount: '@Glen56121',
    articlePackage: {
      root: `articles/fast-path/${suffix}`,
      digest: sha256({ suffix, inlineCount, kind: 'package' })
    },
    document: preflight.sanitized_document,
    visuals,
    plannedAt: '2026-08-29T00:00:00.000Z',
    provenance: { fixture: 'x-article-fast-path-acceptance' }
  });
  return { plan, preflight };
}

function observation(
  executionId: string,
  commandId: string,
  document: XArticlePublicationPlanV1['intent']['document'],
  resolvedInline: ReadonlySet<string>,
  coverCompleted: boolean,
  preserveEmptyImportState = false,
  observedAt = '2026-08-29T00:01:00.000Z'
): XArticleBrowserObservation {
  const template = createXArticleImportTemplate(document);
  const unresolved = template.anchors.filter((anchor) => !resolvedInline.has(anchor.asset_id));
  const visualByAsset = new Map(template.anchors.map((anchor) => [anchor.asset_id, anchor]));
  const altByAsset = new Map(document.blocks.flatMap((block) =>
    block.kind === 'image' ? [[block.asset_id, block.alt_text] as const] : []
  ));
  const visuals: NonNullable<XArticleBrowserObservation['editor']>['visuals'] = [
    ...(coverCompleted ? [{
      ref: 'cover', asset_id: document.cover_asset_id!, kind: 'cover' as const,
      block_ordinal: null, alt_text: null, status: 'uploaded' as const,
      owned_by_execution: true
    }] : []),
    ...[...resolvedInline].map((assetId) => {
      const anchor = visualByAsset.get(assetId)!;
      return {
        ref: `visual_${assetId}`, asset_id: assetId, kind: 'inline' as const,
        block_ordinal: anchor.block_ordinal, alt_text: altByAsset.get(assetId)!,
        status: 'uploaded' as const, owned_by_execution: true
      };
    })
  ];
  const input = {
    schema_version: '1.0', observation_id: `obs_${commandId}`,
    execution_id: executionId, command_id: commandId, origin: 'https://x.com',
    canonical_url: `https://x.com/compose/articles/edit/${draftId}`,
    observed_at: observedAt, account_handle: '@Glen56121',
    page_kind: 'article_editor',
    controls: [
      { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
      { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
      { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false }
    ],
    editor: {
      draft_id: draftId,
      title: document.title,
      blocks: document.blocks.filter((block) =>
        block.kind !== 'image' || resolvedInline.has(block.asset_id)
      ),
      visuals,
      has_unknown_content: false,
      autosave_state: 'saved',
      import_state: unresolved.length === 0 && !preserveEmptyImportState ? null : {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: unresolved
      }
    },
    preview: null, publish_review: null, public_article: null
  } as const;
  return ({
    ...input,
    page_revision: computeXArticlePageRevision(input)
  } as unknown) as XArticleBrowserObservation;
}

class FakeDraftPage {
  readonly resolvedInline = new Set<string>();
  readonly writes = new Map<string, number>();
  coverCompleted = false;

  constructor(readonly plan: XArticlePublicationPlanV1) {}

  execute(command: XArticleBrowserCommandV1): XArticleBrowserObservation {
    if (command.kind === 'upload_article_cover') {
      const assetId = command.payload.kind === 'upload_article_cover'
        ? command.payload.asset.asset_id : 'invalid-cover';
      this.writes.set(assetId, (this.writes.get(assetId) ?? 0) + 1);
      this.coverCompleted = true;
    } else if (command.kind === 'replace_article_visual_anchor') {
      const assetId = command.payload.kind === 'replace_article_visual_anchor'
        ? command.payload.asset.asset_id : 'invalid-inline';
      this.writes.set(assetId, (this.writes.get(assetId) ?? 0) + 1);
      this.resolvedInline.add(assetId);
    } else if (command.kind !== 'observe_article_page' && command.kind !== 'navigate') {
      throw new Error(`Fast Path acceptance received forbidden command ${command.kind}`);
    }
    return observation(
      command.execution_id,
      command.command_id,
      this.plan.intent.document,
      this.resolvedInline,
      this.coverCompleted,
      !this.coverCompleted
    );
  }
}

async function runScenario(
  name: XArticleFastPathAcceptanceScenario['name'],
  inlineCount: number,
  disconnect: boolean
): Promise<XArticleFastPathAcceptanceScenario> {
  const started = performance.now();
  const workspace = await mkdtemp(join(tmpdir(), `rph-fast-path-${name}-`));
  try {
    const store = await WorkspaceStore.open(workspace);
    let commandNumber = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => `execution_fast_path_acceptance_${name}`,
      commandId: () => `command_fast_path_acceptance_${name}_${++commandNumber}`,
      eventId: () => `event_fast_path_acceptance_${name}_${commandNumber}`,
      now: () => new Date('2026-08-29T00:01:00.000Z')
    });
    const { plan, preflight } = fixture(inlineCount, name);
    const audit = createXArticleFastPathAudit({
      preflight,
      publication_plan: plan,
      draft_target: { kind: 'existing', draft_id: draftId }
    });
    const confirmation = confirmXArticleFastPath(
      audit,
      'human:Glen56121',
      3_600_000,
      new Date('2026-08-29T00:00:00.000Z')
    );
    const page = new FakeDraftPage(plan);
    const source = observation(
      'source', 'source_command', plan.intent.document, new Set(), false, true,
      '2026-08-29T00:00:00.000Z'
    );
    const execution = await adapter.prepareFastPath({
      audit, confirmation, capabilities, release_set: releaseSet, source_observation: source
    });
    const commandKinds: string[] = [];
    let disconnected = false;
    let recoveryCount: 0 | 1 = 0;
    let terminalState = '';
    const trace: Array<{ command: string; state: string }> = [];

    while (true) {
      const next = await adapter.next(execution.execution_id);
      if (next.command === null) {
        terminalState = next.snapshot.state;
        break;
      }
      const command = next.command;
      commandKinds.push(command.kind);
      await adapter.claim(command);
      const observed = page.execute(command);
      if (disconnect && !disconnected && command.kind === 'replace_article_visual_anchor') {
        disconnected = true;
        await adapter.report({ command, status: 'uncertain', observation: null });
        const recovery = await adapter.recoverFastPath(execution.execution_id);
        recoveryCount = 1;
        commandKinds.push(recovery.command.kind);
        await adapter.claim(recovery.command);
        const recoveredSnapshot = await adapter.report({
          command: recovery.command,
          status: 'success',
          observation: page.execute(recovery.command)
        });
        trace.push({ command: recovery.command.kind, state: recoveredSnapshot.state });
      } else {
        const reported = await adapter.report({ command, status: 'success', observation: observed });
        trace.push({ command: command.kind, state: reported.state });
      }
    }

    if (terminalState !== 'draft_reconciled') {
      const checkpointPath =
        `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`;
      const checkpoint = await store.exists(checkpointPath)
        ? await store.readJson<Record<string, unknown>>(checkpointPath)
        : null;
      const events = await store.list(`runs/${execution.execution_id}/x-article/browser/events`);
      const lastEvent = events.length === 0 ? null : await store.readJson<Record<string, unknown>>(
        events[events.length - 1]!.relative_path
      );
      const evidenceEntries = await store.list(
        `runs/${execution.execution_id}/x-article/browser/reconciliation-evidence`
      );
      const rejectionEvidence = evidenceEntries.length === 0
        ? null
        : await store.readJson<Record<string, unknown>>(evidenceEntries[0]!.relative_path);
      throw new Error(`Fast Path stopped before reconciliation: ${JSON.stringify({
        name, terminal_state: terminalState, trace, checkpoint, last_event: lastEvent,
        rejection_evidence: rejectionEvidence
      })}`);
    }

    const result = await store.readJson<{
      state: 'draft_reconciled';
      cover: { expected: 1; completed: number };
      inline_images: { expected: number; completed: number };
      alt: { expected: number; verified: number };
      preview_command_count: number;
      publish_command_count: number;
    }>(`runs/${execution.execution_id}/x-article/browser/fast-path-result-v1.json`);
    const duplicateUploads = [...page.writes.values()].filter((count) => count > 1)
      .reduce((total, count) => total + count - 1, 0);
    const elapsedSeconds = (performance.now() - started) / 1_000;
    const current = observation(
      execution.execution_id, 'final', plan.intent.document,
      page.resolvedInline, page.coverCompleted
    ).editor!;
    const scenario = {
      name,
      ok: result.state === 'draft_reconciled'
        && result.cover.completed === 1
        && result.inline_images.completed === inlineCount
        && result.alt.verified === inlineCount
        && result.preview_command_count === 0
        && result.publish_command_count === 0
        && duplicateUploads === 0
        && elapsedSeconds < 600,
      confirmation_count: 1 as const,
      human_browser_operation_count: 0 as const,
      terminal_state: result.state,
      elapsed_seconds: elapsedSeconds,
      cover: result.cover,
      inline_images: result.inline_images,
      alt: { expected: inlineCount, completed: result.alt.verified },
      removed_editorial_metadata_absent: !JSON.stringify(current.blocks).includes(editorialMetadata),
      visual_anchors_absent: current.import_state === null,
      recovery_count: recoveryCount,
      duplicate_draft_count: commandKinds.filter((kind) => kind === 'create_article_draft').length,
      duplicate_upload_count: duplicateUploads,
      duplicate_write_count: duplicateUploads,
      preview_command_count: result.preview_command_count,
      publish_command_count: result.publish_command_count
    } satisfies XArticleFastPathAcceptanceScenario;
    return { ...scenario, ok: scenario.ok && scenario.removed_editorial_metadata_absent
      && scenario.visual_anchors_absent };
  } finally {
    const verified = resolve(workspace);
    if (resolve(verified, '..') !== resolve(tmpdir()) || !verified.includes('rph-fast-path-')) {
      throw new Error('refusing to remove unverified Fast Path acceptance workspace');
    }
    await rm(verified, { recursive: true, force: false });
  }
}

export async function runXArticleFastPathAcceptanceMatrix(): Promise<XArticleFastPathAcceptanceMatrix> {
  const scenarios = [] as XArticleFastPathAcceptanceScenario[];
  for (const count of [0, 1, 3, 10] as const) {
    scenarios.push(await runScenario(String(count) as '0' | '1' | '3' | '10', count, false));
  }
  scenarios.push(await runScenario('disconnect_recovery', 3, true));
  return {
    ok: scenarios.every((scenario) => scenario.ok),
    protocol,
    network: 'unused',
    scenarios
  };
}

if (
  process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.stdout.write(`${JSON.stringify(await runXArticleFastPathAcceptanceMatrix())}\n`);
}
