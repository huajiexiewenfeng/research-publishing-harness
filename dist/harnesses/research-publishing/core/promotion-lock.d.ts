import type { WorkspaceStore } from './workspace-store.js';
export declare function withPromotionLock<T>(store: WorkspaceStore, trackId: string, operation: () => Promise<T>): Promise<T>;
