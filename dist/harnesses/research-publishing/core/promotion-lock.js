import { HarnessError } from './errors.js';
import { STABLE_ID_PATTERN } from './research-memory-contracts.js';
export async function withPromotionLock(store, trackId, operation) {
    if (!STABLE_ID_PATTERN.test(trackId)) {
        throw new HarnessError('CONTRACT_INVALID', 'Promotion Track id must be stable');
    }
    return store.withLock(`memory/promotions/locks/${trackId}.lock`, operation);
}
//# sourceMappingURL=promotion-lock.js.map