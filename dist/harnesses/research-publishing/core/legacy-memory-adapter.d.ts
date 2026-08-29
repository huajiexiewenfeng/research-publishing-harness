import type { RuntimeLoadPathsInput, RuntimeLoadPathsResult } from '../adapters/llm-wiki/runtime-protocol.js';
import type { LegacyRuntimeRecordType } from '../adapters/llm-wiki/runtime-adapter.js';
export interface LegacyRuntimeRecordRef {
    readonly record_type: LegacyRuntimeRecordType;
    readonly path: string;
    readonly checksum: `sha256:${string}`;
}
export interface LegacyResearchRecordV1 {
    readonly schema_version: 'legacy-research-record/v1';
    readonly legacy_record_type: 'legacy_publication_evidence' | 'legacy_feedback_snapshot' | 'legacy_candidate_insight';
    readonly source_record_type: LegacyRuntimeRecordType;
    readonly source_path: string;
    readonly source_digest: `sha256:${string}`;
    readonly content: string;
    readonly instruction_policy: 'data_only';
    readonly sanitized: boolean;
    readonly risk_flags: readonly string[];
    readonly supporting_only: true;
    readonly semantic_completeness: Readonly<{
        research_question: false;
        thesis: false;
        canonical_evidence: false;
    }>;
    readonly record_digest: `sha256:${string}`;
}
export interface LegacyEvidenceBindingV1 {
    readonly legacy_ref: string;
    readonly legacy_record_type: LegacyResearchRecordV1['legacy_record_type'];
    readonly source_path: string;
    readonly source_digest: `sha256:${string}`;
    readonly classification: 'data_only';
    readonly sanitized: boolean;
    readonly risk_flags: readonly string[];
    readonly supporting_only: true;
    readonly eligible_for_mainline: false;
    readonly requires_import_promotion: true;
}
export interface LegacyMemoryRuntime {
    loadPaths(input: RuntimeLoadPathsInput): Promise<RuntimeLoadPathsResult>;
}
export declare class LegacyMemoryAdapter {
    private readonly runtime;
    constructor(runtime: LegacyMemoryRuntime);
    load(ref: LegacyRuntimeRecordRef): Promise<LegacyResearchRecordV1>;
    attachAsSupportingEvidence(refs: readonly LegacyRuntimeRecordRef[]): Promise<readonly LegacyEvidenceBindingV1[]>;
}
