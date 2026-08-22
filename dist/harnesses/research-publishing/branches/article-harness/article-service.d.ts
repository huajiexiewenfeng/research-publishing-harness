import { type GenerationTask } from '../../core/generation.js';
import { type AttachVisualInput, type VisualCandidate } from '../../core/visual-assets.js';
import type { ResearchContentPackage, ReviewReport, VisualAssetRef, VisualReviewReport, VisualSlot } from '../../core/types.js';
import type { WorkspaceStore } from '../../core/workspace-store.js';
export interface ArticleBrief {
    readonly articleType: 'technical_essay' | 'architecture_note' | 'engineering_retrospective' | 'research_proposal';
    readonly primaryAudience: string;
    readonly language: 'en' | 'zh-CN';
    readonly targetDepth: 'focused' | 'deep';
    readonly includeOpenQuestions: boolean;
}
export interface ArticleDraft {
    readonly schema_version: '1.0';
    readonly run_id: string;
    readonly title: string;
    readonly summary: string;
    readonly language: 'en' | 'zh-CN';
    readonly sections: ReadonlyArray<{
        readonly section_id?: string;
        readonly heading: string;
        readonly markdown: string;
        readonly claim_refs: readonly string[];
        readonly source_refs: readonly string[];
    }>;
    readonly visual_slots?: readonly VisualSlot[];
    readonly open_questions: readonly string[];
}
export interface ArticleRun {
    readonly run_id: string;
    readonly package_id: string;
    readonly package_version: number;
    readonly generation_task: GenerationTask;
    readonly draft?: ArticleDraft;
}
export interface ArticlePackageRef {
    readonly root: string;
    readonly digest: string;
    readonly artifacts: readonly string[];
    readonly warnings: readonly string[];
}
export interface XHandoff {
    readonly schema_version: '1.0' | '1.1';
    readonly handoff_id: string;
    readonly article_run_id: string;
    readonly article_digest: string;
    readonly package_id: string;
    readonly package_version: number;
    readonly requested_at: string;
    readonly article_package_root?: string;
    readonly visual_asset?: VisualAssetRef;
}
export interface VisualReviewInput {
    readonly selectedCandidates: Readonly<Record<string, string>>;
    readonly reviewedBy: string;
    readonly claimAlignment: boolean;
    readonly boundaryAlignment: boolean;
    readonly mobileLegibility: boolean;
    readonly singleMessage: boolean;
    readonly privacyReview: boolean;
}
interface ArticleServiceOptions {
    readonly runId?: () => string;
    readonly now?: () => Date;
}
export declare class ArticleService {
    private readonly store;
    private readonly runId;
    private readonly now;
    constructor(store: WorkspaceStore, options?: ArticleServiceOptions);
    prepareArticle(packageValue: ResearchContentPackage, brief: ArticleBrief): Promise<ArticleRun>;
    acceptArticleDraft(runId: string, candidate: ArticleDraft): Promise<ArticleRun>;
    visualStatus(runId: string): Promise<{
        readonly slots: readonly VisualSlot[];
        readonly candidates: readonly VisualCandidate[];
        readonly required_unresolved: readonly string[];
        readonly warnings: readonly string[];
    }>;
    attachVisual(runId: string, input: Omit<AttachVisualInput, 'runId'>): Promise<VisualCandidate>;
    removeVisual(runId: string, candidateId: string): Promise<void>;
    reviewVisual(runId: string, input: VisualReviewInput): Promise<VisualReviewReport>;
    reviewArticle(runId: string): Promise<ReviewReport>;
    finalizeArticle(runId: string): Promise<ArticlePackageRef>;
    createXHandoff(runId: string, assetId?: string): Promise<XHandoff>;
    private runPrefix;
    private renderArticle;
    private renderVisual;
    private renderMetadata;
    private renderSources;
    private renderBoundaryNote;
    private readVisualCandidates;
    private readVisualReview;
    private assertArticleMutable;
}
export {};
