import type { CompileWeeklyPackageInput, ResearchContentPackageV1_2, WeeklyPackageCompilerPort } from './types.js';
import type { WorkspaceStore } from './workspace-store.js';
export declare class WeeklyPackageCompiler implements WeeklyPackageCompilerPort {
    private readonly store;
    constructor(store: WorkspaceStore);
    compile(input: CompileWeeklyPackageInput): Promise<ResearchContentPackageV1_2>;
    private readCycle;
    private readCandidateSet;
    private readSelection;
    private readReview;
    private projectStatusIfPresent;
    private readContract;
}
