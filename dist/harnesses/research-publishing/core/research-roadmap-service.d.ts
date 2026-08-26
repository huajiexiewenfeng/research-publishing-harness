import type { CreateResearchRoadmapInput, ResearchRoadmapPort, ResearchRoadmapV1, ReviseResearchRoadmapInput } from './research-program-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export declare class ResearchRoadmapService implements ResearchRoadmapPort {
    private readonly store;
    constructor(store: WorkspaceStore);
    create(input: CreateResearchRoadmapInput): Promise<ResearchRoadmapV1>;
    revise(input: ReviseResearchRoadmapInput): Promise<ResearchRoadmapV1>;
    current(roadmapId: string): Promise<ResearchRoadmapV1>;
}
