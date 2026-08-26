import { randomUUID } from 'node:crypto';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { RESEARCH_MEMORY_POLICY_V1 } from './research-memory-policy.js';
import { createResearchIncrementRevision, STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { createResearchLifecycleEvent } from './research-lifecycle.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import { validateContract } from './schema-validator.js';
const EVIDENCE_REF = /^evidence:([a-z0-9][a-z0-9_-]{0,95})$/;
const PREDECESSOR_REF = /^increment:([a-z0-9][a-z0-9_-]{0,95}):([a-z0-9][a-z0-9_-]{0,95})@(\d+)$/;
export class ResearchIncrementService {
    store;
    ids;
    evidence;
    constructor(store, ids = {}) {
        this.store = store;
        this.ids = ids;
        this.evidence = new ResearchEvidenceService(store);
    }
    async assemble(input) {
        if (!STABLE_ID_PATTERN.test(input.increment_id)) {
            throw new HarnessError('CONTRACT_INVALID', 'increment id must be an ASCII-safe stable id');
        }
        const trackId = input.track_id ?? RESEARCH_MEMORY_POLICY_V1.default_track_id;
        if (!STABLE_ID_PATTERN.test(trackId) || !Number.isInteger(input.revision) || input.revision < 1) {
            throw new HarnessError('CONTRACT_INVALID', 'Increment track and revision must be stable');
        }
        return this.store.withLock(`memory/increments/${input.increment_id}/assemble.lock`, async () => {
            await this.verifyRevisionSequence(input.increment_id, trackId, input.revision);
            await this.verifyEvidence(input);
            await this.verifyPredecessors(input.predecessor_refs);
            const createdAt = input.created_at ?? (this.ids.now?.() ?? new Date()).toISOString();
            const revision = createResearchIncrementRevision({
                ...input,
                track_id: trackId,
                created_at: createdAt
            });
            const incrementRef = `increment:${trackId}:${input.increment_id}@${input.revision}`;
            const lifecycle = createResearchLifecycleEvent({
                event_id: this.ids.lifecycleEventId?.() ?? `event_${randomUUID().replaceAll('-', '')}`,
                increment_ref: incrementRef,
                event_seq: 1,
                previous_event_ref: null,
                event_type: 'working_checkpointed',
                prior_state: null,
                resulting_state: 'working',
                evidence_refs: [...input.evidence_snapshot_refs],
                approval_ref: null,
                receipt_ref: null,
                occurred_at: createdAt
            });
            await this.store.writeNewDirectory(`memory/increments/${input.increment_id}/revisions/${input.revision}`, { 'revision.json': revision, 'lifecycle-event.json': lifecycle });
            await this.store.replaceAtomic(`memory/increments/${input.increment_id}/status.json`, {
                schema_version: 'research-increment-status/v1',
                increment_id: input.increment_id,
                track_id: trackId,
                state: 'working',
                latest_revision: input.revision,
                latest_revision_ref: incrementRef,
                latest_event_ref: `lifecycle:${lifecycle.event_id}@${lifecycle.event_digest}`,
                updated_at: createdAt
            });
            return revision;
        });
    }
    async status(incrementId) {
        this.assertIncrementId(incrementId);
        return this.store.readJson(`memory/increments/${incrementId}/status.json`);
    }
    async lineage(incrementId) {
        const status = await this.status(incrementId);
        const entries = await this.store.list(`memory/increments/${incrementId}/revisions`);
        const revisions = [];
        for (const entry of entries) {
            if (entry.kind !== 'directory' || !/^\d+$/.test(entry.name))
                continue;
            const revision = validateContract('research-increment-revision', await this.store.readJson(`${entry.relative_path}/revision.json`));
            revisions.push({
                revision: revision.revision,
                content_digest: revision.content_digest,
                predecessor_refs: revision.predecessor_refs,
                created_at: revision.created_at
            });
        }
        revisions.sort((left, right) => left.revision - right.revision);
        return {
            schema_version: 'research-increment-lineage/v1',
            increment_id: incrementId,
            track_id: status.track_id,
            state: status.state,
            revisions
        };
    }
    assertIncrementId(incrementId) {
        if (!STABLE_ID_PATTERN.test(incrementId)) {
            throw new HarnessError('CONTRACT_INVALID', 'increment id must be an ASCII-safe stable id');
        }
    }
    async verifyRevisionSequence(incrementId, trackId, revision) {
        const statusPath = `memory/increments/${incrementId}/status.json`;
        if (!(await this.store.exists(statusPath))) {
            if (revision !== 1) {
                throw new HarnessError('STATE_TRANSITION_INVALID', 'first Increment revision must be 1');
            }
            return;
        }
        const current = await this.status(incrementId);
        if (current.track_id !== trackId || revision !== current.latest_revision + 1) {
            throw new HarnessError('STATE_TRANSITION_INVALID', 'Increment revisions must stay on one track and advance monotonically');
        }
    }
    async verifyEvidence(input) {
        for (const ref of input.evidence_snapshot_refs) {
            const match = EVIDENCE_REF.exec(ref);
            if (match === null) {
                throw new HarnessError('CONTRACT_INVALID', `invalid Evidence Snapshot ref: ${ref}`);
            }
            const evidenceId = match[1];
            await this.evidence.status(evidenceId);
            const snapshot = await this.store.readJson(`memory/evidence/snapshots/${evidenceId}/manifest.json`);
            const body = { ...snapshot };
            Reflect.deleteProperty(body, 'snapshot_digest');
            if (sha256(body) !== snapshot.snapshot_digest ||
                snapshot.increment_id !== input.increment_id ||
                snapshot.increment_revision !== input.revision) {
                throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Evidence Snapshot does not belong to this Increment revision');
            }
        }
    }
    async verifyPredecessors(refs) {
        for (const ref of refs) {
            const match = PREDECESSOR_REF.exec(ref);
            if (match === null) {
                throw new HarnessError('CONTRACT_INVALID', `invalid predecessor ref: ${ref}`);
            }
            const [, trackId, incrementId, rawRevision] = match;
            const predecessor = await this.status(incrementId);
            const revision = Number(rawRevision);
            if (predecessor.track_id !== trackId || predecessor.latest_revision < revision) {
                throw new HarnessError('ARTIFACT_NOT_FOUND', `predecessor revision not found: ${ref}`);
            }
            await this.store.readJson(`memory/increments/${incrementId}/revisions/${revision}/revision.json`);
        }
    }
}
//# sourceMappingURL=research-increment-service.js.map