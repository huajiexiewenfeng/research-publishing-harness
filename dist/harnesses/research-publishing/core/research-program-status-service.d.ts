import type { MonthlyEditorialReviewService } from './monthly-editorial-review-service.js';
import type { ResearchBacklogPort, ResearchProgramStatusV1, ResearchRoadmapPort } from './research-program-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export declare class ResearchProgramStatusService {
    private readonly store;
    private readonly roadmaps;
    private readonly backlog;
    private readonly reviews;
    constructor(store: WorkspaceStore, roadmaps: ResearchRoadmapPort, backlog: ResearchBacklogPort, reviews: MonthlyEditorialReviewService);
    status(roadmapId: string): Promise<ResearchProgramStatusV1>;
    private loadCatalog;
    private workspaceCycleState;
    private nextAction;
    private roadmapRef;
}
