import { type GenerationTask } from '../../core/generation.js';
import { type PublicationPlanV2 } from '../../core/publication-plan-v2.js';
import { type PublicationPlanV2_1 } from '../../core/publication-plan-v2-1.js';
import type { XHandoff } from '../article-harness/article-service.js';
import type { ResearchContentPackage, ReviewReport } from '../../core/types.js';
import type { WorkspaceStore } from '../../core/workspace-store.js';
export interface XBrief {
    readonly contentType: 'anchor' | 'research_note' | 'reply';
    readonly format: 'single' | 'thread' | 'reply';
    readonly language: 'en' | 'zh-CN';
    readonly targetAccount: string;
}
export interface XDraft {
    readonly schema_version: '1.0';
    readonly run_id: string;
    readonly content_type: 'anchor' | 'research_note' | 'reply';
    readonly format: 'single' | 'thread' | 'reply';
    readonly language: 'en' | 'zh-CN';
    readonly items: ReadonlyArray<{
        readonly ordinal: number;
        readonly text: string;
        readonly claim_refs: readonly string[];
        readonly reply_to?: 'previous' | 'target';
    }>;
    readonly target_post?: {
        readonly id: string;
        readonly url: string;
        readonly author: string;
        readonly snapshot_digest: string;
    };
}
export interface XRun {
    readonly run_id: string;
    readonly package_id: string;
    readonly package_version: number;
    readonly generation_task: GenerationTask;
    readonly draft?: XDraft;
}
export interface PublicationPlan {
    readonly schema_version: '1.0';
    readonly run_id: string;
    readonly target_account: string;
    readonly adapter: 'manual';
    readonly target_post_id: string | null;
    readonly target_post: NonNullable<XDraft['target_post']> | null;
    readonly items: ReadonlyArray<{
        readonly ordinal: number;
        readonly text: string;
        readonly digest: string;
        readonly reply_to?: 'previous' | 'target';
    }>;
    readonly publication_digest: string;
    readonly planned_at: string;
    readonly article_handoff?: string;
}
interface XServiceOptions {
    readonly runId?: () => string;
    readonly planId?: () => string;
    readonly now?: () => Date;
}
export declare class XService {
    private readonly store;
    private readonly runId;
    private readonly planId;
    private readonly now;
    constructor(store: WorkspaceStore, options?: XServiceOptions);
    prepareX(packageValue: ResearchContentPackage, brief: XBrief): Promise<XRun>;
    acceptXDraft(runId: string, candidate: XDraft): Promise<XRun>;
    reviewX(runId: string): Promise<ReviewReport>;
    planX(runId: string): Promise<PublicationPlan>;
    planXBrowser(runId: string): Promise<PublicationPlanV2>;
    planXBrowser(runId: string, handoff: XHandoff): Promise<PublicationPlanV2 | PublicationPlanV2_1>;
    private runPrefix;
}
export {};
