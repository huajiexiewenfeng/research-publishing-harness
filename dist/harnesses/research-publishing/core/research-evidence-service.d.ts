import { type ContainedArtifactInput } from './evidence-object-store.js';
import type { PrivacyClassification, ResearchEvidenceCaptureEvent, ResearchEvidenceSnapshotV1 } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface CaptureResearchEvidenceInput {
    readonly increment_id: string;
    readonly increment_revision: number;
    readonly capture_event: ResearchEvidenceCaptureEvent;
    readonly capture_kind: 'automatic_terminal' | 'explicit_working_checkpoint' | 'explicit_import';
    readonly workspace_identity_digest: `sha256:${string}`;
    readonly artifacts: readonly ContainedArtifactInput[];
    readonly source_refs: readonly string[];
    readonly privacy_classification: PrivacyClassification;
}
export interface ResearchEvidenceCaptureStatusV1 {
    readonly evidence_snapshot_id: string;
    readonly state: 'complete';
    readonly snapshot_digest: `sha256:${string}`;
    readonly artifact_count: number;
}
export declare class ResearchEvidenceService {
    private readonly store;
    private readonly ids;
    private readonly objects;
    constructor(store: WorkspaceStore, ids?: Readonly<{
        evidenceSnapshotId?: () => string;
        now?: () => Date;
    }>);
    capture(input: CaptureResearchEvidenceInput): Promise<ResearchEvidenceSnapshotV1>;
    status(evidenceSnapshotId: string): Promise<ResearchEvidenceCaptureStatusV1>;
}
