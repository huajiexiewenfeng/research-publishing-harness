import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
const PATHS = {
    publication_evidence: /^domains\/research-publishing\/tracks\/[a-z0-9][a-z0-9_-]{0,127}\/publications\/[a-zA-Z0-9._-]+\.md$/,
    feedback_snapshot: /^domains\/research-publishing\/tracks\/[a-z0-9][a-z0-9_-]{0,127}\/feedback\/[a-zA-Z0-9._-]+\.md$/,
    candidate_insight: /^domains\/research-publishing\/tracks\/[a-z0-9][a-z0-9_-]{0,127}\/insights\/[a-zA-Z0-9._-]+\.md$/
};
const MAX_RECORD_CHARS = 12_000;
const MAX_SUPPORTING_RECORDS = 12;
export class LegacyMemoryAdapter {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    async load(ref) {
        if (!PATHS[ref.record_type].test(ref.path) ||
            !/^sha256:[a-f0-9]{64}$/.test(ref.checksum) || /[?*\[\]\\]/.test(ref.path)) {
            throw new HarnessError('CONTRACT_INVALID', 'legacy record ref must be one exact type-matched Runtime path');
        }
        const result = await this.runtime.loadPaths({
            paths: [ref.path], max_items: 1,
            max_item_chars: MAX_RECORD_CHARS, max_total_chars: MAX_RECORD_CHARS
        });
        if (result.status !== 'loaded' || !['0.2.0', '0.3.0'].includes(result.runtime_version ?? '') || result.items.length !== 1) {
            throw new HarnessError('ARTIFACT_NOT_FOUND', 'legacy Runtime record was not loaded exactly');
        }
        const item = result.items[0];
        if (item.path !== ref.path || item.checksum !== ref.checksum) {
            throw new HarnessError('MEMORY_SOURCE_STALE', 'legacy Runtime record path or checksum changed');
        }
        const body = {
            schema_version: 'legacy-research-record/v1',
            legacy_record_type: `legacy_${ref.record_type}`,
            source_record_type: ref.record_type,
            source_path: item.path,
            source_digest: item.checksum,
            content: item.content,
            instruction_policy: 'data_only',
            sanitized: item.sanitized,
            risk_flags: [...item.risk_flags],
            supporting_only: true,
            semantic_completeness: {
                research_question: false,
                thesis: false,
                canonical_evidence: false
            }
        };
        return validateContract('legacy-research-record', {
            ...body,
            record_digest: sha256(body)
        });
    }
    async attachAsSupportingEvidence(refs) {
        if (refs.length === 0 || refs.length > MAX_SUPPORTING_RECORDS ||
            new Set(refs.map((ref) => `${ref.record_type}:${ref.path}`)).size !== refs.length) {
            throw new HarnessError('CONTRACT_INVALID', 'legacy supporting refs must be unique and bounded');
        }
        const bindings = [];
        for (const ref of refs) {
            const record = await this.load(ref);
            bindings.push({
                legacy_ref: `legacy:${record.source_record_type}@${record.source_digest}`,
                legacy_record_type: record.legacy_record_type,
                source_path: record.source_path,
                source_digest: record.source_digest,
                classification: 'data_only',
                sanitized: record.sanitized,
                risk_flags: record.risk_flags,
                supporting_only: true,
                eligible_for_mainline: false,
                requires_import_promotion: true
            });
        }
        return bindings;
    }
}
//# sourceMappingURL=legacy-memory-adapter.js.map