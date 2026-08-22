import type { ApprovalV2 } from '../../../core/approval-v2.js';
import type { ApprovalV2_1 } from '../../../core/approval-v2-1.js';
import type { BrowserExecutionSnapshot } from '../../../core/browser-execution.js';
import type { ExecutionStore } from '../../../core/execution-store.js';
import type { PublicationPlanV2 } from '../../../core/publication-plan-v2.js';
import type { PublicationPlanV2_1 } from '../../../core/publication-plan-v2-1.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import type { BrowserActionResultInput, BrowserCapabilityManifest, BrowserCommand, BrowserCommandClaim } from './browser-protocol.js';
import type { CommandBroker } from './command-broker.js';
import type { XPageContract } from './page-contract.js';
import { DeterministicOutcomeResolver } from './outcome-resolver.js';
export interface BrowserAdapterApi {
    start(input: StartBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
    next(executionId: string): Promise<BrowserCommand | null>;
    claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
    report(executionId: string, result: BrowserActionResultInput): Promise<BrowserExecutionSnapshot>;
    status(executionId: string): Promise<BrowserExecutionStatus>;
    resumeVerification(executionId: string): Promise<BrowserExecutionSnapshot>;
    cancelBeforeSubmit(executionId: string): Promise<BrowserExecutionSnapshot>;
}
export interface StartBrowserExecutionInput {
    readonly execution_id: string;
    readonly plan: BrowserPublicationPlan;
    readonly approval: ApprovalV2 | ApprovalV2_1;
    readonly capability_manifest: BrowserCapabilityManifest;
}
type BrowserPublicationPlan = PublicationPlanV2 | PublicationPlanV2_1;
export interface BrowserExecutionStatus {
    readonly snapshot: BrowserExecutionSnapshot;
    readonly pending_command: BrowserCommand | null;
    readonly latest_receipt_path: string | null;
    readonly resumable_verification: boolean;
}
export declare class BrowserAdapter implements BrowserAdapterApi {
    private readonly store;
    private readonly executions;
    private readonly broker;
    private readonly contract;
    private readonly now;
    private readonly attemptId;
    private readonly receiptId;
    private readonly outcomeResolver;
    constructor(store: WorkspaceStore, executions: ExecutionStore, broker: CommandBroker, contract: XPageContract, now?: () => Date, attemptId?: () => string, receiptId?: () => string, outcomeResolver?: DeterministicOutcomeResolver);
    start(input: StartBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
    next(executionId: string): Promise<BrowserCommand | null>;
    claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
    report(executionId: string, resultInput: BrowserActionResultInput): Promise<BrowserExecutionSnapshot>;
    status(executionId: string): Promise<BrowserExecutionStatus>;
    resumeVerification(executionId: string): Promise<BrowserExecutionSnapshot>;
    cancelBeforeSubmit(executionId: string): Promise<BrowserExecutionSnapshot>;
    private crossSubmitBarrier;
    private issueObservation;
    private issueAndPersist;
    private readSubmitResult;
    private finalizeOutcome;
    private persistOutcomeReceipt;
    private failPreSubmit;
    private inflateComposer;
    private storeComposer;
    private readObservation;
    private readContext;
    private writeContext;
    private prefix;
    private assertCapabilityManifest;
    private isTerminal;
}
export {};
