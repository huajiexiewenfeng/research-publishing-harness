import { isDeepStrictEqual } from 'node:util';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
function snapshot(value) {
    return structuredClone(value);
}
export class XArticleMaterializationStore {
    store;
    constructor(store) {
        this.store = store;
    }
    async create(plan, checkpoint) {
        const detachedPlan = snapshot(plan);
        const detachedCheckpoint = snapshot(checkpoint);
        const requestedExecutionId = detachedPlan.execution_id;
        const validatedPlan = validateContract('x-article-materialization-plan', detachedPlan);
        this.assertSafeExecutionId(requestedExecutionId);
        const validatedCheckpoint = validateContract('x-article-materialization-checkpoint', detachedCheckpoint);
        this.assertCheckpointMatchesPlan(validatedCheckpoint, validatedPlan, requestedExecutionId);
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
            }
            else if (planExists) {
                const existingPlan = await this.readArtifact(planPath, 'x-article-materialization-plan', 'materialization plan');
                if (!isDeepStrictEqual(existingPlan, validatedPlan)) {
                    throw this.conflict('incomplete materialization plan does not match retry input');
                }
                await this.store.writeNew(checkpointPath, validatedCheckpoint);
            }
            else {
                const existingCheckpoint = await this.readArtifact(checkpointPath, 'x-article-materialization-checkpoint', 'materialization checkpoint');
                if (!isDeepStrictEqual(existingCheckpoint, validatedCheckpoint)) {
                    throw this.conflict('incomplete materialization checkpoint does not match retry input');
                }
                await this.store.writeNew(planPath, validatedPlan);
            }
            return snapshot(validatedCheckpoint);
        });
    }
    async readCheckpoint(executionId) {
        const requestedExecutionId = executionId;
        this.assertSafeExecutionId(requestedExecutionId);
        return this.store.withLock(this.lockPath(requestedExecutionId), async () => snapshot((await this.readStateUnlocked(requestedExecutionId)).checkpoint));
    }
    async readPlan(executionId) {
        const requestedExecutionId = executionId;
        this.assertSafeExecutionId(requestedExecutionId);
        return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
            const plan = await this.readArtifact(this.planPath(requestedExecutionId), 'x-article-materialization-plan', 'materialization plan');
            if (plan.execution_id !== requestedExecutionId) {
                throw this.conflict('materialization plan does not match the requested execution');
            }
            return snapshot(plan);
        });
    }
    async updateCheckpoint(executionId, expectedRevision, update) {
        const requestedExecutionId = executionId;
        this.assertSafeExecutionId(requestedExecutionId);
        return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
            const { plan, checkpoint: current } = await this.readStateUnlocked(requestedExecutionId);
            if (current.revision !== expectedRevision) {
                throw this.conflict('materialization checkpoint revision changed');
            }
            const detachedUpdate = snapshot(update(snapshot(current)));
            const next = validateContract('x-article-materialization-checkpoint', { ...detachedUpdate, revision: current.revision + 1 });
            this.assertCheckpointMatchesPlan(next, plan, requestedExecutionId);
            const persisted = snapshot(next);
            await this.store.replaceAtomic(this.checkpointPath(requestedExecutionId), persisted);
            return snapshot(persisted);
        });
    }
    async appendProgress(progress) {
        const detachedProgress = snapshot(progress);
        const validated = validateContract('x-article-materialization-progress', detachedProgress);
        const requestedExecutionId = validated.execution_id;
        this.assertSafeExecutionId(requestedExecutionId);
        return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
            await this.readStateUnlocked(requestedExecutionId);
            const persisted = snapshot(validated);
            await this.store.appendLine(this.progressPath(requestedExecutionId), JSON.stringify(persisted));
            return snapshot(persisted);
        });
    }
    async readProgress(executionId) {
        const requestedExecutionId = executionId;
        this.assertSafeExecutionId(requestedExecutionId);
        return this.store.withLock(this.lockPath(requestedExecutionId), async () => {
            await this.readStateUnlocked(requestedExecutionId);
            const path = this.progressPath(requestedExecutionId);
            if (!(await this.store.exists(path)))
                return [];
            const content = await this.store.readText(path);
            if (!content.endsWith('\n')) {
                throw new HarnessError('CONTRACT_INVALID', 'X Article materialization progress ledger must end with a newline');
            }
            const lines = content.split('\n');
            lines.pop();
            if (lines.some((line) => line.length === 0)) {
                throw new HarnessError('CONTRACT_INVALID', 'X Article materialization progress ledger contains a blank record');
            }
            return lines.map((line) => {
                let value;
                try {
                    value = JSON.parse(line);
                }
                catch {
                    throw new HarnessError('CONTRACT_INVALID', 'X Article materialization progress ledger contains invalid JSON');
                }
                const entry = validateContract('x-article-materialization-progress', value);
                if (entry.execution_id !== requestedExecutionId) {
                    throw new HarnessError('CONTRACT_INVALID', 'X Article materialization progress ledger contains a foreign execution entry');
                }
                return entry;
            });
        });
    }
    async readStateUnlocked(executionId) {
        const plan = await this.readArtifact(this.planPath(executionId), 'x-article-materialization-plan', 'materialization plan');
        const checkpoint = await this.readArtifact(this.checkpointPath(executionId), 'x-article-materialization-checkpoint', 'materialization checkpoint');
        this.assertCheckpointMatchesPlan(checkpoint, plan, executionId);
        return { plan, checkpoint };
    }
    async readArtifact(path, contract, label) {
        try {
            return validateContract(contract, await this.store.readJson(path));
        }
        catch (error) {
            if (error instanceof HarnessError) {
                if (error.code === 'ARTICLE_CHECKPOINT_CONFLICT')
                    throw error;
                if (error.code !== 'ARTIFACT_NOT_FOUND' && error.code !== 'CONTRACT_INVALID') {
                    throw error;
                }
            }
            else if (!(error instanceof SyntaxError)) {
                throw error;
            }
            throw this.conflict(`${label} is missing or corrupt`, error);
        }
    }
    assertCheckpointMatchesPlan(checkpoint, plan, requestedExecutionId) {
        const mediaMatches = checkpoint.media.length === plan.visual_anchors.length
            && checkpoint.media.every((media, index) => {
                const anchor = plan.visual_anchors[index];
                return anchor !== undefined
                    && media.anchor_id === anchor.anchor_id
                    && media.asset_id === anchor.asset_id
                    && media.block_ordinal === anchor.block_ordinal
                    && media.asset_digest === anchor.asset_digest;
            });
        const adoptedPlan = plan.draft_binding !== null;
        const adoptedPhase = checkpoint.phase === 'body_verified'
            || checkpoint.phase === 'media_materializing'
            || checkpoint.phase === 'draft_reconciled'
            || checkpoint.phase === 'preview_verified'
            || checkpoint.phase === 'human_confirmed'
            || checkpoint.phase === 'publish_submitted'
            || checkpoint.phase === 'public_verified'
            || checkpoint.phase === 'blocked';
        const adoptedCheckpointMatches = !adoptedPlan || (checkpoint.draft_origin === 'adopted_existing'
            && checkpoint.source_execution_id === null
            && checkpoint.draft_id === plan.draft_binding.draft_id
            && checkpoint.body.status === 'adopted_verified'
            && checkpoint.body.observed_digest === plan.import_template_digest
            && checkpoint.last_editor_revision !== null
            && adoptedPhase);
        if (plan.execution_id !== requestedExecutionId
            || checkpoint.execution_id !== requestedExecutionId
            || checkpoint.execution_id !== plan.execution_id
            || checkpoint.materialization_digest !== plan.materialization_digest
            || !mediaMatches
            || !adoptedCheckpointMatches) {
            throw this.conflict('materialization checkpoint does not match its locked plan');
        }
    }
    assertSafeExecutionId(executionId) {
        if (!SAFE_ID.test(executionId)) {
            throw new HarnessError('WORKSPACE_PATH_INVALID', 'execution id contains unsafe path characters');
        }
    }
    prefix(executionId) {
        return `runs/${executionId}/x-article/browser`;
    }
    planPath(executionId) {
        return `${this.prefix(executionId)}/materialization-plan.json`;
    }
    checkpointPath(executionId) {
        return `${this.prefix(executionId)}/materialization-checkpoint.json`;
    }
    progressPath(executionId) {
        return `${this.prefix(executionId)}/materialization-progress.jsonl`;
    }
    lockPath(executionId) {
        return `${this.prefix(executionId)}/materialization.lock`;
    }
    conflict(message, details) {
        return new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', message, details);
    }
}
//# sourceMappingURL=x-article-materialization-store.js.map