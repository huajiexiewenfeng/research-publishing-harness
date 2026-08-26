import { type ResearchTerminalNotifier } from './research-terminal-hooks.js';
import type { Candidate, ResearchContentPackage, ReviewReport } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';
type CandidateQualification = Readonly<Pick<Candidate, 'novelty_hint'>>;
export declare class PackageService {
    private readonly store;
    private readonly now;
    private readonly terminalNotifier;
    constructor(store: WorkspaceStore, now?: () => Date, terminalNotifier?: ResearchTerminalNotifier | null);
    captureCandidate(candidate: Candidate): Promise<Candidate>;
    qualifyCandidate(candidateId: string, qualification: Partial<CandidateQualification>): Promise<Candidate>;
    buildPackage(candidate: Candidate, packageValue: ResearchContentPackage): Promise<ResearchContentPackage>;
    reviewPackage(packageValue: ResearchContentPackage): Promise<{
        package: ResearchContentPackage;
        report: ReviewReport;
    }>;
    freezePackage(packageValue: ResearchContentPackage): Promise<{
        package: ResearchContentPackage;
        digest: string;
    }>;
    private packagePath;
    private reviewPath;
    private digestPath;
}
export {};
