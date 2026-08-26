import type { CreateMonthlyEditorialReviewInput, MonthlyEditorialReviewV1, ResearchArtifactRefV1 } from './research-program-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export declare class MonthlyEditorialReviewService {
    private readonly store;
    constructor(store: WorkspaceStore);
    create(input: CreateMonthlyEditorialReviewInput): Promise<MonthlyEditorialReviewV1>;
    status(monthId: string): Promise<MonthlyEditorialReviewV1 | null>;
    latest(roadmapRef?: ResearchArtifactRefV1): Promise<MonthlyEditorialReviewV1 | null>;
    private verifyRoadmapRef;
    private readReview;
}
