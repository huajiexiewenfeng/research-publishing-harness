import { isDeepStrictEqual } from 'node:util';

import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import type { ContractName } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';
import type {
  XArticleMaterializationCheckpointV1,
  XArticleMaterializationPlanV1,
  XArticleStageProgressV1
} from './x-article-materialization.js';

export type UpdateCheckpoint = (
  current: XArticleMaterializationCheckpointV1
) => XArticleMaterializationCheckpointV1;

/**
 * Operations sharing an execution lock are fail-busy: a simultaneous loser rejects with
 * EXECUTION_BUSY. A later sequential checkpoint update with a stale revision rejects with
 * ARTICLE_CHECKPOINT_CONFLICT.
 */
export interface XArticleMaterializationStoreApi {
  create(
    plan: XArticleMaterializationPlanV1,
    checkpoint: XArticleMaterializationCheckpointV1
  ): Promise<XArticleMaterializationCheckpointV1>;
  readPlan(executionId: string): Promise<XArticleMaterializationPlanV1>;
  readCheckpoint(executionId: string): Promise<XArticleMaterializationCheckpointV1>;
  updateCheckpoint(
    executionId: string,
    expectedRevision: number,
    update: UpdateCheckpoint
  ): Promise<XArticleMaterializationCheckpointV1>;
  appendProgress(progress: XArticleStageProgressV1): Promise<XArticleStageProgressV1>;
  readProgress(executionId: string): Promise<readonly XArticleStageProgressV1[]>;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

interface MaterializationState {
  readonly plan: XArticleMaterializationPlanV1;
  readonly checkpoint: XArticleMaterializationCheckpointV1;
}

function snapshot<T>(value: T): T {
  return structuredClone(value);
}

export class XArticleMaterializationStore implements XArticleMaterializationStoreApi {
  constructor(private readonly store: WorkspaceStore) {}

  async create(
    plan: XArticleMaterializationPlanV1,
    checkpoint: XArticleMaterializationCheckpointV1
  ): Promise<XArticleMaterializationCheckpointV1> {
    const detachedPlan = snapshot(plan);
    const detachedCheckpoint = snapshot(checkpoint);
    const requestedExecutionId = detachedPlan.execution_id;
    const validatedPlan = validateContract<XArticleMaterializationPlanV1>(
      'x-article-materialization-plan',
      detachedPlan
    );
    this.assertSafeExecutionId(requestedExecutionId);
    const validatedCheckpoint = validateContract<XArticleMaterializationCheckpointV1>(
      'x-article-materialization-checkpoint',
      detachedCheckpoint
    );
    this.assertCheckpointMatchesPlan(
      validatedCheckpoint,
      validatedPlan,
      requestedExecutionId
    );
    if (validatedCheckpoint.revision !== 0) {
      throw this.conflict('initial materialization checkpoint revision must be zero');
    }

    return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
      const planPath = this.planPath(requestedExecutionId);
      const checkpointPath = this.checkpointPath(requestedExecutionId);
      const [planExists, checkpointExists] = await Promise.all([
        this.store.exists(planPath),
        this.store.exists(checkpointPath)
      ]);

      if (planExists && checkpointExists) {
        throw this.conflict('materialization plan and checkpoint already exist');
      }
      if (!planExists && !checkpointExists) {
        await this.store.writeNew(planPath, validatedPlan);
        await this.store.writeNew(checkpointPath, validatedCheckpoint);
      } else if (planExists) {
        const existingPlan = await this.readArtifact<XArticleMaterializationPlanV1>(
          planPath,
          'x-article-materialization-plan',
          'materialization plan'
        );
        if (!isDeepStrictEqual(existingPlan, validatedPlan)) {
          throw this.conflict('incomplete materialization plan does not match retry input');
        }
        await this.store.writeNew(checkpointPath, validatedCheckpoint);
      } else {
        const existingCheckpoint = await this.readArtifact<XArticleMaterializationCheckpointV1>(
          checkpointPath,
          'x-article-materialization-checkpoint',
          'materialization checkpoint'
        );
        if (!isDeepStrictEqual(existingCheckpoint, validatedCheckpoint)) {
          throw this.conflict('incomplete materialization checkpoint does not match retry input');
        }
        await this.store.writeNew(planPath, validatedPlan);
      }
      return snapshot(validatedCheckpoint);
    });
  }

  async readCheckpoint(executionId: string): Promise<XArticleMaterializationCheckpointV1> {
    const requestedExecutionId = executionId;
    this.assertSafeExecutionId(requestedExecutionId);
    return this.store.withLock(this.lockPath(requestedExecutionId), async () =>
      snapshot((await this.readStateUnlocked(requestedExecutionId)).checkpoint)
    );
  }

  async readPlan(executionId: string): Promise<XArticleMaterializationPlanV1> {
    const requestedExecutionId = executionId;
    this.assertSafeExecutionId(requestedExecutionId);
    return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
      const plan = await this.readArtifact<XArticleMaterializationPlanV1>(
        this.planPath(requestedExecutionId),
        'x-article-materialization-plan',
        'materialization plan'
      );
      if (plan.execution_id !== requestedExecutionId) {
        throw this.conflict('materialization plan does not match the requested execution');
      }
      return snapshot(plan);
    });
  }

  async updateCheckpoint(
    executionId: string,
    expectedRevision: number,
    update: UpdateCheckpoint
  ): Promise<XArticleMaterializationCheckpointV1> {
    const requestedExecutionId = executionId;
    this.assertSafeExecutionId(requestedExecutionId);
    return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
      const { plan, checkpoint: current } = await this.readStateUnlocked(requestedExecutionId);
      if (current.revision !== expectedRevision) {
        throw this.conflict('materialization checkpoint revision changed');
      }
      const detachedUpdate = snapshot(update(snapshot(current)));
      const next = validateContract<XArticleMaterializationCheckpointV1>(
        'x-article-materialization-checkpoint',
        { ...detachedUpdate, revision: current.revision + 1 }
      );
      this.assertCheckpointMatchesPlan(next, plan, requestedExecutionId);
      const persisted = snapshot(next);
      await this.store.replaceAtomic(this.checkpointPath(requestedExecutionId), persisted);
      return snapshot(persisted);
    });
  }

  async appendProgress(progress: XArticleStageProgressV1): Promise<XArticleStageProgressV1> {
    const detachedProgress = snapshot(progress);
    const validated = validateContract<XArticleStageProgressV1>(
      'x-article-materialization-progress',
      detachedProgress
    );
    const requestedExecutionId = validated.execution_id;
    this.assertSafeExecutionId(requestedExecutionId);
    return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
      await this.readStateUnlocked(requestedExecutionId);
      const persisted = snapshot(validated);
      await this.store.appendLine(
        this.progressPath(requestedExecutionId),
        JSON.stringify(persisted)
      );
      return snapshot(persisted);
    });
  }

  async readProgress(executionId: string): Promise<readonly XArticleStageProgressV1[]> {
    const requestedExecutionId = executionId;
    this.assertSafeExecutionId(requestedExecutionId);
    return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
      await this.readStateUnlocked(requestedExecutionId);
      const path = this.progressPath(requestedExecutionId);
      if (!(await this.store.exists(path))) return [];

      const content = await this.store.readText(path);
      if (!content.endsWith('\n')) {
        throw new HarnessError(
          'CONTRACT_INVALID',
          'X Article materialization progress ledger must end with a newline'
        );
      }
      const lines = content.split('\n');
      lines.pop();
      if (lines.some((line) => line.length === 0)) {
        throw new HarnessError(
          'CONTRACT_INVALID',
          'X Article materialization progress ledger contains a blank record'
        );
      }

      return lines.map((line) => {
        let value: unknown;
        try {
          value = JSON.parse(line) as unknown;
        } catch {
          throw new HarnessError(
            'CONTRACT_INVALID',
            'X Article materialization progress ledger contains invalid JSON'
          );
        }
        const entry = validateContract<XArticleStageProgressV1>(
          'x-article-materialization-progress',
          value
        );
        if (entry.execution_id !== requestedExecutionId) {
            throw new HarnessError(
              'CONTRACT_INVALID',
              'X Article materialization progress ledger contains a foreign execution entry'
            );
        }
        return entry;
      });
    });
  }

  private async readStateUnlocked(executionId: string): Promise<MaterializationState> {
    const plan = await this.readArtifact<XArticleMaterializationPlanV1>(
      this.planPath(executionId),
      'x-article-materialization-plan',
      'materialization plan'
    );
    const checkpoint = await this.readArtifact<XArticleMaterializationCheckpointV1>(
      this.checkpointPath(executionId),
      'x-article-materialization-checkpoint',
      'materialization checkpoint'
    );
    this.assertCheckpointMatchesPlan(checkpoint, plan, executionId);
    return { plan, checkpoint };
  }

  private async readArtifact<T>(
    path: string,
    contract: ContractName,
    label: string
  ): Promise<T> {
    try {
      return validateContract<T>(contract, await this.store.readJson<unknown>(path));
    } catch (error) {
      if (error instanceof HarnessError) {
        if (error.code === 'ARTICLE_CHECKPOINT_CONFLICT') throw error;
        if (error.code !== 'ARTIFACT_NOT_FOUND' && error.code !== 'CONTRACT_INVALID') {
          throw error;
        }
      } else if (!(error instanceof SyntaxError)) {
        throw error;
      }
      throw this.conflict(`${label} is missing or corrupt`, error);
    }
  }

  private assertCheckpointMatchesPlan(
    checkpoint: XArticleMaterializationCheckpointV1,
    plan: XArticleMaterializationPlanV1,
    requestedExecutionId: string
  ): void {
    const mediaMatches = checkpoint.media.length === plan.visual_anchors.length
      && checkpoint.media.every((media, index) => {
        const anchor = plan.visual_anchors[index];
        return anchor !== undefined
          && media.anchor_id === anchor.anchor_id
          && media.asset_id === anchor.asset_id
          && media.block_ordinal === anchor.block_ordinal
          && media.asset_digest === anchor.asset_digest;
      });
    if (
      plan.execution_id !== requestedExecutionId
      || checkpoint.execution_id !== requestedExecutionId
      || checkpoint.execution_id !== plan.execution_id
      || checkpoint.materialization_digest !== plan.materialization_digest
      || !mediaMatches
    ) {
      throw this.conflict('materialization checkpoint does not match its locked plan');
    }
  }

  private assertSafeExecutionId(executionId: string): void {
    if (!SAFE_ID.test(executionId)) {
      throw new HarnessError(
        'WORKSPACE_PATH_INVALID',
        'execution id contains unsafe path characters'
      );
    }
  }

  private prefix(executionId: string): string {
    return `runs/${executionId}/x-article/browser`;
  }

  private planPath(executionId: string): string {
    return `${this.prefix(executionId)}/materialization-plan.json`;
  }

  private checkpointPath(executionId: string): string {
    return `${this.prefix(executionId)}/materialization-checkpoint.json`;
  }

  private progressPath(executionId: string): string {
    return `${this.prefix(executionId)}/materialization-progress.jsonl`;
  }

  private lockPath(executionId: string): string {
    return `${this.prefix(executionId)}/materialization.lock`;
  }

  private conflict(message: string, details?: unknown): HarnessError {
    return new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', message, details);
  }
}
