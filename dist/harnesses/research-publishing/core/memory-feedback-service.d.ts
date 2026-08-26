import { type ResearchTerminalNotifier } from './research-terminal-hooks.js';
import type { Digest, PublicationFeedbackSnapshotV1 } from './memory-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface CaptureFeedbackInput {
    readonly receipt_path: string;
    readonly receipt_digest: Digest;
    readonly publication_kind: PublicationFeedbackSnapshotV1['publication_kind'];
    readonly public_url: string;
    readonly account: string;
    readonly observed_at: Date;
    readonly selection_actor: string;
    readonly selection_reason: string;
    readonly entries: ReadonlyArray<{
        readonly public_url: string;
        readonly platform_id: string;
        readonly author: string;
        readonly observed_text: string;
        readonly observed_metrics: Readonly<Record<string, number>>;
    }>;
}
export interface MemoryFeedbackServiceIds {
    readonly feedbackSnapshotId?: () => string;
}
export declare class MemoryFeedbackService {
    private readonly store;
    private readonly ids;
    private readonly terminalNotifier;
    constructor(store: WorkspaceStore, ids?: MemoryFeedbackServiceIds, terminalNotifier?: ResearchTerminalNotifier | null);
    private receipt;
    capture(input: CaptureFeedbackInput): Promise<PublicationFeedbackSnapshotV1>;
}
