import { randomUUID } from 'node:crypto';

import type { ApprovalV2 } from '../../../core/approval-v2.js';
import { verifyApprovalV2 } from '../../../core/approval-v2.js';
import type {
  BrowserExecutionSnapshot,
  BrowserExecutionState
} from '../../../core/browser-execution.js';
import { sha256 } from '../../../core/digest.js';
import { HarnessError, type ErrorCode } from '../../../core/errors.js';
import type { ExecutionStore } from '../../../core/execution-store.js';
import type { PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import { assertPublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import {
  type ComposerContext,
  nextComposerDecision
} from './composer-protocol.js';
import type {
  BrowserActionResultInput,
  BrowserCapabilityManifest,
  BrowserCommand,
  BrowserCommandClaim,
  BrowserObservation
} from './browser-protocol.js';
import type { CommandBroker } from './command-broker.js';
import type { XPageContract } from './page-contract.js';

export interface BrowserAdapterApi {
  start(input: StartBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
  next(executionId: string): Promise<BrowserCommand | null>;
  claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
  report(executionId: string, result: BrowserActionResultInput): Promise<BrowserExecutionSnapshot>;
  status(executionId: string): Promise<BrowserExecutionStatus>;
  cancelBeforeSubmit(executionId: string): Promise<BrowserExecutionSnapshot>;
}

export interface StartBrowserExecutionInput {
  readonly execution_id: string;
  readonly plan: PublicationPlanV2;
  readonly approval: ApprovalV2;
  readonly capability_manifest: BrowserCapabilityManifest;
}

export interface BrowserExecutionStatus {
  readonly snapshot: BrowserExecutionSnapshot;
  readonly pending_command: BrowserCommand | null;
  readonly latest_receipt_path: string | null;
  readonly resumable_verification: boolean;
}

interface StoredComposerContext {
  readonly expected_account: string;
  readonly created_item_refs: readonly string[];
  readonly next_ordinal: number;
  readonly add_retry_count: number;
  readonly last_page_revision: string | null;
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
}

const REQUIRED_CAPABILITIES = [
  'observe_page',
  'navigate',
  'click',
  'set_text',
  'press_key',
  'wait'
] as const;

export class BrowserAdapter implements BrowserAdapterApi {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly executions: ExecutionStore,
    private readonly broker: CommandBroker,
    private readonly contract: XPageContract,
    private readonly now: () => Date = () => new Date(),
    private readonly attemptId: () => string = () => `attempt_${randomUUID()}`
  ) {}

  async start(input: StartBrowserExecutionInput): Promise<BrowserExecutionSnapshot> {
    if ((input.plan as { schema_version?: string }).schema_version !== '2.0') {
      throw new HarnessError('CONTRACT_INVALID', 'Browser Adapter accepts PublicationPlanV2 only');
    }
    assertPublicationPlanV2(input.plan);
    if (input.plan.intent.adapter !== 'browser') {
      throw new HarnessError('CONTRACT_INVALID', 'Browser Adapter requires a browser publication intent');
    }
    if (input.plan.intent.media.length > 0) {
      throw new HarnessError('UNSUPPORTED_PUBLICATION_FEATURE', 'Browser Adapter V2 is text-only');
    }
    this.assertCapabilityManifest(input.capability_manifest);
    verifyApprovalV2(input.plan, input.approval, this.now());

    await this.executions.create({
      execution_id: input.execution_id,
      run_id: input.plan.run_id,
      plan_id: input.plan.plan_id,
      created_at: this.now().toISOString()
    });
    const prefix = this.prefix(input.plan.run_id, input.execution_id);
    const planPath = `${prefix}/publication-plan-v2.json`;
    const approvalPath = `${prefix}/approval-v2.json`;
    const manifestPath = `${prefix}/capability-manifest.json`;
    await this.store.writeNew(planPath, input.plan);
    await this.store.writeNew(approvalPath, input.approval);
    await this.store.writeNew(manifestPath, input.capability_manifest);
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
        last_page_revision: null
      },
      pending_command_id: null,
      attempt_id: null,
      submit_command_count: 0,
      observed_account: null,
      read_retry_count: 0,
      barrier_observation_fresh: false,
      latest_receipt_path: null,
      armed_at: null,
      attempted_at: null
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
    const plan = await this.store.readJson<PublicationPlanV2>(context.plan_path);
    if (context.pending_command_id !== null) {
      return this.broker.read(executionId, context.pending_command_id);
    }
    if (this.isTerminal(snapshot.state) || snapshot.state === 'submit_attempted') return null;
    if (context.latest_observation_id === null) {
      return this.issueObservation(snapshot, context, 'missing_observation');
    }
    const observation = await this.readObservation(snapshot, context.latest_observation_id);

    if (snapshot.state === 'account_verified' && plan.intent.mode !== 'reply') {
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
      context = { ...context, barrier_observation_fresh: false };
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
    context = { ...context, pending_command_id: null };

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
      const plan = await this.store.readJson<PublicationPlanV2>(context.plan_path);
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
    plan: PublicationPlanV2,
    observation: BrowserObservation
  ): Promise<BrowserCommand> {
    const approval = await this.store.readJson<ApprovalV2>(context.approval_path);
    verifyApprovalV2(plan, approval, this.now());
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

  private inflateComposer(stored: StoredComposerContext, plan: PublicationPlanV2): ComposerContext {
    return { plan, ...stored };
  }

  private storeComposer(context: ComposerContext): StoredComposerContext {
    return {
      expected_account: context.expected_account,
      created_item_refs: context.created_item_refs,
      next_ordinal: context.next_ordinal,
      add_retry_count: context.add_retry_count,
      last_page_revision: context.last_page_revision
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

  private assertCapabilityManifest(manifest: BrowserCapabilityManifest): void {
    if (
      manifest.executor !== 'codex-chrome' ||
      manifest.browser_family !== 'chrome' ||
      !REQUIRED_CAPABILITIES.every((kind) => manifest.capabilities.includes(kind)) ||
      !Number.isFinite(Date.parse(manifest.observed_at))
    ) {
      throw new HarnessError(
        'BROWSER_EXECUTOR_INCOMPATIBLE',
        'Codex Chrome executor capabilities are missing or incompatible'
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
