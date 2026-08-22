import type { GateResult } from './types.js';
interface ClaimLike {
    readonly claim_id: string;
    readonly statement: string;
    readonly claim_status: string;
    readonly evidence_refs: readonly string[];
}
interface EvidenceLike {
    readonly evidence_id: string;
    readonly source_ref: string;
    readonly evidence_type: string;
    readonly supports: readonly string[];
}
interface SourceLike {
    readonly source_id: string;
    readonly source_type: string;
    readonly publication_policy: string;
}
interface ResearchPackageLike {
    readonly research_track: {
        readonly id: string;
    };
    readonly topic: string;
    readonly thesis: {
        readonly summary: string;
        readonly claim_status: string;
    };
    readonly claims: readonly ClaimLike[];
    readonly evidence: readonly EvidenceLike[];
    readonly sources: readonly SourceLike[];
}
interface PublicationRequestLike {
    readonly publication_digest: string;
    readonly target_account: string;
    readonly adapter: string;
    readonly target_post_id: string | null;
}
interface ApprovalLike extends PublicationRequestLike {
    readonly expires_at: string;
}
export declare function runResearchGate(packageValue: ResearchPackageLike): GateResult;
export declare function runEvidenceGate(packageValue: ResearchPackageLike): GateResult;
export declare function runPrivacyGate(value: unknown): GateResult;
export declare function runPublishGate(request: PublicationRequestLike, approval?: ApprovalLike, now?: Date): GateResult;
export {};
