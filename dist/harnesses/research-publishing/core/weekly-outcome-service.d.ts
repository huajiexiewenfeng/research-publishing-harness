import type { ResearchBacklogService } from './research-backlog-service.js';
import type { ResearchRoadmapService } from './research-roadmap-service.js';
import type { WeeklyResearchCycleService } from './weekly-research-cycle-service.js';
import type { AssembleWeeklyOutcomeInput, ResumeWeeklyOutcomeInput, WeeklyOutcomeStatusV1, WeeklyPublicationOutcomeV1 } from './weekly-outcome-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export declare class WeeklyOutcomeService {
    private readonly store;
    private readonly roadmaps;
    private readonly backlog;
    private readonly weeks;
    private readonly now;
    private readonly evidence;
    constructor(store: WorkspaceStore, roadmaps: ResearchRoadmapService, backlog: ResearchBacklogService, weeks: WeeklyResearchCycleService, options?: {
        readonly now?: () => Date;
    });
    assemble(input: AssembleWeeklyOutcomeInput): Promise<WeeklyPublicationOutcomeV1>;
    resume(input: ResumeWeeklyOutcomeInput): Promise<WeeklyOutcomeStatusV1>;
    status(cycleId: string): Promise<WeeklyOutcomeStatusV1>;
    private resumeUnlocked;
    private readSources;
    private readChildObservation;
    private currentSelectedTopic;
    private findExactRelease;
    private assertClosureLineage;
    private readOutcome;
    private readClosure;
    private readSemantic;
    private readContract;
    private readJson;
    private fileRef;
    private assertOnlyCycleId;
    private cycleRoot;
    private cycleId;
    private roadmapId;
    private topicId;
    private topicRef;
}
