import { randomUUID } from 'node:crypto';

import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import type { ExecutionStore } from '../../../core/execution-store.js';
import {
  assertPublicationPlanV2_1,
  type PublicationPlanV2_1
} from '../../../core/publication-plan-v2-1.js';
import { validateContract } from '../../../core/schema-validator.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import { verifyPackageVisualAsset } from '../../../core/visual-assets.js';
import {
  type BrowserActionResult,
  type BrowserActionResultInput,
  type BrowserCommand,
  type BrowserCommandClaim,
  type BrowserObservation,
  type IssueBrowserCommandInput,
  computePageRevision
} from './browser-protocol.js';

interface BrowserContext {
  readonly latest_observation_id: string;
  readonly page_revision: string;
}

export interface CommandBrokerApi {
  issue(input: IssueBrowserCommandInput): Promise<BrowserCommand>;
  read(executionId: string, commandId: string): Promise<BrowserCommand>;
  claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
  acceptResult(executionId: string, result: BrowserActionResultInput): Promise<BrowserActionResult>;
}

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class CommandBroker implements CommandBrokerApi {
  constructor(
    private readonly store: WorkspaceStore,
    private readonly executions: ExecutionStore,
    private readonly now: () => Date = () => new Date(),
    private readonly commandId: () => string = () => `cmd_${randomUUID()}`
  ) {}

  async issue(input: IssueBrowserCommandInput): Promise<BrowserCommand> {
    this.assertSafeId(input.execution_id);
    const execution = await this.executions.read(input.execution_id);
    if (execution.run_id !== input.run_id || input.kind !== input.payload.kind) {
      throw new HarnessError('CONTRACT_INVALID', 'browser command does not match execution or payload');
    }
    if (
      input.payload.kind === 'navigate' &&
      !this.isAllowedXUrl(input.payload.url)
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'browser navigation must remain on x.com');
    }
    if (input.payload.kind === 'upload_attachment' || input.payload.kind === 'set_attachment_alt_text') {
      await this.assertVisualCommandAuthorized(input.execution_id, execution.run_id, input.payload);
    }
    const command = validateContract<BrowserCommand>('browser-command', {
      ...input,
      schema_version: '2.0',
      command_id: this.commandId(),
      payload_digest: sha256(input.payload),
      issued_at: this.now().toISOString()
    });
    this.assertSafeId(command.command_id);

    return this.executions.withExecutionLock(input.execution_id, async () => {
      if (command.side_effect === 'submit') {
        try {
          await this.store.writeNew(this.submitMarkerPath(execution.run_id, input.execution_id), {
            command_id: command.command_id,
            payload_digest: command.payload_digest,
            issued_at: command.issued_at
          });
        } catch (error) {
          if ((error as HarnessError).code === 'ARTIFACT_EXISTS') {
            throw new HarnessError(
              'SUBMIT_ALREADY_ATTEMPTED',
              'a Submit Command has already been issued for this execution'
            );
          }
          throw error;
        }
      }
      await this.store.writeNew(
        this.commandPath(execution.run_id, input.execution_id, command.command_id),
        command
      );
      return command;
    });
  }

  async read(executionId: string, commandId: string): Promise<BrowserCommand> {
    this.assertSafeId(executionId);
    this.assertSafeId(commandId);
    const execution = await this.executions.read(executionId);
    const command = await this.store.readJson<BrowserCommand>(
      this.commandPath(execution.run_id, executionId, commandId)
    );
    validateContract<BrowserCommand>('browser-command', command);
    if (command.payload_digest !== sha256(command.payload)) {
      throw new HarnessError('CONTRACT_INVALID', 'browser command payload digest is stale');
    }
    return command;
  }

  async claim(executionId: string, commandId: string): Promise<BrowserCommandClaim> {
    const command = await this.read(executionId, commandId);
    if (command.payload.kind === 'upload_attachment') {
      const packageRef = await this.store.readJson<{ readonly root: string; readonly digest: string }>(`${command.payload.package_root}/package-ref.json`);
      if (packageRef.root !== command.payload.package_root || packageRef.digest !== command.payload.package_digest) {
        throw new HarnessError('VISUAL_DIGEST_MISMATCH', 'upload Package identity no longer matches the locked Plan');
      }
      await verifyPackageVisualAsset(this.store, command.payload.package_root, command.payload.asset);
    }
    if (command.expected_page_revision !== null) {
      let context: BrowserContext;
      try {
        context = await this.store.readJson<BrowserContext>(
          this.contextPath(command.run_id, executionId)
        );
      } catch {
        throw new HarnessError('STALE_PAGE_REVISION', 'no current X page revision is available');
      }
      if (context.page_revision !== command.expected_page_revision) {
        throw new HarnessError('STALE_PAGE_REVISION', 'X page revision changed before command claim');
      }
    }
    const claim: BrowserCommandClaim = {
      schema_version: '2.0',
      execution_id: executionId,
      command_id: commandId,
      claimed: true,
      claimed_at: this.now().toISOString()
    };
    try {
      await this.store.writeNew(this.claimPath(command.run_id, executionId, commandId), claim);
    } catch (error) {
      if ((error as HarnessError).code === 'ARTIFACT_EXISTS') {
        throw new HarnessError('COMMAND_REPLAY_REJECTED', 'browser command was already claimed');
      }
      throw error;
    }
    return claim;
  }

  async acceptResult(
    executionId: string,
    resultInput: BrowserActionResultInput
  ): Promise<BrowserActionResult> {
    const command = await this.read(executionId, resultInput.command_id);
    if (
      resultInput.schema_version !== '2.0' ||
      resultInput.execution_id !== executionId ||
      !Number.isFinite(Date.parse(resultInput.reported_at))
    ) {
      throw new HarnessError('CONTRACT_INVALID', 'browser result does not match its command');
    }
    if (!(await this.store.exists(this.claimPath(command.run_id, executionId, command.command_id)))) {
      throw new HarnessError('COMMAND_REPLAY_REJECTED', 'browser result requires a durable command claim');
    }
    if (await this.store.exists(this.resultPath(command.run_id, executionId, command.command_id))) {
      throw new HarnessError('COMMAND_REPLAY_REJECTED', 'browser command result was already recorded');
    }

    let observation: BrowserObservation | null = null;
    if (resultInput.observation !== null) {
      if (
        resultInput.observation.execution_id !== executionId ||
        resultInput.observation.command_id !== command.command_id ||
        resultInput.observation.origin !== command.allowed_origin
      ) {
        throw new HarnessError('CONTRACT_INVALID', 'browser observation does not match command scope');
      }
      this.assertObservationScope(resultInput.observation);
      observation = validateContract<BrowserObservation>('browser-observation', {
        ...resultInput.observation,
        page_revision: computePageRevision(resultInput.observation)
      });
    }
    const result: BrowserActionResult = {
      schema_version: '2.0',
      execution_id: executionId,
      command_id: command.command_id,
      status: resultInput.status,
      resulting_page_revision: observation?.page_revision ?? null,
      observation,
      error_code: resultInput.error_code,
      reported_at: resultInput.reported_at
    };
    if (observation !== null) {
      this.assertSafeId(observation.observation_id);
      await this.store.writeNew(
        this.observationPath(command.run_id, executionId, observation.observation_id),
        observation
      );
      await this.store.replaceAtomic(this.contextPath(command.run_id, executionId), {
        latest_observation_id: observation.observation_id,
        page_revision: observation.page_revision
      } satisfies BrowserContext);
    }
    await this.store.writeNew(
      this.resultPath(command.run_id, executionId, command.command_id),
      result
    );
    return result;
  }

  private prefix(runId: string, executionId: string): string {
    return `runs/${runId}/x/browser/${executionId}`;
  }

  private commandPath(runId: string, executionId: string, commandId: string): string {
    return `${this.prefix(runId, executionId)}/commands/${commandId}.json`;
  }

  private claimPath(runId: string, executionId: string, commandId: string): string {
    return `${this.prefix(runId, executionId)}/claims/${commandId}.json`;
  }

  private resultPath(runId: string, executionId: string, commandId: string): string {
    return `${this.prefix(runId, executionId)}/results/${commandId}.json`;
  }

  private observationPath(runId: string, executionId: string, observationId: string): string {
    return `${this.prefix(runId, executionId)}/observations/${observationId}.json`;
  }

  private contextPath(runId: string, executionId: string): string {
    return `${this.prefix(runId, executionId)}/page-context.json`;
  }

  private submitMarkerPath(runId: string, executionId: string): string {
    return `${this.prefix(runId, executionId)}/submit-command.json`;
  }

  private assertSafeId(value: string): void {
    if (!SAFE_ID.test(value)) {
      throw new HarnessError('WORKSPACE_PATH_INVALID', 'browser protocol id is unsafe');
    }
  }

  private async assertVisualCommandAuthorized(
    executionId: string,
    runId: string,
    payload: Extract<IssueBrowserCommandInput['payload'], { kind: 'upload_attachment' | 'set_attachment_alt_text' }>
  ): Promise<void> {
    const plan = await this.store.readJson<PublicationPlanV2_1>(`${this.prefix(runId, executionId)}/publication-plan-2.1.json`);
    assertPublicationPlanV2_1(plan);
    if (plan.run_id !== runId) throw new HarnessError('CONTRACT_INVALID', 'visual Browser Plan run does not match execution');
    const expected = plan.items.flatMap((item) => item.attachments.map((asset) => ({ ordinal: item.ordinal, asset })))[0];
    if (expected === undefined || expected.ordinal !== payload.target_ordinal) {
      throw new HarnessError('X_ATTACHMENT_MISMATCH', 'visual Browser command ordinal is outside the locked Plan');
    }
    if (payload.kind === 'upload_attachment') {
      if (plan.article_package === null || payload.package_root !== plan.article_package.root || payload.package_digest !== plan.article_package.digest || sha256(payload.asset) !== sha256(expected.asset)) {
        throw new HarnessError('VISUAL_DIGEST_MISMATCH', 'upload command asset or Package is outside the locked Plan');
      }
    } else if (payload.alt_text !== expected.asset.alt_text) {
      throw new HarnessError('X_ALT_TEXT_MISMATCH', 'Alt Text command differs from the locked Plan');
    }
  }

  private isAllowedXUrl(value: string): boolean {
    try {
      return new URL(value).origin.toLowerCase() === 'https://x.com';
    } catch {
      return false;
    }
  }

  private assertObservationScope(observation: BrowserActionResultInput['observation']): void {
    if (observation === null || !this.isAllowedXUrl(observation.canonical_url)) {
      throw new HarnessError('CONTRACT_INVALID', 'browser observation URL must remain on x.com');
    }
    const containsUnrelatedPageContent = observation.nodes.some((node) =>
      ['article', 'feed', 'listitem'].includes(node.role.toLowerCase())
    );
    const serializedSemanticData = JSON.stringify({
      nodes: observation.nodes,
      public_posts: observation.public_posts
    });
    if (
      containsUnrelatedPageContent ||
      /Bearer\s|Cookie:|password[_ -]?field|"type"\s*:\s*"password"/i.test(serializedSemanticData)
    ) {
      throw new HarnessError(
        'CONTRACT_INVALID',
        'browser observation contains unrelated or sensitive page data'
      );
    }
  }
}
