import type { CandidateInsightProposalV1, MemoryIngestPlanV1, PublicationFeedbackSnapshotV1 } from './memory-types.js';
export declare function renderPublicationEvidenceRecord(receipt: Record<string, unknown>): string;
export declare function renderFeedbackRecord(snapshot: PublicationFeedbackSnapshotV1): string;
export declare function renderCandidateInsightRecord(proposal: CandidateInsightProposalV1): string;
export declare function renderMemoryIngestPreview(plan: MemoryIngestPlanV1, recordPreviews: readonly string[]): string;
