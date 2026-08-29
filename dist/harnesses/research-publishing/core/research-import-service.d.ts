import type { ResearchEvidenceSnapshotV1, SemanticMemoryDeltaV1 } from './research-memory-types.js';
import type { LegacyClaimStatus as ClaimStatus } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface ResearchImportManifestV1 {
    readonly schema_version: 'research-import-manifest/v1';
    readonly import_id: string;
    readonly import_scope: 'single_increment';
    readonly workspace_identity_digest: `sha256:${string}`;
    readonly track_id: string;
    readonly increment: Readonly<{
        increment_id: string;
        revision: 1;
        title: string;
        research_question: string;
        thesis: string;
        summary: string;
        tags: readonly string[];
        claim_refs: readonly string[];
        boundary_refs: readonly string[];
        open_question_refs: readonly string[];
        source_refs: readonly string[];
    }>;
    readonly mother_article: Readonly<{
        path: string;
        digest: `sha256:${string}`;
        source_classification: 'local_verified';
    }>;
    readonly gist: Readonly<{
        url: string;
        source_classification: 'user_asserted' | 'public_verified';
    }>;
    readonly thread: Readonly<{
        root_url: string;
        published_at: string;
        source_classification: 'user_asserted' | 'public_verified';
        receipt: Readonly<{
            path: string;
            digest: `sha256:${string}`;
        }>;
        items: ReadonlyArray<{
            ordinal: number;
            text: string;
            content_digest: `sha256:${string}`;
            platform_id: string | null;
            public_url: string | null;
            metrics: Readonly<Record<string, number>> | null;
            source_classification: 'receipt_backed' | 'user_asserted';
        }>;
    }>;
    readonly claims: ReadonlyArray<{
        claim_id: string;
        version: number;
        statement: string;
        claim_status: ClaimStatus;
        evidence_refs: readonly string[];
        boundary_refs: readonly string[];
        summary: string;
    }>;
    readonly boundaries: Readonly<{
        established: readonly string[];
        not_established: readonly string[];
        planned_work: readonly string[];
    }>;
    readonly explicit_assertions: ReadonlyArray<{
        field: string;
        value: string;
        source_classification: 'user_asserted';
    }>;
    readonly imported_at: string;
    readonly manifest_digest: `sha256:${string}`;
}
export interface ResearchImportGapReportV1 {
    readonly schema_version: 'research-import-gap-report/v1';
    readonly import_id: string;
    readonly manifest_digest: `sha256:${string}`;
    readonly item_order: readonly number[];
    readonly unrecoverable_gaps: ReadonlyArray<{
        readonly field: string;
        readonly reason: string;
    }>;
    readonly blocking_gaps: ReadonlyArray<{
        readonly field: string;
        readonly reason: string;
    }>;
    readonly source_summary: Readonly<{
        local_verified: number;
        receipt_backed: number;
        user_asserted: number;
        public_verified: number;
    }>;
    readonly report_digest: `sha256:${string}`;
}
export interface ResearchImportServiceOptions {
    readonly deltaId?: () => string;
    readonly lifecycleEventId?: () => string;
    readonly now?: () => Date;
    readonly baseCatalogDigest?: () => Promise<`sha256:${string}`>;
}
export declare class ResearchImportService {
    private readonly store;
    private readonly options;
    private readonly now;
    constructor(store: WorkspaceStore, options?: ResearchImportServiceOptions);
    inspect(input: ResearchImportManifestV1): Promise<ResearchImportGapReportV1>;
    capture(input: ResearchImportManifestV1): Promise<ResearchEvidenceSnapshotV1>;
    propose(input: ResearchImportManifestV1, snapshotId: string): Promise<SemanticMemoryDeltaV1>;
    private createExpression;
    private operation;
    private target;
    private index;
    private targetForIncrement;
    private targetForClaim;
    private targetForQuestion;
    private targetForExpression;
    private targetForLifecycle;
    private question;
    private assertStructuralSafety;
    private verifyArtifact;
    private root;
}
