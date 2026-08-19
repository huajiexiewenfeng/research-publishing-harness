import { randomUUID } from 'node:crypto';

import {
  type BrowserExecutionEventV2,
  type BrowserExecutionSnapshot,
  type BrowserExecutionState,
  type CreateBrowserExecutionInput,
  type TransitionEvidence,
  transitionBrowserExecution
} from './browser-execution.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';

interface ExecutionLocator {
  readonly execution_id: string;
  readonly run_id: string;
  readonly plan_id: string;
  readonly created_at: string;
}

export interface ExecutionStoreApi {
  create(input: CreateBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
  read(executionId: string): Promise<BrowserExecutionSnapshot>;
  transition(
    executionId: string,
    next: BrowserExecutionState,
    evidence?: TransitionEvidence
  ): Promise<BrowserExecutionSnapshot>;
  rebuild(executionId: string): Promise<BrowserExecutionSnapshot>;
  withExecutionLock<T>(executionId: string, operation: () => Promise<T>): Promise<T>;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class ExecutionStore implements ExecutionStoreApi {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly now: () => Date = () => new Date(),
    private readonly eventId: () => string = () => `evt_${randomUUID()}`
  ) {}

  async create(input: CreateBrowserExecutionInput): Promise<BrowserExecutionSnapshot> {
    this.assertSafeId(input.execution_id, 'execution');
    this.assertSafeId(input.run_id, 'run');
    this.assertSafeId(input.plan_id, 'plan');
    if (!Number.isFinite(Date.parse(input.created_at))) {
      throw new HarnessError('CONTRACT_INVALID', 'execution created_at must be an ISO date-time');
    }
    const locator: ExecutionLocator = input;
    await this.store.writeNew(this.locatorPath(input.execution_id), locator);
    const snapshot = this.initialSnapshot(locator);
    await this.store.replaceAtomic(this.statePath(locator), snapshot);
    return snapshot;
  }

  async read(executionId: string): Promise<BrowserExecutionSnapshot> {
    const locator = await this.readLocator(executionId);
    try {
      const snapshot = await this.store.readJson<BrowserExecutionSnapshot>(this.statePath(locator));
      const ledgerSequence = await this.ledgerSequence(locator);
      if (
        snapshot.execution_id === executionId &&
        snapshot.run_id === locator.run_id &&
        snapshot.plan_id === locator.plan_id &&
        snapshot.sequence === ledgerSequence
      ) {
        return snapshot;
      }
    } catch {
      // The append-only ledger is authoritative when the projection is absent or corrupt.
    }
    return this.rebuild(executionId);
  }

  async transition(
    executionId: string,
    next: BrowserExecutionState,
    evidence?: TransitionEvidence
  ): Promise<BrowserExecutionSnapshot> {
    return this.withExecutionLock(executionId, async () => {
      const locator = await this.readLocator(executionId);
      const current = await this.rebuild(executionId);
      transitionBrowserExecution(current.state, next);
      const submitCommandCount = evidence?.submit_command_count ?? current.submit_command_count;
      if (submitCommandCount < current.submit_command_count) {
        throw new HarnessError('CONTRACT_INVALID', 'submit command count cannot decrease');
      }
      const event = validateContract<BrowserExecutionEventV2>('browser-execution-event', {
        schema_version: '2.0',
        event_id: this.eventId(),
        execution_id: executionId,
        attempt_id: evidence?.attempt_id ?? current.attempt_id,
        sequence: current.sequence + 1,
        event_type: evidence?.event_type ?? 'state_transition',
        occurred_at: this.now().toISOString(),
        previous_state: current.state,
        next_state: next,
        ...(evidence?.command_id === undefined ? {} : { command_id: evidence.command_id }),
        ...(evidence?.evidence_digest === undefined
          ? {}
          : { evidence_digest: evidence.evidence_digest }),
        ...(evidence?.submit_command_count === undefined
          ? {}
          : { submit_command_count: evidence.submit_command_count }),
        ...(evidence?.latest_observation_id === undefined
          ? {}
          : { latest_observation_id: evidence.latest_observation_id })
      });
      await this.store.appendLine(this.eventsPath(locator), JSON.stringify(event));
      const snapshot = this.project(current, event);
      await this.store.replaceAtomic(this.statePath(locator), snapshot);
      return snapshot;
    });
  }

  async rebuild(executionId: string): Promise<BrowserExecutionSnapshot> {
    const locator = await this.readLocator(executionId);
    let snapshot = this.initialSnapshot(locator);
    if (await this.store.exists(this.eventsPath(locator))) {
      const lines = (await this.store.readText(this.eventsPath(locator)))
        .split('\n')
        .filter((line) => line.length > 0);
      for (const line of lines) {
        const event = validateContract<BrowserExecutionEventV2>(
          'browser-execution-event',
          JSON.parse(line) as unknown
        );
        if (
          event.execution_id !== executionId ||
          event.sequence !== snapshot.sequence + 1 ||
          event.previous_state !== snapshot.state
        ) {
          throw new HarnessError('CONTRACT_INVALID', 'browser execution ledger is discontinuous');
        }
        transitionBrowserExecution(snapshot.state, event.next_state);
        snapshot = this.project(snapshot, event);
      }
    }
    await this.store.replaceAtomic(this.statePath(locator), snapshot);
    return snapshot;
  }

  async withExecutionLock<T>(executionId: string, operation: () => Promise<T>): Promise<T> {
    const locator = await this.readLocator(executionId);
    return this.store.withLock(this.lockPath(locator), operation);
  }

  private initialSnapshot(locator: ExecutionLocator): BrowserExecutionSnapshot {
    return {
      schema_version: '2.0',
      execution_id: locator.execution_id,
      run_id: locator.run_id,
      plan_id: locator.plan_id,
      state: 'created',
      sequence: 0,
      attempt_id: null,
      submit_command_count: 0,
      latest_command_id: null,
      latest_observation_id: null,
      updated_at: locator.created_at
    };
  }

  private project(
    current: BrowserExecutionSnapshot,
    event: BrowserExecutionEventV2
  ): BrowserExecutionSnapshot {
    return {
      ...current,
      state: event.next_state,
      sequence: event.sequence,
      attempt_id: event.attempt_id,
      submit_command_count: event.submit_command_count ?? current.submit_command_count,
      latest_command_id: event.command_id ?? current.latest_command_id,
      latest_observation_id: event.latest_observation_id ?? current.latest_observation_id,
      updated_at: event.occurred_at
    };
  }

  private async ledgerSequence(locator: ExecutionLocator): Promise<number> {
    if (!(await this.store.exists(this.eventsPath(locator)))) return 0;
    return (await this.store.readText(this.eventsPath(locator)))
      .split('\n')
      .filter((line) => line.length > 0).length;
  }

  private async readLocator(executionId: string): Promise<ExecutionLocator> {
    this.assertSafeId(executionId, 'execution');
    return this.store.readJson<ExecutionLocator>(this.locatorPath(executionId));
  }

  private locatorPath(executionId: string): string {
    return `x/browser-executions/${executionId}.json`;
  }

  private prefix(locator: ExecutionLocator): string {
    return `runs/${locator.run_id}/x/browser/${locator.execution_id}`;
  }

  private statePath(locator: ExecutionLocator): string {
    return `${this.prefix(locator)}/state.json`;
  }

  private eventsPath(locator: ExecutionLocator): string {
    return `${this.prefix(locator)}/events.jsonl`;
  }

  private lockPath(locator: ExecutionLocator): string {
    return `${this.prefix(locator)}/execution.lock`;
  }

  private assertSafeId(value: string, kind: string): void {
    if (!SAFE_ID.test(value)) {
      throw new HarnessError('WORKSPACE_PATH_INVALID', `${kind} id contains unsafe path characters`);
    }
  }
}
