import { sha256 } from './digest.js';
import { assertArtifactAdmissible, privacyRank } from './artifact-admission-policy.js';
import { HarnessError } from './errors.js';
import { ResearchEvidenceService } from './research-evidence-service.js';
import { assertResearchSynthesisCandidate, assertSynthesisInputSnapshot, createResearchContinuationProposal, createResearchSynthesisAttempt, createResearchSynthesisRevision, createResearchSynthesisStatus, createSynthesisInputSnapshot, synthesisSourceRef } from './research-synthesis-contracts.js';
import { SYNTHESIS_BUDGET_V1 } from './research-synthesis-types.js';
import { validateContract } from './schema-validator.js';
const ALLOWED_SOURCE_ROOTS = [
    'program/weeks/',
    'articles/',
    'memory/evidence/',
    'memory/queries-v2/',
    'feedback/',
    'research/syntheses/'
];
const MEDIA_TYPES = new Set([
    'application/json',
    'application/yaml',
    'application/x-yaml',
    'text/plain',
    'text/markdown',
    'text/yaml'
]);
const QUERY_STATUS = {
    loaded: 'loaded',
    empty: 'empty',
    runtime_unavailable: 'unavailable',
    index_unavailable: 'unavailable',
    index_rebuild_required: 'unavailable',
    context_budget_exceeded: 'unavailable',
    failed: 'unavailable'
};
function fail(code, message) {
    throw new HarnessError(code, message);
}
function omit(value, fields) {
    const copy = { ...value };
    for (const field of fields)
        Reflect.deleteProperty(copy, field);
    return copy;
}
export class ResearchSynthesisService {
    store;
    now;
    constructor(store, options = {}) {
        this.store = store;
        this.now = options.now ?? (() => new Date());
    }
    async plan(input) {
        this.assertPlanInput(input);
        const sourceItems = [];
        let remaining = SYNTHESIS_BUDGET_V1.max_total_chars;
        for (const source of input.source_refs) {
            if (source.role === 'runtime_context') {
                fail('CONTRACT_INVALID', 'Runtime context may enter only through a reviewed Query chain');
            }
            const text = await this.readAdmittedSource(source);
            const item = this.boundedItem(source, text, remaining);
            sourceItems.push(item);
            remaining -= item.included_chars;
        }
        const query = input.runtime_query === null
            ? {
                context: {
                    status: 'unavailable',
                    query_plan_ref: null,
                    context_snapshot_ref: null,
                    review_ref: null,
                    selected_context_refs: [],
                    limitation: 'Historical research context was not loaded.'
                },
                item: null
            }
            : await this.readRuntimeQuery(input.runtime_query, remaining);
        if (query.item !== null)
            sourceItems.push(query.item);
        if (sourceItems.length > SYNTHESIS_BUDGET_V1.max_items) {
            fail('CONTRACT_INVALID', 'Synthesis context exceeds the fixed item budget');
        }
        if (input.prior_synthesis_ref !== null && !input.source_refs.some((source) => source.role === 'prior_synthesis' &&
            source.ref.path === input.prior_synthesis_ref.path &&
            source.ref.digest === input.prior_synthesis_ref.digest)) {
            fail('CONTRACT_INVALID', 'Prior Synthesis ref must be included as an exact source item');
        }
        await this.verifyEvidenceRefs(input.evidence_refs);
        const snapshot = createSynthesisInputSnapshot({
            snapshot_id: input.snapshot_id,
            trigger: input.trigger,
            source_items: sourceItems,
            evidence_refs: [...input.evidence_refs],
            prior_synthesis_ref: input.prior_synthesis_ref,
            runtime_context: query.context,
            created_at: input.created_at
        });
        const path = this.snapshotPath(snapshot.snapshot_id);
        if (!await this.store.exists(path)) {
            await this.store.writeNew(path, snapshot);
            return snapshot;
        }
        const installed = await this.readSnapshot(snapshot.snapshot_id);
        if (installed.snapshot_digest !== snapshot.snapshot_digest) {
            fail('APPROVAL_STALE', 'Installed Synthesis Snapshot differs from the exact bounded input');
        }
        return installed;
    }
    async record(input) {
        this.assertRecordInput(input);
        const root = this.synthesisRoot(input.synthesis_id);
        return this.store.withLock(`${root}/record.lock`, async () => {
            const snapshot = await this.readSnapshot(input.snapshot_id);
            const snapshotRef = await this.fileRef(this.snapshotPath(input.snapshot_id));
            const attemptOrdinal = await this.nextOrdinal(`${root}/attempts`);
            const candidateDigest = this.candidateDigest(input.candidate);
            let candidate;
            try {
                candidate = validateContract('research-synthesis-candidate', input.candidate);
                assertResearchSynthesisCandidate(candidate, snapshot);
            }
            catch (error) {
                const code = error instanceof HarnessError ? error.code : 'CONTRACT_INVALID';
                const attempt = createResearchSynthesisAttempt({
                    synthesis_id: input.synthesis_id,
                    attempt_ordinal: attemptOrdinal,
                    input_snapshot_ref: snapshotRef,
                    candidate_digest: candidateDigest,
                    status: 'rejected',
                    error_codes: [code],
                    attempted_at: input.recorded_at
                });
                await this.store.writeNewDirectory(`${root}/attempts/${attemptOrdinal}`, {
                    'attempt.json': attempt
                });
                await this.writeStatus(input.synthesis_id, {
                    synthesis_id: input.synthesis_id,
                    phase: 'blocked',
                    input_snapshot_ref: snapshotRef,
                    latest_revision_ref: await this.latestRevisionRef(input.synthesis_id),
                    attempt_count: attemptOrdinal,
                    blocked_reason: error instanceof Error ? error.message : 'Candidate validation failed',
                    updated_at: input.recorded_at
                });
                if (error instanceof HarnessError)
                    throw error;
                fail('CONTRACT_INVALID', 'Research Synthesis Candidate validation failed');
            }
            const attempt = createResearchSynthesisAttempt({
                synthesis_id: input.synthesis_id,
                attempt_ordinal: attemptOrdinal,
                input_snapshot_ref: snapshotRef,
                candidate_digest: candidateDigest,
                status: 'accepted',
                error_codes: [],
                attempted_at: input.recorded_at
            });
            await this.store.writeNewDirectory(`${root}/attempts/${attemptOrdinal}`, {
                'attempt.json': attempt
            });
            const revision = await this.nextOrdinal(`${root}/revisions`);
            const previousRevisionRef = revision === 1
                ? null
                : await this.fileRef(`${root}/revisions/${revision - 1}/revision.json`);
            const { schema_version: _schema, ...candidateBody } = candidate;
            void _schema;
            const value = createResearchSynthesisRevision({
                synthesis_id: input.synthesis_id,
                revision,
                previous_revision_ref: previousRevisionRef,
                input_snapshot_ref: snapshotRef,
                ...candidateBody,
                recorded_at: input.recorded_at
            }, snapshot);
            await this.store.writeNewDirectory(`${root}/revisions/${revision}`, {
                'revision.json': value
            });
            const revisionRef = await this.fileRef(`${root}/revisions/${revision}/revision.json`);
            await this.writeStatus(input.synthesis_id, {
                synthesis_id: input.synthesis_id,
                phase: 'recorded',
                input_snapshot_ref: snapshotRef,
                latest_revision_ref: revisionRef,
                attempt_count: attemptOrdinal,
                blocked_reason: null,
                updated_at: input.recorded_at
            });
            return value;
        });
    }
    async status(synthesisId) {
        const root = this.synthesisRoot(synthesisId);
        if (!await this.store.exists(`${root}/status.json`)) {
            return createResearchSynthesisStatus({
                synthesis_id: synthesisId,
                phase: 'not_requested',
                input_snapshot_ref: null,
                latest_revision_ref: null,
                attempt_count: 0,
                blocked_reason: null,
                updated_at: this.now().toISOString()
            });
        }
        const status = await this.readContract(`${root}/status.json`, 'research-synthesis-status');
        const expected = createResearchSynthesisStatus(omit(status, ['schema_version', 'projection_digest']));
        if (expected.projection_digest !== status.projection_digest) {
            fail('APPROVAL_STALE', 'Research Synthesis Status digest is stale');
        }
        if (status.input_snapshot_ref !== null)
            await this.assertFileRef(status.input_snapshot_ref);
        if (status.latest_revision_ref !== null) {
            await this.assertFileRef(status.latest_revision_ref);
            await this.readRevision(status.latest_revision_ref.path);
        }
        return status;
    }
    async proposeContinuation(input) {
        this.assertProposalInput(input);
        const { synthesisId } = this.revisionIdentity(input.synthesis_ref.path);
        await this.assertFileRef(input.synthesis_ref);
        const revision = await this.readRevision(input.synthesis_ref.path);
        const snapshot = await this.readSnapshotRef(revision.input_snapshot_ref);
        const allowedOrigins = this.allowedContinuationOrigins(revision, snapshot);
        const proposal = createResearchContinuationProposal({
            proposal_id: input.proposal_id,
            synthesis_ref: input.synthesis_ref,
            candidates: input.candidates,
            proposed_at: input.proposed_at
        }, allowedOrigins);
        await this.store.writeNew(`${this.synthesisRoot(synthesisId)}/continuations/${proposal.proposal_id}.json`, proposal);
        return proposal;
    }
    async continuationStatus(synthesisId, proposalId) {
        const path = `${this.synthesisRoot(synthesisId)}/continuations/${proposalId}.json`;
        const proposal = await this.readContract(path, 'research-continuation-proposal');
        await this.assertFileRef(proposal.synthesis_ref);
        const revision = await this.readRevision(proposal.synthesis_ref.path);
        const snapshot = await this.readSnapshotRef(revision.input_snapshot_ref);
        const recreated = createResearchContinuationProposal({
            proposal_id: proposal.proposal_id,
            synthesis_ref: proposal.synthesis_ref,
            candidates: proposal.candidates,
            proposed_at: proposal.proposed_at
        }, this.allowedContinuationOrigins(revision, snapshot));
        if (recreated.proposal_digest !== proposal.proposal_digest) {
            fail('APPROVAL_STALE', 'Continuation Proposal digest is stale');
        }
        return proposal;
    }
    async readAdmittedSource(source) {
        if (!ALLOWED_SOURCE_ROOTS.some((root) => source.ref.path.startsWith(root)) ||
            source.ref.path.startsWith('research/syntheses/') && source.role !== 'prior_synthesis') {
            fail('WORKSPACE_PATH_INVALID', 'Synthesis source path is outside the exact allowlist');
        }
        if (!MEDIA_TYPES.has(source.media_type)) {
            fail('CONTRACT_INVALID', 'Synthesis source media type is not textual');
        }
        if (source.role === 'feedback' && source.privacy_classification !== 'data_only') {
            fail('PRIVACY_GATE_BLOCKED', 'Feedback enters Synthesis only as data_only');
        }
        const artifact = await this.store.readContainedArtifact(source.ref.path);
        if (artifact.digest !== source.ref.digest) {
            fail('APPROVAL_STALE', 'Synthesis source bytes differ from the selected ref');
        }
        assertArtifactAdmissible({
            workspace_relative_path: artifact.relative_path,
            media_type: source.media_type,
            privacy_classification: source.privacy_classification,
            bytes: artifact.content,
            allow_restricted: false
        });
        let text;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(artifact.content);
        }
        catch {
            fail('CONTRACT_INVALID', 'Synthesis source is not valid UTF-8 text');
        }
        if (source.role === 'evidence') {
            const match = /^memory\/evidence\/snapshots\/([a-z0-9][a-z0-9_-]{0,95})\/manifest\.json$/
                .exec(source.ref.path);
            if (match === null) {
                fail('CONTRACT_INVALID', 'Evidence context must use a canonical Evidence Snapshot manifest');
            }
            await new ResearchEvidenceService(this.store).status(match[1]);
            const snapshot = validateContract('research-evidence-snapshot', JSON.parse(text));
            if (privacyRank(source.privacy_classification) < privacyRank(snapshot.privacy_classification)) {
                fail('PRIVACY_GATE_BLOCKED', 'Synthesis Evidence classification cannot be downgraded');
            }
        }
        return text;
    }
    boundedItem(source, content, remaining) {
        const includedChars = Math.min(content.length, SYNTHESIS_BUDGET_V1.max_item_chars, Math.max(remaining, 0));
        return {
            ref: source.ref,
            role: source.role,
            media_type: source.media_type,
            privacy_classification: source.privacy_classification,
            content: content.slice(0, includedChars),
            original_chars: content.length,
            included_chars: includedChars,
            truncated: includedChars < content.length
        };
    }
    async readRuntimeQuery(input, remaining) {
        const root = `memory/queries-v2/${input.query_id}`;
        const [plan, snapshot, review] = await Promise.all([
            this.readContract(`${root}/plan.json`, 'research-query-plan-v2'),
            this.readContract(`${root}/snapshot.json`, 'research-context-snapshot-v2'),
            this.readContract(`${root}/review.json`, 'research-context-review-v2')
        ]);
        if (plan.query_id !== input.query_id || plan.plan_digest !== input.plan_digest ||
            plan.plan_digest !== sha256(omit(plan, ['plan_digest'])) ||
            snapshot.query_id !== input.query_id || snapshot.query_plan_digest !== plan.plan_digest ||
            snapshot.snapshot_digest !== input.snapshot_digest ||
            snapshot.snapshot_digest !== sha256(omit(snapshot, ['snapshot_digest'])) ||
            review.query_id !== input.query_id || review.query_plan_digest !== plan.plan_digest ||
            review.snapshot_digest !== snapshot.snapshot_digest ||
            review.review_digest !== input.review_digest ||
            review.review_digest !== sha256(omit(review, ['review_digest'])) ||
            !['0.2.0', null].includes(snapshot.runtime_version)) {
            fail('APPROVAL_STALE', 'Reviewed Runtime Query chain is stale');
        }
        const available = new Map(snapshot.context_items.map((item) => [item.context_ref, item]));
        if (review.selected_context_refs.some((ref) => !available.has(ref))) {
            fail('APPROVAL_STALE', 'Reviewed Runtime context ref is absent from its Snapshot');
        }
        const status = QUERY_STATUS[snapshot.query_status];
        if (status === 'loaded' && review.selected_context_refs.length === 0) {
            fail('CONTRACT_INVALID', 'Loaded Runtime Query requires a Human-selected context ref');
        }
        if (status !== 'loaded' && review.selected_context_refs.length !== 0) {
            fail('CONTRACT_INVALID', 'Unavailable or empty Runtime Query cannot select context refs');
        }
        const [planRef, snapshotRef, reviewRef] = await Promise.all([
            this.fileRef(`${root}/plan.json`),
            this.fileRef(`${root}/snapshot.json`),
            this.fileRef(`${root}/review.json`)
        ]);
        const context = {
            status,
            query_plan_ref: planRef,
            context_snapshot_ref: snapshotRef,
            review_ref: reviewRef,
            selected_context_refs: [...review.selected_context_refs],
            limitation: status === 'unavailable'
                ? `Historical research context was not loaded: ${snapshot.query_status}.`
                : null
        };
        if (status !== 'loaded')
            return { context, item: null };
        const selected = review.selected_context_refs.map((ref) => available.get(ref));
        const content = `${JSON.stringify(selected, null, 2)}\n`;
        const source = {
            ref: snapshotRef,
            role: 'runtime_context',
            media_type: 'application/json',
            privacy_classification: 'data_only'
        };
        assertArtifactAdmissible({
            workspace_relative_path: snapshotRef.path,
            media_type: source.media_type,
            privacy_classification: source.privacy_classification,
            bytes: Buffer.from(content, 'utf8'),
            allow_restricted: false
        });
        return { context, item: this.boundedItem(source, content, remaining) };
    }
    async verifyEvidenceRefs(refs) {
        if (new Set(refs).size !== refs.length || refs.some((ref) => ref.trim().length === 0)) {
            fail('CONTRACT_INVALID', 'Synthesis Evidence refs must be unique and non-empty');
        }
        for (const ref of refs) {
            const match = /^evidence:([a-z0-9][a-z0-9_-]{0,95})$/.exec(ref);
            if (match === null) {
                fail('CONTRACT_INVALID', 'Synthesis Evidence refs must use evidence:<snapshot_id>');
            }
            await new ResearchEvidenceService(this.store).status(match[1]);
        }
    }
    async readSnapshot(snapshotId) {
        const snapshot = await this.readContract(this.snapshotPath(snapshotId), 'synthesis-input-snapshot');
        assertSynthesisInputSnapshot(snapshot);
        return snapshot;
    }
    async readSnapshotRef(ref) {
        await this.assertFileRef(ref);
        const match = /^research\/synthesis-inputs\/([a-z0-9][a-z0-9_-]{0,95})\.json$/.exec(ref.path);
        if (match === null)
            fail('APPROVAL_STALE', 'Synthesis Input Snapshot path is not canonical');
        return this.readSnapshot(match[1]);
    }
    async readRevision(path) {
        const revision = await this.readContract(path, 'research-synthesis-revision');
        const snapshot = await this.readSnapshotRef(revision.input_snapshot_ref);
        const { schema_version: _schema, revision_digest, ...input } = revision;
        void _schema;
        const recreated = createResearchSynthesisRevision(input, snapshot);
        if (recreated.revision_digest !== revision_digest) {
            fail('APPROVAL_STALE', 'Research Synthesis revision digest is stale');
        }
        return revision;
    }
    allowedContinuationOrigins(revision, snapshot) {
        return [...new Set([
                ...snapshot.evidence_refs,
                ...snapshot.source_items.map((item) => synthesisSourceRef(item.ref)),
                ...revision.insights.map((insight) => `insight:${insight.insight_id}`),
                ...revision.insights.flatMap((insight) => insight.prior_semantic_refs)
            ])];
    }
    async writeStatus(synthesisId, input) {
        await this.store.replaceAtomic(`${this.synthesisRoot(synthesisId)}/status.json`, createResearchSynthesisStatus(input));
    }
    async latestRevisionRef(synthesisId) {
        const root = `${this.synthesisRoot(synthesisId)}/revisions`;
        const ordinal = (await this.nextOrdinal(root)) - 1;
        return ordinal < 1 ? null : this.fileRef(`${root}/${ordinal}/revision.json`);
    }
    async nextOrdinal(path) {
        const entries = await this.store.list(path);
        const ordinals = entries.flatMap((entry) => entry.kind === 'directory' && /^[1-9][0-9]*$/.test(entry.name)
            ? [Number(entry.name)] : []);
        return ordinals.length === 0 ? 1 : Math.max(...ordinals) + 1;
    }
    candidateDigest(candidate) {
        try {
            return sha256(candidate);
        }
        catch {
            return sha256({ unvalidated_candidate: true, type: candidate === null ? 'null' : typeof candidate });
        }
    }
    async assertFileRef(ref) {
        const artifact = await this.store.readContainedArtifact(ref.path);
        if (artifact.digest !== ref.digest)
            fail('APPROVAL_STALE', `Artifact ref is stale: ${ref.path}`);
    }
    async fileRef(path) {
        const artifact = await this.store.readContainedArtifact(path);
        return { path: artifact.relative_path, digest: artifact.digest };
    }
    async readContract(path, contract) {
        const artifact = await this.store.readContainedArtifact(path);
        let value;
        try {
            value = JSON.parse(artifact.content.toString('utf8'));
        }
        catch {
            fail('CONTRACT_INVALID', `${path} is not valid JSON`);
        }
        return validateContract(contract, value);
    }
    assertPlanInput(input) {
        const keys = Object.keys(input);
        if (keys.length !== 7 || input.source_refs.length > SYNTHESIS_BUDGET_V1.max_items) {
            fail('CONTRACT_INVALID', 'Synthesis planning input is invalid or over budget');
        }
        this.snapshotPath(input.snapshot_id);
    }
    assertRecordInput(input) {
        if (Object.keys(input).length !== 4) {
            fail('CONTRACT_INVALID', 'Synthesis recording input contains unknown fields');
        }
        this.synthesisRoot(input.synthesis_id);
        this.snapshotPath(input.snapshot_id);
    }
    assertProposalInput(input) {
        if (Object.keys(input).length !== 4) {
            fail('CONTRACT_INVALID', 'Continuation Proposal input contains unknown fields');
        }
    }
    snapshotPath(snapshotId) {
        if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(snapshotId)) {
            fail('CONTRACT_INVALID', 'Synthesis Snapshot id is invalid');
        }
        return `research/synthesis-inputs/${snapshotId}.json`;
    }
    synthesisRoot(synthesisId) {
        if (!/^[a-z0-9][a-z0-9_-]{0,95}$/.test(synthesisId)) {
            fail('CONTRACT_INVALID', 'Research Synthesis id is invalid');
        }
        return `research/syntheses/${synthesisId}`;
    }
    revisionIdentity(path) {
        const match = /^research\/syntheses\/([a-z0-9][a-z0-9_-]{0,95})\/revisions\/([1-9][0-9]*)\/revision\.json$/.exec(path);
        if (match === null)
            fail('CONTRACT_INVALID', 'Research Synthesis revision path is not canonical');
        return { synthesisId: match[1], revision: Number(match[2]) };
    }
}
//# sourceMappingURL=research-synthesis-service.js.map