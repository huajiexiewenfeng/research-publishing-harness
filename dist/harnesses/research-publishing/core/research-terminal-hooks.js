import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import { validateContract } from './schema-validator.js';
export async function notifyTerminalSafely(store, notifier, input) {
    if (notifier === null)
        return;
    try {
        const receipt = await notifier.notify(input);
        if (receipt.status === 'complete')
            return;
        await store.replaceAtomic(`memory/terminal-hooks/pending-notifications/${input.notification_id}.json`, receipt);
    }
    catch (error) {
        await store.replaceAtomic(`memory/terminal-hooks/pending-notifications/${input.notification_id}.json`, {
            schema_version: 'research-terminal-notification-pending/v1',
            notification_id: input.notification_id,
            kind: input.kind,
            source_path: input.workspace_relative_path,
            status: 'evidence_capture_pending',
            error_code: error instanceof HarnessError ? error.code : 'EVIDENCE_CAPTURE_FAILED',
            recorded_at: input.occurred_at
        });
    }
}
const EVENT_CAPTURE = {
    package_finalized: 'research_package_finalized',
    article_finalized: 'article_finalized',
    publication_plan_approved: 'publication_intent_approved',
    publication_receipt_terminal: 'publication_receipt_terminal',
    feedback_selected: 'feedback_selected',
    candidate_insight_created: 'candidate_insight_created'
};
const EVENT_PRIMARY_ROLE = {
    package_finalized: 'research_package',
    article_finalized: 'canonical_article',
    publication_plan_approved: 'publication_plan',
    publication_receipt_terminal: 'publication_receipt',
    feedback_selected: 'feedback_snapshot',
    candidate_insight_created: 'candidate_insight'
};
function unsignedReceipt(receipt) {
    const body = { ...receipt };
    Reflect.deleteProperty(body, 'receipt_digest');
    return body;
}
export class ResearchTerminalHooks {
    store;
    now;
    capture;
    constructor(store, options = {}) {
        this.store = store;
        this.now = options.now ?? (() => new Date());
        this.capture = options.capture ?? ((event, evidenceId) => ResearchTerminalHooks.captureDefault(store, event, evidenceId, this.now));
    }
    static async captureDefault(store, event, evidenceSnapshotId, now = () => new Date()) {
        const evidence = new ResearchEvidenceService(store, {
            evidenceSnapshotId: () => evidenceSnapshotId,
            now
        });
        const snapshotPath = `memory/evidence/snapshots/${evidenceSnapshotId}/manifest.json`;
        if (await store.exists(snapshotPath)) {
            await evidence.status(evidenceSnapshotId);
            return store.readJson(snapshotPath);
        }
        return evidence.capture({
            increment_id: event.increment_id,
            increment_revision: event.increment_revision,
            capture_event: EVENT_CAPTURE[event.kind],
            capture_kind: 'automatic_terminal',
            workspace_identity_digest: event.workspace_identity_digest,
            artifacts: event.artifacts.map((artifact) => ({
                workspace_relative_path: artifact.workspace_relative_path,
                role: artifact.role,
                media_type: artifact.media_type,
                canonical: artifact.canonical,
                privacy_classification: artifact.privacy_classification
            })),
            source_refs: event.source_refs,
            privacy_classification: event.privacy_classification
        });
    }
    async record(event) {
        await this.validateEvent(event);
        const root = this.root(event.event_id);
        const eventDigest = sha256(event);
        const evidenceSnapshotId = `evidence_${sha256(event.event_id).slice(7, 31)}`;
        return this.store.withLock(`memory/terminal-hooks/locks/${event.event_id}.lock`, async () => {
            if (await this.store.exists(`${root}/event.json`)) {
                const stored = await this.store.readJson(`${root}/event.json`);
                if (sha256(stored) !== eventDigest) {
                    throw new HarnessError('APPROVAL_STALE', 'terminal event id is already bound to different source bytes');
                }
                const complete = await this.readReceipt(event.event_id);
                if (complete?.status === 'complete')
                    return complete;
            }
            else {
                const ledger = {
                    schema_version: 'research-terminal-hook-ledger/v1',
                    event_id: event.event_id,
                    event_digest: eventDigest,
                    source_digest: event.source_digest,
                    evidence_snapshot_id: evidenceSnapshotId,
                    status: 'capture_pending',
                    updated_at: this.now().toISOString()
                };
                await this.store.writeNewDirectory(root, { 'event.json': event, 'ledger.json': ledger });
            }
            return this.captureAndRecord(event, eventDigest, evidenceSnapshotId);
        });
    }
    async resume(eventId) {
        const root = this.root(eventId);
        const event = await this.store.readJson(`${root}/event.json`);
        return this.record(event);
    }
    async status(eventId) {
        const receipt = await this.readReceipt(eventId);
        if (receipt === null) {
            throw new HarnessError('ARTIFACT_NOT_FOUND', `terminal hook Receipt not found: ${eventId}`);
        }
        return receipt;
    }
    bind(context) {
        return {
            notify: async (input) => {
                const artifact = await this.store.resolveExistingArtifact(input.workspace_relative_path);
                return this.record({
                    event_id: input.notification_id,
                    kind: input.kind,
                    publication_kind: input.publication_kind,
                    increment_id: context.increment_id,
                    increment_revision: context.increment_revision,
                    workspace_identity_digest: context.workspace_identity_digest,
                    source_digest: artifact.digest,
                    artifacts: [{
                            workspace_relative_path: artifact.relative_path,
                            digest: artifact.digest,
                            role: input.role,
                            media_type: input.media_type,
                            canonical: input.canonical,
                            privacy_classification: input.privacy_classification
                        }],
                    source_refs: context.source_refs,
                    privacy_classification: context.privacy_classification,
                    occurred_at: input.occurred_at
                });
            }
        };
    }
    async captureAndRecord(event, eventDigest, evidenceSnapshotId) {
        try {
            const snapshot = await this.capture(event, evidenceSnapshotId);
            const receipt = this.receipt(event, eventDigest, {
                status: 'complete', evidence_snapshot_ref: `evidence:${snapshot.evidence_snapshot_id}`,
                evidence_snapshot_digest: snapshot.snapshot_digest, error_code: null
            });
            await this.store.replaceAtomic(`${this.root(event.event_id)}/receipt.json`, receipt);
            await this.store.replaceAtomic(`${this.root(event.event_id)}/ledger.json`, {
                schema_version: 'research-terminal-hook-ledger/v1', event_id: event.event_id,
                event_digest: eventDigest, source_digest: event.source_digest,
                evidence_snapshot_id: snapshot.evidence_snapshot_id, status: 'complete',
                updated_at: receipt.recorded_at
            });
            return receipt;
        }
        catch (error) {
            const receipt = this.receipt(event, eventDigest, {
                status: 'evidence_capture_pending', evidence_snapshot_ref: null,
                evidence_snapshot_digest: null,
                error_code: error instanceof HarnessError ? error.code : 'EVIDENCE_CAPTURE_FAILED'
            });
            await this.store.replaceAtomic(`${this.root(event.event_id)}/receipt.json`, receipt);
            return receipt;
        }
    }
    receipt(event, eventDigest, result) {
        const body = {
            schema_version: 'research-terminal-hook-receipt/v1',
            event_id: event.event_id,
            event_kind: event.kind,
            event_digest: eventDigest,
            source_digest: event.source_digest,
            ...result,
            recorded_at: this.now().toISOString()
        };
        return validateContract('research-terminal-hook-receipt', {
            ...body,
            receipt_digest: sha256(body)
        });
    }
    async readReceipt(eventId) {
        const path = `${this.root(eventId)}/receipt.json`;
        if (!(await this.store.exists(path)))
            return null;
        const receipt = validateContract('research-terminal-hook-receipt', await this.store.readJson(path));
        if (sha256(unsignedReceipt(receipt)) !== receipt.receipt_digest) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'terminal hook Receipt digest does not match');
        }
        return receipt;
    }
    async validateEvent(event) {
        if (!STABLE_ID_PATTERN.test(event.event_id) || !STABLE_ID_PATTERN.test(event.increment_id) ||
            !Number.isInteger(event.increment_revision) || event.increment_revision < 1 ||
            !Number.isFinite(Date.parse(event.occurred_at)) || event.artifacts.length === 0 ||
            event.source_refs.length === 0) {
            throw new HarnessError('CONTRACT_INVALID', 'terminal event identity or source binding is incomplete');
        }
        if ((event.kind === 'publication_receipt_terminal') !== (event.publication_kind !== null)) {
            throw new HarnessError('CONTRACT_INVALID', 'publication terminal events require an exact publication kind');
        }
        if (event.artifacts[0].role !== EVENT_PRIMARY_ROLE[event.kind] ||
            event.artifacts[0].digest !== event.source_digest) {
            throw new HarnessError('CONTRACT_INVALID', 'terminal event primary source does not match its kind or digest');
        }
        for (const artifact of event.artifacts) {
            const resolved = await this.store.resolveExistingArtifact(artifact.workspace_relative_path);
            if (resolved.digest !== artifact.digest) {
                throw new HarnessError('MEMORY_SOURCE_STALE', 'terminal event source bytes are stale');
            }
        }
    }
    root(eventId) {
        if (!STABLE_ID_PATTERN.test(eventId))
            throw new HarnessError('CONTRACT_INVALID', 'terminal event id must be stable');
        return `memory/terminal-hooks/${eventId}`;
    }
}
//# sourceMappingURL=research-terminal-hooks.js.map