import { type ResearchTerminalNotifier } from '../../../core/research-terminal-hooks.js';
import { type XArticleExecutionSnapshotV1 } from '../../../core/x-article-execution.js';
import { type XArticleApprovalV1 } from '../../../core/x-article-approval.js';
import { type XArticlePublicationPlanV1 } from '../../../core/x-article-publication-plan.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import type { XArticleBrowserObservation } from './article-browser-protocol.js';
import { type XArticleBrowserCommandKind, type XArticleBrowserCommandV1, type XArticleCommandClaimV1 } from './article-command-broker.js';
import type { XArticlePageContract } from './article-page-contract.js';
export interface XArticleBrowserCapabilityManifestV1 {
    readonly executor: 'codex-chrome';
    readonly executor_version: string;
    readonly browser_family: 'chrome';
    readonly capabilities: readonly XArticleBrowserCommandKind[];
    readonly observed_at: string;
}
export interface XArticleBrowserReportInput {
    readonly command: XArticleBrowserCommandV1;
    readonly status: 'success' | 'transient_failure' | 'uncertain' | 'rejected';
    readonly observation: XArticleBrowserObservation | null;
}
interface XArticleBrowserAdapterOptions {
    readonly executionId?: () => string;
    readonly eventId?: () => string;
    readonly commandId?: () => string;
    readonly attemptId?: () => string;
    readonly receiptId?: () => string;
    readonly now?: () => Date;
    readonly terminalNotifier?: ResearchTerminalNotifier;
}
export declare class XArticleBrowserAdapter {
    private readonly store;
    private readonly contract;
    private readonly executionId;
    private readonly eventId;
    private readonly attemptId;
    private readonly receiptId;
    private readonly now;
    private readonly terminalNotifier;
    private readonly broker;
    constructor(store: WorkspaceStore, contract: XArticlePageContract, options?: XArticleBrowserAdapterOptions);
    start(plan: XArticlePublicationPlanV1, approval: XArticleApprovalV1, capabilities: XArticleBrowserCapabilityManifestV1): Promise<XArticleExecutionSnapshotV1>;
    next(executionId: string): Promise<{
        readonly snapshot: XArticleExecutionSnapshotV1;
        readonly command: XArticleBrowserCommandV1 | null;
    }>;
    claim(command: XArticleBrowserCommandV1): Promise<XArticleCommandClaimV1>;
    report(input: XArticleBrowserReportInput): Promise<XArticleExecutionSnapshotV1>;
    status(executionId: string): Promise<XArticleExecutionSnapshotV1>;
    resumeVerification(executionId: string): Promise<XArticleExecutionSnapshotV1>;
    cancelBeforePublish(executionId: string): Promise<XArticleExecutionSnapshotV1>;
    private nextPublicVerification;
    private nextEditorCommand;
    private issue;
    private clearPending;
    private transition;
    private verifyCapabilities;
    private requireObservation;
    private readContext;
    private writeContext;
    private prefix;
    private assertId;
}
export {};
