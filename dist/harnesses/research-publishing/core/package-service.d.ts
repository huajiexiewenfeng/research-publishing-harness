import type { Candidate, ResearchContentPackage, ReviewReport } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';
type CandidateQualification = Readonly<Pick<Candidate, 'novelty_hint'>>;
export declare class PackageService {
    private readonly store;
    private readonly now;
    constructor(store: WorkspaceStore, now?: () => Date);
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
