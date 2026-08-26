import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import type { WorkspaceStore } from './workspace-store.js';
import type {
  XArticleMaterializationCheckpointV1,
  XArticleMaterializationPlanV1,
  XArticleStageProgressV1
} from './x-article-materialization.js';

export type UpdateCheckpoint = (
  current: XArticleMaterializationCheckpointV1
) => XArticleMaterializationCheckpointV1;

export interface XArticleMaterializationStoreApi {
  create(
    plan: XArticleMaterializationPlanV1,
    checkpoint: XArticleMaterializationCheckpointV1
  ): Promise<XArticleMaterializationCheckpointV1>;
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

export class XArticleMaterializationStore implements XArticleMaterializationStoreApi {
  constructor(private readonly store: WorkspaceStore) {}

  async create(
    plan: XArticleMaterializationPlanV1,
    checkpoint: XArticleMaterializationCheckpointV1
  ): Promise<XArticleMaterializationCheckpointV1> {
    const validatedPlan = validateContract<XArticleMaterializationPlanV1>(
      'x-article-materialization-plan',
      plan
    );
    this.assertSafeExecutionId(validatedPlan.execution_id);
    const validatedCheckpoint = validateContract<XArticleMaterializationCheckpointV1>(
      'x-article-materialization-checkpoint',
      checkpoint
    );
    this.assertCheckpointMatchesPlan(validatedCheckpoint, validatedPlan);
    if (validatedCheckpoint.revision !== 0) {
      throw this.conflict('initial materialization checkpoint revision must be zero');
    }

    return this.store.withLock(this.lockPath(validatedPlan.execution_id), async () => {
      await this.store.writeNew(this.planPath(validatedPlan.execution_id), validatedPlan);
      await this.store.writeNew(
        this.checkpointPath(validatedPlan.execution_id),
        validatedCheckpoint
      );
      return validatedCheckpoint;
    });
  }

  async readCheckpoint(executionId: string): Promise<XArticleMaterializationCheckpointV1> {
    this.assertSafeExecutionId(executionId);
    try {
      const plan = validateContract<XArticleMaterializationPlanV1>(
        'x-article-materialization-plan',
        await this.store.readJson<unknown>(this.planPath(executionId))
      );
      const checkpoint = validateContract<XArticleMaterializationCheckpointV1>(
        'x-article-materialization-checkpoint',
        await this.store.readJson<unknown>(this.checkpointPath(executionId))
      );
      this.assertCheckpointMatchesPlan(checkpoint, plan);
      return checkpoint;
    } catch (error) {
      if (error instanceof HarnessError) {
        if (error.code === 'ARTICLE_CHECKPOINT_CONFLICT') throw error;
        if (error.code !== 'ARTIFACT_NOT_FOUND' && error.code !== 'CONTRACT_INVALID') {
          throw error;
        }
      } else if (!(error instanceof SyntaxError)) {
        throw error;
      }
      throw this.conflict('materialization checkpoint is missing or corrupt', error);
    }
  }

  async updateCheckpoint(
    executionId: string,
    expectedRevision: number,
    update: UpdateCheckpoint
  ): Promise<XArticleMaterializationCheckpointV1> {
    this.assertSafeExecutionId(executionId);
    return this.store.withLock(this.lockPath(executionId), async () => {
      const current = await this.readCheckpoint(executionId);
      if (current.revision !== expectedRevision) {
        throw this.conflict('materialization checkpoint revision changed');
      }
      const next = validateContract<XArticleMaterializationCheckpointV1>(
        'x-article-materialization-checkpoint',
        { ...update(current), revision: current.revision + 1 }
      );
      const plan = validateContract<XArticleMaterializationPlanV1>(
        'x-article-materialization-plan',
        await this.store.readJson<unknown>(this.planPath(executionId))
      );
      this.assertCheckpointMatchesPlan(next, plan);
      await this.store.replaceAtomic(this.checkpointPath(executionId), next);
      return next;
    });
  }

  async appendProgress(progress: XArticleStageProgressV1): Promise<XArticleStageProgressV1> {
    const validated = validateContract<XArticleStageProgressV1>(
      'x-article-materialization-progress',
      progress
    );
    this.assertSafeExecutionId(validated.execution_id);
    return this.store.withLock(this.lockPath(validated.execution_id), async () => {
      await this.readCheckpoint(validated.execution_id);
      await this.store.appendLine(
        this.progressPath(validated.execution_id),
        JSON.stringify(validated)
      );
      return validated;
    });
  }

  async readProgress(executionId: string): Promise<readonly XArticleStageProgressV1[]> {
    this.assertSafeExecutionId(executionId);
    return this.store.withLock(this.lockPath(executionId), async () => {
      await this.readCheckpoint(executionId);
      const path = this.progressPath(executionId);
      if (!(await this.store.exists(path))) return [];

      return (await this.store.readText(path))
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
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
          if (entry.execution_id !== executionId) {
            throw new HarnessError(
              'CONTRACT_INVALID',
              'X Article materialization progress ledger contains a foreign execution entry'
            );
          }
          return entry;
        });
    });
  }

  private assertCheckpointMatchesPlan(
    checkpoint: XArticleMaterializationCheckpointV1,
    plan: XArticleMaterializationPlanV1
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
      checkpoint.execution_id !== plan.execution_id
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
