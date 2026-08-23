import { HarnessError } from './errors.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
import type { WorkspaceStore } from './workspace-store.js';

export async function withPromotionLock<T>(
  store: WorkspaceStore,
  trackId: string,
  operation: () => Promise<T>
): Promise<T> {
  if (!STABLE_ID_PATTERN.test(trackId)) {
    throw new HarnessError('CONTRACT_INVALID', 'Promotion Track id must be stable');
  }
  return store.withLock(`memory/promotions/locks/${trackId}.lock`, operation);
}
