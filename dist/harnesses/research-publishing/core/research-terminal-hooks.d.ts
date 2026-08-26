import type { ArtifactRole, PrivacyClassification, ResearchEvidenceSnapshotV1 } from './research-memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export type ResearchTerminalEventKind = 'package_finalized' | 'article_finalized' | 'publication_plan_approved' | 'publication_receipt_terminal' | 'feedback_selected' | 'candidate_insight_created';
export interface ResearchTerminalEventArtifact {
    readonly workspace_relative_path: string;
    readonly digest: `sha256:${string}`;
    readonly role: ArtifactRole;
    readonly media_type: string;
    readonly canonical: boolean;
    readonly privacy_classification: PrivacyClassification;
}
export interface ResearchTerminalEvent {
    readonly event_id: string;
    readonly kind: ResearchTerminalEventKind;
    readonly publication_kind: 'x_post' | 'x_article' | null;
    readonly increment_id: string;
    readonly increment_revision: number;
    readonly workspace_identity_digest: `sha256:${string}`;
    readonly source_digest: `sha256:${string}`;
    readonly artifacts: readonly ResearchTerminalEventArtifact[];
    readonly source_refs: readonly string[];
    readonly privacy_classification: PrivacyClassification;
    readonly occurred_at: string;
}
export interface ResearchTerminalHookReceiptV1 {
    readonly schema_version: 'research-terminal-hook-receipt/v1';
    readonly event_id: string;
    readonly event_kind: ResearchTerminalEventKind;
    readonly event_digest: `sha256:${string}`;
    readonly source_digest: `sha256:${string}`;
    readonly status: 'complete' | 'evidence_capture_pending';
    readonly evidence_snapshot_ref: string | null;
    readonly evidence_snapshot_digest: `sha256:${string}` | null;
    readonly error_code: string | null;
    readonly recorded_at: string;
    readonly receipt_digest: `sha256:${string}`;
}
export interface ResearchTerminalHooksOptions {
    readonly now?: () => Date;
    readonly capture?: (event: ResearchTerminalEvent, evidenceSnapshotId: string) => Promise<ResearchEvidenceSnapshotV1>;
}
export interface ResearchTerminalArtifactNotification {
    readonly notification_id: string;
    readonly kind: ResearchTerminalEventKind;
    readonly publication_kind: 'x_post' | 'x_article' | null;
    readonly workspace_relative_path: string;
    readonly role: ArtifactRole;
    readonly media_type: string;
    readonly canonical: boolean;
    readonly privacy_classification: PrivacyClassification;
    readonly occurred_at: string;
}
export interface ResearchTerminalNotifier {
    notify(input: ResearchTerminalArtifactNotification): Promise<ResearchTerminalHookReceiptV1>;
}
export interface BoundResearchTerminalContext {
    readonly increment_id: string;
    readonly increment_revision: number;
    readonly workspace_identity_digest: `sha256:${string}`;
    readonly source_refs: readonly string[];
    readonly privacy_classification: PrivacyClassification;
}
export declare function notifyTerminalSafely(store: WorkspaceStore, notifier: ResearchTerminalNotifier | null, input: ResearchTerminalArtifactNotification): Promise<void>;
export declare class ResearchTerminalHooks {
    private readonly store;
    private readonly now;
    private readonly capture;
    constructor(store: WorkspaceStore, options?: ResearchTerminalHooksOptions);
    static captureDefault(store: WorkspaceStore, event: ResearchTerminalEvent, evidenceSnapshotId: string, now?: () => Date): Promise<ResearchEvidenceSnapshotV1>;
    record(event: ResearchTerminalEvent): Promise<ResearchTerminalHookReceiptV1>;
    resume(eventId: string): Promise<ResearchTerminalHookReceiptV1>;
    status(eventId: string): Promise<ResearchTerminalHookReceiptV1>;
    bind(context: BoundResearchTerminalContext): ResearchTerminalNotifier;
    private captureAndRecord;
    private receipt;
    private readReceipt;
    private validateEvent;
    private root;
}
