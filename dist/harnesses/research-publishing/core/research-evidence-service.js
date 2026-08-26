import { randomUUID } from 'node:crypto';
import { sha256 } from './digest.js';
import { EvidenceObjectStore } from './evidence-object-store.js';
import { HarnessError } from './errors.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
const EVENT_ROLES = {
    working_checkpoint: new Set(['canonical_article', 'research_package', 'claim_map', 'sources', 'boundary', 'lineage']),
    research_package_finalized: new Set(['research_package', 'claim_map', 'sources', 'boundary', 'lineage']),
    article_finalized: new Set(['canonical_article', 'article_metadata', 'review_report', 'visual_review_report', 'visual_asset', 'sources', 'boundary', 'lineage']),
    publication_intent_approved: new Set(['publication_plan', 'canonical_article', 'visual_asset']),
    publication_receipt_terminal: new Set(['publication_receipt', 'publication_expression']),
    feedback_selected: new Set(['feedback_snapshot']),
    candidate_insight_created: new Set(['candidate_insight']),
    research_increment_imported: new Set(['research_package', 'canonical_article', 'publication_receipt', 'sources', 'boundary', 'lineage'])
};
const PRIVACY_RANK = {
    public: 0,
    internal: 1,
    data_only: 1,
    restricted: 2
};
export class ResearchEvidenceService {
    store;
    ids;
    objects;
    constructor(store, ids = {}) {
        this.store = store;
        this.ids = ids;
        this.objects = new EvidenceObjectStore(store);
    }
    async capture(input) {
        if (!STABLE_ID_PATTERN.test(input.increment_id) || input.increment_revision < 1) {
            throw new HarnessError('CONTRACT_INVALID', 'Evidence capture requires a stable Increment revision');
        }
        if (input.artifacts.length === 0) {
            throw new HarnessError('CONTRACT_INVALID', 'Evidence capture requires at least one artifact');
        }
        const allowedRoles = EVENT_ROLES[input.capture_event];
        for (const artifact of input.artifacts) {
            if (!allowedRoles.has(artifact.role)) {
                throw new HarnessError('PRIVACY_GATE_BLOCKED', `${artifact.role} is not allowed for ${input.capture_event}`);
            }
            if (PRIVACY_RANK[artifact.privacy_classification] > PRIVACY_RANK[input.privacy_classification]) {
                throw new HarnessError('PRIVACY_GATE_BLOCKED', 'Snapshot privacy cannot downgrade an artifact');
            }
        }
        const artifactRefs = [];
        for (const artifact of input.artifacts) {
            artifactRefs.push((await this.objects.put(artifact)).artifact_ref);
        }
        const evidenceSnapshotId = this.ids.evidenceSnapshotId?.() ??
            `evidence_${randomUUID().replaceAll('-', '')}`;
        const body = {
            schema_version: 'research-evidence-snapshot/v1',
            evidence_snapshot_id: evidenceSnapshotId,
            increment_id: input.increment_id,
            increment_revision: input.increment_revision,
            capture_event: input.capture_event,
            capture_kind: input.capture_kind,
            workspace_identity_digest: input.workspace_identity_digest,
            artifact_refs: artifactRefs,
            source_refs: [...input.source_refs],
            privacy_classification: input.privacy_classification,
            capture_policy_version: 'research-evidence-capture/v1',
            captured_at: (this.ids.now?.() ?? new Date()).toISOString()
        };
        const snapshot = validateContract('research-evidence-snapshot', {
            ...body,
            snapshot_digest: sha256(body)
        });
        await this.store.writeNewDirectory(`memory/evidence/snapshots/${evidenceSnapshotId}`, {
            'manifest.json': snapshot
        });
        return snapshot;
    }
    async status(evidenceSnapshotId) {
        if (!STABLE_ID_PATTERN.test(evidenceSnapshotId)) {
            throw new HarnessError('CONTRACT_INVALID', 'Evidence Snapshot id must be stable');
        }
        const snapshot = validateContract('research-evidence-snapshot', await this.store.readJson(`memory/evidence/snapshots/${evidenceSnapshotId}/manifest.json`));
        const body = { ...snapshot };
        Reflect.deleteProperty(body, 'snapshot_digest');
        if (sha256(body) !== snapshot.snapshot_digest) {
            throw new HarnessError('MEMORY_EVIDENCE_CORRUPT', 'Evidence Snapshot digest does not match');
        }
        for (const ref of snapshot.artifact_refs)
            await this.objects.verify(ref);
        return {
            evidence_snapshot_id: snapshot.evidence_snapshot_id,
            state: 'complete',
            snapshot_digest: snapshot.snapshot_digest,
            artifact_count: snapshot.artifact_refs.length
        };
    }
}
//# sourceMappingURL=research-evidence-service.js.map