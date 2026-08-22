import type { WorkspaceStore } from '../../core/workspace-store.js';
import { type XArticlePublicationPlanV1 } from '../../core/x-article-publication-plan.js';
import type { ArticlePackageRef } from '../article-harness/article-service.js';
interface XArticleServiceOptions {
    readonly runId?: () => string;
    readonly planId?: () => string;
    readonly now?: () => Date;
}
export declare class XArticleService {
    private readonly store;
    private readonly runId;
    private readonly planId;
    private readonly now;
    constructor(store: WorkspaceStore, options?: XArticleServiceOptions);
    plan(packageRef: ArticlePackageRef, targetAccount: string): Promise<XArticlePublicationPlanV1>;
    private requireAsset;
    private verifyPackageDigest;
}
export {};
