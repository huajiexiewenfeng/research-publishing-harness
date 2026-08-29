import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { RESEARCH_MEMORY_POLICY_V1 } from './research-memory-policy.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import { validateContract } from './schema-validator.js';
export const RESEARCH_QUERY_BUDGETS_V2 = Object.freeze({
    max_shards: RESEARCH_MEMORY_POLICY_V1.max_shards_per_query,
    max_records: RESEARCH_MEMORY_POLICY_V1.max_semantic_records_per_query,
    max_chunks: RESEARCH_MEMORY_POLICY_V1.max_document_chunks_per_query,
    max_chars_per_index_record: RESEARCH_MEMORY_POLICY_V1.max_chars_per_index_record,
    max_reconstructed_document_chars: RESEARCH_MEMORY_POLICY_V1.max_reconstructed_document_chars
});
function unique(values, label) {
    if (new Set(values).size !== values.length) {
        throw new HarnessError('CONTRACT_INVALID', `${label} must be unique`);
    }
}
function exactRuntimePath(value) {
    return /^domains\/research-publishing\/[A-Za-z0-9._/-]+$/.test(value) &&
        !value.includes('..') && !value.includes('//') && !value.includes('\\') &&
        !/[?*\[\]]/.test(value);
}
export function createResearchQueryPlan(input) {
    if (!STABLE_ID_PATTERN.test(input.query_id) || !STABLE_ID_PATTERN.test(input.track_id)) {
        throw new HarnessError('CONTRACT_INVALID', 'Query and Track ids must be stable');
    }
    if (input.view === 'working' && !input.include_working) {
        throw new HarnessError('CONTRACT_INVALID', 'Working view requires include_working');
    }
    const fullDocumentRequested = input.full_document_requested ?? false;
    if (fullDocumentRequested && input.document_mode !== 'full_explicit') {
        throw new HarnessError('CONTRACT_INVALID', 'full document reconstruction requires full_explicit');
    }
    if (input.query_intent.trim().length === 0 || input.selection_rationale.trim().length === 0) {
        throw new HarnessError('CONTRACT_INVALID', 'Query intent and selection rationale are required');
    }
    unique(input.selection_terms, 'selection terms');
    unique(input.selected_shard_refs.map((item) => item.shard_id), 'selected Shards');
    unique(input.selected_record_refs.map((item) => item.ref), 'selected records');
    unique(input.selected_manifest_refs.map((item) => item.document_id), 'selected Manifests');
    unique(input.selected_chunk_refs.map((item) => item.chunk_id), 'selected Chunks');
    const paths = [
        ...(input.catalog_ref === null ? [] : [input.catalog_ref.path]),
        ...input.selected_shard_refs.map((item) => item.path),
        ...input.selected_record_refs.map((item) => item.path),
        ...input.selected_manifest_refs.map((item) => item.path),
        ...input.selected_chunk_refs.map((item) => item.path)
    ];
    if (paths.some((path) => !exactRuntimePath(path))) {
        throw new HarnessError('CONTRACT_INVALID', 'Query Plan requires exact contained Runtime paths');
    }
    if (input.selected_shard_refs.length > RESEARCH_QUERY_BUDGETS_V2.max_shards ||
        input.selected_record_refs.length > RESEARCH_QUERY_BUDGETS_V2.max_records ||
        input.selected_manifest_refs.length > RESEARCH_QUERY_BUDGETS_V2.max_records ||
        input.selected_chunk_refs.length > RESEARCH_QUERY_BUDGETS_V2.max_chunks) {
        throw new HarnessError('CONTRACT_INVALID', 'context_budget_exceeded');
    }
    if (input.catalog_ref === null && (input.selected_shard_refs.length > 0 || input.selected_record_refs.length > 0 ||
        input.selected_manifest_refs.length > 0 || input.selected_chunk_refs.length > 0)) {
        throw new HarnessError('CONTRACT_INVALID', 'Query selections require an exact Catalog ref');
    }
    if (input.catalog_ref !== null && input.selected_shard_refs.some((item) => item.generation !== input.catalog_ref.generation || item.view !== input.view)) {
        throw new HarnessError('CONTRACT_INVALID', 'selected Shards must match the Catalog generation and view');
    }
    if (input.document_mode === 'none' && (input.selected_manifest_refs.length > 0 || input.selected_chunk_refs.length > 0)) {
        throw new HarnessError('CONTRACT_INVALID', 'document_mode none cannot select document records');
    }
    const body = {
        schema_version: 'research-query-plan/v2',
        query_id: input.query_id, track_id: input.track_id,
        index_id: `${input.track_id}:research`, query_intent: input.query_intent,
        view: input.view, include_working: input.include_working,
        selection_terms: [...input.selection_terms], selection_rationale: input.selection_rationale,
        document_mode: input.document_mode, full_document_requested: fullDocumentRequested,
        catalog_ref: input.catalog_ref, selected_shard_refs: [...input.selected_shard_refs],
        selected_record_refs: [...input.selected_record_refs],
        selected_manifest_refs: [...input.selected_manifest_refs], selected_chunk_refs: [...input.selected_chunk_refs],
        policy_version: 'research-memory-policy/v1', budgets: RESEARCH_QUERY_BUDGETS_V2,
        created_at: input.created_at
    };
    return validateContract('research-query-plan-v2', {
        ...body, plan_digest: sha256(body)
    });
}
export function createResearchContextSnapshot(input) {
    if (!STABLE_ID_PATTERN.test(input.snapshot_id) || !STABLE_ID_PATTERN.test(input.query_id)) {
        throw new HarnessError('CONTRACT_INVALID', 'Snapshot ids must be stable');
    }
    unique(input.selected_summary_refs, 'selected summary refs');
    unique(input.selected_record_refs.map((item) => item.ref), 'Snapshot record refs');
    unique(input.selected_evidence_refs, 'selected Evidence refs');
    unique(input.context_items.map((item) => item.context_ref), 'context refs');
    if (input.selected_record_refs.length > input.budgets.max_records) {
        throw new HarnessError('CONTRACT_INVALID', 'context_budget_exceeded');
    }
    const body = { schema_version: 'research-context-snapshot/v2', ...input };
    return validateContract('research-context-snapshot-v2', {
        ...body, snapshot_digest: sha256(body)
    });
}
export function createResearchContextReview(snapshot, input) {
    if (!STABLE_ID_PATTERN.test(input.review_id) || input.reviewer.trim().length === 0) {
        throw new HarnessError('CONTRACT_INVALID', 'Review id and reviewer are required');
    }
    unique(input.selected_context_refs, 'reviewed context refs');
    const available = new Set(snapshot.context_items.map((item) => item.context_ref));
    if (input.selected_context_refs.some((ref) => !available.has(ref))) {
        throw new HarnessError('CONTRACT_INVALID', 'Review selected context ref is absent from Snapshot');
    }
    const body = {
        schema_version: 'research-context-review/v2', review_id: input.review_id,
        query_id: snapshot.query_id, query_plan_digest: snapshot.query_plan_digest,
        snapshot_digest: snapshot.snapshot_digest, selected_context_refs: [...input.selected_context_refs],
        reviewer: input.reviewer, reviewed_at: input.reviewed_at
    };
    return validateContract('research-context-review-v2', {
        ...body, review_digest: sha256(body)
    });
}
//# sourceMappingURL=research-query-types.js.map