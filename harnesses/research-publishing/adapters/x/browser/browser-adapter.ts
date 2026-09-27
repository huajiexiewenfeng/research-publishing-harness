import { randomUUID } from 'node:crypto';

import type { ApprovalV2 } from '../../../core/approval-v2.js';
import { verifyApprovalV2 } from '../../../core/approval-v2.js';
import type { ApprovalV2_1 } from '../../../core/approval-v2-1.js';
import { verifyApprovalV2_1 } from '../../../core/approval-v2-1.js';
import type {
  BrowserExecutionSnapshot,
  BrowserExecutionState
} from '../../../core/browser-execution.js';
import { sha256 } from '../../../core/digest.js';
import { HarnessError, type ErrorCode } from '../../../core/errors.js';
import type { ExecutionStore } from '../../../core/execution-store.js';
import type { PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import { assertPublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import type { PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import { assertPublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import {
  notifyTerminalSafely,
  type ResearchTerminalNotifier
} from '../../../core/research-terminal-hooks.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import {
  type ComposerContext,
  nextComposerDecision
} from './composer-protocol.js';
import type {
  BrowserActionResultInput,
  BrowserActionResult,
  BrowserCapabilityManifest,
  BrowserCommand,
  BrowserCommandClaim,
  BrowserObservation
} from './browser-protocol.js';
import type { CommandBroker } from './command-broker.js';
import type { XPageContract } from './page-contract.js';
import {
  DeterministicOutcomeResolver,
  verificationDelaysMs,
  type OutcomeDecision
} from './outcome-resolver.js';
import { verifyPublicThread, type PublicVerificationResult } from './public-verifier.js';
import {
  createPublicationReceiptV2,
  type PublicationReceiptV2,
  type ReceiptStatusV2
} from './receipt-v2.js';
import {
  createPublicationReceiptV2_1,
  type PublicationReceiptV2_1,
  type ReceiptStatusV2_1
} from './receipt-v2-1.js';

export interface BrowserAdapterApi {
  start(input: StartBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
  next(executionId: string): Promise<BrowserCommand | null>;
  claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
  report(executionId: string, result: BrowserActionResultInput): Promise<BrowserExecutionSnapshot>;
  status(executionId: string): Promise<BrowserExecutionStatus>;
  resumeVerification(executionId: string): Promise<BrowserExecutionSnapshot>;
  resumePreSubmit(executionId: string): Promise<BrowserExecutionSnapshot>;
  cancelBeforeSubmit(executionId: string): Promise<BrowserExecutionSnapshot>;
}

export interface StartBrowserExecutionInput {
  readonly execution_id: string;
  readonly plan: BrowserPublicationPlan;
  readonly approval: ApprovalV2 | ApprovalV2_1;
  readonly capability_manifest: BrowserCapabilityManifest;
}

type BrowserPublicationPlan = PublicationPlanV2 | PublicationPlanV2_1;

export interface BrowserExecutionStatus {
  readonly snapshot: BrowserExecutionSnapshot;
  readonly pending_command: BrowserCommand | null;
  readonly latest_receipt_path: string | null;
  readonly resumable_verification: boolean;
}

interface StoredComposerContext {
  readonly quote_entry_step?: number;
  readonly expected_account: string;
  readonly created_item_refs: readonly string[];
  readonly next_ordinal: number;
  readonly add_retry_count: number;
  readonly last_page_revision: string | null;
  readonly attachment_command_issued: boolean;
  readonly alt_text_command_issued: boolean;
  readonly attachment_retry_count: number;
}

interface StoredExecutionContext {
  readonly schema_version: '2.0';
  readonly plan_path: string;
  readonly approval_path: string;
  readonly manifest_path: string;
  readonly capability_manifest_digest: string;
  readonly page_contract_version: string;
  readonly executor_version: string;
  readonly latest_observation_id: string | null;
  readonly current_page_revision: string | null;
  readonly composer: StoredComposerContext;
  readonly pending_command_id: string | null;
  readonly attempt_id: string | null;
  readonly submit_command_count: number;
  readonly observed_account: string | null;
  readonly read_retry_count: number;
  readonly barrier_observation_fresh: boolean;
  readonly latest_receipt_path: string | null;
  readonly armed_at: string | null;
  readonly attempted_at: string | null;
  readonly submit_command_id: string | null;
  readonly verification_index: number;
  readonly verification_wait_completed: boolean;
  readonly positive_publish_signal: boolean;
  readonly platform_rejection: { readonly attempt_id: string; readonly code: string } | null;
  readonly latest_receipt_id: string | null;
  readonly source_asset_verified: boolean;
  readonly composer_attachment_verified: boolean;
  readonly attachment_outcome_pending: boolean;
}

const REQUIRED_CAPABILITIES = [
  'observe_page',
  'navigate',
  'click',
  'set_text',
  'press_key',
  'wait'
] as const;
const REQUIRED_VISUAL_CAPABILITIES = [
  'file_upload',
  'attachment_alt_text',
  'upload_attachment',
  'set_attachment_alt_text'
] as const;

export class BrowserAdapter implements BrowserAdapterApi {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly executions: ExecutionStore,
    private readonly broker: CommandBroker,
    private readonly contract: XPageContract,
    private readonly now: () => Date = () => new Date(),
    private readonly attemptId: () => string = () => `attempt_${randomUUID()}`,
    private readonly receiptId: () => string = () => `receipt_${randomUUID()}`,
    private readonly outcomeResolver = new DeterministicOutcomeResolver(),
    private readonly terminalNotifier: ResearchTerminalNotifier | null = null
  ) {}

  async start(input: StartBrowserExecutionInput): Promise<BrowserExecutionSnapshot> {
    if (input.plan.schema_version === '2.0') assertPublicationPlanV2(input.plan);
    else if (input.plan.schema_version === '2.1') assertPublicationPlanV2_1(input.plan);
    else throw new HarnessError('CONTRACT_INVALID', 'Browser Adapter accepts PublicationPlan V2.0 or V2.1 only');
    if (input.plan.intent.adapter !== 'browser') {
      throw new HarnessError('CONTRACT_INVALID', 'Browser Adapter requires a browser publication intent');
    }
    if (input.plan.schema_version === '2.0' && input.plan.intent.media.length > 0) {
      throw new HarnessError('UNSUPPORTED_PUBLICATION_FEATURE', 'Browser Adapter V2 is text-only');
    }
    this.assertCapabilityManifest(
      input.capability_manifest,
      input.plan.schema_version === '2.1' &&
        input.plan.items.some((item) => item.attachments.length > 0)
    );
    if (input.plan.schema_version === '2.0') verifyApprovalV2(input.plan, input.approval as ApprovalV2, this.now());
    else verifyApprovalV2_1(input.plan, input.approval as ApprovalV2_1, this.now());

    await this.executions.create({
      execution_id: input.execution_id,
      run_id: input.plan.run_id,
      plan_id: input.plan.plan_id,
      created_at: this.now().toISOString()
    });
    const prefix = this.prefix(input.plan.run_id, input.execution_id);
    const planPath = `${prefix}/publication-plan-${input.plan.schema_version}.json`;
    const approvalPath = `${prefix}/approval-${input.plan.schema_version}.json`;
    const manifestPath = `${prefix}/capability-manifest.json`;
    await this.store.writeNew(planPath, input.plan);
    await this.store.writeNew(approvalPath, input.approval);
    await this.store.writeNew(manifestPath, input.capability_manifest);
    await notifyTerminalSafely(this.store, this.terminalNotifier, {
      notification_id: `publication_plan_${input.plan.plan_id}_${input.execution_id}`,
      kind: 'publication_plan_approved', publication_kind: null,
      workspace_relative_path: planPath, role: 'publication_plan', media_type: 'application/json',
      canonical: true, privacy_classification: 'internal', occurred_at: this.now().toISOString()
    });
    let context: StoredExecutionContext = {
      schema_version: '2.0',
      plan_path: planPath,
      approval_path: approvalPath,
      manifest_path: manifestPath,
      capability_manifest_digest: sha256(input.capability_manifest),
      page_contract_version: this.contract.version,
      executor_version: input.capability_manifest.executor_version,
      latest_observation_id: null,
      current_page_revision: null,
      composer: {
        expected_account: input.plan.intent.target_account,
        created_item_refs: [],
        next_ordinal: 1,
        add_retry_count: 0,
        last_page_revision: null,
        attachment_command_issued: false,
        alt_text_command_issued: false,
        attachment_retry_count: 0
      },
      pending_command_id: null,
      attempt_id: null,
      submit_command_count: 0,
      observed_account: null,
      read_retry_count: 0,
      barrier_observation_fresh: false,
      latest_receipt_path: null,
      armed_at: null,
      attempted_at: null,
      submit_command_id: null,
      verification_index: 0,
      verification_wait_completed: true,
      positive_publish_signal: false,
      platform_rejection: null,
      latest_receipt_id: null,
      source_asset_verified: false,
      composer_attachment_verified: false,
      attachment_outcome_pending: false
    };
    await this.writeContext(input.plan.run_id, input.execution_id, context);
    const snapshot = await this.executions.transition(input.execution_id, 'preflight', {
      event_type: 'browser_preflight_started'
    });
    const command = await this.broker.issue({
      execution_id: input.execution_id,
      run_id: input.plan.run_id,
      kind: 'observe_page',
      purpose: 'preflight_observation',
      expected_page_revision: null,
      allowed_origin: 'https://x.com',
      side_effect: 'read',
      payload: { kind: 'observe_page', scope: 'x_page' }
    });
    context = { ...context, pending_command_id: command.command_id };
    await this.writeContext(input.plan.run_id, input.execution_id, context);
    return snapshot;
  }

  async next(executionId: string): Promise<BrowserCommand | null> {
    let snapshot = await this.executions.read(executionId);
    let context = await this.readContext(snapshot);
    const plan = await this.store.readJson<BrowserPublicationPlan>(context.plan_path);
    if (context.pending_command_id !== null) {
      return this.broker.read(executionId, context.pending_command_id);
    }
    if (snapshot.state === 'outcome_resolving') {
      snapshot = await this.executions.transition(executionId, 'public_verifying', {
        event_type: 'public_verification_started',
        ...(context.attempt_id === null ? {} : { attempt_id: context.attempt_id })
      });
    }
    if (snapshot.state === 'public_verifying') {
      if (context.verification_wait_completed) {
        return this.issueAndPersist(snapshot, context, {
          execution_id: executionId,
          run_id: snapshot.run_id,
          kind: 'observe_page',
          purpose: `public_verification_${context.verification_index}`,
          expected_page_revision: context.current_page_revision,
          allowed_origin: 'https://x.com',
          side_effect: 'read',
          payload: { kind: 'observe_page', scope: 'public_thread' }
        });
      }
      return this.issueAndPersist(snapshot, context, {
        execution_id: executionId,
        run_id: snapshot.run_id,
        kind: 'wait',
        purpose: `verification_wait_${context.verification_index}`,
        expected_page_revision: null,
        allowed_origin: 'https://x.com',
        side_effect: 'read',
        payload: {
          kind: 'wait',
          delay_ms: verificationDelaysMs[context.verification_index] ?? 90_000
        }
      });
    }
    if (this.isTerminal(snapshot.state) || snapshot.state === 'submit_attempted') return null;
    if (context.attachment_outcome_pending) {
      return this.issueObservation(snapshot, context, 'attachment_outcome_observation');
    }
    if (context.latest_observation_id === null) {
      return this.issueObservation(snapshot, context, 'missing_observation');
    }
    const observation = await this.readObservation(snapshot, context.latest_observation_id);

    if (snapshot.state === 'account_verified' && plan.intent.mode !== 'reply' && plan.intent.quote_post === undefined) {
      const page = this.contract.detectPage(observation);
      if (page.kind !== 'composer') {
        return this.issueAndPersist(snapshot, context, {
          execution_id: executionId,
          run_id: plan.run_id,
          kind: 'navigate',
          purpose: 'open_x_composer',
          expected_page_revision: observation.page_revision,
          allowed_origin: 'https://x.com',
          side_effect: 'write',
          payload: { kind: 'navigate', url: 'https://x.com/compose/post' }
        });
      }
      snapshot = await this.executions.transition(executionId, 'composer_prepared', {
        event_type: 'composer_detected'
      });
    }

    if (snapshot.state === 'account_verified' || snapshot.state === 'composer_prepared') {
      const decision = nextComposerDecision(
        this.inflateComposer(context.composer, plan),
        observation,
        this.contract
      );
      if (decision.kind === 'blocked') {
        await this.failPreSubmit(executionId, snapshot.state, decision.code, decision.message);
      }
      if (decision.kind === 'command') {
        context = { ...context, composer: this.storeComposer(decision.next_context) };
        return this.issueAndPersist(snapshot, context, decision.input);
      }
      await this.executions.transition(executionId, 'composer_verified', {
        event_type: 'composer_verified',
        evidence_digest: plan.plan_digest,
        latest_observation_id: observation.observation_id
      });
      context = {
        ...context,
        barrier_observation_fresh: false,
        composer_attachment_verified: plan.schema_version === '2.1'
      };
      await this.writeContext(snapshot.run_id, executionId, context);
      return this.issueObservation(snapshot, context, 'submit_barrier_observation');
    }

    if (snapshot.state === 'composer_verified') {
      if (!context.barrier_observation_fresh) {
        return this.issueObservation(snapshot, context, 'submit_barrier_observation');
      }
      return this.crossSubmitBarrier(snapshot, context, plan, observation);
    }
    return null;
  }

  claim(executionId: string, commandId: string): Promise<BrowserCommandClaim> {
    return this.broker.claim(executionId, commandId);
  }

  async report(
    executionId: string,
    resultInput: BrowserActionResultInput
  ): Promise<BrowserExecutionSnapshot> {
    let snapshot = await this.executions.read(executionId);
    let context = await this.readContext(snapshot);
    if (context.pending_command_id !== resultInput.command_id) {
      throw new HarnessError('CONTRACT_INVALID', 'result does not match the pending Browser Command');
    }
    const command = await this.broker.read(executionId, resultInput.command_id);
    const result = await this.broker.acceptResult(executionId, resultInput);
    context = {
      ...context,
      pending_command_id: null,
      source_asset_verified:
        context.source_asset_verified ||
        command.kind === 'upload_attachment'
    };

    if (
      command.kind === 'upload_attachment' &&
      (result.status === 'uncertain' || result.observation === null)
    ) {
      context = { ...context, attachment_outcome_pending: true };
      await this.writeContext(snapshot.run_id, executionId, context);
      return snapshot;
    }

    if (snapshot.state === 'submit_attempted' && command.side_effect === 'submit') {
      context = {
        ...context,
        submit_command_id: command.command_id,
        positive_publish_signal: result.status === 'success',
        platform_rejection:
          result.status === 'rejected' && result.error_code !== null && context.attempt_id !== null
            ? { attempt_id: context.attempt_id, code: result.error_code }
            : null,
        verification_index: 0,
        verification_wait_completed: true,
        ...(result.observation === null
          ? {}
          : {
              latest_observation_id: result.observation.observation_id,
              current_page_revision: result.observation.page_revision
            })
      };
      snapshot = await this.executions.transition(executionId, 'outcome_resolving', {
        event_type: 'submit_result_reported',
        ...(context.attempt_id === null ? {} : { attempt_id: context.attempt_id }),
        command_id: command.command_id,
        evidence_digest: sha256(result)
      });
      await this.writeContext(snapshot.run_id, executionId, context);
      if (context.platform_rejection !== null) {
        const plan = await this.store.readJson<BrowserPublicationPlan>(context.plan_path);
        const verification = {
          kind: 'no_match' as const,
          reason: 'platform rejected the current Submit attempt'
        };
        return this.finalizeOutcome(
          snapshot,
          context,
          plan,
          {
            kind: 'failed_after_submit',
            rejection_code: context.platform_rejection.code
          },
          verification,
          result.observation
        );
      }
      return snapshot;
    }

    if (snapshot.state === 'outcome_resolving' || snapshot.state === 'public_verifying') {
      if (command.side_effect !== 'read') {
        throw new HarnessError('SUBMIT_ALREADY_ATTEMPTED', 'post-submit commands must be read-only');
      }
      if (command.kind === 'wait') {
        context = { ...context, verification_wait_completed: true };
        await this.writeContext(snapshot.run_id, executionId, context);
        return snapshot;
      }
      const observation = result.observation;
      if (observation !== null) {
        context = {
          ...context,
          latest_observation_id: observation.observation_id,
          current_page_revision: observation.page_revision,
          positive_publish_signal:
            context.positive_publish_signal || observation.public_posts.length > 0
        };
      }
      const plan = await this.store.readJson<BrowserPublicationPlan>(context.plan_path);
      const verification =
        observation === null
          ? ({ kind: 'no_match', reason: 'public observation unavailable' } as const)
          : verifyPublicThread(plan, observation.public_posts);
      await this.store.writeNew(
        `${this.prefix(snapshot.run_id, executionId)}/verification-report-${snapshot.sequence}-${context.verification_index}.json`,
        verification
      );
      const submitResult = await this.readSubmitResult(snapshot, context);
      if (context.attempt_id === null) {
        throw new HarnessError('PUBLICATION_OUTCOME_UNKNOWN', 'post-submit execution has no attempt ID');
      }
      const decision = this.outcomeResolver.classify({
        attempt_id: context.attempt_id,
        verification_index: context.verification_index,
        submit_result: submitResult,
        public_verification: verification,
        positive_publish_signal: context.positive_publish_signal,
        platform_rejection: context.platform_rejection
      });
      if (decision.kind === 'verify_again') {
        context = {
          ...context,
          verification_index: context.verification_index + 1,
          verification_wait_completed: false
        };
        await this.writeContext(snapshot.run_id, executionId, context);
        return snapshot;
      }
      return this.finalizeOutcome(snapshot, context, plan, decision, verification, observation);
    }

    if (result.status !== 'success' || result.observation === null) {
      if (command.side_effect === 'read' && context.read_retry_count < 2) {
        context = { ...context, read_retry_count: context.read_retry_count + 1 };
        await this.writeContext(snapshot.run_id, executionId, context);
        return snapshot;
      }
      await this.failPreSubmit(
        executionId,
        snapshot.state,
        result.error_code ?? 'BROWSER_EXECUTOR_UNAVAILABLE',
        'Browser command did not return a usable observation'
      );
    }

    if (result.observation === null) {
      throw new HarnessError('BROWSER_EXECUTOR_UNAVAILABLE', 'Browser observation is unavailable');
    }
    const observation = result.observation;
    context = {
      ...context,
      latest_observation_id: observation.observation_id,
      current_page_revision: observation.page_revision,
      read_retry_count: 0
    };
    try {
      const page = this.contract.detectPage(observation);
      if (page.kind === 'login_required') {
        await this.failPreSubmit(executionId, snapshot.state, 'X_AUTH_REQUIRED', 'X login is required');
      }
      if (page.kind === 'security_challenge') {
        await this.failPreSubmit(
          executionId,
          snapshot.state,
          'X_SECURITY_CHALLENGE',
          'X security challenge requires human action'
        );
      }
      const observedAccount = this.contract.detectAccount(observation).handle;
      const plan = await this.store.readJson<BrowserPublicationPlan>(context.plan_path);
      if (observedAccount.toLowerCase() !== plan.intent.target_account.toLowerCase()) {
        await this.failPreSubmit(
          executionId,
          snapshot.state,
          'X_ACCOUNT_MISMATCH',
          'active X account does not match approval'
        );
      }
      context = { ...context, observed_account: observedAccount };
      if (page.kind === 'composer') this.contract.detectComposer(observation);

      if (command.purpose === 'attachment_outcome_observation') {
        const attachments = this.contract.detectComposer(observation).attachments;
        if (attachments.length === 0 && context.composer.attachment_retry_count < 1) {
          context = {
            ...context,
            attachment_outcome_pending: false,
            composer: {
              ...context.composer,
              attachment_command_issued: false,
              attachment_retry_count: context.composer.attachment_retry_count + 1
            }
          };
        } else {
          context = { ...context, attachment_outcome_pending: false };
        }
      }

      if (snapshot.state === 'preflight') {
        snapshot = await this.executions.transition(executionId, 'account_verified', {
          event_type: 'x_account_verified',
          latest_observation_id: observation.observation_id
        });
      } else if (snapshot.state === 'account_verified' && page.kind === 'composer') {
        snapshot = await this.executions.transition(executionId, 'composer_prepared', {
          event_type: 'composer_prepared',
          latest_observation_id: observation.observation_id
        });
      } else if (
        snapshot.state === 'composer_verified' &&
        command.purpose === 'submit_barrier_observation'
      ) {
        context = { ...context, barrier_observation_fresh: true };
      }
    } catch (error) {
      if (error instanceof HarnessError) {
        const current = await this.executions.read(executionId);
        if (current.state !== 'pre_submit_failed') {
          await this.failPreSubmit(executionId, current.state, error.code, error.message);
        }
      }
      throw error;
    }
    await this.writeContext(snapshot.run_id, executionId, context);
    return snapshot;
  }

  async status(executionId: string): Promise<BrowserExecutionStatus> {
    const snapshot = await this.executions.read(executionId);
    const context = await this.readContext(snapshot);
    return {
      snapshot,
      pending_command:
        context.pending_command_id === null
          ? null
          : await this.broker.read(executionId, context.pending_command_id),
      latest_receipt_path: context.latest_receipt_path,
      resumable_verification:
        snapshot.state === 'outcome_unknown' || snapshot.state === 'published_unverified'
    };
  }

  async resumePreSubmit(executionId: string): Promise<BrowserExecutionSnapshot> {
    const snapshot = await this.executions.read(executionId);
    const context = await this.readContext(snapshot);
    if (snapshot.state !== 'pre_submit_failed' || snapshot.submit_command_count !== 0 ||
      snapshot.attempt_id !== null || context.submit_command_count !== 0 ||
      context.attempt_id !== null || context.pending_command_id !== null ||
      context.attachment_outcome_pending) {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'only idle failed executions with no Submit attempt may reobserve');
    }
    const plan = await this.store.readJson<BrowserPublicationPlan>(context.plan_path);
    if (plan.schema_version === '2.0') {
      verifyApprovalV2(plan, await this.store.readJson<ApprovalV2>(context.approval_path), this.now());
    } else {
      verifyApprovalV2_1(plan, await this.store.readJson<ApprovalV2_1>(context.approval_path), this.now());
    }
    // Keep ownership, upload flags, approval, and all previous observations intact.
    await this.writeContext(snapshot.run_id, executionId, {
      ...context, latest_observation_id: null, current_page_revision: null,
      barrier_observation_fresh: false,
      composer: { ...context.composer, last_page_revision: null }
    });
    return this.executions.transition(executionId, 'preflight', {
      event_type: 'pre_submit_reobservation_requested'
    });
  }

  async resumeVerification(executionId: string): Promise<BrowserExecutionSnapshot> {
    const snapshot = await this.executions.read(executionId);
    if (snapshot.state !== 'outcome_unknown' && snapshot.state !== 'published_unverified') {
      throw new HarnessError(
        'STATE_TRANSITION_INVALID',
        'only unknown or unverified outcomes can resume public verification'
      );
    }
    let context = await this.readContext(snapshot);
    if (context.pending_command_id !== null) {
      throw new HarnessError('EXECUTION_BUSY', 'a Browser Command is already pending');
    }
    const resumed = await this.executions.transition(executionId, 'public_verifying', {
      event_type: 'public_verification_resumed',
      ...(context.attempt_id === null ? {} : { attempt_id: context.attempt_id })
    });
    context = {
      ...context,
      verification_index: 0,
      verification_wait_completed: true
    };
    await this.writeContext(snapshot.run_id, executionId, context);
    return resumed;
  }

  async cancelBeforeSubmit(executionId: string): Promise<BrowserExecutionSnapshot> {
    const snapshot = await this.executions.read(executionId);
    if (
      ['submit_attempted', 'outcome_resolving', 'public_verifying', 'finalized', 'partial',
        'published_unverified', 'outcome_unknown', 'failed_after_submit', 'verification_conflict']
        .includes(snapshot.state)
    ) {
      throw new HarnessError('STATE_TRANSITION_INVALID', 'cannot cancel after Submit was attempted');
    }
    return this.executions.transition(executionId, 'cancelled_before_submit', {
      event_type: 'cancelled_by_human'
    });
  }

  private async crossSubmitBarrier(
    snapshot: BrowserExecutionSnapshot,
    context: StoredExecutionContext,
    plan: BrowserPublicationPlan,
    observation: BrowserObservation
  ): Promise<BrowserCommand> {
    if (plan.schema_version === '2.0') {
      verifyApprovalV2(plan, await this.store.readJson<ApprovalV2>(context.approval_path), this.now());
    } else {
      verifyApprovalV2_1(plan, await this.store.readJson<ApprovalV2_1>(context.approval_path), this.now());
    }
    if (
      context.attempt_id !== null ||
      context.submit_command_count !== 0 ||
      context.observed_account?.toLowerCase() !== plan.intent.target_account.toLowerCase() ||
      context.current_page_revision !== observation.page_revision
    ) {
      throw new HarnessError('SUBMIT_ALREADY_ATTEMPTED', 'Submit Barrier is stale or already crossed');
    }
    const decision = nextComposerDecision(
      this.inflateComposer(context.composer, plan),
      observation,
      this.contract
    );
    if (decision.kind !== 'verified') {
      throw new HarnessError(
        decision.kind === 'blocked' ? decision.code : 'COMPOSER_CONTENT_MISMATCH',
        decision.kind === 'blocked' ? decision.message : 'composer changed before Submit'
      );
    }
    const attemptId = this.attemptId();
    const armedAt = this.now().toISOString();
    await this.executions.transition(snapshot.execution_id, 'submit_armed', {
      event_type: 'submit_armed',
      attempt_id: attemptId,
      latest_observation_id: observation.observation_id
    });
    context = { ...context, attempt_id: attemptId, armed_at: armedAt };
    await this.writeContext(snapshot.run_id, snapshot.execution_id, context);
    const command = await this.broker.issue({
      execution_id: snapshot.execution_id,
      run_id: snapshot.run_id,
      kind: 'click',
      purpose: 'submit_once',
      expected_page_revision: observation.page_revision,
      allowed_origin: 'https://x.com',
      side_effect: 'submit',
      payload: { kind: 'click', target_ref: decision.submit_ref }
    });
    const attemptedAt = this.now().toISOString();
    context = {
      ...context,
      pending_command_id: command.command_id,
      submit_command_count: 1,
      attempted_at: attemptedAt
      ,submit_command_id: command.command_id
    };
    await this.writeContext(snapshot.run_id, snapshot.execution_id, context);
    await this.executions.transition(snapshot.execution_id, 'submit_attempted', {
      event_type: 'submit_command_issued',
      attempt_id: attemptId,
      command_id: command.command_id,
      evidence_digest: command.payload_digest,
      submit_command_count: 1,
      latest_observation_id: observation.observation_id
    });
    return command;
  }

  private async issueObservation(
    snapshot: BrowserExecutionSnapshot,
    context: StoredExecutionContext,
    purpose: string
  ): Promise<BrowserCommand> {
    return this.issueAndPersist(snapshot, context, {
      execution_id: snapshot.execution_id,
      run_id: snapshot.run_id,
      kind: 'observe_page',
      purpose,
      expected_page_revision: context.current_page_revision,
      allowed_origin: 'https://x.com',
      side_effect: 'read',
      payload: { kind: 'observe_page', scope: 'x_page' }
    });
  }

  private async issueAndPersist(
    snapshot: BrowserExecutionSnapshot,
    context: StoredExecutionContext,
    input: Parameters<CommandBroker['issue']>[0]
  ): Promise<BrowserCommand> {
    const command = await this.broker.issue(input);
    await this.writeContext(snapshot.run_id, snapshot.execution_id, {
      ...context,
      pending_command_id: command.command_id
    });
    return command;
  }

  private async readSubmitResult(
    snapshot: BrowserExecutionSnapshot,
    context: StoredExecutionContext
  ): Promise<BrowserActionResult> {
    if (context.submit_command_id === null) {
      throw new HarnessError('PUBLICATION_OUTCOME_UNKNOWN', 'Submit result reference is missing');
    }
    return this.store.readJson<BrowserActionResult>(
      `${this.prefix(snapshot.run_id, snapshot.execution_id)}/results/${context.submit_command_id}.json`
    );
  }

  private async finalizeOutcome(
    snapshot: BrowserExecutionSnapshot,
    context: StoredExecutionContext,
    plan: BrowserPublicationPlan,
    decision: Exclude<OutcomeDecision, { readonly kind: 'verify_again' }>,
    verification: PublicVerificationResult,
    observation: BrowserObservation | null
  ): Promise<BrowserExecutionSnapshot> {
    const state = decision.kind;
    const terminal = await this.executions.transition(snapshot.execution_id, state, {
      event_type: `publication_${state}`,
      ...(context.attempt_id === null ? {} : { attempt_id: context.attempt_id }),
      evidence_digest: sha256({ decision, verification })
    });
    const receipt = await this.persistOutcomeReceipt(
      terminal,
      context,
      plan,
      state,
      verification,
      observation
    );
    await this.writeContext(snapshot.run_id, snapshot.execution_id, {
      ...context,
      latest_receipt_id: receipt.receipt_id,
      latest_receipt_path: `receipts/${receipt.receipt_id}.json`
    });
    return terminal;
  }

  private async persistOutcomeReceipt(
    snapshot: BrowserExecutionSnapshot,
    context: StoredExecutionContext,
    plan: BrowserPublicationPlan,
    status: ReceiptStatusV2,
    verification: PublicVerificationResult,
    observation: BrowserObservation | null
  ): Promise<PublicationReceiptV2 | PublicationReceiptV2_1> {
    if (
      context.attempt_id === null ||
      context.armed_at === null ||
      context.attempted_at === null
    ) {
      throw new HarnessError('PUBLICATION_OUTCOME_UNKNOWN', 'submission evidence is incomplete');
    }
    const verifiedPosts =
      verification.kind === 'full_match' || verification.kind === 'partial'
        ? verification.posts
        : [];
    const matchedOrdinals = verifiedPosts.map((post) => post.ordinal);
    const publicResult =
      verifiedPosts.length === 0
        ? null
        : {
            root_url: verifiedPosts[0]!.canonical_url,
            published_at:
              observation?.public_posts.find((post) => post.post_id === verifiedPosts[0]!.post_id)
                ?.published_at ?? observation?.observed_at ?? this.now().toISOString(),
            ordered_post_ids: verifiedPosts.map((post) => post.post_id),
            posts: verifiedPosts,
            matched_ordinals: matchedOrdinals,
            missing_ordinals:
              verification.kind === 'partial' ? verification.missing_ordinals : [],
            unexpected_post_ids:
              verification.kind === 'conflict' ? verification.unexpected_post_ids : []
          };
    const full = verification.kind === 'full_match' && status === 'finalized';
    if (plan.schema_version === '2.1') {
      const approval = await this.store.readJson<ApprovalV2_1>(context.approval_path);
      const expected = plan.items.flatMap((item) => item.attachments.map((asset) => ({ ordinal: item.ordinal, asset })))[0];
      const publicMedia = verification.kind === 'full_match' ? verification.media_evidence : undefined;
      const limitations = [
        ...(context.source_asset_verified ? [] : ['source asset was not verified immediately before upload']),
        ...(context.composer_attachment_verified ? [] : ['Composer attachment was not verified before Submit']),
        ...(publicMedia?.limitations ?? ['public media was not verified'])
      ];
      const mappedStatus: ReceiptStatusV2_1 =
        status === 'published_unverified' ? 'published_media_unverified' : status;
      const receipt = createPublicationReceiptV2_1(
        {
          plan,
          supersedes_receipt_id: context.latest_receipt_id,
          execution_id: snapshot.execution_id,
          attempt_id: context.attempt_id,
          run_id: snapshot.run_id,
          platform: 'x',
          adapter: 'browser',
          status: mappedStatus,
          target_account: plan.intent.target_account,
          observed_account: context.observed_account,
          plan_digest: plan.plan_digest,
          approval: {
            plan_digest: plan.plan_digest,
            approval_digest: approval.approval_digest,
            approved_at: approval.approved_at,
            expires_at: approval.expires_at
          },
          submission: {
            armed_at: context.armed_at,
            attempted_at: context.attempted_at,
            submit_command_count: 1,
            page_contract_version: context.page_contract_version,
            executor_version: context.executor_version
          },
          public_result: publicResult,
          verification: {
            source: 'browser_public_page',
            strength: full && publicMedia?.verified === true ? 'public_browser_verified' : 'unverified',
            verified_at: full ? observation?.observed_at ?? this.now().toISOString() : null,
            account_match: context.observed_account?.toLowerCase() === plan.intent.target_account.toLowerCase(),
            count_match: verification.kind === 'full_match',
            content_match: verification.kind === 'full_match' || verification.kind === 'partial',
            order_match: verification.kind === 'full_match' || verification.kind === 'partial',
            reply_chain_match: verification.kind === 'full_match' || verification.kind === 'partial',
            links_match: verification.kind === 'full_match' || verification.kind === 'partial',
            unique_post_ids: new Set(verifiedPosts.map((post) => post.post_id)).size === verifiedPosts.length,
            evidence_digest: sha256({ verification, page_revision: observation?.page_revision ?? null })
          },
          media_evidence: expected === undefined
            ? null
            : {
                asset_id: expected.asset.asset_id,
                source_digest: expected.asset.digest,
                source_asset_verified: context.source_asset_verified,
                composer_attachment_verified: context.composer_attachment_verified,
                public_media_verified: publicMedia?.verified ?? false,
                target_ordinal: expected.ordinal,
                alt_text_verified: publicMedia?.alt_text_verified ?? null,
                public_media_url: publicMedia?.public_media_url ?? null,
                limitations
              }
        },
        this.receiptId,
        this.now
      );
      const receiptPath = `receipts/${receipt.receipt_id}.json`;
      await this.store.writeNew(receiptPath, receipt);
      await notifyTerminalSafely(this.store, this.terminalNotifier, {
        notification_id: `publication_receipt_${receipt.receipt_id}`,
        kind: 'publication_receipt_terminal', publication_kind: 'x_post',
        workspace_relative_path: receiptPath, role: 'publication_receipt', media_type: 'application/json',
        canonical: true, privacy_classification: 'internal', occurred_at: receipt.created_at
      });
      return receipt;
    }
    const approval = await this.store.readJson<ApprovalV2>(context.approval_path);
    const receipt = createPublicationReceiptV2(
      {
        plan,
        supersedes_receipt_id: context.latest_receipt_id,
        execution_id: snapshot.execution_id,
        attempt_id: context.attempt_id,
        run_id: snapshot.run_id,
        platform: 'x',
        adapter: 'browser',
        status,
        target_account: plan.intent.target_account,
        observed_account: context.observed_account,
        approval: {
          plan_digest: plan.plan_digest,
          approval_digest: approval.approval_digest,
          approved_at: approval.approved_at,
          expires_at: approval.expires_at
        },
        submission: {
          armed_at: context.armed_at,
          attempted_at: context.attempted_at,
          submit_command_count: 1,
          page_contract_version: context.page_contract_version,
          executor_version: context.executor_version
        },
        public_result: publicResult,
        verification: {
          source: 'browser_public_page',
          strength: full ? 'public_browser_verified' : 'unverified',
          verified_at: full ? observation?.observed_at ?? this.now().toISOString() : null,
          account_match:
            context.observed_account?.toLowerCase() === plan.intent.target_account.toLowerCase(),
          count_match: full,
          content_match: full || verification.kind === 'partial',
          order_match: full || verification.kind === 'partial',
          reply_chain_match: full || verification.kind === 'partial',
          links_match: full || verification.kind === 'partial',
          unique_post_ids: new Set(verifiedPosts.map((post) => post.post_id)).size === verifiedPosts.length,
          evidence_digest: sha256({ verification, page_revision: observation?.page_revision ?? null })
        }
      },
      this.receiptId,
      this.now
    );
    const receiptPath = `receipts/${receipt.receipt_id}.json`;
    await this.store.writeNew(receiptPath, receipt);
    await notifyTerminalSafely(this.store, this.terminalNotifier, {
      notification_id: `publication_receipt_${receipt.receipt_id}`,
      kind: 'publication_receipt_terminal', publication_kind: 'x_post',
      workspace_relative_path: receiptPath, role: 'publication_receipt', media_type: 'application/json',
      canonical: true, privacy_classification: 'internal', occurred_at: receipt.created_at
    });
    return receipt;
  }

  private async failPreSubmit(
    executionId: string,
    state: BrowserExecutionState,
    code: ErrorCode,
    message: string
  ): Promise<never> {
    if (state !== 'pre_submit_failed') {
      await this.executions.transition(executionId, 'pre_submit_failed', {
        event_type: `pre_submit_failed:${code}`
      });
    }
    throw new HarnessError(code, message);
  }

  private inflateComposer(stored: StoredComposerContext, plan: BrowserPublicationPlan): ComposerContext {
    return { plan, ...stored };
  }

  private storeComposer(context: ComposerContext): StoredComposerContext {
    return {
      expected_account: context.expected_account,
      created_item_refs: context.created_item_refs,
      next_ordinal: context.next_ordinal,
      add_retry_count: context.add_retry_count,
      last_page_revision: context.last_page_revision,
      ...(context.quote_entry_step === undefined ? {} : { quote_entry_step: context.quote_entry_step }),
      attachment_command_issued: context.attachment_command_issued ?? false,
      alt_text_command_issued: context.alt_text_command_issued ?? false,
      attachment_retry_count: context.attachment_retry_count ?? 0
    };
  }

  private async readObservation(
    snapshot: BrowserExecutionSnapshot,
    observationId: string
  ): Promise<BrowserObservation> {
    return this.store.readJson<BrowserObservation>(
      `${this.prefix(snapshot.run_id, snapshot.execution_id)}/observations/${observationId}.json`
    );
  }

  private async readContext(snapshot: BrowserExecutionSnapshot): Promise<StoredExecutionContext> {
    return this.store.readJson<StoredExecutionContext>(
      `${this.prefix(snapshot.run_id, snapshot.execution_id)}/execution-context.json`
    );
  }

  private writeContext(
    runId: string,
    executionId: string,
    context: StoredExecutionContext
  ): Promise<unknown> {
    return this.store.replaceAtomic(
      `${this.prefix(runId, executionId)}/execution-context.json`,
      context
    );
  }

  private prefix(runId: string, executionId: string): string {
    return `runs/${runId}/x/browser/${executionId}`;
  }

  private assertCapabilityManifest(manifest: BrowserCapabilityManifest, visual = false): void {
    if (
      manifest.executor !== 'codex-chrome' ||
      manifest.browser_family !== 'chrome' ||
      !REQUIRED_CAPABILITIES.every((kind) => manifest.capabilities.includes(kind)) ||
      (visual && !REQUIRED_VISUAL_CAPABILITIES.every((kind) => manifest.capabilities.includes(kind))) ||
      !Number.isFinite(Date.parse(manifest.observed_at))
    ) {
      throw new HarnessError(
        visual ? 'BROWSER_FILE_UPLOAD_UNAVAILABLE' : 'BROWSER_EXECUTOR_INCOMPATIBLE',
        visual
          ? 'Codex Chrome executor lacks restricted file upload or Alt Text capability'
          : 'Codex Chrome executor capabilities are missing or incompatible'
      );
    }
  }

  private isTerminal(state: BrowserExecutionState): boolean {
    return [
      'finalized',
      'partial',
      'failed_after_submit',
      'verification_conflict',
      'cancelled_before_submit'
    ].includes(state);
  }
}
