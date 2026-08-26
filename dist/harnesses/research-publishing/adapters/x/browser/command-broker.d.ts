import type { ExecutionStore } from '../../../core/execution-store.js';
import type { WorkspaceStore } from '../../../core/workspace-store.js';
import { type BrowserActionResult, type BrowserActionResultInput, type BrowserCommand, type BrowserCommandClaim, type IssueBrowserCommandInput } from './browser-protocol.js';
export interface CommandBrokerApi {
    issue(input: IssueBrowserCommandInput): Promise<BrowserCommand>;
    read(executionId: string, commandId: string): Promise<BrowserCommand>;
    claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
    acceptResult(executionId: string, result: BrowserActionResultInput): Promise<BrowserActionResult>;
}
export declare class CommandBroker implements CommandBrokerApi {
    private readonly store;
    private readonly executions;
    private readonly now;
    private readonly commandId;
    constructor(store: WorkspaceStore, executions: ExecutionStore, now?: () => Date, commandId?: () => string);
    issue(input: IssueBrowserCommandInput): Promise<BrowserCommand>;
    read(executionId: string, commandId: string): Promise<BrowserCommand>;
    claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
    acceptResult(executionId: string, resultInput: BrowserActionResultInput): Promise<BrowserActionResult>;
    private prefix;
    private commandPath;
    private claimPath;
    private resultPath;
    private observationPath;
    private contextPath;
    private submitMarkerPath;
    private assertSafeId;
    private assertVisualCommandAuthorized;
    private isAllowedXUrl;
    private assertObservationScope;
}
