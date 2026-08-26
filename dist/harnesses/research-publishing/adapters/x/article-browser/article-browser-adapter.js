import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { notifyTerminalSafely } from '../../../core/research-terminal-hooks.js';
import { createXArticleExecutionEvent, transitionXArticleExecution } from '../../../core/x-article-execution.js';
import { verifyXArticleApproval } from '../../../core/x-article-approval.js';
import { verifyXArticlePublishConfirmation } from '../../../core/x-article-publish-confirmation.js';
import { assertXArticlePublicationPlan } from '../../../core/x-article-publication-plan.js';
import { createInitialXArticleMaterializationCheckpoint, createXArticleMaterializationPlan } from '../../../core/x-article-materialization.js';
import { XArticleMaterializationStore } from '../../../core/x-article-materialization-store.js';
import { computeXArticlePageRevision } from './article-browser-protocol.js';
import { reconcileXArticleDraft } from './article-draft-reconciler.js';
import { verifyPublicXArticle } from './article-public-verifier.js';
import { createXArticleReceipt } from './article-receipt.js';
import { XArticleCommandBroker } from './article-command-broker.js';
import { nextMaterializationEditorDecision, nextArticleEditorDecision } from './article-editor-protocol.js';
import { createXArticleImportTemplate } from './article-import-template.js';
export class XArticleBrowserAdapter {
    store;
    contract;
    executionId;
    eventId;
    commandId;
    attemptId;
    receiptId;
    now;
    terminalNotifier;
    broker;
    materializationStore;
    constructor(store, contract, options = {}) {
        this.store = store;
        this.contract = contract;
        this.executionId = options.executionId ?? (() => `x_article_execution_${randomUUID()}`);
        this.eventId = options.eventId ?? (() => `x_article_event_${randomUUID()}`);
        this.commandId = options.commandId ?? (() => `x_article_command_${randomUUID()}`);
        this.attemptId = options.attemptId ?? (() => `x_article_attempt_${randomUUID()}`);
        this.receiptId = options.receiptId ?? (() => `x_article_receipt_${randomUUID()}`);
        this.now = options.now ?? (() => new Date());
        this.terminalNotifier = options.terminalNotifier ?? null;
        this.broker = new XArticleCommandBroker(store, { now: this.now });
        this.materializationStore = new XArticleMaterializationStore(store);
    }
    async prepare(plan, capabilities) {
        assertXArticlePublicationPlan(plan);
        this.verifyPreparedCapabilities(plan, capabilities);
        const executionId = this.executionId();
        this.assertId(executionId);
        return this.withExecutionLock(executionId, () => this.prepareLocked(plan, capabilities, executionId));
    }
    async prepareLocked(plan, capabilities, executionId) {
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
        const context = {
            schema_version: '1.0', plan, approval: null, capabilities,
            execution_mode: 'materialization_v3_2', materialization_plan: materializationPlan,
            import_strategy: 'bulk_document', bulk_import_issued: false, snapshot,
            latest_observation: null, editor_revision: null, preview_revision: null,
            latest_editor_observation_id: null, latest_preview_observation_id: null,
            pending_command: null, pending_issue: null, last_projected_report: null,
            submit_delivered: false, needs_editor_observation: false
        };
        const materializationPlanPath = `${this.prefix(executionId)}/materialization-plan.json`;
        const checkpointPath = `${this.prefix(executionId)}/materialization-checkpoint.json`;
        const materializationExists = await this.store.exists(materializationPlanPath);
        const checkpointExists = await this.store.exists(checkpointPath);
        if (materializationExists && checkpointExists) {
            const persistedPlan = await this.materializationStore.readPlan(executionId);
            const persistedCheckpoint = await this.materializationStore.readCheckpoint(executionId);
            if (!isDeepStrictEqual(persistedPlan, materializationPlan)
                || persistedCheckpoint.materialization_digest !== materializationPlan.materialization_digest) {
                throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared X Article materialization retry differs from durable state');
            }
        }
        else {
            await this.materializationStore.create(materializationPlan, checkpoint);
        }
        await this.ensureExactArtifact(`${this.prefix(executionId)}/plan.json`, plan);
        await this.ensureExactArtifact(`${this.prefix(executionId)}/capabilities.json`, capabilities);
        const contextPath = `${this.prefix(executionId)}/adapter-context.json`;
        if (await this.store.exists(contextPath)) {
            const existing = await this.readContext(executionId);
            if (existing.execution_mode !== 'materialization_v3_2'
                || !isDeepStrictEqual(existing.plan, plan)
                || !isDeepStrictEqual(existing.capabilities, capabilities)
                || !isDeepStrictEqual(existing.materialization_plan, materializationPlan)) {
                throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared X Article adapter retry differs from durable state');
            }
            return existing.snapshot;
        }
        await this.store.writeNew(contextPath, context);
        return snapshot;
    }
    async start(plan, approval, capabilities) {
        assertXArticlePublicationPlan(plan);
        verifyXArticleApproval(plan, approval, this.now());
        const importStrategy = this.verifyCapabilities(plan, capabilities);
        const executionId = this.executionId();
        this.assertId(executionId);
        const snapshot = this.initialSnapshot(executionId, plan);
        const context = {
            schema_version: '1.0', plan, approval, capabilities,
            execution_mode: 'legacy_preapproved', materialization_plan: null,
            import_strategy: importStrategy, snapshot,
            bulk_import_issued: false,
            latest_observation: null, editor_revision: null, preview_revision: null,
            latest_editor_observation_id: null, latest_preview_observation_id: null,
            pending_command: null, pending_issue: null, last_projected_report: null,
            submit_delivered: false, needs_editor_observation: false
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
    async next(executionId) {
        return this.withExecutionLock(executionId, () => this.nextLocked(executionId));
    }
    async nextLocked(executionId) {
        let context = await this.readContext(executionId);
        if (context.snapshot.state === 'cancelled_before_publish') {
            return { snapshot: context.snapshot, command: null };
        }
        if (context.pending_issue !== null && context.pending_command === null) {
            return this.finishPendingIssue(context);
        }
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
                context = await this.transition(context, 'materialization_reconciling', 'article_materialization_reconciling');
                return this.nextMaterializationCommand(context, observation);
            }
            context = await this.transition(context, 'content_filling', 'article_content_filling_started');
            return this.nextEditorCommand(context, observation);
        }
        if (state === 'materialization_reconciling') {
            if (context.needs_editor_observation)
                return this.issueEditorObservation(context);
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
        if (state === 'publish_armed' && context.execution_mode === 'materialization_v3_2') {
            await this.verifyStoredPublishConfirmation(context, ['armed']);
            const observation = this.requireObservation(context);
            if (observation.preview !== null) {
                return this.issue(context, {
                    execution_id: executionId, run_id: context.plan.run_id,
                    draft_id: context.snapshot.draft_id,
                    kind: 'open_publish_review', purpose: 'open_publish_review',
                    expected_page_revision: observation.page_revision,
                    allowed_origin: 'https://x.com', side_effect: 'write',
                    payload: {
                        kind: 'open_publish_review',
                        target_ref: this.contract.detectControl(observation, 'publish').ref
                    }
                });
            }
            const review = await this.assertPreparedPublishReview(context, observation);
            return this.issue(context, {
                execution_id: executionId, run_id: context.plan.run_id,
                draft_id: context.snapshot.draft_id,
                kind: 'publish_article_once', purpose: 'publish_article_once',
                expected_page_revision: observation.page_revision,
                allowed_origin: 'https://x.com', side_effect: 'submit',
                payload: { kind: 'publish_article_once', target_ref: review.final_publish_ref }
            }, `publish_${executionId}`);
        }
        if (state === 'preview_verified' || (state === 'publish_armed' && context.execution_mode === 'legacy_preapproved')) {
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
    async claim(command) {
        const detachedCommand = structuredClone(command);
        return this.withExecutionLock(detachedCommand.execution_id, () => this.claimLocked(detachedCommand));
    }
    async claimLocked(command) {
        let context = await this.readContext(command.execution_id);
        this.assertClaimLifecycleActive(context);
        if (context.pending_command === null
            && context.pending_issue?.command_id === command.command_id) {
            context = await this.recoverBrokerPersistedCommand(context, command);
        }
        this.assertPendingClaimIdentity(context, command);
        if (command.kind === 'publish_article_once'
            && command.side_effect === 'submit'
            && context.execution_mode === 'materialization_v3_2') {
            return this.claimPreparedPublish(context, command);
        }
        return this.broker.claim(command);
    }
    assertClaimLifecycleActive(context) {
        if (context.snapshot.state === 'cancelled_before_publish'
            || context.snapshot.state === 'finalized'
            || context.snapshot.state === 'verification_conflict'
            || context.snapshot.state === 'failed_after_publish') {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', `X Article command cannot be claimed from terminal state ${context.snapshot.state}`);
        }
    }
    assertPendingClaimIdentity(context, command) {
        const intent = context.pending_issue;
        const stableCommandInput = Object.fromEntries(Object.entries(command).filter(([key]) => !['schema_version', 'command_id', 'payload_digest', 'issued_at'].includes(key)));
        if (context.pending_command === null
            || intent === null
            || command.execution_id !== context.snapshot.execution_id
            || context.snapshot.latest_command_id !== command.command_id
            || intent.command_id !== command.command_id
            || intent.input.execution_id !== context.snapshot.execution_id
            || intent.input_digest !== sha256(intent.input)
            || intent.input_digest !== sha256(stableCommandInput)
            || sha256(context.pending_command) !== sha256(command)) {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'X Article claim does not match the current durable pending command issue');
        }
    }
    async report(input) {
        return this.withExecutionLock(input.command.execution_id, () => this.reportLocked(input));
    }
    async reportLocked(input) {
        let context = await this.readContext(input.command.execution_id);
        const reportDigest = sha256(input);
        const reportPath = `${this.prefix(input.command.execution_id)}/reports/${input.command.command_id}.json`;
        const projectionPath = this.reportProjectionPath(input.command);
        if (await this.store.exists(projectionPath)) {
            const projection = await this.store.readJson(projectionPath);
            if (projection.execution_id !== input.command.execution_id
                || projection.command_id !== input.command.command_id
                || projection.report_digest !== reportDigest) {
                throw new HarnessError('CONTRACT_INVALID', 'replayed X Article report projection changed');
            }
            const persistedReport = await this.store.readJson(reportPath);
            if (sha256(persistedReport) !== reportDigest) {
                throw new HarnessError('CONTRACT_INVALID', 'replayed X Article report artifact changed');
            }
            if (context.pending_command?.command_id === input.command.command_id
                || context.pending_issue?.command_id === input.command.command_id) {
                context = await this.finalizeProjectedReport(context, input.command.command_id, reportDigest);
            }
            return context.snapshot;
        }
        if (context.snapshot.state === 'cancelled_before_publish') {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'cancelled X Article execution does not accept reports');
        }
        if (context.pending_command === null
            && context.pending_issue?.command_id === input.command.command_id) {
            context = await this.recoverBrokerPersistedCommand(context, input.command);
        }
        if (context.pending_command?.command_id !== input.command.command_id) {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'reported X Article command is not pending');
        }
        if (sha256(context.pending_command) !== sha256(input.command)) {
            if (this.isPreparedReportActive(context)) {
                const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
                context = await this.blockMaterialization(context, checkpoint, {
                    kind: 'unverifiable', reasons: ['reported command envelope changed']
                });
                return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
            }
            throw new HarnessError('CONTRACT_INVALID', 'reported X Article command envelope changed');
        }
        await this.ensureExactArtifact(reportPath, input);
        if (this.isPreparedReportActive(context)
            && (input.observation === null && input.status === 'success')) {
            const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
            context = await this.blockMaterialization(context, checkpoint, {
                kind: 'unverifiable', reasons: ['successful report has no browser observation']
            });
            return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
        }
        const reconcileUncertainMaterialization = input.observation !== null
            && context.execution_mode === 'materialization_v3_2'
            && this.isMaterializationEffect(input.command)
            && (input.observation.editor !== null || input.observation.preview !== null);
        if (input.observation === null
            || (input.status !== 'success' && !reconcileUncertainMaterialization)) {
            if (context.execution_mode === 'materialization_v3_2'
                && this.isMaterializationEffect(input.command)) {
                context = { ...context, needs_editor_observation: true };
                await this.writeContext(context);
                return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
            }
            if (input.command.kind === 'create_article_draft' && input.status === 'uncertain') {
                context = await this.transition(context, 'draft_identity_unknown', 'article_draft_identity_unknown');
                return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
            }
            if (input.command.kind === 'publish_article_once') {
                context = await this.transition(context, 'outcome_resolving', 'article_publish_outcome_resolving');
                context = await this.transition(context, 'outcome_unknown', 'article_publish_outcome_unknown');
                return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
            }
            context = await this.transition(context, 'pre_publish_failed', 'article_browser_command_failed');
            return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
        }
        if (input.observation.execution_id !== input.command.execution_id ||
            input.observation.command_id !== input.command.command_id) {
            if (this.isPreparedReportActive(context)) {
                const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
                context = await this.blockMaterialization(context, checkpoint, {
                    kind: 'unverifiable', reasons: ['reported observation identity is foreign']
                });
                return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
            }
            throw new HarnessError('CONTRACT_INVALID', 'X Article observation does not belong to its command');
        }
        try {
            this.contract.detectPage(input.observation);
        }
        catch (error) {
            if (context.execution_mode !== 'materialization_v3_2')
                throw error;
            const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
            context = await this.blockMaterialization(context, checkpoint, {
                kind: 'unverifiable', reasons: ['reported page contract is malformed']
            });
            return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
        }
        await this.ensureExactArtifact(`${this.prefix(input.command.execution_id)}/observations/${input.observation.observation_id}.json`, input.observation);
        context = {
            ...context,
            latest_observation: input.observation,
            editor_revision: input.observation.editor === null
                ? context.editor_revision
                : input.observation.page_revision,
            latest_editor_observation_id: input.observation.editor === null
                ? context.latest_editor_observation_id
                : input.observation.observation_id,
            latest_preview_observation_id: input.observation.preview === null
                ? context.latest_preview_observation_id
                : input.observation.observation_id,
            preview_revision: input.observation.preview === null
                ? context.preview_revision
                : input.observation.page_revision,
            needs_editor_observation: false,
            snapshot: {
                ...context.snapshot,
                latest_observation_id: input.observation.observation_id,
                updated_at: this.now().toISOString()
            }
        };
        await this.writeContext(context);
        if (context.execution_mode === 'materialization_v3_2'
            && input.observation.editor !== null
            && context.snapshot.draft_id !== null
            && context.snapshot.state === 'materialization_reconciling') {
            context = await this.reconcileReportedEditor(context, input.observation);
        }
        if (context.execution_mode === 'materialization_v3_2'
            && input.observation.preview !== null
            && context.snapshot.state === 'materialization_reconciling') {
            context = await this.reconcilePreparedPreview(context, input.observation);
        }
        return (await this.finalizeProjectedReport(context, input.command.command_id, reportDigest)).snapshot;
    }
    async status(executionId) {
        return (await this.readContext(executionId)).snapshot;
    }
    async confirmPublish(executionId, confirmation) {
        const detachedConfirmation = structuredClone(confirmation);
        return this.withExecutionLock(executionId, () => this.confirmPublishLocked(executionId, detachedConfirmation));
    }
    async confirmPublishLocked(executionId, confirmation) {
        let context = await this.readContext(executionId);
        if (context.execution_mode !== 'materialization_v3_2'
            || (context.snapshot.state !== 'confirmation_pending'
                && context.snapshot.state !== 'publish_armed')
            || context.snapshot.draft_id === null
            || context.snapshot.publish_command_count !== 0
            || context.submit_delivered
            || context.pending_command !== null
            || context.pending_issue !== null) {
            throw new HarnessError('STATE_TRANSITION_INVALID', `X Article Publish cannot be confirmed from ${context.snapshot.state}`);
        }
        const evidence = await this.assertPreparedConfirmationEvidence(context, context.snapshot.state === 'confirmation_pending'
            ? ['absent', 'armed']
            : ['armed']);
        if (context.snapshot.state === 'confirmation_pending'
            && (context.snapshot.latest_observation_id !== evidence.preview.observation_id
                || context.latest_observation === null
                || context.latest_observation.observation_id !== evidence.preview.observation_id
                || sha256(context.latest_observation) !== sha256(evidence.preview))) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article confirmation must bind the latest durable verified Preview');
        }
        if (context.snapshot.state === 'confirmation_pending'
            && !((evidence.checkpoint.publish_confirmation === 'absent'
                && evidence.checkpoint.phase === 'preview_verified')
                || (evidence.checkpoint.publish_confirmation === 'armed'
                    && evidence.checkpoint.phase === 'human_confirmed'))) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article confirmation checkpoint is not at the verified Preview boundary');
        }
        verifyXArticlePublishConfirmation(confirmation, {
            execution_id: executionId,
            draft_id: context.snapshot.draft_id,
            target_account: context.plan.intent.target_account,
            audience: 'everyone',
            plan_digest: context.plan.plan_digest,
            document_digest: evidence.materializationPlan.document_digest,
            preview_revision: evidence.preview.page_revision,
            asset_digests: context.plan.intent.visuals.map((item) => item.asset.digest),
            confirmed_at_not_before: evidence.preview.observed_at,
            confirmed_at_not_after: this.now().toISOString()
        });
        const confirmationPath = this.publishConfirmationPath(executionId);
        if (evidence.checkpoint.publish_confirmation === 'absent') {
            await this.ensureExactArtifact(confirmationPath, confirmation);
        }
        else {
            let existing;
            try {
                existing = await this.store.readJson(confirmationPath);
            }
            catch (error) {
                throw new HarnessError('PUBLISH_GATE_BLOCKED', 'armed X Article Publish confirmation artifact is missing or unreadable', error);
            }
            if (!isDeepStrictEqual(existing, confirmation)) {
                throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'armed X Article Publish confirmation differs on retry');
            }
        }
        if (evidence.checkpoint.publish_confirmation === 'absent') {
            await this.materializationStore.updateCheckpoint(executionId, evidence.checkpoint.revision, (current) => {
                if (current.phase !== 'preview_verified' || current.publish_confirmation !== 'absent') {
                    throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'X Article confirmation checkpoint changed before arming');
                }
                return {
                    ...current,
                    phase: 'human_confirmed',
                    publish_confirmation: 'armed',
                    updated_at: confirmation.confirmed_at
                };
            });
        }
        if (context.snapshot.state === 'publish_armed')
            return context.snapshot;
        context = await this.transition(context, 'publish_armed', 'article_publish_confirmed', {
            attempt_id: this.attemptId()
        });
        return context.snapshot;
    }
    async resumeVerification(executionId) {
        let context = await this.readContext(executionId);
        if (context.snapshot.state !== 'outcome_unknown' && context.snapshot.state !== 'published_unverified') {
            throw new HarnessError('STATE_TRANSITION_INVALID', `X Article verification cannot resume from ${context.snapshot.state}`);
        }
        context = await this.transition(context, 'public_verifying', 'article_public_verification_resumed');
        return context.snapshot;
    }
    async resumeEditor(executionId) {
        return this.withExecutionLock(executionId, () => this.resumeEditorLocked(executionId));
    }
    async resumeEditorLocked(executionId) {
        let context = await this.readContext(executionId);
        if (context.execution_mode === 'materialization_v3_2') {
            const materializationPlan = await this.readBoundMaterializationPlan(context);
            const checkpoint = await this.materializationStore.readCheckpoint(executionId);
            if (checkpoint.execution_id !== executionId
                || checkpoint.materialization_digest !== materializationPlan.materialization_digest
                || checkpoint.draft_id !== context.snapshot.draft_id
                || checkpoint.publish_confirmation !== 'absent'
                || (context.pending_command !== null && context.pending_issue === null)
                || (context.pending_issue !== null && (context.pending_issue.input.execution_id !== executionId
                    || context.pending_issue.input_digest !== sha256(context.pending_issue.input)
                    || (context.pending_command !== null
                        && context.pending_command.command_id !== context.pending_issue.command_id)))) {
                throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'saved X Article editor lifecycle is not bound to durable materialization state');
            }
            if (context.snapshot.state === 'materialization_blocked'
                || context.snapshot.publish_command_count !== 0
                || context.submit_delivered
                || context.snapshot.draft_id === null) {
                throw new HarnessError(context.snapshot.state === 'materialization_blocked'
                    ? 'ARTICLE_MATERIALIZATION_DRIFT'
                    : 'STATE_TRANSITION_INVALID', `X Article editor cannot resume from ${context.snapshot.state}`);
            }
            let durableEditor = null;
            if (context.latest_editor_observation_id !== null) {
                durableEditor = await this.store.readJson(`${this.prefix(executionId)}/observations/${context.latest_editor_observation_id}.json`);
                const revisionBody = Object.fromEntries(Object.entries(durableEditor).filter(([key]) => key !== 'page_revision'));
                if (durableEditor.page_revision !== computeXArticlePageRevision(revisionBody)
                    || durableEditor.execution_id !== executionId
                    || durableEditor.account_handle !== materializationPlan.target_account
                    || durableEditor.page_kind !== 'article_editor'
                    || durableEditor.editor?.draft_id !== checkpoint.draft_id
                    || (context.latest_observation?.editor !== null
                        && context.latest_observation !== null
                        && sha256(context.latest_observation) !== sha256(durableEditor))
                    || (checkpoint.last_editor_revision !== null
                        && durableEditor.page_revision !== checkpoint.last_editor_revision)) {
                    context = await this.blockMaterialization(context, checkpoint, {
                        kind: 'unverifiable', reasons: ['saved editor observation is foreign or stale']
                    });
                    throw new HarnessError('ARTICLE_MATERIALIZATION_DRIFT', 'saved X Article editor observation is foreign or stale');
                }
            }
            const mustObserve = context.pending_issue !== null || context.needs_editor_observation;
            if (!mustObserve) {
                if (durableEditor === null) {
                    throw new HarnessError('STATE_TRANSITION_INVALID', 'X Article editor resume has no durable reconciliation observation');
                }
                const reconciliation = reconcileXArticleDraft({
                    plan: materializationPlan,
                    checkpoint,
                    document: context.plan.intent.document,
                    observation: durableEditor
                });
                if ((reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable')
                    && !this.isOnlyMissingCover(reconciliation)) {
                    context = await this.blockMaterialization(context, checkpoint, reconciliation);
                    throw new HarnessError('ARTICLE_MATERIALIZATION_DRIFT', 'saved X Article Draft cannot resume safely', reconciliation);
                }
            }
            if (context.pending_command !== null
                && context.pending_command.kind !== 'observe_article_page')
                context = await this.clearPending(context);
            context = { ...context, needs_editor_observation: mustObserve };
            if (context.snapshot.state === 'pre_publish_failed') {
                context = await this.transition(context, 'materialization_reconciling', 'article_materialization_resumed');
            }
            else if (context.snapshot.state !== 'materialization_reconciling') {
                throw new HarnessError('STATE_TRANSITION_INVALID', `X Article editor cannot resume from ${context.snapshot.state}`);
            }
            await this.writeContext(context);
            return context.snapshot;
        }
        if (context.snapshot.state !== 'pre_publish_failed' ||
            context.snapshot.publish_command_count !== 0 ||
            context.submit_delivered ||
            context.pending_command !== null ||
            context.snapshot.draft_id === null ||
            context.latest_observation === null) {
            throw new HarnessError('STATE_TRANSITION_INVALID', `X Article editor cannot resume from ${context.snapshot.state}`);
        }
        const account = this.contract.detectAccount(context.latest_observation);
        const page = this.contract.detectPage(context.latest_observation);
        if (account.handle !== context.plan.intent.target_account ||
            page.kind !== 'article_editor' ||
            page.draft_id !== context.snapshot.draft_id) {
            throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'saved X Article editor does not match the execution');
        }
        const decision = nextArticleEditorDecision({
            plan: context.plan,
            draft_id: context.snapshot.draft_id,
            import_strategy: context.import_strategy,
            bulk_import_issued: context.bulk_import_issued
        }, context.latest_observation, this.contract);
        if (decision.kind === 'blocked')
            throw new HarnessError(decision.code, decision.message);
        context = await this.transition(context, 'content_filling', 'article_editor_failure_resumed');
        return context.snapshot;
    }
    async refreshApproval(executionId, approval) {
        let context = await this.readContext(executionId);
        if (context.execution_mode === 'materialization_v3_2') {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'prepared X Article materialization cannot reuse legacy Approval refresh');
        }
        if (context.snapshot.publish_command_count !== 0 ||
            context.submit_delivered ||
            ['publish_attempted', 'outcome_resolving', 'public_verifying', 'finalized',
                'published_unverified', 'outcome_unknown', 'verification_conflict',
                'failed_after_publish', 'cancelled_before_publish'].includes(context.snapshot.state)) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'X Article Approval cannot refresh after Publish');
        }
        verifyXArticleApproval(context.plan, approval, this.now());
        this.assertId(approval.approval_id);
        const approvalPath = `${this.prefix(executionId)}/approval-refreshes/${approval.approval_id}.json`;
        if (await this.store.exists(approvalPath)) {
            const existing = await this.store.readJson(approvalPath);
            if (sha256(existing) !== sha256(approval)) {
                throw new HarnessError('ARTIFACT_EXISTS', 'X Article Approval refresh identity is already used');
            }
        }
        else {
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
    async cancelBeforePublish(executionId) {
        return this.withExecutionLock(executionId, () => this.cancelBeforePublishLocked(executionId));
    }
    async cancelBeforePublishLocked(executionId) {
        let context = await this.readContext(executionId);
        const confirmationConsumed = context.execution_mode === 'materialization_v3_2'
            && (await this.store.exists(this.publishConfirmationConsumptionPath(executionId))
                || (await this.materializationStore.readCheckpoint(executionId)).publish_confirmation === 'consumed');
        if (context.snapshot.publish_command_count > 0
            || context.snapshot.state === 'publish_attempted'
            || confirmationConsumed) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'X Article execution cannot be cancelled after Publish');
        }
        if (context.pending_command !== null || context.pending_issue !== null) {
            context = await this.clearPending(context);
        }
        context = await this.transition(context, 'cancelled_before_publish', 'article_cancelled_before_publish');
        return context.snapshot;
    }
    async nextPublicVerification(context) {
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
        if (context.snapshot.draft_id === null ||
            context.editor_revision === null ||
            context.preview_revision === null) {
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
    async nextEditorCommand(context, observation) {
        if (context.snapshot.draft_id === null) {
            throw new HarnessError('ARTICLE_DRAFT_IDENTITY_UNKNOWN', 'X Article execution has no draft identity');
        }
        const decision = nextArticleEditorDecision({
            plan: context.plan,
            draft_id: context.snapshot.draft_id,
            import_strategy: context.import_strategy,
            bulk_import_issued: context.bulk_import_issued
        }, observation, this.contract);
        if (decision.kind === 'blocked')
            throw new HarnessError(decision.code, decision.message);
        if (decision.kind === 'complete')
            return { snapshot: context.snapshot, command: null };
        if (decision.input.kind === 'open_article_preview') {
            context = await this.transition(context, 'content_verified', 'article_editor_document_verified');
        }
        else if (context.snapshot.state === 'content_filling') {
            context = await this.transition(context, 'content_partially_verified', 'article_editor_prefix_verified');
        }
        else {
            context = await this.transition(context, 'content_filling', 'article_content_filling_resumed');
        }
        if (decision.input.kind === 'import_article_document') {
            context = { ...context, bulk_import_issued: true };
        }
        return this.issue(context, decision.input);
    }
    async nextMaterializationCommand(context, observation) {
        if (context.snapshot.draft_id === null) {
            throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared materialization context is incomplete');
        }
        const persistedPlan = await this.readBoundMaterializationPlan(context);
        const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
        const reconciliation = reconcileXArticleDraft({
            plan: persistedPlan,
            checkpoint,
            document: context.plan.intent.document,
            observation
        });
        if (this.isOnlyMissingCover(reconciliation)) {
            const binding = context.plan.intent.visuals.find((candidate) => candidate.placement.kind === 'cover');
            if (binding === undefined || binding.asset.asset_id !== context.plan.intent.document.cover_asset_id) {
                context = await this.blockMaterialization(context, checkpoint, reconciliation);
                return { snapshot: context.snapshot, command: null };
            }
            return this.issue(context, {
                execution_id: context.snapshot.execution_id,
                run_id: context.plan.run_id,
                draft_id: context.snapshot.draft_id,
                kind: 'upload_article_cover',
                purpose: 'upload_article_cover',
                expected_page_revision: observation.page_revision,
                allowed_origin: 'https://x.com',
                side_effect: 'write',
                payload: {
                    kind: 'upload_article_cover',
                    package_root: context.plan.intent.article_package.root,
                    package_digest: context.plan.intent.article_package.digest,
                    asset: binding.asset
                }
            });
        }
        if (reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable') {
            context = await this.blockMaterialization(context, checkpoint, reconciliation);
            return { snapshot: context.snapshot, command: null };
        }
        const decision = nextMaterializationEditorDecision({
            plan: context.plan,
            materialization_plan: persistedPlan,
            draft_id: context.snapshot.draft_id
        }, observation, reconciliation, this.contract);
        if (decision.kind === 'blocked') {
            context = await this.blockMaterialization(context, checkpoint, decision);
            return { snapshot: context.snapshot, command: null };
        }
        if (decision.kind === 'complete')
            return { snapshot: context.snapshot, command: null };
        this.assertPreparedCommandBinding(context, persistedPlan, decision.input);
        return this.issue(context, decision.input);
    }
    async reconcileReportedEditor(context, observation) {
        if (observation.editor === null)
            return context;
        const plan = await this.readBoundMaterializationPlan(context);
        const revisionInput = Object.fromEntries(Object.entries(observation).filter(([key]) => key !== 'page_revision'));
        const identityInvalid = observation.page_revision !== computeXArticlePageRevision(revisionInput)
            || observation.execution_id !== context.snapshot.execution_id
            || observation.account_handle !== plan.target_account
            || observation.page_kind !== 'article_editor'
            || observation.editor.draft_id !== context.snapshot.draft_id;
        if (identityInvalid) {
            const trusted = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
            return this.blockMaterialization(context, trusted, { kind: 'unverifiable', reasons: ['editor observation identity is invalid'] });
        }
        const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
        const bodyObserved = observation.editor.title.length > 0 || observation.editor.blocks.length > 0;
        const template = createXArticleImportTemplate(context.plan.intent.document);
        const importState = observation.editor.import_state;
        const completedCount = importState === null
            ? plan.visual_anchors.length
            : sha256(importState.unresolved_anchors) === sha256(template.anchors.slice(template.anchors.length - importState.unresolved_anchors.length))
                ? template.anchors.length - importState.unresolved_anchors.length
                : checkpoint.media.filter((media) => media.status === 'completed').length;
        const inlineVisuals = observation.editor.visuals.filter((visual) => visual.kind === 'inline');
        const media = checkpoint.media.map((entry, index) => {
            if (index >= completedCount)
                return entry;
            const anchor = plan.visual_anchors[index];
            const visual = inlineVisuals.find((candidate) => candidate.asset_id === anchor.asset_id
                && candidate.block_ordinal === anchor.block_ordinal);
            if (visual === undefined
                || visual.ref.length === 0
                || visual.status !== 'uploaded'
                || !visual.owned_by_execution
                || visual.alt_text !== anchor.alt_text)
                return entry;
            return {
                ...entry,
                status: 'completed',
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
        const candidate = {
            ...checkpoint,
            phase,
            body: bodyObserved
                ? { status: 'verified', observed_digest: plan.import_template_digest }
                : checkpoint.body,
            media,
            last_editor_revision: observation.page_revision,
            updated_at: observation.observed_at
        };
        const reconciliation = reconcileXArticleDraft({
            plan,
            checkpoint: candidate,
            document: context.plan.intent.document,
            observation
        });
        if ((reconciliation.kind === 'content_drift' || reconciliation.kind === 'unverifiable')
            && !this.isOnlyMissingCover(reconciliation)) {
            return this.blockMaterialization(context, checkpoint, reconciliation);
        }
        const stableCurrent = { ...checkpoint, revision: 0, updated_at: '' };
        const stableCandidate = { ...candidate, revision: 0, updated_at: '' };
        if (!isDeepStrictEqual(stableCurrent, stableCandidate)) {
            await this.materializationStore.updateCheckpoint(context.snapshot.execution_id, checkpoint.revision, () => candidate);
        }
        return context;
    }
    async reconcilePreparedPreview(context, observation) {
        let checkpoint;
        try {
            checkpoint = (await this.assertPreparedConfirmationEvidence(context, ['absent']))
                .checkpoint;
        }
        catch {
            checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
            return this.blockMaterialization(context, checkpoint, {
                kind: 'unverifiable',
                reasons: ['prepared Preview gate lacks coherent durable reconciliation evidence']
            });
        }
        if (checkpoint.phase !== 'preview_verified') {
            await this.materializationStore.updateCheckpoint(context.snapshot.execution_id, checkpoint.revision, (current) => ({
                ...current,
                phase: 'preview_verified',
                updated_at: observation.observed_at
            }));
        }
        if (context.snapshot.state === 'confirmation_pending')
            return context;
        return this.transition(context, 'confirmation_pending', 'article_materialization_confirmation_pending');
    }
    issueEditorObservation(context) {
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
    isMaterializationEffect(command) {
        return command.kind === 'import_article_document'
            || command.kind === 'replace_article_visual_anchor'
            || command.kind === 'upload_article_cover'
            || command.kind === 'open_article_preview';
    }
    isPreparedReportActive(context) {
        return context.execution_mode === 'materialization_v3_2'
            && [
                'created', 'preflight', 'account_verified', 'draft_create_armed',
                'draft_created', 'materialization_reconciling', 'pre_publish_failed'
            ].includes(context.snapshot.state);
    }
    async readBoundMaterializationPlan(context) {
        if (context.execution_mode !== 'materialization_v3_2' || context.materialization_plan === null) {
            throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'prepared materialization plan is absent');
        }
        let durablePlan;
        try {
            durablePlan = await this.store.readJson(`${this.prefix(context.snapshot.execution_id)}/plan.json`);
            assertXArticlePublicationPlan(durablePlan);
        }
        catch (error) {
            throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'immutable X Article adapter plan is missing, corrupt, or invalid', error);
        }
        assertXArticlePublicationPlan(context.plan);
        const persisted = await this.materializationStore.readPlan(context.snapshot.execution_id);
        const expectedMaterialization = createXArticleMaterializationPlan({
            execution_id: context.snapshot.execution_id,
            publication_plan: durablePlan,
            import_template: createXArticleImportTemplate(durablePlan.intent.document),
            strategy: persisted.strategy
        });
        if (!isDeepStrictEqual(durablePlan, context.plan)
            || durablePlan.plan_id !== context.snapshot.plan_id
            || durablePlan.run_id !== context.snapshot.run_id
            || persisted.publication_plan_digest !== context.plan.plan_digest
            || !isDeepStrictEqual(persisted, context.materialization_plan)
            || !isDeepStrictEqual(persisted, expectedMaterialization)) {
            throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'durable materialization plan is not bound to the locked publication plan');
        }
        return persisted;
    }
    isOnlyMissingCover(reconciliation) {
        return reconciliation.kind === 'content_drift'
            && reconciliation.differences.length === 1
            && reconciliation.differences[0]?.path === 'editor.visuals.cover[0]'
            && reconciliation.differences[0]?.reason === 'missing';
    }
    assertPreparedCommandBinding(context, materializationPlan, input) {
        if (input.payload.kind === 'replace_article_visual_anchor') {
            const payload = input.payload;
            const anchor = materializationPlan.visual_anchors.find((candidate) => candidate.anchor_id === payload.anchor.anchor_id);
            const binding = context.plan.intent.visuals.find((candidate) => candidate.placement.kind === 'block'
                && candidate.placement.block_ordinal === payload.anchor.block_ordinal
                && candidate.asset.asset_id === payload.anchor.asset_id);
            if (anchor === undefined
                || binding === undefined
                || anchor.asset_id !== payload.asset.asset_id
                || anchor.block_ordinal !== payload.anchor.block_ordinal
                || anchor.asset_digest !== payload.asset.digest
                || binding.asset.digest !== anchor.asset_digest
                || !isDeepStrictEqual(binding.asset, payload.asset)) {
                throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'prepared anchor command is not bound to durable assets');
            }
        }
        if (input.payload.kind === 'upload_article_cover') {
            const binding = context.plan.intent.visuals.find((candidate) => candidate.placement.kind === 'cover');
            if (binding === undefined
                || context.plan.intent.document.cover_asset_id !== input.payload.asset.asset_id
                || !isDeepStrictEqual(binding.asset, input.payload.asset)) {
                throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'prepared cover command is not bound to the locked asset');
            }
        }
    }
    async blockMaterialization(context, checkpoint, evidence) {
        if (checkpoint.phase !== 'blocked') {
            await this.materializationStore.updateCheckpoint(context.snapshot.execution_id, checkpoint.revision, (trusted) => ({
                ...trusted,
                phase: 'blocked',
                updated_at: context.latest_observation?.observed_at ?? this.now().toISOString()
            }));
        }
        const evidenceDigest = sha256(evidence);
        await this.ensureExactArtifact(`${this.prefix(context.snapshot.execution_id)}/reconciliation-evidence/${evidenceDigest.slice(7)}.json`, { evidence_digest: evidenceDigest, evidence });
        if (context.snapshot.state === 'materialization_blocked')
            return context;
        return this.transition(context, 'materialization_blocked', 'article_materialization_blocked');
    }
    async issue(context, input, deterministicId) {
        let checkpointRevision = null;
        if (context.execution_mode === 'materialization_v3_2') {
            checkpointRevision = (await this.materializationStore.readCheckpoint(context.snapshot.execution_id)).revision;
        }
        const commandId = deterministicId ?? this.commandId();
        this.assertId(commandId);
        const pendingIssue = {
            command_id: commandId,
            input,
            input_digest: sha256(input),
            checkpoint_revision: checkpointRevision,
            action_key: sha256({
                checkpoint_revision: checkpointRevision,
                state: context.snapshot.state,
                sequence: context.snapshot.sequence,
                input
            })
        };
        const intendedContext = { ...context, pending_issue: pendingIssue };
        await this.writeContext(intendedContext);
        await this.projectPendingIssueCheckpoint(intendedContext);
        return this.finishPendingIssue(intendedContext);
    }
    async finishPendingIssue(context) {
        const pendingIssue = context.pending_issue;
        if (pendingIssue === null) {
            throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'X Article command issue intent is absent');
        }
        if (pendingIssue.input_digest !== sha256(pendingIssue.input)) {
            throw new HarnessError('CONTRACT_INVALID', 'X Article command issue intent changed');
        }
        await this.projectPendingIssueCheckpoint(context);
        const command = await this.broker.issue(pendingIssue.input, pendingIssue.command_id);
        const nextContext = {
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
    async projectPendingIssueCheckpoint(context) {
        const intent = context.pending_issue;
        if (context.execution_mode !== 'materialization_v3_2' || intent === null)
            return;
        if (intent.input.execution_id !== context.snapshot.execution_id
            || intent.input_digest !== sha256(intent.input)) {
            throw new HarnessError('CONTRACT_INVALID', 'prepared command issue intent identity changed');
        }
        const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
        if (intent.input.kind === 'import_article_document') {
            if (checkpoint.body.status === 'issued')
                return;
            if (checkpoint.body.status !== 'pending' || checkpoint.revision !== intent.checkpoint_revision) {
                throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'body issue intent checkpoint changed');
            }
            await this.materializationStore.updateCheckpoint(context.snapshot.execution_id, checkpoint.revision, (current) => ({
                ...current,
                body: { status: 'issued', observed_digest: null },
                updated_at: this.now().toISOString()
            }));
            return;
        }
        if (intent.input.kind === 'replace_article_visual_anchor') {
            const anchorId = intent.input.payload.anchor.anchor_id;
            const mediaIndex = checkpoint.media.findIndex((entry) => entry.anchor_id === anchorId);
            const media = checkpoint.media[mediaIndex];
            if (media?.status === 'upload_started')
                return;
            if (media === undefined
                || media.status !== 'pending'
                || checkpoint.revision !== intent.checkpoint_revision) {
                throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'anchor issue intent checkpoint changed');
            }
            await this.materializationStore.updateCheckpoint(context.snapshot.execution_id, checkpoint.revision, (current) => ({
                ...current,
                media: current.media.map((entry, index) => index === mediaIndex
                    ? { ...entry, status: 'upload_started' }
                    : entry),
                updated_at: this.now().toISOString()
            }));
        }
    }
    async clearPending(context) {
        const next = { ...context, pending_command: null, pending_issue: null };
        await this.writeContext(next);
        return next;
    }
    async transition(context, nextState, eventType, overrides = {}) {
        transitionXArticleExecution(context.snapshot.state, nextState);
        const sequence = context.snapshot.sequence + 1;
        const eventPath = `${this.prefix(context.snapshot.execution_id)}/events/${String(sequence).padStart(6, '0')}.json`;
        let event;
        if (await this.store.exists(eventPath)) {
            event = await this.store.readJson(eventPath);
            if (event.execution_id !== context.snapshot.execution_id
                || event.sequence !== sequence
                || event.event_type !== eventType
                || event.previous_state !== context.snapshot.state
                || event.next_state !== nextState
                || event.draft_id !== (overrides.draft_id ?? context.snapshot.draft_id)
                || event.command_id !== (context.pending_command?.command_id ?? null)) {
                throw new HarnessError('CONTRACT_INVALID', 'persisted X Article transition event changed');
            }
        }
        else {
            event = createXArticleExecutionEvent({
                eventId: this.eventId(), executionId: context.snapshot.execution_id, sequence,
                eventType, occurredAt: this.now().toISOString(), previousState: context.snapshot.state,
                nextState, draftId: overrides.draft_id ?? context.snapshot.draft_id,
                commandId: context.pending_command?.command_id ?? null
            });
            await this.store.writeNew(eventPath, event);
        }
        const nextContext = {
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
                updated_at: event.occurred_at
            }
        };
        await this.writeContext(nextContext);
        return nextContext;
    }
    verifyCapabilities(plan, manifest) {
        const hasDocumentImport = manifest.capabilities.includes('import_article_document');
        const hasAnchorReplacement = manifest.capabilities.includes('replace_article_visual_anchor');
        if (hasDocumentImport !== hasAnchorReplacement) {
            throw new HarnessError('BROWSER_EXECUTOR_INCOMPATIBLE', 'Chrome Host must advertise both X Article bulk-import capabilities');
        }
        const required = [
            'observe_article_page', 'create_article_draft', 'set_article_title',
            'insert_article_block', 'open_article_preview', 'open_publish_review', 'publish_article_once'
        ];
        if (plan.intent.visuals.some((visual) => visual.placement.kind === 'cover'))
            required.push('upload_article_cover');
        if (plan.intent.visuals.some((visual) => visual.placement.kind === 'block'))
            required.push('insert_article_image');
        const coverAltRequired = this.contract.media_alt_capabilities.cover === 'editable' &&
            plan.intent.visuals.some((visual) => visual.placement.kind === 'cover');
        const inlineAltRequired = this.contract.media_alt_capabilities.inline === 'editable' &&
            plan.intent.visuals.some((visual) => visual.placement.kind === 'block');
        if (coverAltRequired || inlineAltRequired)
            required.push('set_article_image_alt');
        if (manifest.executor !== 'codex-chrome' || manifest.browser_family !== 'chrome' ||
            required.some((capability) => !manifest.capabilities.includes(capability))) {
            throw new HarnessError('BROWSER_EXECUTOR_INCOMPATIBLE', 'Chrome Host lacks required X Article capabilities');
        }
        return hasDocumentImport ? 'bulk_document' : 'incremental_blocks';
    }
    async finalizeProjectedReport(context, commandId, reportDigest) {
        await this.ensureExactArtifact(this.reportProjectionPath({
            execution_id: context.snapshot.execution_id,
            command_id: commandId
        }), {
            schema_version: '1.0',
            execution_id: context.snapshot.execution_id,
            command_id: commandId,
            report_digest: reportDigest
        });
        const next = {
            ...context,
            pending_command: null,
            pending_issue: null,
            last_projected_report: { command_id: commandId, report_digest: reportDigest }
        };
        await this.writeContext(next);
        return next;
    }
    async recoverBrokerPersistedCommand(context, reported) {
        if (context.snapshot.state === 'cancelled_before_publish') {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'cancelled X Article execution cannot recover a broker command');
        }
        const intent = context.pending_issue;
        if (intent === null
            || intent.command_id !== reported.command_id
            || intent.input_digest !== sha256(intent.input)) {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'reported X Article command has no durable issue intent');
        }
        const command = await this.store.readJson(this.commandPath(reported));
        if (sha256(command) !== sha256(reported)
            || command.command_id !== intent.command_id) {
            throw new HarnessError('CONTRACT_INVALID', 'broker-persisted X Article command changed');
        }
        const stableCommandInput = Object.fromEntries(Object.entries(command).filter(([key]) => !['schema_version', 'command_id', 'payload_digest', 'issued_at'].includes(key)));
        if (sha256(stableCommandInput) !== intent.input_digest) {
            throw new HarnessError('CONTRACT_INVALID', 'broker command is not bound to durable issue intent');
        }
        const repaired = {
            ...context,
            pending_command: command,
            snapshot: {
                ...context.snapshot,
                latest_command_id: command.command_id,
                updated_at: command.issued_at
            }
        };
        await this.writeContext(repaired);
        return repaired;
    }
    verifyPreparedCapabilities(plan, manifest) {
        if (!manifest.capabilities.includes('import_article_document')
            || !manifest.capabilities.includes('replace_article_visual_anchor')) {
            throw new HarnessError('ARTICLE_BULK_IMPORT_REQUIRED', 'prepared X Article materialization requires the complete bulk-import capability set');
        }
        const required = [
            'observe_article_page', 'create_article_draft', 'open_article_preview',
            'open_publish_review', 'publish_article_once'
        ];
        if (plan.intent.visuals.some((visual) => visual.placement.kind === 'cover')) {
            required.push('upload_article_cover');
        }
        if (manifest.executor !== 'codex-chrome'
            || manifest.browser_family !== 'chrome'
            || required.some((capability) => !manifest.capabilities.includes(capability))) {
            throw new HarnessError('ARTICLE_MATERIALIZATION_CAPABILITY_MISMATCH', 'Chrome Host lacks a required prepared X Article materialization capability');
        }
    }
    async assertPreparedConfirmationEvidence(context, allowedConfirmationStates) {
        const materializationPlan = await this.readBoundMaterializationPlan(context);
        const checkpoint = await this.materializationStore.readCheckpoint(context.snapshot.execution_id);
        const previewObservationId = context.latest_preview_observation_id;
        const editorObservationId = context.latest_editor_observation_id;
        let preview = null;
        let editor = null;
        if (previewObservationId !== null && previewObservationId !== undefined) {
            try {
                preview = await this.store.readJson(`${this.prefix(context.snapshot.execution_id)}/observations/${previewObservationId}.json`);
            }
            catch {
                preview = null;
            }
        }
        if (editorObservationId !== null) {
            try {
                editor = await this.store.readJson(`${this.prefix(context.snapshot.execution_id)}/observations/${editorObservationId}.json`);
            }
            catch {
                editor = null;
            }
        }
        let coherentEditor = false;
        if (editor !== null) {
            try {
                const editorBody = Object.fromEntries(Object.entries(editor).filter(([key]) => key !== 'page_revision'));
                const editorPage = this.contract.detectPage(editor);
                this.contract.detectEditor(editor);
                const reconciliation = reconcileXArticleDraft({
                    plan: materializationPlan,
                    checkpoint: {
                        ...checkpoint,
                        phase: 'draft_reconciled',
                        publish_confirmation: 'absent'
                    },
                    document: context.plan.intent.document,
                    observation: editor
                });
                coherentEditor = editor.page_revision === computeXArticlePageRevision(editorBody)
                    && editor.execution_id === context.snapshot.execution_id
                    && editor.account_handle === materializationPlan.target_account
                    && editor.page_kind === 'article_editor'
                    && editorPage.kind === 'article_editor'
                    && editorPage.draft_id === context.snapshot.draft_id
                    && (reconciliation.kind === 'exact'
                        || reconciliation.kind === 'semantically_equivalent');
            }
            catch {
                coherentEditor = false;
            }
        }
        let previewCoherent = false;
        if (preview !== null) {
            try {
                const previewBody = Object.fromEntries(Object.entries(preview).filter(([key]) => key !== 'page_revision'));
                const previewPage = this.contract.detectPage(preview);
                const observedPreview = this.contract.detectPreview(preview);
                const expectedDocument = context.plan.intent.document;
                const actualDocument = {
                    schema_version: '1.0',
                    title: observedPreview.title,
                    cover_asset_id: observedPreview.visuals.find((visual) => visual.kind === 'cover')?.asset_id ?? null,
                    blocks: observedPreview.blocks
                };
                const expectedVisuals = context.plan.intent.visuals.map((binding) => {
                    const isCover = binding.placement.kind === 'cover';
                    const blockOrdinal = isCover ? null : binding.placement.block_ordinal;
                    return {
                        asset_id: binding.asset.asset_id,
                        kind: isCover ? 'cover' : 'inline',
                        block_ordinal: blockOrdinal,
                        ref: isCover
                            ? editor?.editor?.visuals.find((visual) => visual.kind === 'cover')?.ref ?? null
                            : checkpoint.media.find((entry) => entry.block_ordinal === blockOrdinal)
                                ?.observed_media_ref ?? null,
                        alt_text: isCover && this.contract.media_alt_capabilities.cover === 'unobservable'
                            ? null
                            : binding.asset.alt_text,
                        status: 'uploaded',
                        owned_by_execution: true
                    };
                });
                const observedVisuals = observedPreview.visuals.map((visual) => ({
                    asset_id: visual.asset_id,
                    kind: visual.kind,
                    block_ordinal: visual.block_ordinal,
                    ref: visual.ref,
                    alt_text: visual.kind === 'cover'
                        && this.contract.media_alt_capabilities.cover === 'unobservable'
                        ? null
                        : visual.alt_text,
                    status: visual.status,
                    owned_by_execution: visual.owned_by_execution
                }));
                previewCoherent = preview.page_revision === computeXArticlePageRevision(previewBody)
                    && preview.execution_id === context.snapshot.execution_id
                    && preview.account_handle === materializationPlan.target_account
                    && preview.page_kind === 'article_preview'
                    && previewPage.kind === 'article_preview'
                    && observedPreview.draft_id === context.snapshot.draft_id
                    && sha256(actualDocument) === sha256(expectedDocument)
                    && sha256(observedVisuals) === sha256(expectedVisuals);
            }
            catch {
                previewCoherent = false;
            }
        }
        const phaseMatches = (checkpoint.publish_confirmation === 'absent'
            && (checkpoint.phase === 'draft_reconciled' || checkpoint.phase === 'preview_verified'))
            || (checkpoint.publish_confirmation === 'armed' && checkpoint.phase === 'human_confirmed')
            || (checkpoint.publish_confirmation === 'consumed' && checkpoint.phase === 'publish_submitted');
        const mediaRefs = checkpoint.media.map((entry) => entry.observed_media_ref);
        const contextPreviewMatches = preview !== null
            && context.preview_revision === preview.page_revision
            && (context.latest_observation?.observation_id !== preview.observation_id
                || sha256(context.latest_observation) === sha256(preview));
        const gateInvalid = context.execution_mode !== 'materialization_v3_2'
            || context.snapshot.draft_id === null
            || context.snapshot.execution_id !== materializationPlan.execution_id
            || checkpoint.execution_id !== context.snapshot.execution_id
            || checkpoint.draft_id !== context.snapshot.draft_id
            || checkpoint.materialization_digest !== materializationPlan.materialization_digest
            || !allowedConfirmationStates.includes(checkpoint.publish_confirmation)
            || !phaseMatches
            || checkpoint.body.status !== 'verified'
            || checkpoint.body.observed_digest !== materializationPlan.import_template_digest
            || checkpoint.media.length !== materializationPlan.visual_anchors.length
            || checkpoint.media.some((entry, index) => entry.status !== 'completed'
                || entry.observed_media_ref === null
                || entry.observed_context_digest !== materializationPlan.visual_anchors[index]?.context_digest
                || entry.asset_id !== materializationPlan.visual_anchors[index]?.asset_id
                || entry.asset_digest !== materializationPlan.visual_anchors[index]?.asset_digest)
            || new Set(mediaRefs).size !== mediaRefs.length
            || checkpoint.last_editor_revision === null
            || context.editor_revision !== checkpoint.last_editor_revision
            || editor === null
            || !coherentEditor
            || editor.page_revision !== checkpoint.last_editor_revision
            || preview === null
            || !previewCoherent
            || !contextPreviewMatches;
        if (gateInvalid || preview === null) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article Publish confirmation lacks coherent durable Preview and Editor evidence');
        }
        return { materializationPlan, checkpoint, preview };
    }
    async verifyStoredPublishConfirmation(context, allowedConfirmationStates) {
        const evidence = await this.assertPreparedConfirmationEvidence(context, allowedConfirmationStates);
        let confirmation;
        try {
            confirmation = await this.store.readJson(this.publishConfirmationPath(context.snapshot.execution_id));
        }
        catch (error) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article Publish confirmation artifact is missing or unreadable', error);
        }
        verifyXArticlePublishConfirmation(confirmation, {
            execution_id: context.snapshot.execution_id,
            draft_id: context.snapshot.draft_id,
            target_account: context.plan.intent.target_account,
            audience: 'everyone',
            plan_digest: context.plan.plan_digest,
            document_digest: evidence.materializationPlan.document_digest,
            preview_revision: evidence.preview.page_revision,
            asset_digests: context.plan.intent.visuals.map((item) => item.asset.digest),
            confirmed_at_not_before: evidence.preview.observed_at,
            confirmed_at_not_after: this.now().toISOString()
        });
        return { confirmation, evidence };
    }
    async assertPreparedPublishReview(context, observation) {
        let durable;
        try {
            durable = await this.store.readJson(`${this.prefix(context.snapshot.execution_id)}/observations/${observation.observation_id}.json`);
        }
        catch (error) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'durable X Article Publish review is missing', error);
        }
        const body = Object.fromEntries(Object.entries(durable).filter(([key]) => key !== 'page_revision'));
        const review = this.contract.detectPublishReview(durable);
        if (sha256(durable) !== sha256(observation)
            || durable.page_revision !== computeXArticlePageRevision(body)
            || durable.execution_id !== context.snapshot.execution_id
            || durable.account_handle !== context.plan.intent.target_account
            || durable.page_kind !== 'publish_review'
            || review.draft_id !== context.snapshot.draft_id
            || review.audience !== 'everyone'
            || review.final_publish_ref === null) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article Publish review differs from the confirmed publication');
        }
        return review;
    }
    async claimPreparedPublish(context, command) {
        if (context.snapshot.state === 'cancelled_before_publish'
            || (context.snapshot.state !== 'publish_armed'
                && context.snapshot.state !== 'publish_attempted')) {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'X Article Publish command is not armed for this execution');
        }
        if (context.pending_command === null
            || sha256(context.pending_command) !== sha256(command)
            || command.execution_id !== context.snapshot.execution_id
            || command.run_id !== context.plan.run_id
            || command.draft_id !== context.snapshot.draft_id
            || command.kind !== 'publish_article_once'
            || command.purpose !== 'publish_article_once'
            || command.side_effect !== 'submit'
            || command.payload.kind !== 'publish_article_once') {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'X Article Publish claim does not match the exact armed command');
        }
        const verified = await this.verifyStoredPublishConfirmation(context, context.snapshot.state === 'publish_attempted' ? ['consumed'] : ['armed', 'consumed']);
        const review = await this.assertPreparedPublishReview(context, this.requireObservation(context));
        if (command.expected_page_revision !== context.latest_observation?.page_revision
            || command.payload.target_ref !== review.final_publish_ref) {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'X Article Publish command is stale for the durable Publish review');
        }
        const consumptionBody = {
            schema_version: 'x-article-publish-confirmation-consumption/v1',
            execution_id: context.snapshot.execution_id,
            draft_id: context.snapshot.draft_id,
            confirmation_id: verified.confirmation.confirmation_id,
            confirmation_digest: verified.confirmation.confirmation_digest,
            command_id: command.command_id,
            command_digest: sha256(command),
            consumed_at: this.now().toISOString()
        };
        const consumptionPath = this.publishConfirmationConsumptionPath(context.snapshot.execution_id);
        const consumptionExists = await this.store.exists(consumptionPath);
        const alreadyConsumed = context.snapshot.state === 'publish_attempted'
            || verified.evidence.checkpoint.publish_confirmation === 'consumed'
            || consumptionExists;
        if (alreadyConsumed) {
            const consumption = await this.readExactPublishConsumption(consumptionPath, consumptionBody);
            if (verified.evidence.checkpoint.publish_confirmation === 'consumed'
                && verified.evidence.checkpoint.updated_at !== consumption.consumed_at) {
                throw new HarnessError('CONTRACT_INVALID', 'consumed X Article checkpoint differs from its confirmation consumption');
            }
            if (verified.evidence.checkpoint.publish_confirmation === 'armed') {
                await this.consumePublishCheckpoint(context.snapshot.execution_id, verified.evidence.checkpoint, consumption.consumed_at);
            }
            if (context.snapshot.state === 'publish_attempted') {
                await this.broker.readExistingClaim(command);
                throw new HarnessError('COMMAND_REPLAY_REJECTED', 'X Article Publish command was already consumed');
            }
            const recovered = await this.broker.claimOrRead(command);
            await this.transition(context, 'publish_attempted', 'article_publish_command_claimed', {
                publish_command_count: 1,
                submit_delivered: true
            });
            if (!recovered.created) {
                throw new HarnessError('COMMAND_REPLAY_REJECTED', 'X Article Publish command may already have been delivered');
            }
            return recovered.claim;
        }
        const consumption = {
            ...consumptionBody,
            consumption_digest: sha256(consumptionBody)
        };
        await this.store.writeNew(consumptionPath, consumption);
        await this.consumePublishCheckpoint(context.snapshot.execution_id, verified.evidence.checkpoint, consumption.consumed_at);
        const claim = await this.broker.claim(command);
        await this.transition(context, 'publish_attempted', 'article_publish_command_claimed', {
            publish_command_count: 1,
            submit_delivered: true
        });
        return claim;
    }
    async readExactPublishConsumption(path, expectedBody) {
        const consumption = await this.store.readJson(path);
        const { consumption_digest: persistedDigest, ...persistedBody } = consumption;
        const stablePersisted = { ...persistedBody, consumed_at: null };
        const stableExpected = { ...expectedBody, consumed_at: null };
        if (persistedDigest !== sha256(persistedBody)
            || !isDeepStrictEqual(stablePersisted, stableExpected)
            || !Number.isFinite(Date.parse(consumption.consumed_at))) {
            throw new HarnessError('CONTRACT_INVALID', 'X Article Publish confirmation consumption changed or belongs to another command');
        }
        return consumption;
    }
    async consumePublishCheckpoint(executionId, checkpoint, consumedAt) {
        if (checkpoint.publish_confirmation === 'armed') {
            await this.materializationStore.updateCheckpoint(executionId, checkpoint.revision, (current) => {
                if (current.phase !== 'human_confirmed' || current.publish_confirmation !== 'armed') {
                    throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'X Article Publish confirmation checkpoint changed before consumption');
                }
                return {
                    ...current,
                    phase: 'publish_submitted',
                    publish_confirmation: 'consumed',
                    updated_at: consumedAt
                };
            });
        }
    }
    initialSnapshot(executionId, plan) {
        return {
            schema_version: '1.0', execution_id: executionId, run_id: plan.run_id,
            plan_id: plan.plan_id, state: 'created', sequence: 0, draft_id: null,
            attempt_id: null, publish_command_count: 0, latest_command_id: null,
            latest_observation_id: null, latest_receipt_path: null, updated_at: this.now().toISOString()
        };
    }
    requireApproval(context) {
        if (context.approval === null) {
            throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article Publish requires explicit approval');
        }
        return context.approval;
    }
    requireObservation(context) {
        if (context.latest_observation === null) {
            throw new HarnessError('ARTICLE_PAGE_CONTRACT_UNSUPPORTED', 'X Article execution needs a fresh observation');
        }
        return context.latest_observation;
    }
    async readContext(executionId) {
        this.assertId(executionId);
        return this.store.readJson(`${this.prefix(executionId)}/adapter-context.json`);
    }
    async writeContext(context) {
        await this.store.replaceAtomic(`${this.prefix(context.snapshot.execution_id)}/adapter-context.json`, context);
    }
    prefix(executionId) {
        this.assertId(executionId);
        return `runs/${executionId}/x-article/browser`;
    }
    publishConfirmationPath(executionId) {
        return `${this.prefix(executionId)}/publish-confirmation.json`;
    }
    publishConfirmationConsumptionPath(executionId) {
        return `${this.prefix(executionId)}/publish-confirmation-consumption.json`;
    }
    async ensureExactArtifact(path, expected) {
        if (await this.store.exists(path)) {
            const existing = await this.store.readJson(path);
            if (!isDeepStrictEqual(existing, expected)) {
                throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', `prepared X Article artifact differs on retry: ${path}`);
            }
            return;
        }
        await this.store.writeNew(path, expected);
    }
    withExecutionLock(executionId, operation) {
        this.assertId(executionId);
        return this.store.withLock(`runs/${executionId}/x-article/adapter-execution.lock`, operation);
    }
    commandPath(command) {
        this.assertId(command.command_id);
        return `${this.prefix(command.execution_id)}/commands/${command.command_id}/command.json`;
    }
    reportProjectionPath(command) {
        this.assertId(command.command_id);
        return `${this.prefix(command.execution_id)}/report-projections/${command.command_id}.json`;
    }
    assertId(id) {
        if (!/^[A-Za-z0-9_-]+$/.test(id))
            throw new HarnessError('WORKSPACE_PATH_INVALID', 'unsafe X Article execution identity');
    }
}
//# sourceMappingURL=article-browser-adapter.js.map