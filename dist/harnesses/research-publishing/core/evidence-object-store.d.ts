import type { ArtifactRefV2, ArtifactRole, PrivacyClassification } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface ContainedArtifactInput {
    readonly workspace_relative_path: string;
    readonly role: ArtifactRole;
    readonly media_type: string;
    readonly canonical: boolean;
    readonly privacy_classification: PrivacyClassification;
}
export interface EvidenceObjectPutResult {
    readonly status: 'created' | 'already_exists';
    readonly artifact_ref: ArtifactRefV2;
}
export declare class EvidenceObjectStore {
    private readonly store;
    constructor(store: WorkspaceStore);
    put(input: ContainedArtifactInput): Promise<EvidenceObjectPutResult>;
    verify(ref: ArtifactRefV2): Promise<void>;
}
