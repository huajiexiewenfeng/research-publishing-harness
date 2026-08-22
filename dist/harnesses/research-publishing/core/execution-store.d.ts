import { type BrowserExecutionSnapshot, type BrowserExecutionState, type CreateBrowserExecutionInput, type TransitionEvidence } from './browser-execution.js';
import type { WorkspaceStore } from './workspace-store.js';
export interface ExecutionStoreApi {
    create(input: CreateBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
    read(executionId: string): Promise<BrowserExecutionSnapshot>;
    transition(executionId: string, next: BrowserExecutionState, evidence?: TransitionEvidence): Promise<BrowserExecutionSnapshot>;
    rebuild(executionId: string): Promise<BrowserExecutionSnapshot>;
    withExecutionLock<T>(executionId: string, operation: () => Promise<T>): Promise<T>;
}
export declare class ExecutionStore implements ExecutionStoreApi {
    private readonly store;
    private readonly now;
    private readonly eventId;
    constructor(store: WorkspaceStore, now?: () => Date, eventId?: () => string);
    create(input: CreateBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
    read(executionId: string): Promise<BrowserExecutionSnapshot>;
    transition(executionId: string, next: BrowserExecutionState, evidence?: TransitionEvidence): Promise<BrowserExecutionSnapshot>;
    rebuild(executionId: string): Promise<BrowserExecutionSnapshot>;
    withExecutionLock<T>(executionId: string, operation: () => Promise<T>): Promise<T>;
    private initialSnapshot;
    private project;
    private ledgerSequence;
    private readLocator;
    private locatorPath;
    private prefix;
    private statePath;
    private eventsPath;
    private lockPath;
    private assertSafeId;
}
