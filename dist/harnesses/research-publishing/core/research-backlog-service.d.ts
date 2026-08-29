import type { AddResearchTopicInput, CompleteResearchTopicInput, ReleaseResearchTopicInput, ResearchBacklogCatalogV1, ResearchBacklogPort, ResearchRoadmapPort, ResearchTopicRevisionV1, ReserveResearchTopicInput, ReviseResearchTopicInput } from './research-program-types.js';
import type { WorkspaceStore } from './workspace-store.js';
export declare class ResearchBacklogService implements ResearchBacklogPort {
    private readonly store;
    private readonly roadmaps;
    constructor(store: WorkspaceStore, roadmaps: ResearchRoadmapPort);
    add(input: AddResearchTopicInput): Promise<ResearchTopicRevisionV1>;
    revise(input: ReviseResearchTopicInput): Promise<ResearchTopicRevisionV1>;
    reserve(input: ReserveResearchTopicInput): Promise<ResearchTopicRevisionV1>;
    release(input: ReleaseResearchTopicInput): Promise<ResearchTopicRevisionV1>;
    complete(input: CompleteResearchTopicInput): Promise<ResearchTopicRevisionV1>;
    catalog(roadmapId: string): Promise<ResearchBacklogCatalogV1>;
    rebuildCatalog(roadmapId: string): Promise<ResearchBacklogCatalogV1>;
    assertCadenceReady(roadmapId: string): Promise<void>;
    private transition;
    private install;
    private latest;
    private latestTopics;
    private readRevision;
    private assertAgainstRoadmap;
    private roadmapRef;
}
