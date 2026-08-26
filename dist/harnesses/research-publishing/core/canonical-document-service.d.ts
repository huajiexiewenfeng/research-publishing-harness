import type { ArtifactRefV2, ArtifactRole, QueryableCanonicalDocumentV1 } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface ProjectCanonicalDocumentInput {
    readonly document_id: string;
    readonly document_role: ArtifactRole;
    readonly track_id: string;
    readonly increment_ref: string;
    readonly artifact_ref: ArtifactRefV2;
    readonly language: string;
}
export type CanonicalDocumentProjectionResult = Readonly<{
    status: 'projected';
    manifest: QueryableCanonicalDocumentV1;
    manifest_path: string;
}> | Readonly<{
    status: 'evidence_only';
    reason: 'non_text_media' | 'lossy_decode';
    artifact_ref: ArtifactRefV2;
}>;
export declare class CanonicalDocumentService {
    private readonly store;
    private readonly objects;
    constructor(store: WorkspaceStore);
    project(input: ProjectCanonicalDocumentInput): Promise<CanonicalDocumentProjectionResult>;
    reconstruct(manifest: QueryableCanonicalDocumentV1): Promise<string>;
}
