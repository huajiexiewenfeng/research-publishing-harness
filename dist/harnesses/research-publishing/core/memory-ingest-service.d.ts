import type { RuntimeEnvelope } from '../adapters/llm-wiki/runtime-protocol.js';
import type { Digest, MemoryIngestApprovalV1, MemoryIngestPlanV1, MemoryIngestReceiptV1, MemoryIngestState, MemoryIngestStepName } from './memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface MemoryIngestRuntime {
    version(): Promise<'0.2.0'>;
    validateMapping(): Promise<RuntimeEnvelope>;
    copySource(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
    writeRecord(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
    registerArtifact(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
    appendLog(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
}
export interface MemoryDomainAssets {
    readonly profile_path: string;
    readonly mapping_path: string;
    readonly scp_paths: readonly string[];
}
export interface MemoryIngestIds {
    readonly ingestId?: () => string;
    readonly approvalId?: () => string;
    readonly receiptId?: () => string;
    readonly now?: () => Date;
}
export interface PublicationCheckpointInput {
    readonly receipt_path: string;
    readonly receipt_digest: Digest;
    readonly research_track: string;
    readonly publication_id: string;
}
export interface FeedbackInsightInput extends PublicationCheckpointInput {
    readonly feedback_snapshot_path: string;
    readonly feedback_snapshot_file_digest: Digest;
    readonly proposal_ids: readonly string[];
    readonly feedback_id: string;
}
interface IngestStepState {
    readonly name: MemoryIngestStepName;
    readonly status: 'pending' | 'succeeded' | 'already_exists' | 'failed';
    readonly artifact_ref: string | null;
    readonly checksum: Digest | null;
    readonly error_code: string | null;
}
export interface MemoryIngestExecutionStateV1 {
    readonly schema_version: 'memory-ingest-state/v1';
    readonly ingest_id: string;
    readonly plan_digest: Digest;
    readonly approval_digest: Digest | null;
    readonly state: MemoryIngestState;
    readonly active_step: MemoryIngestStepName | null;
    readonly steps: readonly IngestStepState[];
    readonly records: ReadonlyArray<{
        readonly relative_path: string;
        readonly digest: Digest;
    }>;
    readonly log_event_ref: string | null;
    readonly latest_receipt_path: string | null;
    readonly updated_at: string;
}
export declare function approveMemoryIngest(plan: MemoryIngestPlanV1, approvedBy: string, ttlMs: number, now?: Date, id?: () => string): MemoryIngestApprovalV1;
export declare class MemoryIngestService {
    private readonly store;
    private readonly runtime;
    private readonly assets;
    private readonly ids;
    private readonly now;
    constructor(store: WorkspaceStore, runtime: MemoryIngestRuntime, assets: MemoryDomainAssets, ids?: MemoryIngestIds);
    private root;
    private domainDigests;
    private workspaceDigest;
    private loadBoundJson;
    private publication;
    private writeStaging;
    private finalizePlan;
    planPublicationCheckpoint(input: PublicationCheckpointInput): Promise<MemoryIngestPlanV1>;
    planFeedbackInsight(input: FeedbackInsightInput): Promise<MemoryIngestPlanV1>;
    private initialState;
    approve(ingestId: string, approvedBy: string, ttlMs: number): Promise<MemoryIngestApprovalV1>;
    private plan;
    private writeState;
    status(ingestId: string): Promise<MemoryIngestExecutionStateV1>;
    private assertApproval;
    private preflight;
    execute(ingestId: string, approval: MemoryIngestApprovalV1): Promise<MemoryIngestReceiptV1>;
    resume(ingestId: string, approval: MemoryIngestApprovalV1): Promise<MemoryIngestReceiptV1>;
    private runSteps;
    private receipt;
}
export {};
