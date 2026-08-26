import type { WeeklyResearchBridgeStatusV1 } from './research-bridge-types.js';
import type { WorkspaceStore } from './workspace-store.js';
interface AssembleBridgeInput {
    readonly cycle_id: string;
    readonly workspace_identity_digest: `sha256:${string}`;
}
export declare class WeeklyResearchBridgeService {
    private readonly store;
    private readonly now;
    constructor(store: WorkspaceStore, options?: {
        readonly now?: () => Date;
    });
    assemble(input: AssembleBridgeInput): Promise<WeeklyResearchBridgeStatusV1>;
    resume(input: {
        readonly cycle_id: string;
    }): Promise<WeeklyResearchBridgeStatusV1>;
    status(cycleId: string): Promise<WeeklyResearchBridgeStatusV1>;
    private resumeUnlocked;
    private readSources;
    private ensureClaimProjection;
    private ensureInitialEvidence;
    private ensureIncrement;
    private ensureBinding;
    private ensureExpression;
    private ensureTerminalEvidence;
    private ensureEvidence;
    private deriveStatus;
    private writeBlockedStatus;
    private optionalValidatedRef;
    private optionalExpressionRef;
    private optionalEvidenceRef;
    private readBridgeStatus;
    private statusFacts;
    private articleContent;
    private singleContent;
    private visualRefs;
    private artifact;
    private readSemanticRef;
    private assertSemanticRef;
    private readFileRef;
    private readContract;
    private readJson;
    private parse;
    private fileRef;
    private fileRefIfExists;
    private evidenceRefIfExists;
    private assertAssembleInput;
    private assertResumeInput;
    private weekRoot;
    private bridgeRoot;
    private bundleId;
}
export {};
