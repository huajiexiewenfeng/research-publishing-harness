import { randomUUID } from 'node:crypto';
import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import { notifyTerminalSafely } from './research-terminal-hooks.js';
import { validateContract } from './schema-validator.js';
const TERMINAL_RECEIPT_STATUSES = new Set(['finalized', 'published', 'manual_recorded']);
function record(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new HarnessError('CONTRACT_INVALID', 'publication receipt must be a JSON object');
    }
    return value;
}
function nestedString(value, objectKey, field) {
    const nested = value[objectKey];
    if (nested === null || typeof nested !== 'object' || Array.isArray(nested))
        return null;
    const result = nested[field];
    return typeof result === 'string' ? result : null;
}
function publicHttpsUrl(value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new HarnessError('CONTRACT_INVALID', 'feedback URL must be a valid public URL');
    }
    if (parsed.protocol !== 'https:') {
        throw new HarnessError('CONTRACT_INVALID', 'feedback URL must use HTTPS');
    }
    return parsed;
}
export class MemoryFeedbackService {
    store;
    ids;
    terminalNotifier;
    constructor(store, ids = {}, terminalNotifier = null) {
        this.store = store;
        this.ids = ids;
        this.terminalNotifier = terminalNotifier;
    }
    async receipt(path, expectedDigest) {
        const before = await this.store.resolveExistingArtifact(path);
        if (before.digest !== expectedDigest) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'publication receipt bytes no longer match');
        }
        const bytes = await this.store.readBytes(path);
        if (sha256Bytes(bytes) !== expectedDigest) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'publication receipt changed during capture');
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString('utf8'));
        }
        catch {
            throw new HarnessError('CONTRACT_INVALID', 'publication receipt is not valid JSON');
        }
        const value = record(parsed);
        const after = await this.store.resolveExistingArtifact(path);
        if (after.digest !== expectedDigest) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'publication receipt changed during capture');
        }
        const receiptId = value.receipt_id;
        const status = value.status;
        if (typeof receiptId !== 'string' || receiptId.length === 0 || typeof status !== 'string') {
            throw new HarnessError('CONTRACT_INVALID', 'publication receipt identity is incomplete');
        }
        return {
            receipt_id: receiptId,
            status,
            target_account: typeof value.target_account === 'string' ? value.target_account : null,
            public_url: nestedString(value, 'public_result', 'root_url') ??
                nestedString(value, 'public_result', 'url') ??
                nestedString(value, 'public_evidence', 'canonical_url')
        };
    }
    async capture(input) {
        const receipt = await this.receipt(input.receipt_path, input.receipt_digest);
        const actor = input.selection_actor.trim();
        const reason = input.selection_reason.trim();
        const account = input.account.trim();
        const rootUrl = publicHttpsUrl(input.public_url).toString();
        if (!TERMINAL_RECEIPT_STATUSES.has(receipt.status) ||
            actor.length === 0 || reason.length === 0 || account.length === 0 ||
            !Number.isFinite(input.observed_at.getTime()) || input.entries.length === 0) {
            throw new HarnessError('CONTRACT_INVALID', 'feedback capture requires terminal receipt and Human selection provenance');
        }
        if (receipt.public_url !== null && publicHttpsUrl(receipt.public_url).toString() !== rootUrl) {
            throw new HarnessError('CONTRACT_INVALID', 'feedback publication URL does not match receipt');
        }
        if (receipt.target_account !== null && receipt.target_account.toLowerCase() !== account.toLowerCase()) {
            throw new HarnessError('CONTRACT_INVALID', 'feedback account does not match receipt');
        }
        const entries = input.entries.map((entry, index) => {
            const observedText = entry.observed_text;
            publicHttpsUrl(entry.public_url);
            if (entry.platform_id.trim().length === 0 || entry.author.trim().length === 0 ||
                observedText.trim().length === 0 ||
                Object.values(entry.observed_metrics).some((value) => !Number.isFinite(value) || value < 0)) {
                throw new HarnessError('CONTRACT_INVALID', 'feedback entry is incomplete or has invalid metrics');
            }
            return {
                ordinal: index + 1,
                public_url: new URL(entry.public_url).toString(),
                platform_id: entry.platform_id,
                author: entry.author,
                observed_text: observedText,
                observed_text_checksum: sha256Bytes(Buffer.from(observedText, 'utf8')),
                observed_metrics: { ...entry.observed_metrics },
                data_classification: 'data_only'
            };
        });
        const body = {
            schema_version: 'publication-feedback-snapshot/v1',
            feedback_snapshot_id: this.ids.feedbackSnapshotId?.() ?? `feedback_${randomUUID().replaceAll('-', '')}`,
            publication_receipt_id: receipt.receipt_id,
            publication_receipt_digest: input.receipt_digest,
            publication_kind: input.publication_kind,
            public_url: rootUrl,
            account,
            observed_at: input.observed_at.toISOString(),
            selection_actor: actor,
            selection_reason: reason,
            entries
        };
        const snapshot = validateContract('publication-feedback-snapshot', { ...body, snapshot_digest: sha256(body) });
        const snapshotPath = `feedback/${snapshot.feedback_snapshot_id}/snapshot.json`;
        await this.store.writeNew(snapshotPath, snapshot);
        await notifyTerminalSafely(this.store, this.terminalNotifier, {
            notification_id: `feedback_selected_${snapshot.feedback_snapshot_id}`,
            kind: 'feedback_selected', publication_kind: null,
            workspace_relative_path: snapshotPath, role: 'feedback_snapshot', media_type: 'application/json',
            canonical: true, privacy_classification: 'data_only', occurred_at: snapshot.observed_at
        });
        return snapshot;
    }
}
//# sourceMappingURL=memory-feedback-service.js.map