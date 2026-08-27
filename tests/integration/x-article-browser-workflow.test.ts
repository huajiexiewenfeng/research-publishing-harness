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
import type { XArticleBrowserCommandV1 } from '../../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import { XArticleWeb2026_08Contract } from '../../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { XArticleService } from '../../harnesses/research-publishing/branches/x-article-harness/x-article-service.js';
import type { XArticleBlockV1 } from '../../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import { sha256, sha256Bytes } from '../../harnesses/research-publishing/core/digest.js';
import { approveXArticlePublication } from '../../harnesses/research-publishing/core/x-article-approval.js';
import { createXArticlePublishConfirmation } from '../../harnesses/research-publishing/core/x-article-publish-confirmation.js';
import {
  createXArticlePublicationPlan,
  type XArticlePublicationPlanV1,
  type XArticleVisualBindingV1
} from '../../harnesses/research-publishing/core/x-article-publication-plan.js';
import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import {
  bulkArticleMarkdown,
  bulkArticleVisualFixtures
} from '../fixtures/x-article-browser-observations.js';
import { runXArticleHostAcceptance } from '../../tools/acceptance.js';

function observation(
  executionId: string,
  commandId: string,
  value: Record<string, unknown>
): XArticleBrowserObservation {
  const input = {
    schema_version: '1.0', observation_id: `obs_${commandId}`, execution_id: executionId,
    command_id: commandId, origin: 'https://x.com', observed_at: '2026-08-21T09:01:00.000Z',
    account_handle: '@Glen56121', controls: [], editor: null, preview: null,
    publish_review: null, public_article: null, ...value
  } as const;
  return { ...input, page_revision: computeXArticlePageRevision(input) } as unknown as XArticleBrowserObservation;
}

async function succeed(
  adapter: XArticleBrowserAdapter,
  command: XArticleBrowserCommandV1,
  value: Record<string, unknown>
): Promise<void> {
  await adapter.claim(command);
  await adapter.report({
    command, status: 'success', observation: observation(command.execution_id, command.command_id, value)
  });
}

const materializationCapabilities = {
  executor: 'codex-chrome', executor_version: 'offline-control-plane-fixture', browser_family: 'chrome',
  capabilities: [
    'observe_article_page', 'create_article_draft', 'set_article_title', 'import_article_document',
    'replace_article_visual_anchor', 'upload_article_cover', 'open_article_preview',
    'open_publish_review', 'publish_article_once'
  ],
  observed_at: '2026-08-26T00:00:00.000Z'
} as const;

const crashPoints = [
  'after_draft_create',
  'after_metadata',
  'import_effect_before_checkpoint',
  'before_media_1',
  'media_effect_before_anchor_cleanup',
  'media_complete_before_checkpoint',
  'after_preview',
  'after_confirmation_before_publish',
  'publish_effect_unknown'
] as const;

type CrashPoint = (typeof crashPoints)[number];

interface HostLocalMetadataState {
  readonly draft_id: string;
  readonly title: string;
  readonly persisted: boolean;
  readonly digest: `sha256:${string}`;
}

function createMaterializationFixturePlan(
  imageCount: number,
  suffix: string,
  includeCover = false
): XArticlePublicationPlanV1 {
  const blocks: XArticleBlockV1[] = [{
    kind: 'paragraph',
    runs: [{ text: 'Human-reviewed control-plane introduction.', marks: [], link: null }]
  }];
  const visuals: XArticleVisualBindingV1[] = [];
  let coverAssetId: string | null = null;
  if (includeCover) {
    const asset = {
      asset_id: `asset_cover_${suffix}`,
      relative_path: `assets/cover-${suffix}.png`,
      digest: sha256({ suffix, kind: 'cover' }),
      mime_type: 'image/png' as const,
      alt_text: 'Human-reviewed control-plane cover.',
      claim_refs: ['claim_control_plane']
    };
    coverAssetId = asset.asset_id;
    visuals.push({ asset, placement: { kind: 'cover' } });
  }
  for (let index = 0; index < imageCount; index += 1) {
    const asset = {
      asset_id: `asset_inline_${suffix}_${index + 1}`,
      relative_path: `assets/inline-${suffix}-${index + 1}.png`,
      digest: sha256({ suffix, index, kind: 'inline' }),
      mime_type: 'image/png' as const,
      alt_text: `Human-reviewed diagram ${index + 1}.`,
      claim_refs: [`claim_${index + 1}`]
    };
    blocks.push({ kind: 'image', asset_id: asset.asset_id, alt_text: asset.alt_text });
    visuals.push({ asset, placement: { kind: 'block', block_ordinal: blocks.length } });
    blocks.push({
      kind: 'paragraph',
      runs: [{ text: `Human-reviewed explanation ${index + 1}.`, marks: [], link: null }]
    });
  }
  return createXArticlePublicationPlan({
    planId: `plan_${suffix}`,
    runId: `run_${suffix}`,
    targetAccount: '@Glen56121',
    articlePackage: {
      root: `articles/control-plane/${suffix}`,
      digest: sha256({ suffix, imageCount, includeCover })
    },
    document: {
      schema_version: '1.0',
      title: `Control plane ${suffix}`,
      cover_asset_id: coverAssetId,
      blocks
    },
    visuals,
    plannedAt: '2026-08-26T00:00:00.000Z',
    provenance: { fixture: 'offline-control-plane' }
  });
}

class OfflineMaterializationHost {
  readonly network = 'unused';
  readonly draftId = '2092246293603373056';
  readonly completedAssetEffects: string[] = [];
  readonly commandEffects: string[] = [];
  bodyImportEffects = 0;
  bodyOverwriteAttempts = 0;
  coverEffects = 0;
  metadataOverwriteAttempts = 0;
  metadataWriteEffects = 0;
  publishEffects = 0;
  localAnchorCleanupRecoveries = 0;
  private metadataPersisted = false;
  private title = '';
  private blocks: readonly XArticleBlockV1[] = [];
  private visuals: NonNullable<XArticleBrowserObservation['editor']>['visuals'] = [];
  private importState: NonNullable<XArticleBrowserObservation['editor']>['import_state'] = null;

  constructor(private readonly plan: XArticlePublicationPlanV1) {}

  persistDraftMetadata(): void {
    const plannedTitle = this.plan.intent.document.title;
    if (this.metadataPersisted) {
      if (this.title !== plannedTitle) this.metadataOverwriteAttempts += 1;
      return;
    }
    if (this.title !== '' && this.title !== plannedTitle) this.metadataOverwriteAttempts += 1;
    this.title = plannedTitle;
    this.metadataPersisted = true;
    this.metadataWriteEffects += 1;
  }

  metadataState(): HostLocalMetadataState {
    const body = {
      draft_id: this.draftId,
      title: this.title,
      persisted: this.metadataPersisted
    } as const;
    return { ...body, digest: sha256(body) };
  }

  private observed(
    command: XArticleBrowserCommandV1,
    value: Record<string, unknown>
  ): XArticleBrowserObservation {
    return observation(command.execution_id, command.command_id, {
      observed_at: '2026-08-26T00:01:00.000Z',
      ...value
    });
  }

  private editor(command: XArticleBrowserCommandV1): XArticleBrowserObservation {
    return this.observed(command, {
      canonical_url: `https://x.com/compose/articles/edit/${this.draftId}`,
      page_kind: 'article_editor',
      controls: [
        { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
        { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
        { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
        { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
      ],
      editor: {
        draft_id: this.draftId,
        title: this.title,
        blocks: this.blocks,
        visuals: this.visuals,
        import_state: this.importState,
        has_unknown_content: false,
        autosave_state: 'saved'
      }
    });
  }

  private completeAnchor(command: XArticleBrowserCommandV1): void {
    if (command.payload.kind !== 'replace_article_visual_anchor') {
      throw new Error('expected visual-anchor command');
    }
    const anchor = command.payload.anchor;
    const unresolved = this.importState?.unresolved_anchors.filter(
      (candidate) => candidate.anchor_id !== anchor.anchor_id
    ) ?? [];
    if (!this.completedAssetEffects.includes(command.payload.asset.asset_id)) {
      this.completedAssetEffects.push(command.payload.asset.asset_id);
      this.visuals = [...this.visuals, {
        ref: `visual_${anchor.asset_id}`,
        asset_id: command.payload.asset.asset_id,
        kind: 'inline',
        block_ordinal: anchor.block_ordinal,
        alt_text: command.payload.asset.alt_text,
        status: 'uploaded',
        owned_by_execution: true
      }];
    }
    const unresolvedOrdinals = new Set(unresolved.map((candidate) => candidate.block_ordinal));
    this.blocks = this.plan.intent.document.blocks.filter((block, index) =>
      block.kind !== 'image' || !unresolvedOrdinals.has(index + 1)
    );
    this.importState = unresolved.length === 0
      ? null
      : { ...this.importState!, unresolved_anchors: unresolved };
  }

  recoverAnchorCleanup(command: XArticleBrowserCommandV1): XArticleBrowserObservation {
    this.localAnchorCleanupRecoveries += 1;
    this.completeAnchor(command);
    return this.editor(command);
  }

  apply(
    command: XArticleBrowserCommandV1,
    options: { readonly leaveAnchorAfterMediaEffect?: boolean } = {}
  ): XArticleBrowserObservation | null {
    this.commandEffects.push(command.kind);
    if (command.payload.kind === 'observe_article_page') {
      if (command.payload.scope === 'index') {
        return this.observed(command, {
          canonical_url: 'https://x.com/compose/articles',
          page_kind: 'articles_index',
          controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
        });
      }
      if (command.payload.scope === 'editor') {
        if (this.importState?.unresolved_anchors.length === 0) this.importState = null;
        return this.editor(command);
      }
      throw new Error('offline Host refuses public network observation');
    }
    if (command.payload.kind === 'create_article_draft') return this.editor(command);
    if (command.payload.kind === 'set_article_title') {
      this.persistDraftMetadata();
      return this.editor(command);
    }
    if (command.payload.kind === 'import_article_document') {
      if (this.bodyImportEffects > 0 || this.blocks.length > 0) this.bodyOverwriteAttempts += 1;
      if (this.bodyImportEffects === 0) {
        this.bodyImportEffects += 1;
        if (this.metadataPersisted && this.title !== this.plan.intent.document.title) {
          this.metadataOverwriteAttempts += 1;
        }
        this.title = this.plan.intent.document.title;
        this.blocks = this.plan.intent.document.blocks.filter((block) => block.kind !== 'image');
        const template = createXArticleImportTemplate(this.plan.intent.document);
        this.importState = {
          template_digest: template.template_digest,
          source_document_digest: template.source_document_digest,
          unresolved_anchors: template.anchors
        };
      }
      return this.editor(command);
    }
    if (command.payload.kind === 'upload_article_cover') {
      if (!this.visuals.some((visual) => visual.kind === 'cover')) {
        this.coverEffects += 1;
        this.visuals = [...this.visuals, {
          ref: 'cover_control_plane',
          asset_id: command.payload.asset.asset_id,
          kind: 'cover',
          block_ordinal: null,
          alt_text: null,
          status: 'uploaded',
          owned_by_execution: true
        }];
      }
      return this.editor(command);
    }
    if (command.payload.kind === 'replace_article_visual_anchor') {
      if (options.leaveAnchorAfterMediaEffect) {
        if (!this.completedAssetEffects.includes(command.payload.asset.asset_id)) {
          this.completedAssetEffects.push(command.payload.asset.asset_id);
          this.visuals = [...this.visuals, {
            ref: `visual_${command.payload.anchor.asset_id}`,
            asset_id: command.payload.asset.asset_id,
            kind: 'inline',
            block_ordinal: command.payload.anchor.block_ordinal,
            alt_text: command.payload.asset.alt_text,
            status: 'uploaded',
            owned_by_execution: true
          }];
        }
        return this.editor(command);
      }
      this.completeAnchor(command);
      return this.editor(command);
    }
    if (command.payload.kind === 'open_article_preview') {
      return this.observed(command, {
        canonical_url: `https://x.com/compose/articles/edit/${this.draftId}/preview`,
        page_kind: 'article_preview',
        controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
        preview: {
          draft_id: this.draftId,
          title: this.title,
          blocks: this.blocks,
          visuals: this.visuals
        }
      });
    }
    if (command.payload.kind === 'open_publish_review') {
      return this.observed(command, {
        canonical_url: `https://x.com/compose/articles/edit/${this.draftId}/preview`,
        page_kind: 'publish_review',
        controls: [{ ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }],
        publish_review: {
          draft_id: this.draftId,
          audience: 'everyone',
          final_publish_ref: 'publish_final'
        }
      });
    }
    if (command.payload.kind === 'publish_article_once') {
      this.publishEffects += 1;
      return null;
    }
    throw new Error(`offline Host does not implement ${command.kind}`);
  }

  humanTextDigest(): `sha256:${string}` {
    return sha256(this.blocks.filter((block) => block.kind !== 'image'));
  }
}

interface MaterializationRunResult {
  readonly state: string;
  readonly body_import_count: number;
  readonly body_import_command_count: number;
  readonly incremental_block_command_count: number;
  readonly cover_effect_count: number;
  readonly cover_command_count: number;
  readonly expected_asset_ids: readonly string[];
  readonly completed_asset_ids: readonly string[];
  readonly publish_effect_count: number;
  readonly publish_command_count: number;
  readonly command_count: number;
  readonly observation_count: number;
  readonly command_ceiling: number;
  readonly observation_ceiling: number;
  readonly human_content_overwrite_count: number;
  readonly human_text_digest_before_recovery: `sha256:${string}`;
  readonly human_text_digest_after_recovery: `sha256:${string}`;
  readonly network: 'unused';
  readonly local_anchor_cleanup_recoveries: number;
  readonly metadata_state_before_recovery: HostLocalMetadataState | null;
  readonly metadata_state_after_recovery: HostLocalMetadataState;
  readonly metadata_write_count: number;
  readonly metadata_overwrite_count: number;
  readonly boundary_checkpoint: Record<string, unknown> | null;
  readonly boundary_command_id: string | null;
  readonly boundary_claim_persisted: boolean | null;
  readonly boundary_report_persisted: boolean | null;
}

async function runOfflineMaterialization(
  imageCount: number,
  suffix: string,
  crashPoint: CrashPoint | null = null,
  includeCover = false
): Promise<MaterializationRunResult> {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), `rph-x-article-v32-${suffix}-`)));
  const plan = createMaterializationFixturePlan(imageCount, suffix, includeCover);
  const host = new OfflineMaterializationHost(plan);
  let commandNumber = 0;
  let eventNumber = 0;
  const createAdapter = () => new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
    executionId: () => `execution_${suffix}`,
    commandId: () => `command_${suffix}_${++commandNumber}`,
    eventId: () => `event_${suffix}_${++eventNumber}`,
    attemptId: () => `attempt_${suffix}`,
    receiptId: () => `receipt_${suffix}`,
    now: () => new Date('2026-08-26T00:01:00.000Z')
  });
  let adapter = createAdapter();
  const execution = await adapter.prepare(plan, materializationCapabilities);
  let crashed = false;
  let confirmed = false;
  let boundaryCheckpoint: Record<string, unknown> | null = null;
  let boundaryCommandId: string | null = null;
  let boundaryClaimPersisted: boolean | null = null;
  let boundaryReportPersisted: boolean | null = null;
  let metadataStateBeforeRecovery: HostLocalMetadataState | null = null;
  let humanTextDigestBeforeRecovery: `sha256:${string}` | null = null;

  const recordBoundary = async (command: XArticleBrowserCommandV1 | null): Promise<void> => {
    boundaryCommandId = command?.command_id ?? null;
    boundaryClaimPersisted = command === null
      ? null
      : await store.exists(
          `runs/${execution.execution_id}/x-article/browser/commands/${command.command_id}/claim.json`
        );
    boundaryReportPersisted = command === null
      ? null
      : await store.exists(
          `runs/${execution.execution_id}/x-article/browser/reports/${command.command_id}.json`
        );
    boundaryCheckpoint = await store.readJson<Record<string, unknown>>(
      `runs/${execution.execution_id}/x-article/browser/materialization-checkpoint.json`
    );
    if (host.bodyImportEffects > 0) humanTextDigestBeforeRecovery = host.humanTextDigest();
    metadataStateBeforeRecovery = host.metadataState();
    adapter = createAdapter();
    crashed = true;
  };

  for (let step = 0; step < 100; step += 1) {
    const status = await adapter.status(execution.execution_id);
    if (status.state === 'confirmation_pending') {
      if (crashPoint === 'after_preview' && !crashed) {
        await recordBoundary(null);
        break;
      }
      if (crashPoint === 'after_confirmation_before_publish') {
        const preview = await store.readJson<XArticleBrowserObservation>(
          `runs/${execution.execution_id}/x-article/browser/observations/${status.latest_observation_id}.json`
        );
        await adapter.confirmPublish(execution.execution_id, createXArticlePublishConfirmation({
          confirmation_id: `confirmation_${suffix}`,
          execution_id: execution.execution_id,
          draft_id: host.draftId,
          target_account: plan.intent.target_account,
          audience: 'everyone',
          plan_digest: plan.plan_digest as `sha256:${string}`,
          document_digest: sha256(plan.intent.document),
          preview_revision: preview.page_revision,
          asset_digests: plan.intent.visuals.map((binding) => binding.asset.digest),
          confirmed_by: 'human:Glen56121',
          confirmed_at: '2026-08-26T00:01:00.000Z'
        }));
        confirmed = true;
        await recordBoundary(null);
        break;
      }
      if (crashPoint === 'publish_effect_unknown' && !confirmed) {
        const preview = await store.readJson<XArticleBrowserObservation>(
          `runs/${execution.execution_id}/x-article/browser/observations/${status.latest_observation_id}.json`
        );
        await adapter.confirmPublish(execution.execution_id, createXArticlePublishConfirmation({
          confirmation_id: `confirmation_${suffix}`,
          execution_id: execution.execution_id,
          draft_id: host.draftId,
          target_account: plan.intent.target_account,
          audience: 'everyone',
          plan_digest: plan.plan_digest as `sha256:${string}`,
          document_digest: sha256(plan.intent.document),
          preview_revision: preview.page_revision,
          asset_digests: plan.intent.visuals.map((binding) => binding.asset.digest),
          confirmed_by: 'human:Glen56121',
          confirmed_at: '2026-08-26T00:01:00.000Z'
        }));
        confirmed = true;
        continue;
      }
      break;
    }

    const next = await adapter.next(execution.execution_id);
    if (next.command === null) break;
    const command = next.command;

    if (
      crashPoint === 'before_media_1'
      && !crashed
      && command.kind === 'replace_article_visual_anchor'
    ) {
      await recordBoundary(command);
      continue;
    }

    await adapter.claim(command);
    if (
      crashPoint === 'media_effect_before_anchor_cleanup'
      && !crashed
      && command.kind === 'replace_article_visual_anchor'
    ) {
      host.apply(command, { leaveAnchorAfterMediaEffect: true });
      await recordBoundary(command);
      const recovered = host.recoverAnchorCleanup(command);
      await adapter.report({ command, status: 'success', observation: recovered });
      continue;
    }

    const effect = host.apply(command);
    if (
      crashPoint === 'after_draft_create'
      && !crashed
      && command.kind === 'create_article_draft'
    ) {
      await recordBoundary(command);
      await adapter.report({ command, status: 'success', observation: effect });
      continue;
    }
    if (
      crashPoint === 'import_effect_before_checkpoint'
      && !crashed
      && command.kind === 'import_article_document'
    ) {
      await recordBoundary(command);
      await adapter.report({ command, status: 'success', observation: effect });
      continue;
    }
    if (
      crashPoint === 'media_complete_before_checkpoint'
      && !crashed
      && command.kind === 'replace_article_visual_anchor'
    ) {
      await recordBoundary(command);
      await adapter.report({ command, status: 'success', observation: effect });
      continue;
    }
    if (command.kind === 'publish_article_once' && crashPoint === 'publish_effect_unknown') {
      await recordBoundary(command);
      await adapter.report({ command, status: 'uncertain', observation: null });
      break;
    }
    await adapter.report({ command, status: 'success', observation: effect });

    if (
      crashPoint === 'after_metadata'
      && !crashed
      && command.kind === 'set_article_title'
    ) {
      await recordBoundary(command);
    }
  }

  if (crashPoint !== null && !crashed) throw new Error(`crash point ${crashPoint} was not reached`);
  const materializationPlan = await store.readJson<{
    expected_command_ceiling: number;
    expected_observation_ceiling: number;
  }>(`runs/${execution.execution_id}/x-article/browser/materialization-plan.json`);
  const commandEntries = await store.list(`runs/${execution.execution_id}/x-article/browser/commands`);
  const commands = await Promise.all(commandEntries
    .filter((entry) => entry.kind === 'directory')
    .map((entry) => store.readJson<XArticleBrowserCommandV1>(`${entry.relative_path}/command.json`)));
  const observationEntries = await store.list(`runs/${execution.execution_id}/x-article/browser/observations`);
  const progress = (await store.readText(
    `runs/${execution.execution_id}/x-article/browser/materialization-progress.jsonl`
  )).trim().split('\n').map((line) => JSON.parse(line) as {
    readonly asset_id: string | null;
    readonly observed_effect: string;
  });
  const finalStatus = await adapter.status(execution.execution_id);
  return {
    state: finalStatus.state,
    body_import_count: host.bodyImportEffects,
    body_import_command_count: commands.filter((command) => command.kind === 'import_article_document').length,
    incremental_block_command_count: commands.filter((command) => command.kind === 'insert_article_block').length,
    cover_effect_count: host.coverEffects,
    cover_command_count: commands.filter((command) => command.kind === 'upload_article_cover').length,
    expected_asset_ids: plan.intent.visuals.map((binding) => binding.asset.asset_id),
    completed_asset_ids: progress
      .filter((entry) => entry.asset_id !== null && entry.observed_effect === 'complete')
      .map((entry) => entry.asset_id as string),
    publish_effect_count: host.publishEffects,
    publish_command_count: commands.filter((command) => command.kind === 'publish_article_once').length,
    command_count: commands.length,
    observation_count: observationEntries.filter((entry) => entry.kind === 'file').length,
    command_ceiling: materializationPlan.expected_command_ceiling,
    observation_ceiling: materializationPlan.expected_observation_ceiling,
    human_content_overwrite_count: host.bodyOverwriteAttempts,
    human_text_digest_before_recovery: humanTextDigestBeforeRecovery ?? host.humanTextDigest(),
    human_text_digest_after_recovery: host.humanTextDigest(),
    network: host.network,
    local_anchor_cleanup_recoveries: host.localAnchorCleanupRecoveries,
    metadata_state_before_recovery: metadataStateBeforeRecovery,
    metadata_state_after_recovery: host.metadataState(),
    metadata_write_count: host.metadataWriteEffects,
    metadata_overwrite_count: host.metadataOverwriteAttempts,
    boundary_checkpoint: boundaryCheckpoint,
    boundary_command_id: boundaryCommandId,
    boundary_claim_persisted: boundaryClaimPersisted,
    boundary_report_persisted: boundaryReportPersisted
  };
}

describe('bounded X Article Browser Host transactions', () => {
  it('imports 76 blocks once and replaces three anchors without paragraph typing', async () => {
    const result = await runXArticleHostAcceptance({ body_blocks: 76, inline_images: 3 });

    expect(result.host_transactions).toEqual([
      'import_article_document',
      'replace_article_visual_anchor',
      'replace_article_visual_anchor',
      'replace_article_visual_anchor'
    ]);
    expect(result.claim_count).toBe(4);
    expect(result.body_import_effects).toBe(1);
    expect(result.image_upload_effects).toHaveLength(3);
    expect(new Set(result.image_upload_effects).size).toBe(3);
    expect(result.paragraph_level_transactions).toBe(0);
    expect(result.observation_count).toBe(4);
    expect(result.network).toBe('unused');
    expect(result.normalized_post_state.blocks).toHaveLength(76);
    expect(result.normalized_post_state.visuals).toHaveLength(3);
    expect(result.normalized_post_state).toMatchObject({
      import_state: null,
      has_unknown_content: false,
      autosave_state: 'saved'
    });
  });

  it('models the exact bounded waits and emits truthful 20-second progress', async () => {
    const result = await runXArticleHostAcceptance({ body_blocks: 76, inline_images: 3 });

    expect(result.waits.map(({ waiting_for, timeout_ms, progress_every_ms }) => ({
      waiting_for, timeout_ms, progress_every_ms
    }))).toEqual([
      { waiting_for: 'editor_stability', timeout_ms: 45_000, progress_every_ms: 20_000 },
      { waiting_for: 'autosave', timeout_ms: 30_000, progress_every_ms: 20_000 },
      ...Array.from({ length: 3 }, () => [
        { waiting_for: 'media_readiness', timeout_ms: 60_000, progress_every_ms: 20_000 },
        { waiting_for: 'autosave', timeout_ms: 30_000, progress_every_ms: 20_000 }
      ]).flat()
    ]);
    expect(result.progress_events.length).toBeGreaterThan(0);
    expect(result.progress_events.every((event) =>
      event.elapsed_seconds % 20 === 0
      && event.waiting_for !== null
      && event.observed_effect !== 'complete'
    )).toBe(true);
    expect(result.progress_events.every((event) =>
      event.elapsed_seconds <= 20 || event.waiting_for !== null
    )).toBe(true);
    const expectedStages = new Set(result.command_timeline.map((entry) =>
      `${entry.purpose}#${entry.command_id}`
    ));
    expect(result.progress_events.every((event) => expectedStages.has(event.stage))).toBe(true);
    expect(result.command_timeline.every((entry) => {
      const progress = result.progress_events.filter((event) =>
        event.stage === `${entry.purpose}#${entry.command_id}`
      );
      return progress.length > 0
        && progress.every((event) => Date.parse(event.recorded_at) < Date.parse(entry.observation_at));
    })).toBe(true);
    const timeline = result.command_timeline.flatMap((entry) => [
      entry.issued_at,
      entry.claimed_at,
      ...result.progress_events
        .filter((event) => event.stage.endsWith(`#${entry.command_id}`))
        .map((event) => event.recorded_at),
      entry.observation_at
    ]).map(Date.parse);
    expect(timeline.every((at, index) => index === 0 || at >= timeline[index - 1]!)).toBe(true);
    expect(result.wall_clock_sleeps).toBe(0);
  });

  it('fails closed when progress is not bound to the issued purpose and command', async () => {
    await expect(runXArticleHostAcceptance({
      body_blocks: 76,
      inline_images: 3,
      fault: 'wrong_progress_stage'
    })).rejects.toThrow('progress stage does not match');
  });

  it('corrects X grouping each uploaded image at the opening before success', async () => {
    const result = await runXArticleHostAcceptance({ body_blocks: 76, inline_images: 3 });

    expect(result.grouped_image_corrections).toBe(3);
    expect(result.normalized_post_state.visuals.map((visual) => visual.block_ordinal))
      .toEqual(result.expected_image_ordinals);
    expect(result.normalized_post_state.visuals.map((visual) => visual.alt_text))
      .toEqual(result.expected_image_alts);
    expect(JSON.stringify(result.normalized_post_state)).not.toContain('RPH_VISUAL_ANCHOR:');
  });

  it.each([
    ['non_empty_body', 'empty body'],
    ['unknown_content', 'unknown content'],
    ['wrong_template_digest', 'template digest'],
    ['reordered_anchors', 'ordered anchors'],
    ['duplicate_anchor', 'ordered anchors'],
    ['missing_anchor', 'ordered anchors'],
    ['second_import', 'already imported']
  ] as const)('fails closed for %s', async (fault, message) => {
    await expect(runXArticleHostAcceptance({
      body_blocks: 76,
      inline_images: 3,
      fault
    })).rejects.toThrow(message);
  });

  it.each([
    ['wrong_asset', 'claimed asset'],
    ['wrong_ordinal', 'block ordinal'],
    ['wrong_alt', 'inline Alt'],
    ['ambiguous_grouping', 'ambiguous grouped media']
  ] as const)('fails closed for %s', async (fault, message) => {
    await expect(runXArticleHostAcceptance({
      body_blocks: 76,
      inline_images: 3,
      fault
    })).rejects.toThrow(message);
  });

  it.each(['import', 'first_image'] as const)(
    'restarts after a durable %s effect and reports without replaying the transaction',
    async (restartAfterEffect) => {
      const result = await runXArticleHostAcceptance({
        body_blocks: 76,
        inline_images: 3,
        restart_after_effect: restartAfterEffect
      });

      expect(result.restart_count).toBe(1);
      expect(result.recovered_command_ids).toHaveLength(1);
      expect(result.recovered_claim_created).toEqual([false]);
      expect(result.claim_identity_unchanged).toBe(true);
      expect(result.command_digest_unchanged).toBe(true);
      expect(result.body_import_effects).toBe(1);
      expect(result.host_transactions.filter((kind) =>
        kind === 'import_article_document'
      )).toHaveLength(1);
      expect(result.image_upload_effects).toHaveLength(3);
      expect(new Set(result.image_upload_effects).size).toBe(3);
      expect(result.normalized_post_state.visuals).toHaveLength(3);
      expect(result.host_transactions).toHaveLength(4);
      expect(result.observation_count).toBe(4);
      expect(result.report_count).toBe(4);
      expect(result.human_content_overwrite_count).toBe(0);
    }
  );

  it.each([
    ['snapshot_body_tamper', 'import'],
    ['snapshot_template_tamper', 'import'],
    ['snapshot_visual_tamper', 'first_image'],
    ['snapshot_counter_tamper', 'import'],
    ['snapshot_completed_command_tamper', 'import'],
    ['snapshot_schema_tamper', 'import'],
    ['snapshot_clock_tamper', 'import']
  ] as const)(
    'rejects durable %s before reconstructing or reporting the recovered effect',
    async (fault, restartAfterEffect) => {
      await expect(runXArticleHostAcceptance({
        body_blocks: 76,
        inline_images: 3,
        fault,
        restart_after_effect: restartAfterEffect
      })).rejects.toMatchObject({
        code: 'ARTICLE_MATERIALIZATION_DRIFT',
        message: 'X Article Host durable evidence changed',
        details: {
          new_host_transactions: 0,
          new_effects: 0,
          new_reports: 0
        }
      });
    }
  );

  it.each([
    'persisted_report_digest_tamper',
    'persisted_evidence_digest_tamper',
    'persisted_reported_at_tamper',
    'persisted_report_command_tamper',
    'persisted_observation_tamper',
    'persisted_command_tamper',
    'persisted_claim_tamper'
  ] as const)(
    'rereads durable files and rejects %s without a new report or Host effect',
    async (fault) => {
      await expect(runXArticleHostAcceptance({
        body_blocks: 76,
        inline_images: 3,
        fault
      })).rejects.toMatchObject({
        code: 'ARTICLE_MATERIALIZATION_DRIFT',
        message: 'X Article Host durable evidence changed',
        details: {
          new_host_transactions: 0,
          new_effects: 0,
          new_reports: 0
        }
      });
    }
  );
});

describe('X Article Browser workflow', () => {
  it.each(crashPoints)('recovers the %s crash boundary without replaying irreversible effects', async (point) => {
    const result = await runOfflineMaterialization(3, `crash_${point}`, point, true);
    const expectedState = point === 'after_confirmation_before_publish'
      ? 'publish_armed'
      : point === 'publish_effect_unknown'
        ? 'outcome_unknown'
        : 'confirmation_pending';

    expect(result.state).toBe(expectedState);
    expect(result.body_import_count).toBe(1);
    expect(result.body_import_command_count).toBe(1);
    expect(result.incremental_block_command_count).toBe(0);
    expect(result.completed_asset_ids).toEqual(result.expected_asset_ids);
    expect(new Set(result.completed_asset_ids).size).toBe(4);
    expect(result.cover_effect_count).toBe(1);
    expect(result.cover_command_count).toBe(1);
    expect(result.publish_command_count).toBe(point === 'publish_effect_unknown' ? 1 : 0);
    expect(result.publish_effect_count).toBe(point === 'publish_effect_unknown' ? 1 : 0);
    expect(result.human_content_overwrite_count).toBe(0);
    expect(result.metadata_overwrite_count).toBe(0);
    expect(result.human_text_digest_after_recovery).toBe(result.human_text_digest_before_recovery);
    expect(result.network).toBe('unused');
    expect(result.boundary_checkpoint).not.toBeNull();
    expect(result.local_anchor_cleanup_recoveries).toBe(
      point === 'media_effect_before_anchor_cleanup' ? 1 : 0
    );

    if (point === 'import_effect_before_checkpoint') {
      expect(result.boundary_checkpoint).toMatchObject({ body: { status: 'issued' } });
      expect(result.boundary_report_persisted).toBe(false);
    }
    if (
      point === 'before_media_1'
      || point === 'media_effect_before_anchor_cleanup'
      || point === 'media_complete_before_checkpoint'
    ) {
      expect(result.boundary_checkpoint).toMatchObject({ body: { status: 'verified' } });
      const boundaryMedia = result.boundary_checkpoint?.media as readonly { readonly status: string }[];
      expect(boundaryMedia[0]).toMatchObject({ status: 'upload_started' });
      expect(boundaryMedia.slice(1).every((entry) => entry.status === 'pending')).toBe(true);
      expect(result.boundary_report_persisted).toBe(false);
    }
    if (point === 'after_draft_create') {
      expect(result.boundary_report_persisted).toBe(false);
    }
    if (point === 'after_metadata') {
      expect(result.boundary_report_persisted).toBe(true);
      expect(result).toMatchObject({
        metadata_state_before_recovery: {
          draft_id: '2092246293603373056',
          title: `Control plane crash_${point}`,
          persisted: true
        },
        metadata_state_after_recovery: {
          draft_id: '2092246293603373056',
          title: `Control plane crash_${point}`,
          persisted: true
        },
        metadata_write_count: 1,
        metadata_overwrite_count: 0
      });
      expect(result.metadata_state_after_recovery).toEqual(result.metadata_state_before_recovery);
    }
    if (point === 'before_media_1') {
      expect(result).toMatchObject({ boundary_claim_persisted: false });
    }
    if (point === 'after_preview') {
      expect(result.boundary_checkpoint).toMatchObject({ phase: 'preview_verified' });
      expect(result.boundary_command_id).toBeNull();
    }
    if (point === 'after_confirmation_before_publish') {
      expect(result.boundary_checkpoint).toMatchObject({
        phase: 'human_confirmed',
        publish_confirmation: 'armed'
      });
      expect(result.publish_command_count).toBe(0);
    }
    if (point === 'publish_effect_unknown') {
      expect(result.boundary_checkpoint).toMatchObject({
        phase: 'publish_submitted',
        publish_confirmation: 'consumed'
      });
      expect(result.publish_command_count).toBe(1);
      expect(result.publish_effect_count).toBe(1);
    }
  });

  it.each([
    [0, 12, 9, 6, 6],
    [3, 15, 12, 8, 8],
    [10, 22, 19, 15, 15]
  ])(
    'keeps %i images within the measured command and Observation budgets',
    async (images, commandCeiling, observationCeiling, measuredCommands, measuredObservations) => {
      const result = await runOfflineMaterialization(images, `budget_${images}`);

      expect(result.state).toBe('confirmation_pending');
      expect(result.body_import_count).toBe(1);
      expect(result.body_import_command_count).toBe(1);
      expect(result.incremental_block_command_count).toBe(0);
      expect(result.command_count).toBe(measuredCommands);
      expect(result.observation_count).toBe(measuredObservations);
      expect(result.command_ceiling).toBe(commandCeiling);
      expect(result.observation_ceiling).toBe(observationCeiling);
      expect(result.command_count).toBeLessThanOrEqual(commandCeiling);
      expect(result.observation_count).toBeLessThanOrEqual(observationCeiling);
      expect(result.completed_asset_ids).toEqual(result.expected_asset_ids);
      expect(new Set(result.completed_asset_ids).size).toBe(images);
      expect(result.publish_command_count).toBe(0);
      expect(result.human_content_overwrite_count).toBe(0);
      expect(result.network).toBe('unused');
    }
  );

  it('includes one planned cover progress event in the immutable Preview receipt', async () => {
    const result = await runOfflineMaterialization(3, 'cover_receipt', null, true);

    expect(result.state).toBe('confirmation_pending');
    expect(result.body_import_count).toBe(1);
    expect(result.body_import_command_count).toBe(1);
    expect(result.incremental_block_command_count).toBe(0);
    expect(result.cover_effect_count).toBe(1);
    expect(result.completed_asset_ids).toEqual(result.expected_asset_ids);
    expect(new Set(result.completed_asset_ids).size).toBe(4);
    expect(result.command_count).toBe(9);
    expect(result.observation_count).toBe(9);
    expect(result.command_count).toBeLessThanOrEqual(result.command_ceiling);
    expect(result.observation_count).toBeLessThanOrEqual(result.observation_ceiling);
    expect(result.publish_command_count).toBe(0);
    expect(result.human_content_overwrite_count).toBe(0);
    expect(result.network).toBe('unused');
  });

  it('recovers an uncertain Publish read-only and finalizes one immutable Receipt', async () => {
    const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-x-article-e2e-')));
    const root = 'articles/runtime-boundary/article_e2e';
    const manifestBase = {
      schema_version: '1.0', article_run_id: 'article_e2e',
      bindings: bulkArticleVisualFixtures.map((fixture, index) => ({
        slot_id: fixture.slot_id, asset: fixture.asset, placement_ordinal: index + 1,
        width: 1, height: 1, byte_size: fixture.bytes.byteLength,
        normalization_version: 'acceptance-v1',
        provenance: { method: 'deterministic', tool: 'integration-fixture', source_digest: null },
        editable_source: null
      }))
    };
    const files = {
      'article.md': bulkArticleMarkdown,
      'visual-manifest.json': { ...manifestBase, manifest_digest: sha256(manifestBase) },
      'draft-candidate.json': {
        schema_version: '1.0', run_id: 'article_e2e', title: 'Runtime boundary',
        summary: 'Skills own semantics.', language: 'en', sections: [{
          section_id: 'boundary', heading: 'Boundary', markdown: 'Skills own semantics.',
          claim_refs: [], source_refs: []
        }],
        visual_slots: bulkArticleVisualFixtures.map((fixture) => ({
          slot_id: fixture.slot_id, placement: { kind: 'after_section', section_id: 'boundary' },
          purpose: 'explanation', required: true, brief: fixture.asset.alt_text,
          claim_refs: fixture.asset.claim_refs
        })),
        open_questions: []
      },
      ...Object.fromEntries(bulkArticleVisualFixtures.map((fixture) => [
        fixture.asset.relative_path, fixture.bytes
      ]))
    };
    const packageRef = {
      root,
      digest: sha256(Object.entries(files)
        .map(([path, value]) => ({
          path, digest: value instanceof Uint8Array ? sha256Bytes(value) : sha256(value)
        }))
        .sort((left, right) => left.path.localeCompare(right.path))),
      artifacts: Object.keys(files).map((path) => `${root}/${path}`), warnings: []
    };
    await store.writeNewDirectory(root, { ...files, 'package-ref.json': packageRef });
    const service = new XArticleService(store, {
      runId: () => 'run_x_article_e2e', planId: () => 'plan_x_article_e2e',
      now: () => new Date('2026-08-21T09:00:00.000Z')
    });
    const plan = await service.plan(packageRef, '@Glen56121');
    const approval = approveXArticlePublication(
      plan, 'human:Glen56121', 3_600_000, new Date('2026-08-21T09:00:00.000Z'),
      () => 'approval_x_article_e2e'
    );
    let commandNumber = 0;
    let eventNumber = 0;
    const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'execution_x_article_e2e',
      commandId: () => `command_e2e_${++commandNumber}`,
      eventId: () => `event_e2e_${++eventNumber}`,
      attemptId: () => 'attempt_x_article_e2e',
      receiptId: () => 'receipt_x_article_e2e',
      now: () => new Date('2026-08-21T09:02:00.000Z')
    });
    const execution = await adapter.start(plan, approval, {
      executor: 'codex-chrome', executor_version: 'fake-host', browser_family: 'chrome',
      capabilities: [
        'observe_article_page', 'create_article_draft', 'set_article_title',
        'import_article_document', 'replace_article_visual_anchor',
        'insert_article_block', 'open_article_preview', 'open_publish_review',
        'insert_article_image', 'set_article_image_alt', 'publish_article_once'
      ], observed_at: '2026-08-21T09:00:00.000Z'
    });
    const draftId = '2090731994279755776';
    const articleId = '2091000000000000000';
    const editorControls = [
      { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
      { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
      { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
      { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
    ];
    let title = '';
    let projectedBlocks: typeof plan.intent.document.blocks = [];
    let visuals: NonNullable<XArticleBrowserObservation['editor']>['visuals'] = [];
    let importState: NonNullable<XArticleBrowserObservation['editor']>['import_state'] = null;
    let finalized: Awaited<ReturnType<typeof adapter.next>> | null = null;

    const editorValue = () => ({
      canonical_url: `https://x.com/compose/articles/edit/${draftId}`, page_kind: 'article_editor',
      controls: editorControls,
      editor: {
        draft_id: draftId, title, blocks: projectedBlocks, visuals, import_state: importState,
        has_unknown_content: false, autosave_state: 'saved'
      }
    });

    while (finalized === null) {
      const step = await adapter.next(execution.execution_id);
      if (step.command === null) {
        finalized = step;
        break;
      }
      const command = step.command;
      if (command.kind === 'observe_article_page' && command.payload.kind === 'observe_article_page') {
        if (command.payload.scope === 'index') {
          await succeed(adapter, command, {
            canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
            controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
          });
          continue;
        }
        expect(command).toMatchObject({
          side_effect: 'read', payload: { scope: 'public_article' }
        });
        await succeed(adapter, command, {
          canonical_url: `https://x.com/Glen56121/article/${articleId}`, page_kind: 'public_article',
          public_article: {
            article_id: articleId, canonical_url: `https://x.com/Glen56121/article/${articleId}`,
            author_handle: '@Glen56121', title, blocks: projectedBlocks,
            visuals: visuals.map((visual) => ({ ...visual, owned_by_execution: false })),
            published_at: '2026-08-21T09:02:00.000Z'
          }
        });
        continue;
      }
      if (command.kind === 'create_article_draft') {
        await succeed(adapter, command, editorValue());
        continue;
      }
      if (command.kind === 'set_article_title' && command.payload.kind === 'set_article_title') {
        title = command.payload.title;
        await succeed(adapter, command, editorValue());
        continue;
      }
      if (command.kind === 'import_article_document' && command.payload.kind === 'import_article_document') {
        importState = {
          template_digest: command.payload.template.template_digest,
          source_document_digest: command.payload.template.source_document_digest,
          unresolved_anchors: command.payload.template.anchors
        };
        projectedBlocks = plan.intent.document.blocks.filter((block) => block.kind !== 'image');
        await succeed(adapter, command, editorValue());
        continue;
      }
      if (
        command.kind === 'replace_article_visual_anchor' &&
        command.payload.kind === 'replace_article_visual_anchor'
      ) {
        expect(importState?.unresolved_anchors[0]).toEqual(command.payload.anchor);
        const unresolvedAnchors = importState!.unresolved_anchors.slice(1);
        visuals = [...visuals, {
          ref: `visual_${command.payload.anchor.block_ordinal}`,
          asset_id: command.payload.asset.asset_id, kind: 'inline',
          block_ordinal: command.payload.anchor.block_ordinal,
          alt_text: command.payload.asset.alt_text, status: 'uploaded', owned_by_execution: true
        }];
        if (unresolvedAnchors.length === 0) {
          importState = null;
          projectedBlocks = plan.intent.document.blocks;
        } else {
          importState = { ...importState!, unresolved_anchors: unresolvedAnchors };
          const unresolvedOrdinals = new Set(unresolvedAnchors.map((anchor) => anchor.block_ordinal));
          projectedBlocks = plan.intent.document.blocks.filter((block, index) =>
            block.kind !== 'image' || !unresolvedOrdinals.has(index + 1)
          );
        }
        await succeed(adapter, command, editorValue());
        continue;
      }
      if (command.kind === 'open_article_preview') {
        expect(importState).toBeNull();
        await succeed(adapter, command, {
          canonical_url: `https://x.com/compose/articles/edit/${draftId}/preview`, page_kind: 'article_preview',
          controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
          preview: { draft_id: draftId, title, blocks: projectedBlocks, visuals }
        });
        continue;
      }
      if (command.kind === 'open_publish_review') {
        await succeed(adapter, command, {
          canonical_url: `https://x.com/compose/articles/edit/${draftId}/preview`, page_kind: 'publish_review',
          controls: [{ ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }],
          publish_review: { draft_id: draftId, audience: 'everyone', final_publish_ref: 'publish_final' }
        });
        continue;
      }
      if (command.kind === 'publish_article_once') {
        await adapter.claim(command);
        await adapter.report({ command, status: 'uncertain', observation: null });
        expect(await adapter.status(execution.execution_id)).toMatchObject({
          state: 'outcome_unknown', publish_command_count: 1
        });
        await adapter.resumeVerification(execution.execution_id);
        continue;
      }
      throw new Error(`unexpected X Article command ${command.kind}`);
    }

    expect(finalized).toMatchObject({
      snapshot: {
        state: 'finalized', publish_command_count: 1,
        latest_receipt_path: 'receipts/receipt_x_article_e2e.json'
      }, command: null
    });
    const receipt = await store.readJson<{ status: string }>('receipts/receipt_x_article_e2e.json');
    expect(receipt).toMatchObject({
      schema_version: '1.0', execution_id: execution.execution_id,
      plan_digest: plan.plan_digest, status: 'published',
      public_evidence: { article_id: articleId, kind: 'full_match' }
    });
    const commands = await store.list(`runs/${execution.execution_id}/x-article/browser/commands`);
    const persisted = await Promise.all(commands
      .filter((entry) => entry.kind === 'directory')
      .map((entry) => store.readJson<XArticleBrowserCommandV1>(`${entry.relative_path}/command.json`)));
    const commandKinds = persisted.map((command) => command.kind);
    const replacementOrdinals = persisted.flatMap((command) =>
      command.payload.kind === 'replace_article_visual_anchor'
        ? [command.payload.anchor.block_ordinal]
        : []
    );
    expect(commandKinds.filter((kind) => kind === 'import_article_document')).toHaveLength(1);
    expect(commandKinds.filter((kind) => kind === 'replace_article_visual_anchor')).toHaveLength(3);
    expect(replacementOrdinals).toEqual(plan.intent.visuals.flatMap((visual) =>
      visual.placement.kind === 'block' ? [visual.placement.block_ordinal] : []
    ));
    expect(commandKinds.filter((kind) => kind === 'insert_article_block')).toHaveLength(0);
    expect(commandKinds.filter((kind) => kind === 'open_article_preview')).toHaveLength(1);
    expect(commandKinds.filter((kind) => kind === 'publish_article_once')).toHaveLength(1);
    expect(finalized.snapshot.publish_command_count).toBe(1);
    expect(receipt.status).toBe('published');
    expect(projectedBlocks).toEqual(plan.intent.document.blocks);
    expect(importState).toBeNull();
    expect(JSON.stringify({ blocks: projectedBlocks, visuals })).not.toContain('RPH_VISUAL_ANCHOR:');
    await expect(store.writeNew('receipts/receipt_x_article_e2e.json', { status: 'changed' }))
      .rejects.toMatchObject({ code: 'ARTIFACT_EXISTS' });
  });
});
