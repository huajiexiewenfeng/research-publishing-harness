import { randomUUID } from 'node:crypto';
import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
export class XArticleCommandBroker {
    store;
    commandId;
    now;
    constructor(store, options = {}) {
        this.store = store;
        this.commandId = options.commandId ?? (() => `x_article_command_${randomUUID()}`);
        this.now = options.now ?? (() => new Date());
    }
    async issue(input, commandIdOverride) {
        this.assertId(input.execution_id);
        const command = {
            schema_version: '1.0',
            ...input,
            command_id: commandIdOverride ?? this.commandId(),
            payload_digest: sha256(input.payload),
            issued_at: this.now().toISOString()
        };
        validateContract('x-article-browser-command', command);
        if (await this.store.exists(this.commandPath(command))) {
            const existing = await this.store.readJson(this.commandPath(command));
            const existingStable = { ...existing, issued_at: null };
            const newStable = { ...command, issued_at: null };
            if (sha256(existingStable) !== sha256(newStable)) {
                throw new HarnessError('COMMAND_REPLAY_REJECTED', 'deterministic X Article command identity changed payload');
            }
            return existing;
        }
        await this.store.writeNew(this.commandPath(command), command);
        return command;
    }
    async claim(command) {
        const result = await this.claimOrRead(command);
        if (!result.created) {
            throw new HarnessError('COMMAND_REPLAY_REJECTED', 'X Article command was already claimed');
        }
        return result.claim;
    }
    async claimOrRead(command) {
        const stored = await this.store.readJson(this.commandPath(command));
        if (sha256(stored) !== sha256(command)) {
            throw new HarnessError('CONTRACT_INVALID', 'X Article command differs from its persisted envelope');
        }
        const claim = {
            schema_version: '1.0', execution_id: command.execution_id,
            command_id: command.command_id, claimed: true, claimed_at: this.now().toISOString()
        };
        try {
            await this.store.writeNew(this.claimPath(command), claim);
        }
        catch (error) {
            if (error instanceof HarnessError && error.code === 'ARTIFACT_EXISTS') {
                const existing = await this.store.readJson(this.claimPath(command));
                if (existing.schema_version !== '1.0'
                    || existing.execution_id !== command.execution_id
                    || existing.command_id !== command.command_id
                    || existing.claimed !== true
                    || !Number.isFinite(Date.parse(existing.claimed_at))) {
                    throw new HarnessError('CONTRACT_INVALID', 'persisted X Article command claim changed');
                }
                return { claim: existing, created: false };
            }
            throw error;
        }
        return { claim, created: true };
    }
    commandPath(command) {
        this.assertId(command.execution_id);
        this.assertId(command.command_id);
        return `runs/${command.execution_id}/x-article/browser/commands/${command.command_id}/command.json`;
    }
    claimPath(command) {
        return this.commandPath(command).replace(/command\.json$/, 'claim.json');
    }
    assertId(id) {
        if (!/^[A-Za-z0-9_-]+$/.test(id))
            throw new HarnessError('WORKSPACE_PATH_INVALID', 'unsafe X Article command identity');
    }
}
//# sourceMappingURL=article-command-broker.js.map