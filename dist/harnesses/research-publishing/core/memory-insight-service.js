import { randomUUID } from 'node:crypto';
import { sha256, sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import { notifyTerminalSafely } from './research-terminal-hooks.js';
import { validateContract } from './schema-validator.js';
function unsigned(value, key) {
    const copy = { ...value };
    Reflect.deleteProperty(copy, key);
    return copy;
}
export class MemoryInsightService {
    store;
    ids;
    terminalNotifier;
    constructor(store, ids = {}, terminalNotifier = null) {
        this.store = store;
        this.ids = ids;
        this.terminalNotifier = terminalNotifier;
    }
    root(proposalId) {
        if (!/^[a-z0-9][a-z0-9_-]{0,127}$/.test(proposalId)) {
            throw new HarnessError('CONTRACT_INVALID', 'proposal id must be a safe slug');
        }
        return `memory/insights/${proposalId}`;
    }
    async loadFeedback(path, digest) {
        const artifact = await this.store.resolveExistingArtifact(path);
        if (artifact.digest !== digest) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'feedback snapshot bytes no longer match');
        }
        const bytes = await this.store.readBytes(path);
        if (sha256Bytes(bytes) !== digest) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'feedback snapshot changed during proposal');
        }
        let parsed;
        try {
            parsed = JSON.parse(bytes.toString('utf8'));
        }
        catch {
            throw new HarnessError('CONTRACT_INVALID', 'feedback snapshot is not valid JSON');
        }
        const snapshot = validateContract('publication-feedback-snapshot', parsed);
        if (sha256(unsigned(snapshot, 'snapshot_digest')) !== snapshot.snapshot_digest) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'feedback snapshot digest no longer matches its content');
        }
        return snapshot;
    }
    async propose(input) {
        const feedback = await this.loadFeedback(input.feedback_snapshot_path, input.feedback_snapshot_digest);
        if (input.basis === 'metrics_only' &&
            input.insight_type !== 'audience_signal' && input.insight_type !== 'format_signal') {
            throw new HarnessError('CONTRACT_INVALID', 'metrics-only evidence supports audience or format signals only');
        }
        if (input.source_refs.length === 1 && input.evidence_strength !== 'anecdotal') {
            throw new HarnessError('CONTRACT_INVALID', 'one feedback entry is anecdotal evidence only');
        }
        for (const sourceRef of input.source_refs) {
            const match = sourceRef.match(/^feedback:([a-z0-9][a-z0-9_-]{0,127}):(\d+)$/);
            const ordinal = match === null ? NaN : Number(match[2]);
            if (match === null || match[1] !== feedback.feedback_snapshot_id ||
                !feedback.entries.some((entry) => entry.ordinal === ordinal)) {
                throw new HarnessError('CONTRACT_INVALID', 'insight source ref is absent from the feedback snapshot');
            }
        }
        const { feedback_snapshot_path: _path, feedback_snapshot_digest: _digest, basis: _basis, ...proposalInput } = input;
        void _path;
        void _digest;
        void _basis;
        const body = {
            schema_version: 'candidate-insight-proposal/v1',
            proposal_id: this.ids.proposalId?.() ?? `insight_${randomUUID().replaceAll('-', '')}`,
            ...proposalInput
        };
        const proposal = validateContract('candidate-insight-proposal', { ...body, proposal_digest: sha256(body) });
        const root = this.root(proposal.proposal_id);
        const proposalPath = `${root}/proposal.json`;
        await this.store.writeNew(proposalPath, proposal);
        await this.store.writeNew(`${root}/source.json`, {
            feedback_snapshot_path: input.feedback_snapshot_path,
            feedback_snapshot_digest: input.feedback_snapshot_digest,
            basis: input.basis
        });
        await notifyTerminalSafely(this.store, this.terminalNotifier, {
            notification_id: `candidate_insight_created_${proposal.proposal_id}`,
            kind: 'candidate_insight_created', publication_kind: null,
            workspace_relative_path: proposalPath, role: 'candidate_insight', media_type: 'application/json',
            canonical: true, privacy_classification: 'data_only',
            occurred_at: (this.ids.now?.() ?? new Date()).toISOString()
        });
        return proposal;
    }
    async reviewInsight(proposalId, input) {
        const proposal = await this.proposal(proposalId);
        const reviewedBy = input.reviewed_by.trim();
        const reason = input.reason.trim();
        if (reviewedBy.length === 0 || reason.length === 0 || !Number.isFinite(input.reviewed_at.getTime())) {
            throw new HarnessError('CONTRACT_INVALID', 'Evidence Review requires reviewer, reason, and time');
        }
        const body = {
            schema_version: 'memory-insight-review/v1',
            proposal_id: proposalId,
            proposal_digest: proposal.proposal_digest,
            reviewed_by: reviewedBy,
            accepted: input.accepted,
            reason,
            reviewed_at: input.reviewed_at.toISOString()
        };
        const review = { ...body, review_digest: sha256(body) };
        await this.store.writeNew(`${this.root(proposalId)}/review.json`, review);
        return review;
    }
    async proposal(proposalId) {
        const proposal = validateContract('candidate-insight-proposal', await this.store.readJson(`${this.root(proposalId)}/proposal.json`));
        if (sha256(unsigned(proposal, 'proposal_digest')) !== proposal.proposal_digest) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'Candidate Insight Proposal bytes no longer match its digest');
        }
        return proposal;
    }
    async requireAccepted(proposalId) {
        const proposal = await this.proposal(proposalId);
        const review = await this.store.readJson(`${this.root(proposalId)}/review.json`);
        if (sha256(unsigned(review, 'review_digest')) !== review.review_digest ||
            review.proposal_digest !== proposal.proposal_digest) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'Evidence Review no longer matches Candidate Insight Proposal');
        }
        if (!review.accepted) {
            throw new HarnessError('CONTRACT_INVALID', 'rejected Candidate Insight cannot enter memory ingest');
        }
        return proposal;
    }
}
//# sourceMappingURL=memory-insight-service.js.map