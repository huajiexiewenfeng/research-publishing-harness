import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
export const STABLE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,95}$/;
const CLAIM_RANK = {
    planned: 0,
    hypothesis: 1,
    inferred: 2,
    observed: 3,
    verified: 4
};
function assertStableId(value, label) {
    if (!STABLE_ID_PATTERN.test(value)) {
        throw new HarnessError('CONTRACT_INVALID', `${label} must be an ASCII-safe stable id`);
    }
}
function assertWorkspaceRelativePath(value) {
    const normalized = value.replaceAll('\\', '/');
    if (value.length === 0 ||
        /^[a-zA-Z]:[\\/]/.test(value) ||
        value.startsWith('/') ||
        normalized.split('/').some((part) => part === '..' || part.length === 0)) {
        throw new HarnessError('WORKSPACE_PATH_INVALID', 'artifact path must be a contained workspace-relative path');
    }
}
export function createArtifactRefV2(input) {
    assertWorkspaceRelativePath(input.workspace_relative_path);
    const hex = input.digest.slice('sha256:'.length);
    const value = {
        schema_version: '2.3',
        ...input,
        object_path: `memory/evidence/objects/sha256/${hex.slice(0, 2)}/${hex}`
    };
    return validateContract('artifact-ref-v2', value);
}
export function createResearchIncrementRevision(input) {
    assertStableId(input.increment_id, 'increment id');
    assertStableId(input.track_id, 'track id');
    const body = {
        schema_version: 'research-increment-revision/v1',
        ...input
    };
    return validateContract('research-increment-revision', {
        ...body,
        content_digest: sha256(input)
    });
}
export function createClaimVersion(input) {
    assertStableId(input.claim_id, 'claim id');
    if (CLAIM_RANK[input.claim_status] > CLAIM_RANK[input.canonical_claim_status]) {
        throw new HarnessError('CONTRACT_INVALID', 'claim status cannot exceed canonical claim status');
    }
    const persisted = {
        claim_id: input.claim_id,
        version: input.version,
        statement: input.statement,
        claim_status: input.claim_status,
        evidence_refs: input.evidence_refs,
        boundary_refs: input.boundary_refs,
        increment_ref: input.increment_ref,
        evolution_refs: input.evolution_refs,
        summary: input.summary
    };
    const body = {
        schema_version: 'claim-version/v1',
        ...persisted
    };
    return validateContract('claim-version', {
        ...body,
        claim_digest: sha256(body)
    });
}
export function createPublicationExpression(input) {
    assertStableId(input.expression_id, 'Publication Expression id');
    assertUnique(input.claim_refs, 'Publication Expression claim refs');
    assertUnique(input.visual_refs, 'Publication Expression visual refs');
    assertUnique(input.evidence_snapshot_refs, 'Publication Expression Evidence refs');
    const body = {
        schema_version: 'publication-expression/v1',
        ...input
    };
    return validateContract('publication-expression', {
        ...body,
        expression_digest: sha256(body)
    });
}
const PRIVACY_RANK = {
    public: 0,
    internal: 1,
    data_only: 1,
    restricted: 2
};
function assertUnique(values, label) {
    if (new Set(values).size !== values.length) {
        throw new HarnessError('CONTRACT_INVALID', `${label} must be unique`);
    }
}
export function createSemanticMemoryDelta(input) {
    assertStableId(input.delta_id, 'delta id');
    if (input.proposed_operations.length === 0 || input.evidence_snapshot_refs.length === 0) {
        throw new HarnessError('CONTRACT_INVALID', 'Semantic Delta requires operations and Evidence');
    }
    assertUnique(input.evidence_snapshot_refs, 'Delta Evidence refs');
    assertUnique(input.proposed_operations.map((operation) => operation.operation_id), 'operation ids');
    const availableEvidence = new Set(input.evidence_snapshot_refs);
    for (const operation of input.proposed_operations) {
        assertStableId(operation.operation_id, 'operation id');
        assertStableId(operation.target_id, 'operation target id');
        if (sha256(operation.target_content) !== operation.target_content_digest) {
            throw new HarnessError('CONTRACT_INVALID', 'operation target content digest does not match');
        }
        if (operation.evidence_refs.length === 0 ||
            operation.evidence_refs.some((ref) => !availableEvidence.has(ref))) {
            throw new HarnessError('CONTRACT_INVALID', 'operation Evidence must resolve within the Delta');
        }
        if (PRIVACY_RANK[operation.target_privacy_classification] <
            PRIVACY_RANK[operation.evidence_privacy_classification]) {
            throw new HarnessError('PRIVACY_GATE_BLOCKED', 'operation privacy cannot downgrade Evidence');
        }
        if (operation.operation_type === 'add_edge') {
            const from = operation.target_content.from_ref;
            const to = operation.target_content.to_ref;
            if (typeof from !== 'string' || typeof to !== 'string' || from.length === 0 || to.length === 0 || from === to) {
                throw new HarnessError('CONTRACT_INVALID', 'evolution edge endpoints must be distinct resolvable refs');
            }
        }
    }
    const body = {
        schema_version: 'semantic-memory-delta/v1',
        ...input
    };
    return validateContract('semantic-memory-delta', {
        ...body,
        delta_digest: sha256(body)
    });
}
export function createSemanticPromotionReview(delta, input) {
    validateContract('semantic-memory-delta', delta);
    assertStableId(input.review_id, 'review id');
    const allIds = delta.proposed_operations.map((operation) => operation.operation_id);
    const accepted = new Set(input.accepted_operation_ids);
    const rejected = new Set(input.rejected_operation_ids);
    assertUnique(input.accepted_operation_ids, 'accepted operation ids');
    assertUnique(input.rejected_operation_ids, 'rejected operation ids');
    if (allIds.some((id) => (accepted.has(id) ? 1 : 0) + (rejected.has(id) ? 1 : 0) !== 1) ||
        accepted.size + rejected.size !== allIds.length) {
        throw new HarnessError('CONTRACT_INVALID', 'Review must partition every Delta operation exactly once');
    }
    const reasonIds = input.rejection_reasons.map((reason) => reason.operation_id);
    assertUnique(reasonIds, 'rejection reasons');
    if (reasonIds.length !== rejected.size ||
        reasonIds.some((id) => !rejected.has(id)) ||
        input.rejection_reasons.some((item) => item.reason.trim().length === 0)) {
        throw new HarnessError('CONTRACT_INVALID', 'Review requires one reason for every rejected operation');
    }
    assertUnique(input.operation_replacements.map((replacement) => replacement.operation_id), 'operation replacements');
    for (const replacement of input.operation_replacements) {
        if (!accepted.has(replacement.operation_id)) {
            throw new HarnessError('CONTRACT_INVALID', 'only accepted operations may be replaced');
        }
        const operation = delta.proposed_operations.find((candidate) => candidate.operation_id === replacement.operation_id);
        if (replacement.evidence_refs.some((ref) => !delta.evidence_snapshot_refs.includes(ref))) {
            throw new HarnessError('CONTRACT_INVALID', 'replacement Evidence must resolve within the Delta');
        }
        if (replacement.claim_status !== undefined) {
            const priorStatus = operation.target_content.claim_status;
            const canonicalStatus = operation.target_content.canonical_claim_status;
            if (typeof priorStatus !== 'string' || !(priorStatus in CLAIM_RANK) ||
                typeof canonicalStatus !== 'string' || !(canonicalStatus in CLAIM_RANK)) {
                throw new HarnessError('CONTRACT_INVALID', 'claim replacement requires canonical claim status');
            }
            if (CLAIM_RANK[replacement.claim_status] > CLAIM_RANK[canonicalStatus]) {
                throw new HarnessError('CONTRACT_INVALID', 'review cannot exceed canonical claim status');
            }
            const hasNewEvidence = replacement.evidence_refs.some((ref) => !operation.evidence_refs.includes(ref));
            if (CLAIM_RANK[replacement.claim_status] > CLAIM_RANK[priorStatus] &&
                !hasNewEvidence) {
                throw new HarnessError('CONTRACT_INVALID', 'review cannot strengthen a claim without new Evidence');
            }
        }
    }
    const body = {
        schema_version: 'semantic-promotion-review/v1',
        review_id: input.review_id,
        delta_id: delta.delta_id,
        delta_digest: delta.delta_digest,
        accepted_operation_ids: [...input.accepted_operation_ids],
        rejected_operation_ids: [...input.rejected_operation_ids],
        rejection_reasons: [...input.rejection_reasons],
        operation_replacements: [...input.operation_replacements],
        reviewer: input.reviewer,
        reviewed_at: input.reviewed_at
    };
    return validateContract('semantic-promotion-review', {
        ...body,
        review_digest: sha256(body)
    });
}
//# sourceMappingURL=research-memory-contracts.js.map