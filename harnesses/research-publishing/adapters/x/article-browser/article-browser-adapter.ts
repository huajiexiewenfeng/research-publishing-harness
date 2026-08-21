import { randomUUID } from 'node:crypto';

import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import {
  createXArticleExecutionEvent,
  transitionXArticleExecution,
  type XArticleExecutionSnapshotV1,
  type XArticleExecutionState
} from '../../../core/x-article-execution.js';
import {
  verifyXArticleApproval,
  type XArticleApprovalV1
} from '../../../core/x-article-approval.js';
import {
  assertXArticlePublicationPlan,
  type XArticlePublicationPlanV1
} from '../../../core/x-article-publication-plan.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import type { XArticleBrowserObservation } from './article-browser-protocol.js';
import { verifyPublicXArticle } from './article-public-verifier.js';
import { createXArticleReceipt } from './article-receipt.js';
import {
  XArticleCommandBroker,
  type IssueXArticleBrowserCommandInput,
  type XArticleBrowserCommandKind,
  type XArticleBrowserCommandV1,
  type XArticleCommandClaimV1
} from './article-command-broker.js';
import {
  nextArticleEditorDecision,
  type XArticleImportStrategy
} from './article-editor-protocol.js';
import type { XArticlePageContract } from './article-page-contract.js';

export interface XArticleBrowserCapabilityManifestV1 {
  readonly executor: 'codex-chrome';
  readonly executor_version: string;
  readonly browser_family: 'chrome';
  readonly capabilities: readonly XArticleBrowserCommandKind[];
  readonly observed_at: string;
}

export interface XArticleBrowserReportInput {
  readonly command: XArticleBrowserCommandV1;
  readonly status: 'success' | 'transient_failure' | 'uncertain' | 'rejected';
  readonly observation: XArticleBrowserObservation | null;
}

interface AdapterContext {
  readonly schema_version: '1.0';
  readonly plan: XArticlePublicationPlanV1;
  readonly approval: XArticleApprovalV1;
  readonly capabilities: XArticleBrowserCapabilityManifestV1;
  readonly import_strategy: XArticleImportStrategy;
  readonly bulk_import_issued: boolean;
  readonly snapshot: XArticleExecutionSnapshotV1;
  readonly latest_observation: XArticleBrowserObservation | null;
  readonly editor_revision: string | null;
  readonly preview_revision: string | null;
  readonly pending_command: XArticleBrowserCommandV1 | null;
  readonly submit_delivered: boolean;
}

interface XArticleBrowserAdapterOptions {
  readonly executionId?: () => string;
  readonly eventId?: () => string;
  readonly commandId?: () => string;
  readonly attemptId?: () => string;
  readonly receiptId?: () => string;
  readonly now?: () => Date;
}

export class XArticleBrowserAdapter {
  private readonly executionId: () => string;
  private readonly eventId: () => string;
  private readonly attemptId: () => string;
  private readonly receiptId: () => string;
  private readonly now: () => Date;
  private readonly broker: XArticleCommandBroker;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly contract: XArticlePageContract,
    options: XArticleBrowserAdapterOptions = {}
  ) {
    this.executionId = options.executionId ?? (() => `x_article_execution_${randomUUID()}`);
    this.eventId = options.eventId ?? (() => `x_article_event_${randomUUID()}`);
    this.attemptId = options.attemptId ?? (() => `x_article_attempt_${randomUUID()}`);
    this.receiptId = options.receiptId ?? (() => `x_article_receipt_${randomUUID()}`);
    this.now = options.now ?? (() => new Date());
    this.broker = new XArticleCommandBroker(store, {
      ...(options.commandId === undefined ? {} : { commandId: options.commandId }),
      now: this.now
    });
  }

  async start(
    plan: XArticlePublicationPlanV1,
    approval: XArticleApprovalV1,
    capabilities: XArticleBrowserCapabilityManifestV1
  ): Promise<XArticleExecutionSnapshotV1> {
    assertXArticlePublicationPlan(plan);
    verifyXArticleApproval(plan, approval, this.now());
    const importStrategy = this.verifyCapabilities(plan, capabilities);
    const executionId = this.executionId();
    this.assertId(executionId);
    const snapshot: XArticleExecutionSnapshotV1 = {
      schema_version: '1.0', execution_id: executionId, run_id: plan.run_id,
      plan_id: plan.plan_id, state: 'created', sequence: 0, draft_id: null,
      attempt_id: null, publish_command_count: 0, latest_command_id: null,
      latest_observation_id: null, latest_receipt_path: null, updated_at: this.now().toISOString()
    };
    const context: AdapterContext = {
      schema_version: '1.0', plan, approval, capabilities, import_strategy: importStrategy, snapshot,
      bulk_import_issued: false,
      latest_observation: null, editor_revision: null, preview_revision: null,
      pending_command: null, submit_delivered: false
    };
    await this.store.writeNewDirectory(this.prefix(executionId), {
      'plan.json': plan, 'approval.json': approval, 'capabilities.json': capabilities,
      'adapter-context.json': context
    });
    return snapshot;
  }

  async next(executionId: string): Promise<{
    readonly snapshot: XArticleExecutionSnapshotV1;
    readonly command: XArticleBrowserCommandV1 | null;
  }> {
    let context = await this.readContext(executionId);
    if (context.pending_command !== null) {
      return {
        snapshot: context.snapshot,
        command: context.pending_command.side_effect === 'submit' && context.submit_delivered
          ? null
          : context.pending_command
      };
    }

    const state = context.snapshot.state;
    if (state === 'created') {
      context = await this.transition(context, 'preflight', 'preflight_started');
      return this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id, draft_id: null,
        kind: 'observe_article_page', purpose: 'observe_articles_index',
        expected_page_revision: null, allowed_origin: 'https://x.com', side_effect: 'read',
        payload: { kind: 'observe_article_page', scope: 'index' }
      });
    }

    if (state === 'preflight') {
      const observation = this.requireObservation(context);
      const account = this.contract.detectAccount(observation);
      if (account.handle !== context.plan.intent.target_account) {
        throw new HarnessError('X_ACCOUNT_MISMATCH', 'X Article account differs from the Plan target');
      }
      const page = this.contract.detectPage(observation);
      if (page.kind !== 'articles_index') {
        throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'new X Article publication must start from the Articles index');
      }
      context = await this.transition(context, 'account_verified', 'article_account_verified');
      context = await this.transition(context, 'draft_create_armed', 'article_draft_create_armed');
      return this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id, draft_id: null,
        kind: 'create_article_draft', purpose: 'create_article_draft',
        expected_page_revision: observation.page_revision, allowed_origin: 'https://x.com', side_effect: 'write',
        payload: { kind: 'create_article_draft', target_ref: this.contract.detectControl(observation, 'create').ref }
      });
    }

    if (state === 'draft_create_armed') {
      const observation = this.requireObservation(context);
      const page = this.contract.detectPage(observation);
      if (page.kind !== 'article_editor') {
        throw new HarnessError('ARTICLE_DRAFT_IDENTITY_UNKNOWN', 'draft creation did not produce a unique Article editor identity');
      }
      context = await this.transition(context, 'draft_created', 'article_draft_identity_captured', {
        draft_id: page.draft_id
      });
      context = await this.transition(context, 'content_filling', 'article_content_filling_started');
      return this.nextEditorCommand(context, observation);
    }

    if (state === 'content_filling' || state === 'content_partially_verified') {
      return this.nextEditorCommand(context, this.requireObservation(context));
    }

    if (state === 'content_verified') {
      const observation = this.requireObservation(context);
      const preview = this.contract.detectPreview(observation);
      const expected = context.plan.intent.document;
      const actual = {
        schema_version: '1.0', title: preview.title,
        cover_asset_id: preview.visuals.find((visual) => visual.kind === 'cover')?.asset_id ?? null,
        blocks: preview.blocks
      };
      if (sha256(actual) !== sha256(expected)) {
        throw new HarnessError('ARTICLE_PREVIEW_MISMATCH', 'X Article Preview differs from the approved Plan');
      }
      context = await this.transition(context, 'preview_verified', 'article_preview_verified');
      return this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id, draft_id: context.snapshot.draft_id,
        kind: 'open_publish_review', purpose: 'open_publish_review',
        expected_page_revision: observation.page_revision, allowed_origin: 'https://x.com', side_effect: 'write',
        payload: { kind: 'open_publish_review', target_ref: this.contract.detectControl(observation, 'publish').ref }
      });
    }

    if (state === 'preview_verified' || state === 'publish_armed') {
      const observation = this.requireObservation(context);
      const review = this.contract.detectPublishReview(observation);
      if (review.draft_id !== context.snapshot.draft_id || review.audience !== 'everyone' || review.final_publish_ref === null) {
        throw new HarnessError('ARTICLE_PREVIEW_MISMATCH', 'X Article publish review differs from the approved account or audience');
      }
      verifyXArticleApproval(context.plan, context.approval, this.now());
      if (state === 'preview_verified') {
        context = await this.transition(context, 'publish_armed', 'article_publish_armed', {
          attempt_id: this.attemptId()
        });
      }
      const issued = await this.issue(context, {
        execution_id: executionId, run_id: context.plan.run_id, draft_id: context.snapshot.draft_id,
        kind: 'publish_article_once', purpose: 'publish_article_once',
        expected_page_revision: observation.page_revision, allowed_origin: 'https://x.com', side_effect: 'submit',
        payload: { kind: 'publish_article_once', target_ref: review.final_publish_ref }
      }, `publish_${executionId}`);
      context = await this.readContext(executionId);
      context = await this.transition(context, 'publish_attempted', 'article_publish_command_issued', {
        publish_command_count: 1,
        submit_delivered: true
      });
      return { snapshot: context.snapshot, command: issued.command };
    }

    if (state === 'publish_attempted' || state === 'outcome_resolving') {
      if (state === 'publish_attempted') {
        context = await this.transition(context, 'outcome_resolving', 'article_publish_outcome_resolving');
      }
      context = await this.transition(context, 'public_verifying', 'article_public_verification_started');
      return this.nextPublicVerification(context);
    }

    if (state === 'public_verifying') {
      return this.nextPublicVerification(context);
    }

    return { snapshot: context.snapshot, command: null };
  }

  async claim(command: XArticleBrowserCommandV1): Promise<XArticleCommandClaimV1> {
    return this.broker.claim(command);
  }

  async report(input: XArticleBrowserReportInput): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(input.command.execution_id);
    if (context.pending_command?.command_id !== input.command.command_id) {
      throw new HarnessError('COMMAND_REPLAY_REJECTED', 'reported X Article command is not pending');
    }
    if (input.status !== 'success' || input.observation === null) {
      context = await this.clearPending(context);
      if (input.command.kind === 'create_article_draft' && input.status === 'uncertain') {
        return (await this.transition(context, 'draft_identity_unknown', 'article_draft_identity_unknown')).snapshot;
      }
      if (input.command.kind === 'publish_article_once') {
        context = await this.transition(context, 'outcome_resolving', 'article_publish_outcome_resolving');
        return (await this.transition(context, 'outcome_unknown', 'article_publish_outcome_unknown')).snapshot;
      }
      return (await this.transition(context, 'pre_publish_failed', 'article_browser_command_failed')).snapshot;
    }
    if (
      input.observation.execution_id !== input.command.execution_id ||
      input.observation.command_id !== input.command.command_id
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'X Article observation does not belong to its command');
    }
    this.contract.detectPage(input.observation);
    await this.store.writeNew(
      `${this.prefix(input.command.execution_id)}/observations/${input.observation.observation_id}.json`,
      input.observation
    );
    context = {
      ...context,
      latest_observation: input.observation,
      editor_revision: input.observation.editor === null
        ? context.editor_revision
        : input.observation.page_revision,
      preview_revision: input.observation.preview === null
        ? context.preview_revision
        : input.observation.page_revision,
      pending_command: null,
      snapshot: {
        ...context.snapshot,
        latest_observation_id: input.observation.observation_id,
        updated_at: this.now().toISOString()
      }
    };
    await this.writeContext(context);
    return context.snapshot;
  }

  async status(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    return (await this.readContext(executionId)).snapshot;
  }

  async resumeVerification(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    if (context.snapshot.state !== 'outcome_unknown' && context.snapshot.state !== 'published_unverified') {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        `X Article verification cannot resume from ${context.snapshot.state}`
      );
    }
    context = await this.transition(context, 'public_verifying', 'article_public_verification_resumed');
    return context.snapshot;
  }

  async cancelBeforePublish(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    if (context.snapshot.publish_command_count > 0 || context.snapshot.state === 'publish_attempted') {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'X Article execution cannot be cancelled after Publish');
    }
    if (context.pending_command !== null) context = await this.clearPending(context);
    context = await this.transition(context, 'cancelled_before_publish', 'article_cancelled_before_publish');
    return context.snapshot;
  }

  private async nextPublicVerification(
    context: AdapterContext
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 | null }> {
    const article = context.latest_observation?.public_article ?? null;
    if (article === null) {
      return this.issue(context, {
        execution_id: context.snapshot.execution_id,
        run_id: context.plan.run_id,
        draft_id: context.snapshot.draft_id,
        kind: 'observe_article_page',
        purpose: 'observe_public_article',
        expected_page_revision: context.latest_observation?.page_revision ?? null,
        allowed_origin: 'https://x.com',
        side_effect: 'read',
        payload: { kind: 'observe_article_page', scope: 'public_article' }
      });
    }
    if (
      context.snapshot.draft_id === null ||
      context.editor_revision === null ||
      context.preview_revision === null
    ) {
      throw new HarnessError('ARTICLE_OUTCOME_UNKNOWN', 'X Article verification lacks editor or Preview evidence');
    }
    const verification = verifyPublicXArticle(context.plan, article, this.now());
    const status = verification.kind === 'full_match'
      ? 'published'
      : verification.kind === 'media_unverified'
        ? 'published_media_unverified'
        : 'verification_conflict';
    const receipt = createXArticleReceipt({
      receiptId: this.receiptId(),
      executionId: context.snapshot.execution_id,
      plan: context.plan,
      status,
      draftId: context.snapshot.draft_id,
      editorRevision: context.editor_revision,
      previewRevision: context.preview_revision,
      publicVerification: verification,
      issuedAt: this.now().toISOString(),
      supersedesReceiptId: null
    });
    const receiptPath = `receipts/${receipt.receipt_id}.json`;
    await this.store.writeNew(receiptPath, receipt);
    const finalState = verification.kind === 'full_match'
      ? 'finalized'
      : verification.kind === 'media_unverified'
        ? 'published_unverified'
        : 'verification_conflict';
    context = await this.transition(context, finalState, 'article_public_verification_completed', {
      latest_receipt_path: receiptPath
    });
    return { snapshot: context.snapshot, command: null };
  }

  private async nextEditorCommand(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 | null }> {
    if (context.snapshot.draft_id === null) {
      throw new HarnessError('ARTICLE_DRAFT_IDENTITY_UNKNOWN', 'X Article execution has no draft identity');
    }
    const decision = nextArticleEditorDecision(
      {
        plan: context.plan,
        draft_id: context.snapshot.draft_id,
        import_strategy: context.import_strategy,
        bulk_import_issued: context.bulk_import_issued
      },
      observation,
      this.contract
    );
    if (decision.kind === 'blocked') throw new HarnessError(decision.code, decision.message);
    if (decision.kind === 'complete') return { snapshot: context.snapshot, command: null };
    if (decision.input.kind === 'open_article_preview') {
      context = await this.transition(context, 'content_verified', 'article_editor_document_verified');
    } else if (context.snapshot.state === 'content_filling') {
      context = await this.transition(context, 'content_partially_verified', 'article_editor_prefix_verified');
    } else {
      context = await this.transition(context, 'content_filling', 'article_content_filling_resumed');
    }
    if (decision.input.kind === 'import_article_document') {
      context = { ...context, bulk_import_issued: true };
    }
    return this.issue(context, decision.input);
  }

  private async issue(
    context: AdapterContext,
    input: IssueXArticleBrowserCommandInput,
    deterministicId?: string
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 }> {
    const command = await this.broker.issue(input, deterministicId);
    const nextContext: AdapterContext = {
      ...context,
      pending_command: command,
      snapshot: {
        ...context.snapshot,
        latest_command_id: command.command_id,
        updated_at: this.now().toISOString()
      }
    };
    await this.writeContext(nextContext);
    return { snapshot: nextContext.snapshot, command };
  }

  private async clearPending(context: AdapterContext): Promise<AdapterContext> {
    const next = { ...context, pending_command: null };
    await this.writeContext(next);
    return next;
  }

  private async transition(
    context: AdapterContext,
    nextState: XArticleExecutionState,
    eventType: string,
    overrides: {
      readonly draft_id?: string;
      readonly attempt_id?: string;
      readonly publish_command_count?: number;
      readonly submit_delivered?: boolean;
      readonly latest_receipt_path?: string;
    } = {}
  ): Promise<AdapterContext> {
    transitionXArticleExecution(context.snapshot.state, nextState);
    const sequence = context.snapshot.sequence + 1;
    const event = createXArticleExecutionEvent({
      eventId: this.eventId(), executionId: context.snapshot.execution_id, sequence,
      eventType, occurredAt: this.now().toISOString(), previousState: context.snapshot.state,
      nextState, draftId: overrides.draft_id ?? context.snapshot.draft_id,
      commandId: context.pending_command?.command_id ?? null
    });
    const nextContext: AdapterContext = {
      ...context,
      submit_delivered: overrides.submit_delivered ?? context.submit_delivered,
      snapshot: {
        ...context.snapshot,
        state: nextState,
        sequence,
        draft_id: overrides.draft_id ?? context.snapshot.draft_id,
        attempt_id: overrides.attempt_id ?? context.snapshot.attempt_id,
        publish_command_count: overrides.publish_command_count ?? context.snapshot.publish_command_count,
        latest_receipt_path: overrides.latest_receipt_path ?? context.snapshot.latest_receipt_path,
        updated_at: this.now().toISOString()
      }
    };
    await this.store.writeNew(`${this.prefix(context.snapshot.execution_id)}/events/${String(sequence).padStart(6, '0')}.json`, event);
    await this.writeContext(nextContext);
    return nextContext;
  }

  private verifyCapabilities(
    plan: XArticlePublicationPlanV1,
    manifest: XArticleBrowserCapabilityManifestV1
  ): XArticleImportStrategy {
    const hasDocumentImport = manifest.capabilities.includes('import_article_document');
    const hasAnchorReplacement = manifest.capabilities.includes('replace_article_visual_anchor');
    if (hasDocumentImport !== hasAnchorReplacement) {
      throw new HarnessError(
        'BROWSER_EXECUTOR_INCOMPATIBLE',
        'Chrome Host must advertise both X Article bulk-import capabilities'
      );
    }
    const required: XArticleBrowserCommandKind[] = [
      'observe_article_page', 'create_article_draft', 'set_article_title',
      'insert_article_block', 'open_article_preview', 'open_publish_review', 'publish_article_once'
    ];
    if (plan.intent.visuals.some((visual) => visual.placement.kind === 'cover')) required.push('upload_article_cover');
    if (plan.intent.visuals.some((visual) => visual.placement.kind === 'block')) required.push('insert_article_image');
    if (plan.intent.visuals.length > 0) required.push('set_article_image_alt');
    if (
      manifest.executor !== 'codex-chrome' || manifest.browser_family !== 'chrome' ||
      required.some((capability) => !manifest.capabilities.includes(capability))
    ) {
      throw new HarnessError('BROWSER_EXECUTOR_INCOMPATIBLE', 'Chrome Host lacks required X Article capabilities');
    }
    return hasDocumentImport ? 'bulk_document' : 'incremental_blocks';
  }

  private requireObservation(context: AdapterContext): XArticleBrowserObservation {
    if (context.latest_observation === null) {
      throw new HarnessError('ARTICLE_PAGE_CONTRACT_UNSUPPORTED', 'X Article execution needs a fresh observation');
    }
    return context.latest_observation;
  }

  private async readContext(executionId: string): Promise<AdapterContext> {
    this.assertId(executionId);
    return this.store.readJson<AdapterContext>(`${this.prefix(executionId)}/adapter-context.json`);
  }

  private async writeContext(context: AdapterContext): Promise<void> {
    await this.store.replaceAtomic(`${this.prefix(context.snapshot.execution_id)}/adapter-context.json`, context);
  }

  private prefix(executionId: string): string {
    this.assertId(executionId);
    return `runs/${executionId}/x-article/browser`;
  }

  private assertId(id: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HarnessError('WORKSPACE_PATH_INVALID', 'unsafe X Article execution identity');
  }
}
