import { type ResearchTerminalNotifier } from './research-terminal-hooks.js';
import type { CandidateInsightProposalV1, Digest } from './memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface ProposeInsightInput extends Omit<CandidateInsightProposalV1, 'schema_version' | 'proposal_id' | 'proposal_digest'> {
    readonly feedback_snapshot_path: string;
    readonly feedback_snapshot_digest: Digest;
    readonly basis: 'observed_text' | 'metrics_only';
}
export interface MemoryInsightReviewV1 {
    readonly schema_version: 'memory-insight-review/v1';
    readonly proposal_id: string;
    readonly proposal_digest: Digest;
    readonly reviewed_by: string;
    readonly accepted: boolean;
    readonly reason: string;
    readonly reviewed_at: string;
    readonly review_digest: Digest;
}
export interface MemoryInsightServiceIds {
    readonly proposalId?: () => string;
    readonly now?: () => Date;
}
export declare class MemoryInsightService {
    private readonly store;
    private readonly ids;
    private readonly terminalNotifier;
    constructor(store: WorkspaceStore, ids?: MemoryInsightServiceIds, terminalNotifier?: ResearchTerminalNotifier | null);
    private root;
    private loadFeedback;
    propose(input: ProposeInsightInput): Promise<CandidateInsightProposalV1>;
    reviewInsight(proposalId: string, input: Readonly<{
        reviewed_by: string;
        accepted: boolean;
        reason: string;
        reviewed_at: Date;
    }>): Promise<MemoryInsightReviewV1>;
    private proposal;
    requireAccepted(proposalId: string): Promise<CandidateInsightProposalV1>;
}
