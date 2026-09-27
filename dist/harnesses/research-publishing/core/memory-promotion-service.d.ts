import type { RuntimeEnvelope } from '../adapters/llm-wiki/runtime-protocol.js';
import type { MemoryPromotionApprovalV2, MemoryPromotionPlanV2, MemoryPromotionReceiptV2, MemoryPromotionStepStatus, ResearchPromotionAction } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface RuntimeCatalogLookupNotFound {
    readonly status: 'not_found';
}
export interface RuntimeCatalogLookupFound {
    readonly status: 'found';
    readonly path: string;
    readonly digest: `sha256:${string}`;
}
export type RuntimeCatalogLookup = RuntimeCatalogLookupNotFound | RuntimeCatalogLookupFound;
export interface MemoryPromotionRuntime {
    version(): Promise<'0.2.0' | '0.3.0'>;
    validateMapping(): Promise<RuntimeEnvelope>;
    findCatalog(trackId: string): Promise<RuntimeCatalogLookup>;
    copySource(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
    writeRecord(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
    registerArtifact(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
    appendLog(input: Readonly<Record<string, unknown>>): Promise<RuntimeEnvelope>;
}
export interface PromotionDomainAssets {
    readonly profile_path: string;
    readonly mapping_path: string;
    readonly scp_paths: readonly string[];
}
export interface MemoryPromotionIds {
    readonly planId?: () => string;
    readonly approvalId?: () => string;
    readonly receiptId?: () => string;
    readonly now?: () => Date;
}
interface PromotionStepStateV2 {
    readonly name: ResearchPromotionAction;
    readonly status: MemoryPromotionStepStatus;
    readonly artifact_ref: string | null;
    readonly checksum: `sha256:${string}` | null;
    readonly error_code: string | null;
    readonly runtime_status: string | null;
}
export interface MemoryPromotionStatusV2 {
    readonly schema_version: 'memory-promotion-status/v2';
    readonly plan_id: string;
    readonly plan_digest: `sha256:${string}`;
    readonly approval_digest: `sha256:${string}` | null;
    readonly track_id: string;
    readonly phase: 'planned' | 'approved' | 'executing' | 'partial' | 'reconciliation_required' | 'complete';
    readonly active_step: ResearchPromotionAction | null;
    readonly steps: readonly PromotionStepStateV2[];
    readonly record_refs: readonly string[];
    readonly latest_receipt_path: string | null;
    readonly receipt_seq: number;
    readonly updated_at: string;
}
export declare class MemoryPromotionService {
    private readonly store;
    private readonly runtime;
    private readonly assets;
    private readonly ids;
    private readonly now;
    private readonly evidence;
    constructor(store: WorkspaceStore, runtime: MemoryPromotionRuntime, assets: PromotionDomainAssets, ids?: MemoryPromotionIds);
    private root;
    private workspaceDigest;
    private domainDigests;
    private loadDelta;
    private loadReview;
    plan(deltaId: string, reviewId: string): Promise<MemoryPromotionPlanV2>;
    private renderOperation;
    approve(planId: string, confirmedPlanDigest: `sha256:${string}`, actor: string, ttlMs: number): Promise<MemoryPromotionApprovalV2>;
    execute(planId: string, approval: MemoryPromotionApprovalV2): Promise<MemoryPromotionReceiptV2>;
    resume(planId: string, approval: MemoryPromotionApprovalV2): Promise<MemoryPromotionReceiptV2>;
    status(planId: string): Promise<MemoryPromotionStatusV2>;
    private loadPlan;
    private preflight;
    private run;
    private perform;
    private writeOperations;
    private checkedMutation;
    private receipt;
    private writeState;
}
export {};
