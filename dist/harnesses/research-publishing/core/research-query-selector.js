import { HarnessError } from './errors.js';
import { RESEARCH_QUERY_BUDGETS_V2 } from './research-query-types.js';
function selectedUnique(candidates, selected, key, limit, label) {
    const requested = new Set(selected);
    if (requested.size > limit)
        throw new HarnessError('CONTRACT_INVALID', 'context_budget_exceeded');
    const byKey = new Map();
    for (const candidate of candidates) {
        const id = key(candidate);
        if (byKey.has(id))
            throw new HarnessError('CONTRACT_INVALID', `${label} candidates must be unique`);
        byKey.set(id, candidate);
    }
    if ([...requested].some((id) => !byKey.has(id))) {
        throw new HarnessError('CONTRACT_INVALID', `selected ref is absent from ${label} candidates`);
    }
    return [...requested].sort((left, right) => left.localeCompare(right)).map((id) => byKey.get(id));
}
export function selectIndexShards(input) {
    return selectedUnique(input.candidates, input.selected_shard_ids, (item) => item.shard_id, RESEARCH_QUERY_BUDGETS_V2.max_shards, 'Shard').map((item) => {
        if (item.generation !== input.generation) {
            throw new HarnessError('CONTRACT_INVALID', 'selected Shard belongs to another generation');
        }
        return {
            shard_id: item.shard_id, path: item.path, digest: item.digest,
            generation: item.generation, view: input.view
        };
    });
}
export function selectSemanticRecords(input) {
    return selectedUnique(input.candidates, input.selected_record_refs, (item) => item.ref, RESEARCH_QUERY_BUDGETS_V2.max_records, 'record').map((item) => ({
        ref: item.ref, path: item.record_path, digest: item.record_digest,
        evidence_refs: [], document_manifest_ref: null
    }));
}
export function selectDocumentChunks(input) {
    if (input.document_mode === 'none' && input.selected_chunk_ids.length > 0) {
        throw new HarnessError('CONTRACT_INVALID', 'document_mode none cannot select Chunks');
    }
    return selectedUnique(input.candidates, input.selected_chunk_ids, (item) => item.chunk_id, RESEARCH_QUERY_BUDGETS_V2.max_chunks, 'Chunk').sort((left, right) => left.ordinal - right.ordinal || left.chunk_id.localeCompare(right.chunk_id))
        .map((item) => ({
        chunk_id: item.chunk_id, path: item.record_path, digest: item.chunk_digest,
        ordinal: item.ordinal, char_start: item.char_start, char_end: item.char_end
    }));
}
//# sourceMappingURL=research-query-selector.js.map