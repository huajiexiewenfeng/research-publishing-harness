import type { ClaimStatus } from './types.js';
import { type PublicationEvidenceReader, type PublicationIntentBinding, type PublicationReceiptBinding } from './publication-evidence-reader.js';
import type { PrivacyClassification, PublicationChannel, PublicationExpressionV1 } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export type { PublicationChannel } from './research-memory-types.js';
export interface AssemblePublicationExpressionInput {
    readonly expression_id: string;
    readonly increment_ref: string;
    readonly channel: PublicationChannel;
    readonly language: string;
    readonly derivation_type: 'original' | 'translation' | 'compression' | 'adaptation';
    readonly claim_refs: readonly string[];
    readonly visual_refs: readonly string[];
    readonly evidence_snapshot_refs: readonly string[];
    readonly intent: PublicationIntentBinding;
    readonly receipt: PublicationReceiptBinding | null;
    readonly source_claim_statuses: Readonly<Record<string, ClaimStatus>>;
    readonly expression_claim_statuses: Readonly<Record<string, ClaimStatus>>;
    readonly target_privacy_classification: PrivacyClassification;
}
export declare class PublicationExpressionService {
    private readonly reader;
    constructor(store: WorkspaceStore, reader?: PublicationEvidenceReader);
    assemble(input: AssemblePublicationExpressionInput): Promise<PublicationExpressionV1>;
}
