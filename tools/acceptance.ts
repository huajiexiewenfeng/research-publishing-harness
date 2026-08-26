import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ManualAdapter } from '../harnesses/research-publishing/adapters/x/manual/manual-adapter.js';
import { BrowserAdapter } from '../harnesses/research-publishing/adapters/x/browser/browser-adapter.js';
import type {
  BrowserCapabilityManifest,
  BrowserCommand,
  BrowserNodeObservation,
  BrowserObservationInput,
  BrowserPublicPostObservation
} from '../harnesses/research-publishing/adapters/x/browser/browser-protocol.js';
import { CommandBroker } from '../harnesses/research-publishing/adapters/x/browser/command-broker.js';
import { XWeb202608Contract } from '../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import {
  XArticleBrowserAdapter
} from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation,
  type XArticleEditorImportStateV1,
  type XArticleEditorObservation
} from '../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import {
  XArticleCommandBroker,
  type XArticleBrowserCommandV1,
  type XArticleCommandClaimV1
} from '../harnesses/research-publishing/adapters/x/article-browser/article-command-broker.js';
import {
  createXArticleImportTemplate,
  type XArticleImportTemplateV1,
  type XArticleVisualAnchorV1
} from '../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { XArticleWeb2026_08Contract } from '../harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.js';
import { ArticleService, type ArticleDraft } from '../harnesses/research-publishing/branches/article-harness/article-service.js';
import { XArticleService } from '../harnesses/research-publishing/branches/x-article-harness/x-article-service.js';
import type { XArticleBlockV1 } from '../harnesses/research-publishing/branches/x-article-harness/article-document.js';
import { XService, type XDraft } from '../harnesses/research-publishing/branches/x-harness/x-service.js';
import { approvePublication } from '../harnesses/research-publishing/core/approval.js';
import { approvePublicationV2_1 } from '../harnesses/research-publishing/core/approval-v2-1.js';
import { approveXArticlePublication } from '../harnesses/research-publishing/core/x-article-approval.js';
import { CanonicalDocumentService } from '../harnesses/research-publishing/core/canonical-document-service.js';
import { sha256, sha256Bytes } from '../harnesses/research-publishing/core/digest.js';
import { ExecutionStore } from '../harnesses/research-publishing/core/execution-store.js';
import { HarnessError } from '../harnesses/research-publishing/core/errors.js';
import { MemoryFeedbackService } from '../harnesses/research-publishing/core/memory-feedback-service.js';
import { MemoryIngestService } from '../harnesses/research-publishing/core/memory-ingest-service.js';
import { MemoryInsightService } from '../harnesses/research-publishing/core/memory-insight-service.js';
import { MemoryQueryService } from '../harnesses/research-publishing/core/memory-query-service.js';
import { MemoryPromotionService } from '../harnesses/research-publishing/core/memory-promotion-service.js';
import { ProgressiveResearchQueryService } from '../harnesses/research-publishing/core/progressive-research-query-service.js';
import { PackageService } from '../harnesses/research-publishing/core/package-service.js';
import { ResearchEvidenceService } from '../harnesses/research-publishing/core/research-evidence-service.js';
import { ResearchFlywheelService } from '../harnesses/research-publishing/core/research-flywheel-service.js';
import { ResearchIncrementService } from '../harnesses/research-publishing/core/research-increment-service.js';
import { ResearchIndexProjector } from '../harnesses/research-publishing/core/research-index-projector.js';
import { createPublicationExpression } from '../harnesses/research-publishing/core/research-memory-contracts.js';
import { renderResearchRecord } from '../harnesses/research-publishing/core/research-record-renderer.js';
import { ResearchTerminalHooks } from '../harnesses/research-publishing/core/research-terminal-hooks.js';
import { SemanticDeltaService } from '../harnesses/research-publishing/core/semantic-delta-service.js';
import type {
  Candidate,
  ResearchContentPackage,
  ResearchContentPackageV1_1,
  VisualAssetRef
} from '../harnesses/research-publishing/core/types.js';
import { WorkspaceStore } from '../harnesses/research-publishing/core/workspace-store.js';
import {
  createXArticleStageProgress,
  type XArticleStageProgressV1
} from '../harnesses/research-publishing/core/x-article-materialization.js';

const examples = resolve(import.meta.dirname, '../harnesses/research-publishing/examples/synthetic');
async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(examples, name), 'utf8')) as T;
}

export interface HostWaitInput {
  readonly timeout_ms: number;
  readonly progress_every_ms: 20_000;
}

export interface FakeXArticleHost {
  focusBody(targetRef: string): Promise<void>;
  pasteStructuredTemplate(template: XArticleImportTemplateV1): Promise<void>;
  locateUniqueAnchor(anchorId: string): Promise<void>;
  uploadVerifiedAsset(asset: VisualAssetRef): Promise<void>;
  moveMediaToAnchorOrdinal(blockOrdinal: number): Promise<void>;
  setAndVerifyInlineAlt(altText: string): Promise<void>;
  removeAnchor(anchorId: string): Promise<void>;
  waitForEditorStable(input: HostWaitInput): Promise<void>;
  waitForMediaReady(input: HostWaitInput): Promise<void>;
  waitForAutosave(input: HostWaitInput): Promise<void>;
  readImportProjection(): Promise<XArticleEditorImportStateV1>;
  readEditorProjection(): Promise<XArticleEditorObservation>;
}

export type XArticleHostAcceptanceFault =
  | 'non_empty_body'
  | 'unknown_content'
  | 'wrong_template_digest'
  | 'reordered_anchors'
  | 'duplicate_anchor'
  | 'missing_anchor'
  | 'second_import'
  | 'wrong_asset'
  | 'wrong_ordinal'
  | 'wrong_alt'
  | 'ambiguous_grouping';

export interface XArticleHostAcceptanceInput {
  readonly body_blocks: number;
  readonly inline_images: number;
  readonly fault?: XArticleHostAcceptanceFault;
  readonly interrupt_after_transaction?: number;
}

interface HostWaitRecord extends HostWaitInput {
  readonly waiting_for: 'editor_stability' | 'media_readiness' | 'autosave';
}

export interface XArticleHostAcceptanceResult {
  readonly host_transactions: readonly string[];
  readonly paragraph_level_transactions: number;
  readonly progress_events: readonly XArticleStageProgressV1[];
  readonly waits: readonly HostWaitRecord[];
  readonly grouped_image_corrections: number;
  readonly observation_count: number;
  readonly claim_count: number;
  readonly body_import_effects: number;
  readonly image_upload_effects: readonly string[];
  readonly expected_image_ordinals: readonly number[];
  readonly expected_image_alts: readonly string[];
  readonly normalized_post_state: XArticleEditorObservation;
  readonly interruption_count: number;
  readonly wall_clock_sleeps: 0;
  readonly network: 'unused';
}

interface MutableVisualObservation {
  ref: string;
  asset_id: string | null;
  kind: 'cover' | 'inline';
  block_ordinal: number | null;
  alt_text: string | null;
  status: 'processing' | 'uploaded' | 'failed';
  owned_by_execution: boolean;
}

const hostAcceptanceAt = '2026-08-26T00:00:00.000Z';

function rejectHost(message: string): never {
  throw new HarnessError('ARTICLE_MATERIALIZATION_DRIFT', message);
}

function assertTemplateStructure(template: XArticleImportTemplateV1): void {
  const { template_digest: templateDigest, ...templateBody } = template;
  if (sha256(templateBody) !== templateDigest) {
    rejectHost('X Article Host rejected the template digest');
  }
  const anchorsFromBlocks = template.blocks.flatMap((block, index) => {
    if (block.kind !== 'visual_anchor') return [];
    const declared = template.anchors.filter((anchor) => anchor.anchor_id === block.anchor_id);
    if (
      declared.length !== 1
      || declared[0]!.marker !== block.marker
      || declared[0]!.block_ordinal !== index + 1
    ) {
      rejectHost('X Article Host rejected missing, duplicate, or reordered ordered anchors');
    }
    return declared;
  });
  if (sha256(anchorsFromBlocks) !== sha256(template.anchors)) {
    rejectHost('X Article Host rejected missing, duplicate, or reordered ordered anchors');
  }
}

function assertImportProjection(
  template: XArticleImportTemplateV1,
  projection: XArticleEditorImportStateV1
): void {
  if (projection.template_digest !== template.template_digest) {
    rejectHost('X Article Host observed the wrong template digest');
  }
  if (projection.source_document_digest !== template.source_document_digest) {
    rejectHost('X Article Host observed the wrong source document digest');
  }
  if (sha256(projection.unresolved_anchors) !== sha256(template.anchors)) {
    rejectHost('X Article Host observed missing, duplicate, or reordered ordered anchors');
  }
}

class OfflineFakeXArticleHost implements FakeXArticleHost {
  readonly network = 'unused' as const;
  readonly transactions: string[] = [];
  readonly progressEvents: XArticleStageProgressV1[] = [];
  readonly waits: HostWaitRecord[] = [];
  readonly imageUploadEffects: string[] = [];
  bodyImportEffects = 0;
  groupedImageCorrections = 0;
  private template: XArticleImportTemplateV1 | null = null;
  private unresolvedAnchors: XArticleVisualAnchorV1[] = [];
  private readonly resolvedAssets = new Map<string, VisualAssetRef>();
  private readonly visuals: MutableVisualObservation[] = [];
  private initialBlocks: XArticleBlockV1[] = [];
  private hasUnknownContent = false;
  private autosaveState: XArticleEditorObservation['autosave_state'] = 'saved';
  private focused = false;
  private activeCommand: XArticleBrowserCommandV1 | null = null;
  private activeAnchor: XArticleVisualAnchorV1 | null = null;
  private faultConsumed = false;

  constructor(
    private readonly executionId: string,
    private readonly draftId: string,
    private readonly expectedAssets: ReadonlyMap<string, VisualAssetRef>,
    private readonly fault?: XArticleHostAcceptanceFault
  ) {
    if (fault === 'non_empty_body') {
      this.initialBlocks = [{
        kind: 'paragraph',
        runs: [{ text: 'Unknown existing body.', marks: [], link: null }]
      }];
    }
    if (fault === 'unknown_content') this.hasUnknownContent = true;
  }

  beginTransaction(command: XArticleBrowserCommandV1): void {
    if (
      command.allowed_origin !== 'https://x.com'
      || command.payload_digest !== sha256(command.payload)
      || command.kind !== command.payload.kind
      || command.side_effect !== 'write'
    ) rejectHost('X Article Host rejected an invalid claimed command envelope');
    this.activeCommand = command;
    this.transactions.push(command.kind);
  }

  async focusBody(targetRef: string): Promise<void> {
    if (targetRef.trim() === '') rejectHost('X Article Host rejected an empty body target');
    if (this.bodyImportEffects > 0 || this.template !== null) {
      rejectHost('X Article body was already imported');
    }
    if (this.hasUnknownContent) rejectHost('X Article Host rejected unknown content');
    if (this.initialBlocks.length > 0 || this.visuals.length > 0) {
      rejectHost('X Article Host requires an empty body');
    }
    this.focused = true;
  }

  async pasteStructuredTemplate(template: XArticleImportTemplateV1): Promise<void> {
    if (!this.focused) rejectHost('X Article body was not focused');
    if (this.bodyImportEffects > 0 || this.template !== null) {
      rejectHost('X Article body was already imported');
    }
    assertTemplateStructure(template);
    this.template = structuredClone(template);
    this.unresolvedAnchors = [...structuredClone(template.anchors)];
    if (this.fault === 'reordered_anchors' && this.unresolvedAnchors.length > 1) {
      [this.unresolvedAnchors[0], this.unresolvedAnchors[1]] = [
        this.unresolvedAnchors[1]!, this.unresolvedAnchors[0]!
      ];
    }
    if (this.fault === 'duplicate_anchor' && this.unresolvedAnchors.length > 1) {
      this.unresolvedAnchors[1] = this.unresolvedAnchors[0]!;
    }
    if (this.fault === 'missing_anchor') this.unresolvedAnchors.pop();
    this.bodyImportEffects += 1;
    this.autosaveState = 'saving';
  }

  async locateUniqueAnchor(anchorId: string): Promise<void> {
    const matches = this.unresolvedAnchors.filter((anchor) => anchor.anchor_id === anchorId);
    if (matches.length !== 1 || this.resolvedAssets.has(anchorId)) {
      rejectHost('X Article Host requires one unique unresolved anchor');
    }
    this.activeAnchor = matches[0]!;
  }

  async uploadVerifiedAsset(asset: VisualAssetRef): Promise<void> {
    const anchor = this.activeAnchor;
    if (anchor === null) rejectHost('X Article Host has no active anchor');
    const expected = this.expectedAssets.get(anchor.asset_id);
    if (expected === undefined || sha256(expected) !== sha256(asset)) {
      rejectHost('X Article Host rejected the claimed asset');
    }
    if (this.consumeFault('wrong_asset')) rejectHost('X Article Host rejected the claimed asset');
    this.imageUploadEffects.push(asset.asset_id);
    this.visuals.push({
      ref: `grouped_${anchor.anchor_id}`,
      asset_id: asset.asset_id,
      kind: 'inline',
      block_ordinal: 1,
      alt_text: null,
      status: 'processing',
      owned_by_execution: true
    });
    if (this.consumeFault('ambiguous_grouping')) {
      this.visuals.push({
        ...this.visuals[this.visuals.length - 1]!,
        ref: `grouped_duplicate_${anchor.anchor_id}`
      });
    }
  }

  async moveMediaToAnchorOrdinal(blockOrdinal: number): Promise<void> {
    const anchor = this.activeAnchor;
    if (anchor === null) rejectHost('X Article Host has no active anchor');
    const candidates = this.visuals.filter((visual) =>
      visual.asset_id === anchor.asset_id && !this.resolvedAssets.has(anchor.anchor_id)
    );
    if (candidates.length !== 1) rejectHost('X Article Host observed ambiguous grouped media');
    if (blockOrdinal !== anchor.block_ordinal) {
      rejectHost('X Article Host rejected the claimed block ordinal');
    }
    const visual = candidates[0]!;
    const actualOrdinal = this.consumeFault('wrong_ordinal') ? blockOrdinal + 1 : blockOrdinal;
    if (visual.block_ordinal !== actualOrdinal) this.groupedImageCorrections += 1;
    visual.block_ordinal = actualOrdinal;
    if (visual.block_ordinal !== blockOrdinal) {
      rejectHost('X Article Host failed to verify the block ordinal');
    }
  }

  async setAndVerifyInlineAlt(altText: string): Promise<void> {
    const anchor = this.activeAnchor;
    if (anchor === null) rejectHost('X Article Host has no active anchor');
    const candidates = this.visuals.filter((visual) => visual.asset_id === anchor.asset_id);
    if (candidates.length !== 1) rejectHost('X Article Host observed ambiguous grouped media');
    candidates[0]!.alt_text = this.consumeFault('wrong_alt') ? `${altText} changed` : altText;
    if (candidates[0]!.alt_text !== altText) {
      rejectHost('X Article Host failed to verify inline Alt');
    }
  }

  async removeAnchor(anchorId: string): Promise<void> {
    const anchor = this.activeAnchor;
    if (anchor === null || anchor.anchor_id !== anchorId) {
      rejectHost('X Article Host rejected anchor cleanup');
    }
    const expected = this.expectedAssets.get(anchor.asset_id);
    const visual = this.visuals.find((candidate) => candidate.asset_id === anchor.asset_id);
    if (
      expected === undefined || visual === undefined
      || visual.block_ordinal !== anchor.block_ordinal
      || visual.alt_text !== expected.alt_text || visual.status !== 'uploaded'
    ) rejectHost('X Article Host refused to remove an unverified anchor');
    this.unresolvedAnchors = this.unresolvedAnchors.filter((candidate) =>
      candidate.anchor_id !== anchorId
    );
    this.resolvedAssets.set(anchorId, expected);
    this.activeAnchor = null;
    this.autosaveState = 'saving';
  }

  async waitForEditorStable(input: HostWaitInput): Promise<void> {
    this.recordWait('editor_stability', input);
  }

  async waitForMediaReady(input: HostWaitInput): Promise<void> {
    this.recordWait('media_readiness', input);
    const anchor = this.activeAnchor;
    if (anchor === null) rejectHost('X Article Host has no active anchor');
    for (const visual of this.visuals.filter((candidate) => candidate.asset_id === anchor.asset_id)) {
      visual.status = 'uploaded';
    }
  }

  async waitForAutosave(input: HostWaitInput): Promise<void> {
    this.recordWait('autosave', input);
    this.autosaveState = 'saved';
  }

  async readImportProjection(): Promise<XArticleEditorImportStateV1> {
    if (this.template === null) rejectHost('X Article import projection is absent');
    return {
      template_digest: this.fault === 'wrong_template_digest'
        ? sha256('wrong-template') : this.template.template_digest,
      source_document_digest: this.template.source_document_digest,
      unresolved_anchors: structuredClone(this.unresolvedAnchors)
    };
  }

  async readEditorProjection(): Promise<XArticleEditorObservation> {
    const blocks: XArticleBlockV1[] = [];
    if (this.template === null) {
      blocks.push(...structuredClone(this.initialBlocks));
    } else {
      for (const block of this.template.blocks) {
        if (block.kind !== 'visual_anchor') {
          blocks.push(structuredClone(block));
          continue;
        }
        const asset = this.resolvedAssets.get(block.anchor_id);
        if (asset !== undefined) {
          blocks.push({ kind: 'image', asset_id: asset.asset_id, alt_text: asset.alt_text });
        }
      }
    }
    const importState = this.template !== null && this.unresolvedAnchors.length > 0
      ? await this.readImportProjection() : null;
    return {
      draft_id: this.draftId,
      title: 'Bounded X Article Host acceptance',
      blocks,
      visuals: structuredClone(this.visuals)
        .sort((left, right) => (left.block_ordinal ?? 0) - (right.block_ordinal ?? 0)),
      import_state: importState,
      has_unknown_content: this.hasUnknownContent,
      autosave_state: this.autosaveState
    };
  }

  private consumeFault(fault: XArticleHostAcceptanceFault): boolean {
    if (!this.faultConsumed && this.fault === fault) {
      this.faultConsumed = true;
      return true;
    }
    return false;
  }

  private recordWait(waitingFor: HostWaitRecord['waiting_for'], input: HostWaitInput): void {
    if (
      input.progress_every_ms !== 20_000
      || !Number.isInteger(input.timeout_ms) || input.timeout_ms <= 0
    ) rejectHost('X Article Host received an invalid bounded wait');
    this.waits.push({ waiting_for: waitingFor, ...input });
    for (
      let elapsedMs = input.progress_every_ms;
      elapsedMs < input.timeout_ms;
      elapsedMs += input.progress_every_ms
    ) {
      const eventNumber = this.progressEvents.length + 1;
      this.progressEvents.push(createXArticleStageProgress({
        execution_id: this.executionId,
        stage: this.activeCommand?.kind ?? 'unknown_transaction',
        asset_id: this.activeAnchor?.asset_id ?? null,
        elapsed_seconds: elapsedMs / 1_000,
        waiting_for: waitingFor,
        retry_count: 0,
        observed_effect: eventNumber % 2 === 0 ? 'partial' : 'none',
        recorded_at: new Date(Date.parse(hostAcceptanceAt) + eventNumber * 20_000).toISOString()
      }));
    }
  }
}

function createHostObservation(
  command: XArticleBrowserCommandV1,
  editor: XArticleEditorObservation,
  observationNumber: number
): XArticleBrowserObservation {
  const input = {
    schema_version: '1.0' as const,
    observation_id: `host_observation_${observationNumber}`,
    execution_id: command.execution_id,
    command_id: command.command_id,
    origin: 'https://x.com' as const,
    canonical_url: `https://x.com/compose/articles/edit/${editor.draft_id}`,
    observed_at: new Date(Date.parse(hostAcceptanceAt) + observationNumber * 1_000).toISOString(),
    account_handle: '@runtime_ai',
    page_kind: 'article_editor' as const,
    controls: [],
    editor,
    preview: null,
    publish_review: null,
    public_article: null
  };
  return { ...input, page_revision: computeXArticlePageRevision(input) };
}

async function executeClaimedHostTransaction(
  host: OfflineFakeXArticleHost,
  command: XArticleBrowserCommandV1,
  claim: XArticleCommandClaimV1,
  observationNumber: number
): Promise<XArticleBrowserObservation> {
  if (
    claim.claimed !== true
    || claim.execution_id !== command.execution_id
    || claim.command_id !== command.command_id
  ) rejectHost('X Article Host rejected an invalid command claim');
  host.beginTransaction(command);
  if (command.payload.kind === 'import_article_document') {
    await host.focusBody(command.payload.target_ref);
    await host.pasteStructuredTemplate(command.payload.template);
    await host.waitForEditorStable({ timeout_ms: 45_000, progress_every_ms: 20_000 });
    assertImportProjection(command.payload.template, await host.readImportProjection());
    await host.waitForAutosave({ timeout_ms: 30_000, progress_every_ms: 20_000 });
  } else if (command.payload.kind === 'replace_article_visual_anchor') {
    await host.locateUniqueAnchor(command.payload.anchor.anchor_id);
    await host.uploadVerifiedAsset(command.payload.asset);
    await host.waitForMediaReady({ timeout_ms: 60_000, progress_every_ms: 20_000 });
    await host.moveMediaToAnchorOrdinal(command.payload.anchor.block_ordinal);
    await host.setAndVerifyInlineAlt(command.payload.asset.alt_text);
    await host.removeAnchor(command.payload.anchor.anchor_id);
    await host.waitForAutosave({ timeout_ms: 30_000, progress_every_ms: 20_000 });
  } else {
    rejectHost('X Article Host rejected a non-materialization command');
  }
  const editor = await host.readEditorProjection();
  if (editor.has_unknown_content || editor.autosave_state !== 'saved') {
    rejectHost('X Article Host post-state is unknown or unsaved');
  }
  return createHostObservation(command, editor, observationNumber);
}

function hostImageOrdinals(bodyBlocks: number, inlineImages: number): number[] {
  return Array.from({ length: inlineImages }, (_, index) =>
    Math.floor(((index + 1) * bodyBlocks) / (inlineImages + 1)) + 1
  );
}

export async function runXArticleHostAcceptance(
  input: XArticleHostAcceptanceInput
): Promise<XArticleHostAcceptanceResult> {
  if (
    !Number.isInteger(input.body_blocks) || !Number.isInteger(input.inline_images)
    || input.body_blocks < 1 || input.inline_images < 0
    || input.inline_images >= input.body_blocks
  ) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'Host acceptance requires integer body_blocks > inline_images >= 0'
    );
  }
  const executionId = `host_acceptance_${input.body_blocks}_${input.inline_images}`;
  const runId = `run_${executionId}`;
  const draftId = '2092246293603373056';
  const ordinals = hostImageOrdinals(input.body_blocks, input.inline_images);
  if (new Set(ordinals).size !== input.inline_images) {
    throw new HarnessError('CONTRACT_INVALID', 'Host acceptance image ordinals are not unique');
  }
  const assets = ordinals.map((ordinal, index): VisualAssetRef => ({
    asset_id: `host_asset_${index + 1}`,
    relative_path: `assets/host-asset-${index + 1}.png`,
    digest: sha256({ executionId, ordinal, index }),
    mime_type: 'image/png',
    alt_text: `Approved inline Alt ${index + 1}.`,
    claim_refs: [`claim_host_${index + 1}`]
  }));
  const assetByOrdinal = new Map(ordinals.map((ordinal, index) => [ordinal, assets[index]!]));
  const blocks: XArticleBlockV1[] = Array.from({ length: input.body_blocks }, (_, index) => {
    const ordinal = index + 1;
    const asset = assetByOrdinal.get(ordinal);
    return asset === undefined
      ? {
          kind: 'paragraph' as const,
          runs: [{ text: `Approved paragraph ${ordinal}.`, marks: [], link: null }]
        }
      : { kind: 'image' as const, asset_id: asset.asset_id, alt_text: asset.alt_text };
  });
  const template = createXArticleImportTemplate({
    schema_version: '1.0',
    title: 'Bounded X Article Host acceptance',
    cover_asset_id: null,
    blocks
  });
  const expectedAssets = new Map(assets.map((asset) => [asset.asset_id, asset]));
  const host = new OfflineFakeXArticleHost(executionId, draftId, expectedAssets, input.fault);
  const hostWorkspace = await mkdtemp(join(tmpdir(), 'rph-x-article-host-'));
  const store = await WorkspaceStore.open(hostWorkspace);
  let commandNumber = 0;
  const broker = new XArticleCommandBroker(store, {
    commandId: () => `host_command_${++commandNumber}`,
    now: () => new Date(hostAcceptanceAt)
  });
  const issuedCommands: XArticleBrowserCommandV1[] = [];
  const observations: XArticleBrowserObservation[] = [];
  let interruptionCount = 0;

  const issueAndExecute = async (
    commandInput: Parameters<XArticleCommandBroker['issue']>[0]
  ): Promise<void> => {
    const command = await broker.issue(commandInput);
    const claim = await broker.claim(command);
    issuedCommands.push(command);
    observations.push(await executeClaimedHostTransaction(
      host, command, claim, observations.length + 1
    ));
    if (
      input.interrupt_after_transaction === issuedCommands.length
      && interruptionCount === 0
    ) {
      interruptionCount += 1;
      await host.readEditorProjection();
    }
  };

  try {
    const common = {
      execution_id: executionId,
      run_id: runId,
      draft_id: draftId,
      expected_page_revision: null,
      allowed_origin: 'https://x.com' as const
    };
    const importInput = {
      ...common,
      kind: 'import_article_document' as const,
      purpose: 'import_article_document',
      side_effect: 'write' as const,
      payload: {
        kind: 'import_article_document' as const,
        target_ref: 'body',
        package_root: 'articles/acceptance/host-v32',
        package_digest: sha256({ executionId, kind: 'package' }),
        template
      }
    };
    await issueAndExecute(importInput);
    if (input.fault === 'second_import') {
      await issueAndExecute({ ...importInput, purpose: 'second_import_rejected' });
    }
    for (const anchor of template.anchors) {
      const asset = expectedAssets.get(anchor.asset_id);
      if (asset === undefined) rejectHost('X Article Host fixture is missing a claimed asset');
      await issueAndExecute({
        ...common,
        kind: 'replace_article_visual_anchor',
        purpose: `replace_article_visual_anchor_${anchor.block_ordinal}`,
        side_effect: 'write',
        payload: {
          kind: 'replace_article_visual_anchor',
          target_ref: 'body',
          anchor,
          package_root: 'articles/acceptance/host-v32',
          package_digest: sha256({ executionId, kind: 'package' }),
          asset
        }
      });
    }
    const normalizedPostState = await host.readEditorProjection();
    const claimCount = (await Promise.all(issuedCommands.map((command) => store.exists(
      `runs/${command.execution_id}/x-article/browser/commands/${command.command_id}/claim.json`
    )))).filter(Boolean).length;
    return {
      host_transactions: [...host.transactions],
      paragraph_level_transactions: issuedCommands
        .filter((command) => command.kind === 'insert_article_block').length,
      progress_events: structuredClone(host.progressEvents),
      waits: structuredClone(host.waits),
      grouped_image_corrections: host.groupedImageCorrections,
      observation_count: observations.length,
      claim_count: claimCount,
      body_import_effects: host.bodyImportEffects,
      image_upload_effects: [...host.imageUploadEffects],
      expected_image_ordinals: ordinals,
      expected_image_alts: assets.map((asset) => asset.alt_text),
      normalized_post_state: normalizedPostState,
      interruption_count: interruptionCount,
      wall_clock_sleeps: 0,
      network: host.network
    };
  } finally {
    const verifiedRoot = resolve(hostWorkspace);
    if (
      resolve(verifiedRoot, '..') !== resolve(tmpdir())
      || !basename(verifiedRoot).startsWith('rph-x-article-host-')
    ) throw new Error('refusing to remove an unverified Host acceptance path');
    await rm(verifiedRoot, { recursive: true, force: false });
  }
}

if (
  process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
const workspace = await mkdtemp(join(tmpdir(), 'research-publishing-acceptance-'));
let articleComplete = false;
let manualXComplete = false;
let browserXComplete = false;
let xArticleComplete = false;
let memoryQueryComplete = false;
let publicationCheckpointComplete = false;
let feedbackInsightComplete = false;
let memoryResumeComplete = false;
let researchEvidenceFoundationComplete = false;
let researchPromotionComplete = false;
let progressiveQueryComplete = false;
let promotionResumeComplete = false;
let packageBindingComplete = false;
let terminalHookResumeComplete = false;
let publicationFlywheelComplete = false;
let submitCommands = 0;
let submitClaims = 0;
let xArticlePublishCommands = 0;
let xArticleImportCommands = 0;
let xArticleAnchorReplacementCommands = 0;
const xArticleAnchorReplacementOrdinals: number[] = [];
let xArticleExecutionState = '';
let xArticleReceiptStatus = '';

const browserAt = '2026-08-18T16:00:00.000Z';
const browserManifest: BrowserCapabilityManifest = {
  executor: 'codex-chrome', executor_version: 'acceptance-fake-host', browser_family: 'chrome',
  capabilities: ['observe_page', 'navigate', 'click', 'set_text', 'press_key', 'wait'],
  observed_at: browserAt
};

function accountNode(): BrowserNodeObservation {
  return {
    ref: 'account', role: 'button', name: 'Account menu', text: '@runtime_ai',
    test_id: 'SideNav_AccountSwitcher_Button', editable: false, disabled: false, parent_ref: null
  };
}

function composerNodes(values: readonly string[]): BrowserNodeObservation[] {
  return [
    accountNode(),
    ...values.map((text, index) => ({
      ref: `item_${index + 1}`, role: 'textbox', name: 'Post text', text,
      test_id: `tweetTextarea_${index}`, editable: true, disabled: false, parent_ref: null
    })),
    {
      ref: 'add', role: 'button', name: 'Add post', text: 'Add post', test_id: 'addButton',
      editable: false, disabled: false, parent_ref: null
    },
    {
      ref: 'submit', role: 'button', name: 'Post all', text: 'Post all', test_id: 'tweetButton',
      editable: false, disabled: values.some((value) => value.length === 0), parent_ref: null
    }
  ];
}

function observed(
  command: BrowserCommand,
  url: string,
  nodes: readonly BrowserNodeObservation[],
  posts: readonly BrowserPublicPostObservation[] = [],
  composerAttachments: BrowserObservationInput['composer_attachments'] = []
): BrowserObservationInput {
  return {
    schema_version: '2.0', observation_id: `obs_${command.command_id}`,
    execution_id: command.execution_id, command_id: command.command_id,
    origin: 'https://x.com', canonical_url: url, observed_at: browserAt,
    nodes, public_posts: posts, composer_attachments: composerAttachments
  };
}

async function browserReport(
  adapter: BrowserAdapter,
  command: BrowserCommand,
  observation: BrowserObservationInput | null,
  status: 'success' | 'uncertain' = 'success'
): Promise<void> {
  await adapter.claim(command.execution_id, command.command_id);
  await adapter.report(command.execution_id, {
    schema_version: '2.0', execution_id: command.execution_id, command_id: command.command_id,
    status, observation, error_code: null, reported_at: browserAt
  });
}

function articleObserved(
  command: XArticleBrowserCommandV1,
  value: Record<string, unknown>
): XArticleBrowserObservation {
  const input = {
    schema_version: '1.0', observation_id: `obs_${command.command_id}`,
    execution_id: command.execution_id, command_id: command.command_id,
    origin: 'https://x.com', observed_at: browserAt, account_handle: '@runtime_ai',
    controls: [], editor: null, preview: null, publish_review: null, public_article: null,
    ...value
  } as const;
  return { ...input, page_revision: computeXArticlePageRevision(input) } as unknown as XArticleBrowserObservation;
}

async function articleReport(
  adapter: XArticleBrowserAdapter,
  command: XArticleBrowserCommandV1,
  value: Record<string, unknown>
): Promise<void> {
  await adapter.claim(command);
  await adapter.report({ command, status: 'success', observation: articleObserved(command, value) });
}

try {
  const store = await WorkspaceStore.open(workspace);
  const packages = new PackageService(store, () => new Date('2026-08-18T13:00:00.000Z'));
  const candidate = await fixture<Candidate>('candidate.json');
  await packages.captureCandidate(candidate);
  const qualified = await packages.qualifyCandidate(candidate.candidate_id, {
    novelty_hint: candidate.novelty_hint!
  });
  const built = await packages.buildPackage(
    qualified,
    await fixture<ResearchContentPackage>('package.json')
  );
  const reviewed = await packages.reviewPackage(built);
  const frozen = await packages.freezePackage(reviewed.package);

  const articles = new ArticleService(store, {
    runId: () => 'acceptance_article',
    now: () => new Date('2026-08-18T14:00:00.000Z')
  });
  const articleRun = await articles.prepareArticle(frozen.package, {
    articleType: 'architecture_note',
    primaryAudience: 'AI Agent and AI Infra developers',
    language: 'en',
    targetDepth: 'deep',
    includeOpenQuestions: true
  });
  const inlineVisualSpecs = [
    {
      slotId: 'runtime-boundary-inline', candidateId: 'candidate_runtime_boundary',
      assetId: 'asset_runtime_boundary', sectionId: 'runtime-boundary',
      altText: 'Runtime boundary diagram.', claimRefs: ['claim_contract_test']
    },
    {
      slotId: 'research-hypothesis-inline', candidateId: 'candidate_research_hypothesis',
      assetId: 'asset_research_hypothesis', sectionId: 'research-hypothesis',
      altText: 'Research hypothesis diagram.', claimRefs: ['claim_runtime_hypothesis']
    },
    {
      slotId: 'planned-work-inline', candidateId: 'candidate_planned_work',
      assetId: 'asset_planned_work', sectionId: 'planned-work',
      altText: 'Planned work diagram.', claimRefs: ['claim_trace_planned']
    }
  ] as const;
  const sectionIds = ['runtime-boundary', 'research-hypothesis', 'planned-work'] as const;
  const articleDraft = {
    ...(await fixture<ArticleDraft>('article-draft.json')),
    run_id: articleRun.run_id,
    sections: (await fixture<ArticleDraft>('article-draft.json')).sections.map((section, index) =>
      ({ ...section, section_id: sectionIds[index]! })
    ),
    visual_slots: [{
      slot_id: 'cover', placement: { kind: 'cover' as const }, purpose: 'cover' as const,
      required: true, brief: 'Show one evidence-backed runtime boundary.', claim_refs: ['claim_contract_test']
    }, ...inlineVisualSpecs.map((visual) => ({
      slot_id: visual.slotId,
      placement: { kind: 'after_section' as const, section_id: visual.sectionId },
      purpose: 'explanation' as const, required: true, brief: visual.altText,
      claim_refs: visual.claimRefs
    }))]
  };
  await articles.acceptArticleDraft(articleRun.run_id, articleDraft);
  const articleReview = await articles.reviewArticle(articleRun.run_id);
  const visualSource = join(workspace, 'acceptance-visual.png');
  await writeFile(visualSource, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'));
  const visualCandidate = await articles.attachVisual(articleRun.run_id, {
    candidateId: 'candidate_cover', assetId: 'asset_cover', slotId: 'cover',
    sourcePath: visualSource, altText: 'One evidence-backed runtime boundary.',
    claimRefs: ['claim_contract_test'], provenance: { method: 'generated', tool: 'acceptance-synthetic' }
  });
  const inlineVisualCandidates = [];
  for (const visual of inlineVisualSpecs) {
    inlineVisualCandidates.push(await articles.attachVisual(articleRun.run_id, {
      candidateId: visual.candidateId, assetId: visual.assetId, slotId: visual.slotId,
      sourcePath: visualSource, altText: visual.altText, claimRefs: visual.claimRefs,
      provenance: { method: 'generated', tool: 'acceptance-synthetic' }
    }));
  }
  await articles.reviewVisual(articleRun.run_id, {
    selectedCandidates: {
      cover: visualCandidate.candidate_id,
      ...Object.fromEntries(inlineVisualCandidates.map((candidate) => [
        candidate.slot_id, candidate.candidate_id
      ]))
    },
    reviewedBy: 'acceptance-reviewer',
    claimAlignment: true, boundaryAlignment: true, mobileLegibility: true,
    singleMessage: true, privacyReview: true
  });
  const canonical = await articles.finalizeArticle(articleRun.run_id);
  const articleHandoff = await articles.createXHandoff(articleRun.run_id, 'asset_cover');
  articleComplete =
    articleReview.passed &&
    canonical.artifacts.includes(`${canonical.root}/visual-manifest.json`) &&
    canonical.artifacts.includes(`${canonical.root}/assets/asset_cover.png`) &&
    inlineVisualSpecs.every((visual) =>
      canonical.artifacts.includes(`${canonical.root}/assets/${visual.assetId}.png`)
    ) &&
    articleHandoff.article_digest === canonical.digest &&
    articleHandoff.visual_asset?.asset_id === 'asset_cover';

  const xArticles = new XArticleService(store, {
    runId: () => 'acceptance_x_article', planId: () => 'plan_acceptance_x_article',
    now: () => new Date(browserAt)
  });
  const xArticlePlan = await xArticles.plan(canonical, '@runtime_ai');
  const xArticleApproval = approveXArticlePublication(
    xArticlePlan, 'acceptance-reviewer', 60_000, new Date(browserAt),
    () => 'approval_acceptance_x_article'
  );
  let xArticleEvent = 0;
  let xArticleCommand = 0;
  const xArticleAdapter = new XArticleBrowserAdapter(
    store, new XArticleWeb2026_08Contract(), {
      executionId: () => 'exec_acceptance_x_article',
      eventId: () => `event_acceptance_x_article_${++xArticleEvent}`,
      commandId: () => `command_acceptance_x_article_${++xArticleCommand}`,
      attemptId: () => 'attempt_acceptance_x_article',
      receiptId: () => 'receipt_acceptance_x_article',
      now: () => new Date(browserAt)
    }
  );
  const xArticleExecution = await xArticleAdapter.start(xArticlePlan, xArticleApproval, {
    executor: 'codex-chrome', executor_version: 'acceptance-fake-host', browser_family: 'chrome',
    capabilities: [
      'observe_article_page', 'create_article_draft', 'set_article_title',
      'import_article_document', 'replace_article_visual_anchor',
      'upload_article_cover', 'insert_article_block', 'insert_article_image',
      'set_article_image_alt', 'open_article_preview', 'open_publish_review',
      'publish_article_once'
    ], observed_at: browserAt
  });
  const xArticleDraftId = '2090731994279755776';
  let xArticleTitle = '';
  let xArticleBlocks: typeof xArticlePlan.intent.document.blocks = [];
  let xArticleVisuals: XArticleBrowserObservation['editor'] extends null
    ? never
    : NonNullable<XArticleBrowserObservation['editor']>['visuals'] = [];
  let xArticleImportState: NonNullable<XArticleBrowserObservation['editor']>['import_state'] = null;
  const xArticleCommandKinds: string[] = [];
  const editorControls = [
    { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
    { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
    { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
    { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
  ];
  while (true) {
    const step = await xArticleAdapter.next(xArticleExecution.execution_id);
    if (step.command === null) {
      if (
        step.snapshot.state === 'finalized'
        || step.snapshot.state === 'published_unverified'
      ) break;
      throw new Error(`X Article acceptance stalled in ${step.snapshot.state}`);
    }
    const command = step.command;
    xArticleCommandKinds.push(command.kind);
    if (command.kind === 'observe_article_page' && command.payload.kind === 'observe_article_page') {
      if (command.payload.scope === 'index') {
        await articleReport(xArticleAdapter, command, {
          canonical_url: 'https://x.com/compose/articles', page_kind: 'articles_index',
          controls: [{ ref: 'create', role: 'button', name: 'create', test_id: null, disabled: false }]
        });
      } else if (command.payload.scope === 'public_article') {
        const articleId = '2091000000000000000';
        const publicVisuals = xArticleVisuals.map((visual) => ({ ...visual, owned_by_execution: false }));
        await articleReport(xArticleAdapter, command, {
          canonical_url: `https://x.com/runtime_ai/article/${articleId}`, page_kind: 'public_article',
          public_article: {
            article_id: articleId, canonical_url: `https://x.com/runtime_ai/article/${articleId}`,
            author_handle: '@runtime_ai', title: xArticleTitle, blocks: xArticleBlocks,
            visuals: publicVisuals, published_at: browserAt
          }
        });
      } else {
        throw new Error(`unexpected Article observation scope ${command.payload.scope}`);
      }
      continue;
    }
    if (command.kind === 'create_article_draft') {
      await articleReport(xArticleAdapter, command, {
        canonical_url: `https://x.com/compose/articles/edit/${xArticleDraftId}`, page_kind: 'article_editor',
        controls: editorControls,
        editor: { draft_id: xArticleDraftId, title: xArticleTitle, blocks: xArticleBlocks, visuals: xArticleVisuals, import_state: xArticleImportState, has_unknown_content: false, autosave_state: 'saved' }
      });
      continue;
    }
    if (command.kind === 'set_article_title') xArticleTitle = command.payload.kind === 'set_article_title' ? command.payload.title : xArticleTitle;
    if (command.kind === 'import_article_document' && command.payload.kind === 'import_article_document') {
      xArticleImportCommands += 1;
      xArticleImportState = {
        template_digest: command.payload.template.template_digest,
        source_document_digest: command.payload.template.source_document_digest,
        unresolved_anchors: command.payload.template.anchors
      };
      xArticleBlocks = xArticlePlan.intent.document.blocks.filter((block) => block.kind !== 'image');
    }
    if (
      command.kind === 'replace_article_visual_anchor' &&
      command.payload.kind === 'replace_article_visual_anchor'
    ) {
      const nextAnchor = xArticleImportState?.unresolved_anchors[0];
      if (nextAnchor === undefined || nextAnchor.anchor_id !== command.payload.anchor.anchor_id) {
        throw new Error('X Article acceptance Host received an out-of-order visual anchor replacement');
      }
      xArticleAnchorReplacementCommands += 1;
      xArticleAnchorReplacementOrdinals.push(command.payload.anchor.block_ordinal);
      const unresolvedAnchors = xArticleImportState!.unresolved_anchors.slice(1);
      xArticleVisuals = [...xArticleVisuals, {
        ref: `image_${command.payload.anchor.block_ordinal}`,
        asset_id: command.payload.asset.asset_id, kind: 'inline',
        block_ordinal: command.payload.anchor.block_ordinal,
        alt_text: command.payload.asset.alt_text, status: 'uploaded', owned_by_execution: true
      }];
      if (unresolvedAnchors.length === 0) {
        xArticleImportState = null;
        xArticleBlocks = xArticlePlan.intent.document.blocks;
      } else {
        xArticleImportState = { ...xArticleImportState!, unresolved_anchors: unresolvedAnchors };
        const unresolvedOrdinals = new Set(unresolvedAnchors.map((anchor) => anchor.block_ordinal));
        xArticleBlocks = xArticlePlan.intent.document.blocks.filter((block, index) =>
          block.kind !== 'image' || !unresolvedOrdinals.has(index + 1)
        );
      }
    }
    if (command.kind === 'upload_article_cover' && command.payload.kind === 'upload_article_cover') {
      xArticleVisuals = [{
        ref: 'cover_acceptance', asset_id: command.payload.asset.asset_id, kind: 'cover',
        block_ordinal: null, alt_text: null, status: 'uploaded', owned_by_execution: true
      }, ...xArticleVisuals];
    }
    if (command.kind === 'set_article_image_alt' && command.payload.kind === 'set_article_image_alt') {
      const altText = command.payload.alt_text;
      const visualRef = command.payload.visual_ref;
      xArticleVisuals = xArticleVisuals.map((visual) =>
        visual.ref === visualRef ? { ...visual, alt_text: altText } : visual
      );
    }
    if (command.kind === 'insert_article_block' && command.payload.kind === 'insert_article_block') {
      xArticleBlocks = [...xArticleBlocks, command.payload.block];
    }
    if (command.kind === 'insert_article_image' && command.payload.kind === 'insert_article_image') {
      xArticleBlocks = [
        ...xArticleBlocks,
        xArticlePlan.intent.document.blocks[command.payload.block_ordinal - 1]!
      ];
      xArticleVisuals = [...xArticleVisuals, {
        ref: `image_${command.payload.block_ordinal}`, asset_id: command.payload.asset.asset_id,
        kind: 'inline', block_ordinal: command.payload.block_ordinal, alt_text: command.payload.asset.alt_text,
        status: 'uploaded', owned_by_execution: true
      }];
    }
    if (command.kind === 'open_article_preview') {
      await articleReport(xArticleAdapter, command, {
        canonical_url: `https://x.com/compose/articles/edit/${xArticleDraftId}/preview`, page_kind: 'article_preview',
        controls: [{ ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }],
        preview: { draft_id: xArticleDraftId, title: xArticleTitle, blocks: xArticleBlocks, visuals: xArticleVisuals }
      });
      continue;
    }
    if (command.kind === 'open_publish_review') {
      await articleReport(xArticleAdapter, command, {
        canonical_url: `https://x.com/compose/articles/edit/${xArticleDraftId}/preview`, page_kind: 'publish_review',
        controls: [{ ref: 'publish_final', role: 'button', name: 'Publish', test_id: null, disabled: false }],
        publish_review: { draft_id: xArticleDraftId, audience: 'everyone', final_publish_ref: 'publish_final' }
      });
      continue;
    }
    if (command.kind === 'publish_article_once') {
      xArticlePublishCommands += 1;
      await xArticleAdapter.claim(command);
      await xArticleAdapter.report({ command, status: 'uncertain', observation: null });
      await xArticleAdapter.resumeVerification(xArticleExecution.execution_id);
      continue;
    }
    await articleReport(xArticleAdapter, command, {
      canonical_url: `https://x.com/compose/articles/edit/${xArticleDraftId}`, page_kind: 'article_editor',
      controls: editorControls,
      editor: { draft_id: xArticleDraftId, title: xArticleTitle, blocks: xArticleBlocks, visuals: xArticleVisuals, import_state: xArticleImportState, has_unknown_content: false, autosave_state: 'saved' }
    });
  }
  const xArticleStatus = await xArticleAdapter.status(xArticleExecution.execution_id);
  const xArticleReceipt = await store.readJson<{ status: string }>(xArticleStatus.latest_receipt_path!);
  xArticleExecutionState = xArticleStatus.state;
  xArticleReceiptStatus = xArticleReceipt.status;
  const xArticleTerminalEvidenceValid =
    (xArticleStatus.state === 'finalized' && xArticleReceipt.status === 'published')
    || (
      xArticleStatus.state === 'published_unverified'
      && xArticleReceipt.status === 'published_media_unverified'
    );
  xArticleComplete =
    xArticleTerminalEvidenceValid &&
    xArticleStatus.publish_command_count === 1 &&
    xArticlePublishCommands === 1 &&
    xArticleImportCommands === 1 &&
    xArticleAnchorReplacementCommands === 3 &&
    sha256(xArticleAnchorReplacementOrdinals) === sha256(
      xArticlePlan.intent.visuals.flatMap((visual) =>
        visual.placement.kind === 'block' ? [visual.placement.block_ordinal] : []
      )
    ) &&
    xArticleCommandKinds.filter((kind) => kind === 'insert_article_block').length === 0 &&
    xArticleCommandKinds.filter((kind) => kind === 'open_article_preview').length === 1 &&
    xArticleImportState === null &&
    sha256(xArticleBlocks) === sha256(xArticlePlan.intent.document.blocks) &&
    !JSON.stringify({ blocks: xArticleBlocks, visuals: xArticleVisuals }).includes('RPH_VISUAL_ANCHOR:') &&
    ['published', 'published_media_unverified'].includes(xArticleReceipt.status);

  const x = new XService(store, {
    runId: () => 'acceptance_x',
    now: () => new Date('2026-08-18T15:00:00.000Z')
  });
  const xRun = await x.prepareX(frozen.package, {
    contentType: 'anchor',
    format: 'thread',
    language: 'en',
    targetAccount: '@runtime_ai'
  });
  const xDraft = { ...(await fixture<XDraft>('x-draft.json')), run_id: xRun.run_id };
  await x.acceptXDraft(xRun.run_id, xDraft);
  const xReview = await x.reviewX(xRun.run_id);
  const plan = await x.planX(xRun.run_id);
  const approval = approvePublication(
    plan,
    'acceptance-reviewer',
    60_000,
    new Date('2026-08-18T15:00:10.000Z')
  );
  const manual = new ManualAdapter(store, {
    receiptId: () => 'receipt_acceptance_x',
    now: () => new Date('2026-08-18T15:00:20.000Z')
  });
  const receipt = await manual.handoff(plan, approval);
  const recorded = await manual.recordPublished(receipt, {
    url: 'https://x.com/runtime_ai/status/2000000000000000200',
    postIds: ['2000000000000000200', '2000000000000000201', '2000000000000000202'],
    publishedAt: '2026-08-18T15:10:00.000Z'
  });
  manualXComplete =
    xReview.passed &&
    receipt.status === 'handed_off' &&
    recorded.status === 'manual_recorded' &&
    recorded.verification_source === 'manual';

  const browserX = new XService(store, {
    runId: () => 'acceptance_browser_x',
    planId: () => 'plan_acceptance_browser_x',
    now: () => new Date(browserAt)
  });
  const browserRun = await browserX.prepareX(frozen.package, {
    contentType: 'anchor', format: 'thread', language: 'en', targetAccount: '@runtime_ai'
  });
  const browserDraft = { ...(await fixture<XDraft>('x-draft.json')), run_id: browserRun.run_id };
  await browserX.acceptXDraft(browserRun.run_id, browserDraft);
  const browserReview = await browserX.reviewX(browserRun.run_id);
  const browserPlan = await browserX.planXBrowser(browserRun.run_id, articleHandoff);
  if (browserPlan.schema_version !== '2.1') throw new Error('visual handoff did not create a V2.1 Plan');
  const browserApproval = approvePublicationV2_1(
    browserPlan, 'acceptance-reviewer', 60_000, new Date(browserAt), () => 'approval_acceptance_browser'
  );
  let browserEvent = 0;
  let browserCommand = 0;
  const browserExecutions = new ExecutionStore(
    store, () => new Date(browserAt), () => `evt_acceptance_${++browserEvent}`
  );
  const browserBroker = new CommandBroker(
    store, browserExecutions, () => new Date(browserAt), () => `cmd_acceptance_${++browserCommand}`
  );
  const browserAdapter = new BrowserAdapter(
    store, browserExecutions, browserBroker, new XWeb202608Contract(),
    () => new Date(browserAt), () => 'attempt_acceptance_browser', () => 'receipt_acceptance_browser'
  );
  await browserAdapter.start({
    execution_id: 'exec_acceptance_browser', plan: browserPlan,
    approval: browserApproval,
    capability_manifest: {
      ...browserManifest,
      capabilities: [...browserManifest.capabilities, 'file_upload', 'attachment_alt_text', 'upload_attachment', 'set_attachment_alt_text']
    }
  });
  let browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(
    browserAdapter, browserNext, observed(browserNext, 'https://x.com/home', [accountNode()])
  );
  browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(
    browserAdapter, browserNext,
    observed(browserNext, 'https://x.com/compose/post', composerNodes(['']))
  );
  const browserTexts = browserPlan.items.map((item) => item.text);
  for (let index = 0; index < browserTexts.length; index += 1) {
    browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
    await browserReport(
      browserAdapter, browserNext,
      observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts.slice(0, index + 1)))
    );
    if (index < browserTexts.length - 1) {
      browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
      await browserReport(
        browserAdapter, browserNext,
        observed(browserNext, 'https://x.com/compose/post', composerNodes([
          ...browserTexts.slice(0, index + 1), ''
        ]))
      );
    }
  }
  browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  const attachment = {
    ref: 'attachment_acceptance', ordinal: 1, kind: 'image' as const,
    mime_type: 'image/png' as const, alt_text: null, status: 'uploaded' as const,
    owned_by_execution: true
  };
  await browserReport(
    browserAdapter, browserNext,
    observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts), [], [attachment])
  );
  browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  const altAttachment = { ...attachment, alt_text: articleHandoff.visual_asset!.alt_text };
  await browserReport(
    browserAdapter, browserNext,
    observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts), [], [altAttachment])
  );
  browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(
    browserAdapter, browserNext,
    observed(browserNext, 'https://x.com/compose/post', composerNodes(browserTexts), [], [altAttachment])
  );
  const submit = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(browserAdapter, submit, null, 'uncertain');
  const publicPosts: BrowserPublicPostObservation[] = browserTexts.map((text, index) => {
    const id = (800000000000000100n + BigInt(index)).toString();
    return {
      post_id: id, canonical_url: `https://x.com/runtime_ai/status/${id}`,
      author_handle: '@runtime_ai', text, links: [], published_at: browserAt,
      reply_to_id: index === 0 ? null : (800000000000000100n + BigInt(index - 1)).toString(),
      ...(index === 0 ? { media: [{ kind: 'image' as const, alt_text: articleHandoff.visual_asset!.alt_text, url: 'https://pbs.twimg.com/media/acceptance' }] } : {})
    };
  });
  browserNext = (await browserAdapter.next('exec_acceptance_browser'))!;
  await browserReport(
    browserAdapter, browserNext,
    observed(browserNext, publicPosts[0]!.canonical_url, [accountNode()], publicPosts)
  );
  const browserStatus = await browserAdapter.status('exec_acceptance_browser');
  const visualReceipt = await store.readJson<{ schema_version: string; media_evidence: { source_asset_verified: boolean; composer_attachment_verified: boolean; public_media_verified: boolean } }>(browserStatus.latest_receipt_path!);
  const browserPrefix = 'runs/acceptance_browser_x/x/browser/exec_acceptance_browser';
  for (const entry of await store.list(`${browserPrefix}/commands`)) {
    if (entry.kind !== 'file') continue;
    const persisted = await store.readJson<BrowserCommand>(entry.relative_path);
    if (persisted.side_effect === 'submit') submitCommands += 1;
  }
  submitClaims = (await store.list(`${browserPrefix}/claims`)).filter(
    (entry) => entry.name === `${submit.command_id}.json`
  ).length;
  browserXComplete =
    browserReview.passed &&
    browserStatus.snapshot.state === 'finalized' &&
    browserStatus.snapshot.submit_command_count === 1 &&
    submitCommands === 1 &&
    submitClaims === 1 &&
    visualReceipt.schema_version === '2.1' &&
    visualReceipt.media_evidence.source_asset_verified &&
    visualReceipt.media_evidence.composer_attachment_verified &&
    visualReceipt.media_evidence.public_media_verified;

  const researchEvidencePath = 'packages/acceptance_research_evidence.md';
  const researchEvidenceText = '# Runtime boundary\n\nDeterministic access belongs in the Runtime.\n';
  await store.writeNew(researchEvidencePath, researchEvidenceText);
  const researchEvidence = await new ResearchEvidenceService(store, {
    evidenceSnapshotId: () => 'evidence_acceptance_foundation',
    now: () => new Date(browserAt)
  }).capture({
    increment_id: 'increment_acceptance_foundation', increment_revision: 1,
    capture_event: 'research_package_finalized', capture_kind: 'automatic_terminal',
    workspace_identity_digest: `sha256:${'a'.repeat(64)}`,
    artifacts: [{
      workspace_relative_path: researchEvidencePath, role: 'research_package',
      media_type: 'text/markdown', canonical: true, privacy_classification: 'internal'
    }],
    source_refs: ['acceptance:research-package'], privacy_classification: 'internal'
  });
  const canonicalDocuments = new CanonicalDocumentService(store);
  const canonicalProjection = await canonicalDocuments.project({
    document_id: 'document_acceptance_foundation', document_role: 'research_package',
    track_id: 'enterprise-agent-runtime',
    increment_ref: 'increment:enterprise-agent-runtime:increment_acceptance_foundation@1',
    artifact_ref: researchEvidence.artifact_refs[0]!, language: 'en'
  });
  if (canonicalProjection.status !== 'projected') {
    throw new Error('acceptance canonical research document was not projected');
  }
  const increment = await new ResearchIncrementService(store, {
    lifecycleEventId: () => 'event_acceptance_foundation',
    now: () => new Date(browserAt)
  }).assemble({
    increment_id: 'increment_acceptance_foundation', revision: 1,
    title: 'Runtime boundary', research_question: 'Where should deterministic access live?',
    thesis: 'Deterministic knowledge access belongs in the Runtime.',
    summary: 'Human-promoted acceptance summary for the Runtime boundary.',
    document_manifest_refs: [`document:${canonicalProjection.manifest.document_id}@${canonicalProjection.manifest.manifest_digest}`],
    tags: ['agent-runtime'], claim_refs: [], decision_refs: [], boundary_refs: [],
    open_question_refs: [], source_refs: ['acceptance:research-package'],
    evidence_snapshot_refs: [`evidence:${researchEvidence.evidence_snapshot_id}`], predecessor_refs: []
  });
  researchEvidenceFoundationComplete =
    increment.revision === 1 &&
    await canonicalDocuments.reconstruct(canonicalProjection.manifest) === researchEvidenceText;

  const promotionTarget = {
    frontmatter: { claim_id: 'claim_acceptance_promotion', version: 1, claim_status: 'observed' },
    body: '# Catalog-last promotion\n\nHuman-promoted acceptance claim.\n',
    variables: {
      research_track: 'enterprise-agent-runtime', claim_id: 'claim_acceptance_promotion', version: '1'
    },
    refs: {},
    index_entry: {
      ref: 'claim:claim_acceptance_promotion@1',
      record_path: 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/claim_acceptance_promotion/versions/1.md',
      record_digest: `sha256:${'b'.repeat(64)}`, title: 'Catalog-last promotion',
      summary: 'Human-promoted acceptance claim.', tags: ['promotion'], category: 'semantic',
      claim_status: 'observed', lifecycle_status: 'accepted', evolution_target: null,
      updated_at: browserAt, accepted_at: browserAt, published_at: null,
      evidence_available: true, document_manifest_available: false
    }
  } as const;
  const promotionDeltas = new SemanticDeltaService(store);
  const promotionDelta = await promotionDeltas.propose({
    delta_id: 'delta_acceptance_promotion',
    increment_ref: 'increment:enterprise-agent-runtime:increment_acceptance_foundation@1',
    base_catalog_digest: sha256({ catalog: null }),
    evidence_snapshot_refs: [`evidence:${researchEvidence.evidence_snapshot_id}`],
    proposed_operations: [{
      operation_id: 'op_acceptance_promotion', operation_type: 'add_record',
      target_id: 'claim_acceptance_promotion', record_type: 'claim_version',
      target_content: promotionTarget, target_content_digest: sha256(promotionTarget),
      evidence_refs: [`evidence:${researchEvidence.evidence_snapshot_id}`],
      evidence_privacy_classification: 'internal', target_privacy_classification: 'internal',
      index_impact: ['mainline', 'history']
    }],
    generated_by: 'acceptance', generated_at: browserAt, policy_version: 'semantic-promotion/v1'
  });
  const promotionReview = await promotionDeltas.review(promotionDelta.delta_id, {
    review_id: 'review_acceptance_promotion', accepted_operation_ids: ['op_acceptance_promotion'],
    rejected_operation_ids: [], rejection_reasons: [], operation_replacements: [],
    reviewer: 'acceptance-reviewer', reviewed_at: browserAt
  });
  let acceptanceCatalog: { path: string; digest: `sha256:${string}` } | null = null;
  let promotionShardFailure = true;
  const promotionRuntimeCalls: string[] = [];
  const acceptancePromotionRuntime = {
    async version() { promotionRuntimeCalls.push('version'); return '0.2.0' as const; },
    async validateMapping() { promotionRuntimeCalls.push('validate_mapping'); return { status: 'ok' }; },
    async findCatalog() {
      promotionRuntimeCalls.push('find_catalog');
      return acceptanceCatalog === null
        ? { status: 'not_found' as const }
        : { status: 'found' as const, ...acceptanceCatalog };
    },
    async copySource(input: Readonly<Record<string, unknown>>) {
      promotionRuntimeCalls.push('copy_source');
      return {
        status: 'ok', path: input.logical_path as string,
        checksum: sha256Bytes(await readFile(input.source as string))
      };
    },
    async writeRecord(input: Readonly<Record<string, unknown>>) {
      const checksum = sha256Bytes(await readFile(input.content_file as string));
      const recordType = input.record_type as string;
      promotionRuntimeCalls.push(`write_record:${recordType}`);
      if (recordType === 'research_index_shard' && promotionShardFailure) {
        promotionShardFailure = false;
        throw new Error('synthetic promotion shard failure');
      }
      const path = `acceptance/${recordType}.md`;
      if (recordType === 'research_index_catalog') acceptanceCatalog = { path, digest: checksum };
      return { status: 'ok', path, checksum };
    },
    async registerArtifact() { promotionRuntimeCalls.push('register_artifact'); return { status: 'ok' }; },
    async appendLog() { promotionRuntimeCalls.push('append_log'); return { status: 'ok', path: 'logs/research-promotion.jsonl' }; }
  };
  const promotionService = new MemoryPromotionService(store, acceptancePromotionRuntime, {
    profile_path: resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml'),
    mapping_path: resolve('harnesses/research-publishing/memory/ingest-mapping.yml'),
    scp_paths: [
      resolve('harnesses/research-publishing/memory/scp.yml'),
      resolve('skills/article-publishing-copilot/scp.yml'),
      resolve('skills/x-publishing-copilot/scp.yml'),
      resolve('skills/research-synthesis-copilot/scp.yml')
    ]
  }, {
    planId: () => 'promotion_plan_acceptance', approvalId: () => 'promotion_approval_acceptance',
    receiptId: () => 'promotion_receipt_acceptance', now: () => new Date(browserAt)
  });
  const promotionPlan = await promotionService.plan(promotionDelta.delta_id, promotionReview.review_id);
  const promotionApproval = await promotionService.approve(
    promotionPlan.plan_id, promotionPlan.plan_digest, 'acceptance-reviewer', 60_000
  );
  const partialPromotionReceipt = await promotionService.execute(promotionPlan.plan_id, promotionApproval);
  const copiedBeforeResume = promotionRuntimeCalls.filter((call) => call === 'copy_source').length;
  const promotionReceipt = await promotionService.resume(promotionPlan.plan_id, promotionApproval);
  const observedCatalog = acceptanceCatalog as {
    path: string;
    digest: `sha256:${string}`;
  } | null;
  researchPromotionComplete =
    promotionReceipt.status === 'complete' &&
    observedCatalog?.digest === promotionPlan.expected_final_catalog_digest &&
    promotionRuntimeCalls.filter((call) => call.startsWith('write_record:')).at(-1) === 'write_record:research_index_catalog';
  promotionResumeComplete =
    partialPromotionReceipt.status === 'partial' &&
    promotionRuntimeCalls.filter((call) => call === 'copy_source').length === copiedBeforeResume;

  const queryRecordContent = renderResearchRecord({
    record_type: 'claim_version',
    frontmatter: { claim_id: 'claim_acceptance_query', version: 1, claim_status: 'observed' },
    body: '# Runtime boundary\n\nDeterministic knowledge access belongs in the Runtime.\n'
  });
  const queryRecordPath = 'domains/research-publishing/tracks/enterprise-agent-runtime/claims/claim_acceptance_query/versions/1.md';
  const queryRecordDigest = sha256Bytes(Buffer.from(queryRecordContent, 'utf8'));
  const queryProjection = new ResearchIndexProjector().project({
    track_id: 'enterprise-agent-runtime', prior_catalog: null,
    records: [{
      ref: 'claim:claim_acceptance_query@1', record_path: queryRecordPath,
      record_digest: queryRecordDigest, title: 'Runtime boundary',
      summary: 'Deterministic knowledge access belongs in the Runtime.', tags: ['runtime'],
      category: 'semantic', claim_status: 'observed', lifecycle_status: 'accepted',
      evolution_target: null, updated_at: browserAt, accepted_at: browserAt, published_at: null,
      evidence_available: true, document_manifest_available: false
    }]
  });
  const queryShard = queryProjection.shards.find((item) => item.record.view === 'mainline')!;
  const queryRuntimeContent = new Map([
    [queryProjection.catalog_path, queryProjection.catalog_content],
    [queryShard.path, queryShard.content],
    [queryRecordPath, queryRecordContent]
  ]);
  const queryRuntimeCalls: string[] = [];
  const progressiveQuery = new ProgressiveResearchQueryService(store, {
    async findRecords() {
      queryRuntimeCalls.push('find:catalog');
      return {
        status: 'found', record_type: 'research_index_catalog',
        matches: [{
          path: queryProjection.catalog_path, checksum: queryProjection.catalog_content_digest,
          identity: 'enterprise-agent-runtime:research', display: 'enterprise-agent-runtime:research', fields: {}
        }]
      };
    },
    async loadPaths(input) {
      queryRuntimeCalls.push(`load:${input.paths.join(',')}`);
      const items = input.paths.map((path) => {
        const content = queryRuntimeContent.get(path);
        if (content === undefined) throw new Error('acceptance exact Query path is missing');
        return {
          path, checksum: sha256Bytes(Buffer.from(content, 'utf8')), content,
          instruction_policy: 'data_only' as const, sanitized: false, risk_flags: []
        };
      });
      return { status: 'loaded' as const, runtime_version: '0.2.0' as const, items, excluded_count: 0, truncated_count: 0 };
    }
  }, {
    snapshotId: () => 'snapshot_acceptance_progressive',
    reviewId: () => 'review_acceptance_progressive', now: () => new Date(browserAt)
  });
  const progressivePlan = await progressiveQuery.plan({
    query_id: 'query_acceptance_progressive', track_id: 'enterprise-agent-runtime',
    query_intent: 'Explain the Runtime boundary.', view: 'mainline', include_working: false,
    selection_terms: ['runtime', 'boundary'], selection_rationale: 'The accepted claim directly answers the question.',
    document_mode: 'none', catalog_ref: {
      path: queryProjection.catalog_path, digest: queryProjection.catalog_content_digest,
      generation: queryProjection.generation
    },
    selected_shard_refs: [{
      shard_id: queryShard.record.shard_id, path: queryShard.path, digest: queryShard.content_digest,
      generation: queryProjection.generation, view: 'mainline'
    }],
    selected_record_refs: [{
      ref: 'claim:claim_acceptance_query@1', path: queryRecordPath, digest: queryRecordDigest,
      evidence_refs: [], document_manifest_ref: null
    }],
    selected_manifest_refs: [], selected_chunk_refs: [], created_at: browserAt
  });
  const progressiveSnapshot = await progressiveQuery.execute(progressivePlan.query_id);
  const progressiveReview = await progressiveQuery.review(progressivePlan.query_id, {
    selected_context_refs: [progressiveSnapshot.context_items[0]!.context_ref],
    reviewer: 'acceptance-reviewer', reviewed_at: browserAt
  });
  if (frozen.package.schema_version === '1.2') {
    throw new Error('legacy acceptance package unexpectedly resolved to V1.2');
  }
  const packageDraftV1_1: ResearchContentPackageV1_1 = {
    ...frozen.package,
    schema_version: '1.1' as const,
    status: 'draft' as const,
    memory_context: {
      query_plan_digest: null, context_snapshot_digest: null, context_refs: [],
      status: 'not_configured' as const, reviewer: null, reviewed_at: null
    }
  };
  const boundPackage = await progressiveQuery.bindPackage(progressivePlan.query_id, packageDraftV1_1);
  packageBindingComplete =
    boundPackage.memory_context.status === 'applied' &&
    boundPackage.memory_context.context_refs.includes(progressiveSnapshot.context_items[0]!.context_ref);
  progressiveQueryComplete =
    progressiveSnapshot.query_status === 'loaded' &&
    progressiveReview.snapshot_digest === progressiveSnapshot.snapshot_digest &&
    queryRuntimeCalls.length === 4 && queryRuntimeCalls.every((call) => !call.includes('**'));

  const memoryQuery = new MemoryQueryService(store, {
    async query() {
      return {
        status: 'loaded' as const, runtime_version: '0.2.0' as const,
        excluded_count: 0, truncated_count: 0,
        items: [{
          path: 'domains/research-publishing/tracks/enterprise-agent-runtime/insights/acceptance.md',
          checksum: `sha256:${'d'.repeat(64)}` as const,
          content: 'A governed memory loop preserves provenance.',
          instruction_policy: 'data_only' as const, sanitized: false, risk_flags: []
        }]
      };
    }
  }, {
    queryId: () => 'query_acceptance_memory', runId: () => 'run_acceptance_memory',
    snapshotId: () => 'snapshot_acceptance_memory', now: () => new Date(browserAt)
  });
  const memoryQueryPlan = await memoryQuery.planQuery({
    research_track: 'enterprise-agent-runtime', purpose: 'candidate_enrichment', query_terms: [],
    context_budget: { max_items: 4, max_chars: 8_000, max_item_chars: 2_000 },
    profile_digest: `sha256:${'e'.repeat(64)}`, scp_digest: `sha256:${'f'.repeat(64)}`
  });
  const memorySnapshot = await memoryQuery.executeQuery(memoryQueryPlan.query_id);
  const memoryReview = await memoryQuery.reviewContext(memoryQueryPlan.query_id, {
    selected_refs: [memorySnapshot.items[0]!.context_ref], reviewed_by: 'acceptance-reviewer',
    reviewed_at: new Date(browserAt)
  });
  memoryQueryComplete = memoryReview.status === 'applied';

  const memoryPublicationPath = 'receipts/acceptance_memory_publication.json';
  await store.writeNew(memoryPublicationPath, {
    receipt_id: 'publication_acceptance_memory', status: 'finalized', target_account: '@runtime_ai',
    public_result: { root_url: 'https://x.com/runtime_ai/status/900000000000000000' }
  });
  const memoryPublication = await store.resolveExistingArtifact(memoryPublicationPath);
  let appendLogFailure = false;
  const fakeMemoryRuntime = {
    async version() { return '0.2.0' as const; },
    async validateMapping() { return { status: 'ok', warnings: [], next_actions: [], context_refs: [] }; },
    async copySource() {
      return { status: 'ok', path: 'sources/originals/research-publishing/acceptance.json', checksum: `sha256:${'1'.repeat(64)}`, warnings: [], next_actions: [], context_refs: [] };
    },
    async writeRecord() {
      return { status: 'ok', path: 'domains/research-publishing/tracks/enterprise-agent-runtime/acceptance.md', checksum: `sha256:${'2'.repeat(64)}`, warnings: [], next_actions: [], context_refs: [] };
    },
    async registerArtifact() {
      return { status: 'ok', path: 'artifacts/index.json', checksum: `sha256:${'3'.repeat(64)}`, warnings: [], next_actions: [], context_refs: [] };
    },
    async appendLog() {
      if (appendLogFailure) {
        appendLogFailure = false;
        throw new Error('synthetic append failure');
      }
      return { status: 'ok', path: 'logs/research-publishing-memory-event.jsonl', checksum: `sha256:${'4'.repeat(64)}`, warnings: [], next_actions: [], context_refs: [] };
    }
  };
  let memoryIngestId = 0;
  let memoryApprovalId = 0;
  let memoryReceiptId = 0;
  const memoryIngest = new MemoryIngestService(store, fakeMemoryRuntime, {
    profile_path: resolve('harnesses/research-publishing/memory/llm-wiki-profile.yml'),
    mapping_path: resolve('harnesses/research-publishing/memory/ingest-mapping.yml'),
    scp_paths: [
      resolve('harnesses/research-publishing/memory/scp.yml'),
      resolve('skills/article-publishing-copilot/scp.yml'),
      resolve('skills/x-publishing-copilot/scp.yml'),
      resolve('skills/research-synthesis-copilot/scp.yml')
    ]
  }, {
    ingestId: () => `ingest_acceptance_${++memoryIngestId}`,
    approvalId: () => `approval_acceptance_${++memoryApprovalId}`,
    receiptId: () => `memory_receipt_acceptance_${++memoryReceiptId}`,
    now: () => new Date(browserAt)
  });
  const checkpointPlan = await memoryIngest.planPublicationCheckpoint({
    receipt_path: memoryPublicationPath, receipt_digest: memoryPublication.digest,
    research_track: 'enterprise-agent-runtime', publication_id: 'publication_acceptance_memory'
  });
  const checkpointApproval = await memoryIngest.approve(
    checkpointPlan.ingest_id, 'acceptance-reviewer', 60_000
  );
  const checkpointReceipt = await memoryIngest.execute(checkpointPlan.ingest_id, checkpointApproval);
  publicationCheckpointComplete = checkpointReceipt.status === 'succeeded';

  const acceptanceFeedback = await new MemoryFeedbackService(store, {
    feedbackSnapshotId: () => 'feedback_acceptance_memory'
  }).capture({
    receipt_path: memoryPublicationPath, receipt_digest: memoryPublication.digest,
    publication_kind: 'x_thread', public_url: 'https://x.com/runtime_ai/status/900000000000000000',
    account: '@runtime_ai', observed_at: new Date(browserAt), selection_actor: 'acceptance-reviewer',
    selection_reason: 'Synthetic counterexample selected by the acceptance Human gate.',
    entries: [{
      public_url: 'https://x.com/peer/status/900000000000000001', platform_id: '900000000000000001',
      author: '@peer', observed_text: 'Recovery needs explicit idempotency.', observed_metrics: { replies: 1 }
    }]
  });
  const acceptanceFeedbackPath = `feedback/${acceptanceFeedback.feedback_snapshot_id}/snapshot.json`;
  const acceptanceFeedbackArtifact = await store.resolveExistingArtifact(acceptanceFeedbackPath);
  const memoryInsights = new MemoryInsightService(store, { proposalId: () => 'insight_acceptance_memory' });
  const acceptanceInsight = await memoryInsights.propose({
    feedback_snapshot_path: acceptanceFeedbackPath,
    feedback_snapshot_digest: acceptanceFeedbackArtifact.digest,
    basis: 'observed_text', research_track: 'enterprise-agent-runtime', insight_type: 'counterexample',
    proposition: 'Recovery may need an explicit idempotency contract.',
    source_refs: ['feedback:feedback_acceptance_memory:1'], affected_claim_refs: [],
    evidence_strength: 'anecdotal', confidence: 0.4,
    boundary_note: 'Synthetic feedback is not production evidence.', alternative_explanations: ['Host retry policy.'],
    recommended_disposition: 'investigate', created_by_skill: 'x-publishing-copilot'
  });
  await memoryInsights.reviewInsight(acceptanceInsight.proposal_id, {
    reviewed_by: 'acceptance-reviewer', accepted: true, reason: 'Candidate only.',
    reviewed_at: new Date(browserAt)
  });
  const feedbackPlan = await memoryIngest.planFeedbackInsight({
    receipt_path: memoryPublicationPath, receipt_digest: memoryPublication.digest,
    feedback_snapshot_path: acceptanceFeedbackPath,
    feedback_snapshot_file_digest: acceptanceFeedbackArtifact.digest,
    proposal_ids: [acceptanceInsight.proposal_id], research_track: 'enterprise-agent-runtime',
    publication_id: 'publication_acceptance_memory', feedback_id: acceptanceFeedback.feedback_snapshot_id
  });
  const feedbackApproval = await memoryIngest.approve(feedbackPlan.ingest_id, 'acceptance-reviewer', 60_000);
  appendLogFailure = true;
  const partialFeedbackReceipt = await memoryIngest.execute(feedbackPlan.ingest_id, feedbackApproval);
  const resumedFeedbackReceipt = await memoryIngest.resume(feedbackPlan.ingest_id, feedbackApproval);
  feedbackInsightComplete = resumedFeedbackReceipt.status === 'succeeded';
  memoryResumeComplete =
    partialFeedbackReceipt.status === 'partial' &&
    partialFeedbackReceipt.resume_cursor === 'append_log' &&
    resumedFeedbackReceipt.resume_cursor === null;

  const foundationStatusPath = 'memory/increments/increment_acceptance_foundation/status.json';
  const foundationStatus = await store.readJson<Record<string, unknown>>(foundationStatusPath);
  await store.replaceAtomic(foundationStatusPath, {
    ...foundationStatus, state: 'accepted', latest_event_seq: 2,
    latest_event_ref: `lifecycle:event_acceptance_promoted@${promotionReceipt.receipt_digest}`,
    updated_at: browserAt
  });
  const publicationExpression = createPublicationExpression({
    expression_id: 'expression_acceptance_thread',
    increment_ref: 'increment:enterprise-agent-runtime:increment_acceptance_foundation@1',
    channel: 'x_thread', language: 'en', derivation_type: 'adaptation',
    claim_refs: ['claim:claim_acceptance_promotion@1'], visual_refs: [],
    evidence_snapshot_refs: [`evidence:${researchEvidence.evidence_snapshot_id}`],
    intended_content: {
      approved_plan_ref: 'x/acceptance/plan.json', approved_plan_digest: sha256('acceptance-plan'),
      local_content_path: `${canonical.root}/article.md`, content_digest: sha256(canonical),
      expected_item_order: [1, 2], link_refs: [memoryPublicationPath], visual_refs: []
    },
    observed_content: {
      source: 'user_report', public_url: 'https://x.com/runtime_ai/status/900000000000000000',
      platform_ids: ['900000000000000000', '900000000000000002'],
      observed_digest: sha256(['acceptance-thread-1', 'acceptance-thread-2']),
      actual_item_order: [1, 2], media_verification: 'unverified', link_verification: 'matched',
      missing_content: [], unexpected_content: [], mismatches: []
    },
    verification_level: 'manual_recorded',
    platform_refs: ['https://x.com/runtime_ai/status/900000000000000000'],
    publication_receipt_ref: `receipt:${memoryPublicationPath}#${memoryPublication.digest}`,
    published_at: browserAt
  });
  const expressionPath = 'receipts/acceptance-publication-expression.json';
  await store.writeNew(expressionPath, publicationExpression);
  const expressionArtifact = await store.resolveExistingArtifact(expressionPath);
  let terminalCaptureFailure = true;
  const terminalHooks = new ResearchTerminalHooks(store, {
    now: () => new Date(browserAt),
    capture: async (event, snapshotId) => {
      if (terminalCaptureFailure) {
        terminalCaptureFailure = false;
        throw new Error('synthetic terminal Evidence failure');
      }
      return ResearchTerminalHooks.captureDefault(store, event, snapshotId, () => new Date(browserAt));
    }
  });
  const terminalEvent = {
    event_id: 'terminal_acceptance_publication', kind: 'publication_receipt_terminal' as const,
    publication_kind: 'x_post' as const,
    increment_id: 'increment_acceptance_foundation', increment_revision: 1,
    workspace_identity_digest: `sha256:${'a'.repeat(64)}` as const,
    source_digest: memoryPublication.digest,
    artifacts: [
      { workspace_relative_path: memoryPublication.relative_path, digest: memoryPublication.digest,
        role: 'publication_receipt' as const, media_type: 'application/json', canonical: true,
        privacy_classification: 'internal' as const },
      { workspace_relative_path: expressionArtifact.relative_path, digest: expressionArtifact.digest,
        role: 'publication_expression' as const, media_type: 'application/json', canonical: true,
        privacy_classification: 'internal' as const }
    ],
    source_refs: ['publication:acceptance-thread'], privacy_classification: 'internal' as const,
    occurred_at: browserAt
  };
  const pendingTerminal = await terminalHooks.record(terminalEvent);
  const completedTerminal = await terminalHooks.resume(terminalEvent.event_id);
  terminalHookResumeComplete =
    pendingTerminal.status === 'evidence_capture_pending' && completedTerminal.status === 'complete';
  const publicationEvidenceId = completedTerminal.evidence_snapshot_ref!.slice('evidence:'.length);
  const nextDelta = await new ResearchFlywheelService(store, {
    deltaId: () => 'delta_acceptance_next_unapproved',
    lifecycleEventId: () => 'event_acceptance_publication_attached',
    now: () => new Date(browserAt),
    baseCatalogDigest: async () => promotionPlan.expected_final_catalog_digest
  }).proposeFromEvidence(publicationEvidenceId);
  const nextQuestions = await new ResearchFlywheelService(store).proposeNextQuestions(
    'increment:enterprise-agent-runtime:increment_acceptance_foundation@1'
  );
  publicationFlywheelComplete =
    acceptanceFeedback.entries.length === 1 &&
    nextDelta.proposed_operations.some((operation) => operation.operation_type === 'attach_publication') &&
    nextQuestions.every((question) => question.data_classification === 'data_only') &&
    !(await store.exists('memory/reviews/review_acceptance_next_unapproved/review.json')) &&
    !(await store.exists('memory/promotions/delta_acceptance_next_unapproved/approval.json'));
  const xArticleHostAcceptance = await runXArticleHostAcceptance({
    body_blocks: 76,
    inline_images: 3
  });
  const xArticleHostAcceptanceComplete =
    xArticleHostAcceptance.body_import_effects === 1 &&
    xArticleHostAcceptance.image_upload_effects.length === 3 &&
    xArticleHostAcceptance.host_transactions.length === 4 &&
    xArticleHostAcceptance.paragraph_level_transactions === 0 &&
    xArticleHostAcceptance.observation_count === 4 &&
    xArticleHostAcceptance.grouped_image_corrections === 3 &&
    xArticleHostAcceptance.normalized_post_state.blocks.length === 76 &&
    xArticleHostAcceptance.normalized_post_state.import_state === null &&
    xArticleHostAcceptance.normalized_post_state.autosave_state === 'saved' &&
    xArticleHostAcceptance.network === 'unused';

  if (
    !articleComplete || !manualXComplete || !browserXComplete || !xArticleComplete ||
    !memoryQueryComplete || !publicationCheckpointComplete ||
    !feedbackInsightComplete || !memoryResumeComplete || !researchEvidenceFoundationComplete ||
    !researchPromotionComplete || !progressiveQueryComplete || !promotionResumeComplete ||
    !packageBindingComplete || !terminalHookResumeComplete || !publicationFlywheelComplete ||
    !xArticleHostAcceptanceComplete
  ) {
    throw new Error('acceptance workflow did not reach the required terminal artifacts');
  }
  const acceptanceCriteria = {
    AC01: 'canonical Package source', AC02: 'immutable Increment revision',
    AC03: 'content-addressed Evidence', AC04: 'lossless canonical reconstruction',
    AC05: 'workspace-relative persistence', AC06: 'Evidence and Promotion separated',
    AC07: 'terminal Evidence hook', AC08: 'unapproved Delta excluded',
    AC09: 'Review-bound one-confirmation Promotion', AC10: 'Working excluded by default',
    AC11: 'lifecycle and Claim status separated', AC12: 'intended and observed expression',
    AC13: 'observation does not overwrite intent', AC14: 'adaptation preserves Claim strength',
    AC15: 'Human-selected feedback only', AC16: 'metrics remain non-technical evidence',
    AC17: 'versioned evolution contracts', AC18: 'history remains auditable',
    AC19: 'semantic records create-only', AC20: 'digest-bound derived Index',
    AC21: 'generation-bound Shards and Catalog', AC22: 'Catalog-first exact Query',
    AC23: 'bounded document retrieval', AC24: 'no broad research glob',
    AC25: 'budget fail-closed', AC26: 'Catalog committed last',
    AC27: 'partial Promotion invisible', AC28: 'digest changes stale Approval',
    AC29: 'safe Resume skips confirmed work', AC30: 'registration reconciliation contract',
    AC31: 'reviewed Context bound to Package', AC32: 'V2.2 read-only compatibility',
    AC33: 'bounded one-Increment six-item Import', AC34: 'offline fake-only acceptance',
    AC35: 'Runtime-only Wiki access', AC36: 'monotonic lifecycle chain',
    AC37: 'next question and Delta remain unapproved', AC38: 'enterprise runtime default Track isolation'
  } as const;
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      article: 'complete',
      manual_x: 'complete',
      browser_x: 'simulated_complete',
      visual_v2_1: 'simulated_complete',
      x_article: xArticleExecutionState === 'finalized'
        ? 'simulated_complete'
        : 'simulated_verification_needed',
      x_article_execution_state: xArticleExecutionState,
      x_article_receipt_status: xArticleReceiptStatus,
      x_article_public_content_verified: ['published', 'published_media_unverified']
        .includes(xArticleReceiptStatus),
      x_article_media_verified: xArticleReceiptStatus === 'published',
      x_article_verification_needed: xArticleReceiptStatus === 'published_media_unverified',
      x_article_host_transactions: xArticleHostAcceptance.host_transactions,
      x_article_paragraph_level_transactions: xArticleHostAcceptance.paragraph_level_transactions,
      x_article_host_progress_events: xArticleHostAcceptance.progress_events.length,
      x_article_host_grouped_image_corrections: xArticleHostAcceptance.grouped_image_corrections,
      x_article_host_observations: xArticleHostAcceptance.observation_count,
      x_article_network: xArticleHostAcceptance.network,
      memory_query: 'simulated_complete',
      publication_checkpoint: 'simulated_complete',
      feedback_insight: 'simulated_complete',
      memory_resume: 'simulated_complete',
      research_evidence_foundation: 'simulated_complete',
      research_promotion: 'simulated_complete',
      promotion_resume: 'simulated_complete',
      progressive_query: 'simulated_complete',
      package_binding: 'simulated_complete',
      terminal_hook_resume: 'simulated_complete',
      publication_flywheel: 'simulated_complete',
      phase4_owned_acceptance: ['AC12', 'AC13', 'AC14', 'AC15', 'AC16', 'AC32', 'AC33', 'AC34', 'AC37'],
      acceptance_criteria: acceptanceCriteria,
      network: 'unused',
      submit_commands: submitCommands,
      submit_claims: submitClaims,
      x_article_publish_commands: xArticlePublishCommands,
      x_article_import_commands: xArticleImportCommands,
      x_article_anchor_replacement_commands: xArticleAnchorReplacementCommands
    })}\n`
  );
} finally {
  const verifiedRoot = resolve(workspace);
  if (
    resolve(verifiedRoot, '..') !== resolve(tmpdir()) ||
    !basename(verifiedRoot).startsWith('research-publishing-acceptance-')
  ) {
    throw new Error('refusing to remove an unverified acceptance path');
  }
  await rm(verifiedRoot, { recursive: true, force: false });
}
}
