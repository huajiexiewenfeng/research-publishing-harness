import { randomUUID } from 'node:crypto';

import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import {
  notifyTerminalSafely,
  type ResearchTerminalNotifier
} from '../../../core/research-terminal-hooks.js';
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
import {
  createInitialXArticleMaterializationCheckpoint,
  createXArticleMaterializationPlan,
  type XArticleMaterializationPlanV1
} from '../../../core/x-article-materialization.js';
import { XArticleMaterializationStore } from '../../../core/x-article-materialization-store.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import {
  computeXArticlePageRevision,
  type XArticleBrowserObservation
} from './article-browser-protocol.js';
import { reconcileXArticleDraft } from './article-draft-reconciler.js';
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
  nextMaterializationEditorDecision,
  nextArticleEditorDecision,
  type XArticleImportStrategy
} from './article-editor-protocol.js';
import { createXArticleImportTemplate } from './article-import-template.js';
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
  readonly approval: XArticleApprovalV1 | null;
  readonly execution_mode: 'materialization_v3_2' | 'legacy_preapproved';
  readonly materialization_plan: XArticleMaterializationPlanV1 | null;
  readonly capabilities: XArticleBrowserCapabilityManifestV1;
  readonly import_strategy: XArticleImportStrategy;
  readonly bulk_import_issued: boolean;
  readonly snapshot: XArticleExecutionSnapshotV1;
  readonly latest_observation: XArticleBrowserObservation | null;
  readonly editor_revision: string | null;
  readonly preview_revision: string | null;
  readonly pending_command: XArticleBrowserCommandV1 | null;
  readonly submit_delivered: boolean;
  readonly needs_editor_observation: boolean;
}

interface XArticleBrowserAdapterOptions {
  readonly executionId?: () => string;
  readonly eventId?: () => string;
  readonly commandId?: () => string;
  readonly attemptId?: () => string;
  readonly receiptId?: () => string;
  readonly now?: () => Date;
  readonly terminalNotifier?: ResearchTerminalNotifier;
}

export class XArticleBrowserAdapter {
  private readonly executionId: () => string;
  private readonly eventId: () => string;
  private readonly attemptId: () => string;
  private readonly receiptId: () => string;
  private readonly now: () => Date;
  private readonly terminalNotifier: ResearchTerminalNotifier | null;
  private readonly broker: XArticleCommandBroker;
  private readonly materializationStore: XArticleMaterializationStore;

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
    this.terminalNotifier = options.terminalNotifier ?? null;
    this.broker = new XArticleCommandBroker(store, {
      ...(options.commandId === undefined ? {} : { commandId: options.commandId }),
      now: this.now
    });
    this.materializationStore = new XArticleMaterializationStore(store);
  }

  async prepare(
    plan: XArticlePublicationPlanV1,
    capabilities: XArticleBrowserCapabilityManifestV1
  ): Promise<XArticleExecutionSnapshotV1> {
    assertXArticlePublicationPlan(plan);
    this.verifyPreparedCapabilities(plan, capabilities);
    const executionId = this.executionId();
    this.assertId(executionId);
    const snapshot = this.initialSnapshot(executionId, plan);
    const materializationPlan = createXArticleMaterializationPlan({
      execution_id: executionId,
      publication_plan: plan,
      import_template: createXArticleImportTemplate(plan.intent.document),
      strategy: 'rich_text_anchor_import/v1'
    });
    const checkpoint = createInitialXArticleMaterializationCheckpoint({
      plan: materializationPlan,
      updated_at: snapshot.updated_at
    });
    const context: AdapterContext = {
      schema_version: '1.0', plan, approval: null, capabilities,
      execution_mode: 'materialization_v3_2', materialization_plan: materializationPlan,
      import_strategy: 'bulk_document', bulk_import_issued: false, snapshot,
      latest_observation: null, editor_revision: null, preview_revision: null,
      pending_command: null, submit_delivered: false, needs_editor_observation: false
    };
    await this.store.writeNewDirectory(this.prefix(executionId), {
      'plan.json': plan, 'capabilities.json': capabilities, 'adapter-context.json': context
    });
    await this.materializationStore.create(materializationPlan, checkpoint);
    return snapshot;
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
    const snapshot = this.initialSnapshot(executionId, plan);
    const context: AdapterContext = {
      schema_version: '1.0', plan, approval, capabilities,
      execution_mode: 'legacy_preapproved', materialization_plan: null,
      import_strategy: importStrategy, snapshot,
      bulk_import_issued: false,
      latest_observation: null, editor_revision: null, preview_revision: null,
      pending_command: null, submit_delivered: false, needs_editor_observation: false
    };
    await this.store.writeNewDirectory(this.prefix(executionId), {
      'plan.json': plan, 'approval.json': approval, 'capabilities.json': capabilities,
      'adapter-context.json': context
    });
    await notifyTerminalSafely(this.store, this.terminalNotifier, {
      notification_id: `publication_plan_${plan.plan_id}_${executionId}`,
      kind: 'publication_plan_approved', publication_kind: null,
      workspace_relative_path: `${this.prefix(executionId)}/plan.json`, role: 'publication_plan',
      media_type: 'application/json', canonical: true, privacy_classification: 'internal',
      occurred_at: snapshot.updated_at
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
      if (context.execution_mode === 'materialization_v3_2') {
        const checkpoint = await this.materializationStore.readCheckpoint(executionId);
        await this.materializationStore.updateCheckpoint(executionId, checkpoint.revision, (current) => ({
          ...current,
          phase: 'preflight_passed',
          updated_at: this.now().toISOString()
        }));
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
      if (context.execution_mode === 'materialization_v3_2') {
        const checkpoint = await this.materializationStore.readCheckpoint(executionId);
        await this.materializationStore.updateCheckpoint(executionId, checkpoint.revision, (current) => ({
          ...current,
          draft_id: page.draft_id,
          phase: 'article_shell_ready',
          updated_at: this.now().toISOString()
        }));
        context = await this.transition(
          context,
          'materialization_reconciling',
          'article_materialization_reconciling'
        );
        return this.nextMaterializationCommand(context, observation);
      }
      context = await this.transition(context, 'content_filling', 'article_content_filling_started');
      return this.nextEditorCommand(context, observation);
    }

    if (state === 'materialization_reconciling') {
      if (context.needs_editor_observation) return this.issueEditorObservation(context);
      return this.nextMaterializationCommand(context, this.requireObservation(context));
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
      verifyXArticleApproval(context.plan, this.requireApproval(context), this.now());
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
      if (input.observation !== null) {
        const replayPath = `${this.prefix(input.command.execution_id)}/observations/${input.observation.observation_id}.json`;
        if (await this.store.exists(replayPath)) {
          const existing = await this.store.readJson<XArticleBrowserObservation>(replayPath);
          const storedCommand = await this.store.readJson<XArticleBrowserCommandV1>(
            this.commandPath(input.command)
          );
          if (sha256(storedCommand) !== sha256(input.command)) {
            throw new HarnessError('CONTRACT_INVALID', 'replayed X Article command envelope changed');
          }
          if (sha256(existing) === sha256(input.observation)) return context.snapshot;
        }
      }
      throw new HarnessError('COMMAND_REPLAY_REJECTED', 'reported X Article command is not pending');
    }
    if (sha256(context.pending_command) !== sha256(input.command)) {
      throw new HarnessError('CONTRACT_INVALID', 'reported X Article command envelope changed');
    }
    const reconcileUncertainMaterialization = input.observation !== null
      && context.execution_mode === 'materialization_v3_2'
      && this.isMaterializationEffect(input.command)
      && (input.observation.editor !== null || input.observation.preview !== null);
    if (
      input.observation === null
      || (input.status !== 'success' && !reconcileUncertainMaterialization)
    ) {
      context = await this.clearPending(context);
      if (
        context.execution_mode === 'materialization_v3_2'
        && this.isMaterializationEffect(input.command)
      ) {
        context = { ...context, needs_editor_observation: true };
        await this.writeContext(context);
        return context.snapshot;
      }
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
    try {
      this.contract.detectPage(input.observation);
    } catch (error) {
      if (context.execution_mode !== 'materialization_v3_2') throw error;
      context = await this.clearPending(context);
      return (await this.transition(
        context,
        'materialization_blocked',
        'article_materialization_blocked'
      )).snapshot;
    }
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
      needs_editor_observation: false,
      snapshot: {
        ...context.snapshot,
        latest_observation_id: input.observation.observation_id,
        updated_at: this.now().toISOString()
      }
    };
    await this.writeContext(context);
    if (
      context.execution_mode === 'materialization_v3_2'
      && input.observation.editor !== null
      && context.snapshot.draft_id !== null
      && context.snapshot.state === 'materialization_reconciling'
    ) {
      context = await this.reconcileReportedEditor(context, input.observation);
    }
    if (
      context.execution_mode === 'materialization_v3_2'
      && input.observation.preview !== null
      && context.snapshot.state === 'materialization_reconciling'
    ) {
      context = await this.reconcilePreparedPreview(context, input.observation);
    }
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

  async resumeEditor(executionId: string): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    if (context.execution_mode === 'materialization_v3_2') {
      if (
        context.snapshot.state === 'materialization_blocked'
        || context.snapshot.publish_command_count !== 0
        || context.submit_delivered
        || context.snapshot.draft_id === null
      ) {
        throw new HarnessError(
          context.snapshot.state === 'materialization_blocked'
            ? 'ARTICLE_MATERIALIZATION_DRIFT'
            : 'STATE_TRANSITION_INVALID',
          `X Article editor cannot resume from ${context.snapshot.state}`
        );
      }
      const mustObserve = context.pending_command !== null || context.needs_editor_observation;
      if (!mustObserve) {
        if (context.latest_observation === null || context.materialization_plan === null) {
          throw new HarnessError(
            'STATE_TRANSITION_INVALID',
            'X Article editor resume has no durable reconciliation observation'
          );
        }
        const checkpoint = await this.materializationStore.readCheckpoint(executionId);
        const reconciliation = reconcileXArticleDraft({
          plan: context.materialization_plan,
          checkpoint,
          document: context.plan.intent.document,
          observation: context.latest_observation
        });
        if (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable') {
          context = await this.transition(
            context,
            'materialization_blocked',
            'article_materialization_blocked'
          );
          throw new HarnessError(
            'ARTICLE_MATERIALIZATION_DRIFT',
            'saved X Article Draft cannot resume safely',
            reconciliation
          );
        }
      }
      if (context.pending_command !== null) context = await this.clearPending(context);
      context = { ...context, needs_editor_observation: mustObserve };
      if (context.snapshot.state === 'pre_publish_failed') {
        context = await this.transition(
          context,
          'materialization_reconciling',
          'article_materialization_resumed'
        );
      } else if (context.snapshot.state !== 'materialization_reconciling') {
        throw new HarnessError(
          'STATE_TRANSITION_INVALID',
          `X Article editor cannot resume from ${context.snapshot.state}`
        );
      }
      await this.writeContext(context);
      return context.snapshot;
    }
    if (
      context.snapshot.state !== 'pre_publish_failed' ||
      context.snapshot.publish_command_count !== 0 ||
      context.submit_delivered ||
      context.pending_command !== null ||
      context.snapshot.draft_id === null ||
      context.latest_observation === null
    ) {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        `X Article editor cannot resume from ${context.snapshot.state}`
      );
    }
    const account = this.contract.detectAccount(context.latest_observation);
    const page = this.contract.detectPage(context.latest_observation);
    if (
      account.handle !== context.plan.intent.target_account ||
      page.kind !== 'article_editor' ||
      page.draft_id !== context.snapshot.draft_id
    ) {
      throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'saved X Article editor does not match the execution');
    }
    const decision = nextArticleEditorDecision(
      {
        plan: context.plan,
        draft_id: context.snapshot.draft_id,
        import_strategy: context.import_strategy,
        bulk_import_issued: context.bulk_import_issued
      },
      context.latest_observation,
      this.contract
    );
    if (decision.kind === 'blocked') throw new HarnessError(decision.code, decision.message);
    context = await this.transition(context, 'content_filling', 'article_editor_failure_resumed');
    return context.snapshot;
  }

  async refreshApproval(
    executionId: string,
    approval: XArticleApprovalV1
  ): Promise<XArticleExecutionSnapshotV1> {
    let context = await this.readContext(executionId);
    if (
      context.snapshot.publish_command_count !== 0 ||
      context.submit_delivered ||
      ['publish_attempted', 'outcome_resolving', 'public_verifying', 'finalized',
        'published_unverified', 'outcome_unknown', 'verification_conflict',
        'failed_after_publish', 'cancelled_before_publish'].includes(context.snapshot.state)
    ) {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'X Article Approval cannot refresh after Publish');
    }
    verifyXArticleApproval(context.plan, approval, this.now());
    this.assertId(approval.approval_id);
    const approvalPath = `${this.prefix(executionId)}/approval-refreshes/${approval.approval_id}.json`;
    if (await this.store.exists(approvalPath)) {
      const existing = await this.store.readJson<XArticleApprovalV1>(approvalPath);
      if (sha256(existing) !== sha256(approval)) {
        throw new HarnessError('ARTIFACT_EXISTS', 'X Article Approval refresh identity is already used');
      }
    } else {
      await this.store.writeNew(approvalPath, approval);
    }
    context = {
      ...context,
      approval,
      snapshot: { ...context.snapshot, updated_at: this.now().toISOString() }
    };
    await this.writeContext(context);
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
    await notifyTerminalSafely(this.store, this.terminalNotifier, {
      notification_id: `publication_receipt_${receipt.receipt_id}`,
      kind: 'publication_receipt_terminal', publication_kind: 'x_article',
      workspace_relative_path: receiptPath, role: 'publication_receipt', media_type: 'application/json',
      canonical: true, privacy_classification: 'internal', occurred_at: receipt.issued_at
    });
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

  private async nextMaterializationCommand(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 | null }> {
    if (context.materialization_plan === null || context.snapshot.draft_id === null) {
      throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared materialization context is incomplete');
    }
    const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
    const reconciliation = reconcileXArticleDraft({
      plan: context.materialization_plan,
      checkpoint,
      document: context.plan.intent.document,
      observation
    });
    if (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable') {
      context = await this.transition(context, 'materialization_blocked', 'article_materialization_blocked');
      return { snapshot: context.snapshot, command: null };
    }
    const decision = nextMaterializationEditorDecision({
      plan: context.plan,
      materialization_plan: context.materialization_plan,
      draft_id: context.snapshot.draft_id
    }, observation, reconciliation, this.contract);
    if (decision.kind === 'blocked') {
      context = await this.transition(context, 'materialization_blocked', 'article_materialization_blocked');
      return { snapshot: context.snapshot, command: null };
    }
    if (decision.kind === 'complete') return { snapshot: context.snapshot, command: null };
    if (decision.input.kind === 'import_article_document') {
      await this.materializationStore.updateCheckpoint(
        context.snapshot.execution_id,
        checkpoint.revision,
        (current) => ({
          ...current,
          body: { status: 'issued', observed_digest: null },
          updated_at: this.now().toISOString()
        })
      );
    }
    return this.issue(context, decision.input);
  }

  private async reconcileReportedEditor(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<AdapterContext> {
    if (context.materialization_plan === null || observation.editor === null) return context;
    const plan = context.materialization_plan;
    const revisionInput = Object.fromEntries(
      Object.entries(observation).filter(([key]) => key !== 'page_revision')
    );
    const identityInvalid = observation.page_revision !== computeXArticlePageRevision(revisionInput)
      || observation.execution_id !== context.snapshot.execution_id
      || observation.account_handle !== plan.target_account
      || observation.page_kind !== 'article_editor'
      || observation.editor.draft_id !== context.snapshot.draft_id;
    if (identityInvalid) {
      return this.transition(context, 'materialization_blocked', 'article_materialization_blocked');
    }
    const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
    const bodyObserved = observation.editor.title.length > 0 || observation.editor.blocks.length > 0;
    const template = createXArticleImportTemplate(context.plan.intent.document);
    const importState = observation.editor.import_state;
    const completedCount = importState === null
      ? plan.visual_anchors.length
      : sha256(importState.unresolved_anchors) === sha256(
          template.anchors.slice(template.anchors.length - importState.unresolved_anchors.length)
        )
        ? template.anchors.length - importState.unresolved_anchors.length
        : checkpoint.media.filter((media) => media.status === 'completed').length;
    const inlineVisuals = observation.editor.visuals.filter((visual) => visual.kind === 'inline');
    const media = checkpoint.media.map((entry, index) => {
      if (index >= completedCount) return entry;
      const anchor = plan.visual_anchors[index]!;
      const visual = inlineVisuals.find((candidate) =>
        candidate.asset_id === anchor.asset_id
        && candidate.block_ordinal === anchor.block_ordinal
      );
      if (
        visual === undefined
        || visual.ref.length === 0
        || visual.status !== 'uploaded'
        || !visual.owned_by_execution
        || visual.alt_text !== anchor.alt_text
      ) return entry;
      return {
        ...entry,
        status: 'completed' as const,
        observed_media_ref: visual.ref,
        observed_context_digest: anchor.context_digest
      };
    });
    const finalEditor = importState === null
      && (bodyObserved || checkpoint.body.status === 'verified')
      && media.every((entry) => entry.status === 'completed');
    const phase = finalEditor
      ? 'draft_reconciled'
      : media.some((entry) => entry.status === 'completed')
        ? 'media_materializing'
        : 'body_imported';
    const updated = await this.materializationStore.updateCheckpoint(
      context.snapshot.execution_id,
      checkpoint.revision,
      (current) => ({
        ...current,
        phase,
        body: bodyObserved
          ? { status: 'verified', observed_digest: plan.import_template_digest }
          : current.body,
        media,
        last_editor_revision: observation.page_revision,
        updated_at: this.now().toISOString()
      })
    );
    const reconciliation = reconcileXArticleDraft({
      plan,
      checkpoint: updated,
      document: context.plan.intent.document,
      observation
    });
    if (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable') {
      return this.transition(context, 'materialization_blocked', 'article_materialization_blocked');
    }
    return context;
  }

  private async reconcilePreparedPreview(
    context: AdapterContext,
    observation: XArticleBrowserObservation
  ): Promise<AdapterContext> {
    const preview = observation.preview;
    if (
      preview === null
      || context.materialization_plan === null
      || context.snapshot.draft_id === null
    ) return context;
    const expected = context.plan.intent.document;
    const actual = {
      schema_version: '1.0' as const,
      title: preview.title,
      cover_asset_id: preview.visuals.find((visual) => visual.kind === 'cover')?.asset_id ?? null,
      blocks: preview.blocks
    };
    const expectedVisuals = context.plan.intent.visuals.map((binding) => ({
      asset_id: binding.asset.asset_id,
      kind: binding.placement.kind === 'cover' ? 'cover' as const : 'inline' as const,
      block_ordinal: binding.placement.kind === 'cover' ? null : binding.placement.block_ordinal,
      alt_text: binding.placement.kind === 'cover'
        && this.contract.media_alt_capabilities.cover === 'unobservable'
        ? null
        : binding.asset.alt_text
    }));
    const observedVisuals = preview.visuals.map((visual) => ({
      asset_id: visual.asset_id,
      kind: visual.kind,
      block_ordinal: visual.block_ordinal,
      alt_text: visual.alt_text
    }));
    if (
      preview.draft_id !== context.snapshot.draft_id
      || sha256(actual) !== sha256(expected)
      || sha256(observedVisuals) !== sha256(expectedVisuals)
    ) {
      return this.transition(context, 'materialization_blocked', 'article_materialization_blocked');
    }
    const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
    await this.materializationStore.updateCheckpoint(
      context.snapshot.execution_id,
      checkpoint.revision,
      (current) => ({
        ...current,
        phase: 'preview_verified',
        updated_at: this.now().toISOString()
      })
    );
    return this.transition(
      context,
      'confirmation_pending',
      'article_materialization_confirmation_pending'
    );
  }

  private issueEditorObservation(
    context: AdapterContext
  ): Promise<{ readonly snapshot: XArticleExecutionSnapshotV1; readonly command: XArticleBrowserCommandV1 }> {
    return this.issue(context, {
      execution_id: context.snapshot.execution_id,
      run_id: context.plan.run_id,
      draft_id: context.snapshot.draft_id,
      kind: 'observe_article_page',
      purpose: 'reconcile_article_editor',
      expected_page_revision: context.latest_observation?.page_revision ?? null,
      allowed_origin: 'https://x.com', side_effect: 'read',
      payload: { kind: 'observe_article_page', scope: 'editor' }
    });
  }

  private isMaterializationEffect(command: XArticleBrowserCommandV1): boolean {
    return command.kind === 'import_article_document'
      || command.kind === 'replace_article_visual_anchor'
      || command.kind === 'upload_article_cover'
      || command.kind === 'open_article_preview';
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
      needs_editor_observation: context.needs_editor_observation
        || (context.execution_mode === 'materialization_v3_2' && this.isMaterializationEffect(command)),
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
    const coverAltRequired =
      this.contract.media_alt_capabilities.cover === 'editable' &&
      plan.intent.visuals.some((visual) => visual.placement.kind === 'cover');
    const inlineAltRequired =
      this.contract.media_alt_capabilities.inline === 'editable' &&
      plan.intent.visuals.some((visual) => visual.placement.kind === 'block');
    if (coverAltRequired || inlineAltRequired) required.push('set_article_image_alt');
    if (
      manifest.executor !== 'codex-chrome' || manifest.browser_family !== 'chrome' ||
      required.some((capability) => !manifest.capabilities.includes(capability))
    ) {
      throw new HarnessError('BROWSER_EXECUTOR_INCOMPATIBLE', 'Chrome Host lacks required X Article capabilities');
    }
    return hasDocumentImport ? 'bulk_document' : 'incremental_blocks';
  }

  private verifyPreparedCapabilities(
    plan: XArticlePublicationPlanV1,
    manifest: XArticleBrowserCapabilityManifestV1
  ): void {
    if (
      !manifest.capabilities.includes('import_article_document')
      || !manifest.capabilities.includes('replace_article_visual_anchor')
    ) {
      throw new HarnessError(
        'ARTICLE_BULK_IMPORT_REQUIRED',
        'prepared X Article materialization requires the complete bulk-import capability set'
      );
    }
    const required: XArticleBrowserCommandKind[] = [
      'observe_article_page', 'create_article_draft', 'open_article_preview'
    ];
    if (plan.intent.visuals.some((visual) => visual.placement.kind === 'cover')) {
      required.push('upload_article_cover');
    }
    if (
      manifest.executor !== 'codex-chrome'
      || manifest.browser_family !== 'chrome'
      || required.some((capability) => !manifest.capabilities.includes(capability))
    ) {
      throw new HarnessError(
        'ARTICLE_MATERIALIZATION_CAPABILITY_MISMATCH',
        'Chrome Host lacks a required prepared X Article materialization capability'
      );
    }
  }

  private initialSnapshot(
    executionId: string,
    plan: XArticlePublicationPlanV1
  ): XArticleExecutionSnapshotV1 {
    return {
      schema_version: '1.0', execution_id: executionId, run_id: plan.run_id,
      plan_id: plan.plan_id, state: 'created', sequence: 0, draft_id: null,
      attempt_id: null, publish_command_count: 0, latest_command_id: null,
      latest_observation_id: null, latest_receipt_path: null, updated_at: this.now().toISOString()
    };
  }

  private requireApproval(context: AdapterContext): XArticleApprovalV1 {
    if (context.approval === null) {
      throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article Publish requires explicit approval');
    }
    return context.approval;
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

  private commandPath(command: Pick<XArticleBrowserCommandV1, 'execution_id' | 'command_id'>): string {
    this.assertId(command.command_id);
    return `${this.prefix(command.execution_id)}/commands/${command.command_id}/command.json`;
  }

  private assertId(id: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new HarnessError('WORKSPACE_PATH_INVALID', 'unsafe X Article execution identity');
  }
}
