import { HarnessError } from './errors.js';
const REQUIRED_IDENTITIES = {
    research_increment: ['increment_id', 'track_id', 'revision'],
    claim_version: ['claim_id', 'version'],
    research_decision: ['decision_id'],
    open_question: ['question_id', 'version'],
    publication_expression: ['expression_id'],
    research_evolution_edge: ['edge_id'],
    canonical_document_manifest: ['document_id'],
    canonical_document_chunk: ['document_id', 'chunk_id', 'ordinal'],
    research_lifecycle_event: ['event_id', 'increment_ref', 'event_seq'],
    research_index_catalog: ['index_id', 'track_id', 'generation', 'catalog_digest'],
    research_index_shard: ['shard_id', 'track_id', 'generation', 'view']
};
const FRONTMATTER_KEY = /^[a-z][a-z0-9_]*$/;
const FORBIDDEN_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
function yamlScalar(value) {
    if (typeof value === 'string')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new HarnessError('CONTRACT_INVALID', 'frontmatter number must be finite');
        return String(value);
    }
    if (typeof value === 'boolean')
        return String(value);
    if (!value.every((item) => typeof item === 'string')) {
        throw new HarnessError('CONTRACT_INVALID', 'frontmatter arrays must contain strings');
    }
    return JSON.stringify(value);
}
export function renderResearchRecord(input) {
    if (input.body.length === 0 || FORBIDDEN_CONTROL.test(input.body) ||
        input.body.includes('\r')) {
        throw new HarnessError('CONTRACT_INVALID', 'record body must be exact non-empty LF text without control characters');
    }
    if ('record_type' in input.frontmatter || 'instruction_policy' in input.frontmatter) {
        throw new HarnessError('CONTRACT_INVALID', 'reserved frontmatter fields are renderer-owned');
    }
    for (const identity of REQUIRED_IDENTITIES[input.record_type]) {
        const value = input.frontmatter[identity];
        if (value === undefined || value === '') {
            throw new HarnessError('CONTRACT_INVALID', `record frontmatter requires ${identity}`);
        }
    }
    const keys = Object.keys(input.frontmatter).sort();
    if (keys.some((key) => !FRONTMATTER_KEY.test(key))) {
        throw new HarnessError('CONTRACT_INVALID', 'record frontmatter keys must be ASCII-safe');
    }
    const lines = [
        '---',
        `record_type: ${JSON.stringify(input.record_type)}`,
        'instruction_policy: "data_only"',
        ...keys.map((key) => `${key}: ${yamlScalar(input.frontmatter[key])}`),
        '---'
    ];
    return `${lines.join('\n')}\n${input.body}`;
}
//# sourceMappingURL=research-record-renderer.js.map