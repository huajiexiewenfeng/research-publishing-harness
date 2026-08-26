import type { WorkspaceStore } from '../../core/workspace-store.js';
import type { ArticlePackageRef } from './article-service.js';
export declare function verifyFinalizedArticlePackage(store: WorkspaceStore, packageRef: ArticlePackageRef): Promise<void>;
