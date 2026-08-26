import type { ResearchArtifactRefV1 } from './research-program-types.js';
import type { ResearchContinuationCandidateV1, ResearchContinuationProposalV1, ResearchSynthesisRevisionV1, ResearchSynthesisStatusV1, SynthesisContextItemV1, SynthesisInputSnapshotV1 } from './research-synthesis-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface PlanResearchSynthesisInput {
    readonly snapshot_id: string;
    readonly trigger: SynthesisInputSnapshotV1['trigger'];
    readonly source_refs: ReadonlyArray<{
        readonly ref: ResearchArtifactRefV1;
        readonly role: SynthesisContextItemV1['role'];
        readonly media_type: string;
        readonly privacy_classification: Exclude<SynthesisContextItemV1['privacy_classification'], 'restricted'>;
    }>;
    readonly evidence_refs: readonly string[];
    readonly prior_synthesis_ref: ResearchArtifactRefV1 | null;
    readonly runtime_query: {
        readonly query_id: string;
        readonly plan_digest: `sha256:${string}`;
        readonly snapshot_digest: `sha256:${string}`;
        readonly review_digest: `sha256:${string}`;
    } | null;
    readonly created_at: string;
}
export interface RecordResearchSynthesisInput {
    readonly synthesis_id: string;
    readonly snapshot_id: string;
    readonly candidate: unknown;
    readonly recorded_at: string;
}
export interface ProposeResearchContinuationInput {
    readonly proposal_id: string;
    readonly synthesis_ref: ResearchArtifactRefV1;
    readonly candidates: readonly ResearchContinuationCandidateV1[];
    readonly proposed_at: string;
}
export declare class ResearchSynthesisService {
    private readonly store;
    private readonly now;
    constructor(store: WorkspaceStore, options?: {
        readonly now?: () => Date;
    });
    plan(input: PlanResearchSynthesisInput): Promise<SynthesisInputSnapshotV1>;
    record(input: RecordResearchSynthesisInput): Promise<ResearchSynthesisRevisionV1>;
    status(synthesisId: string): Promise<ResearchSynthesisStatusV1>;
    proposeContinuation(input: ProposeResearchContinuationInput): Promise<ResearchContinuationProposalV1>;
    continuationStatus(synthesisId: string, proposalId: string): Promise<ResearchContinuationProposalV1>;
    private readAdmittedSource;
    private boundedItem;
    private readRuntimeQuery;
    private verifyEvidenceRefs;
    private readSnapshot;
    private readSnapshotRef;
    private readRevision;
    private allowedContinuationOrigins;
    private writeStatus;
    private latestRevisionRef;
    private nextOrdinal;
    private candidateDigest;
    private assertFileRef;
    private fileRef;
    private readContract;
    private assertPlanInput;
    private assertRecordInput;
    private assertProposalInput;
    private snapshotPath;
    private synthesisRoot;
    private revisionIdentity;
}
