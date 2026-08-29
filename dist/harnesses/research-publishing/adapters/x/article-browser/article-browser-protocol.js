import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
export function computeXArticlePageRevision(input) {
    return sha256(input);
}
export function computeXArticleElapsedSeconds(startedAt, endedAt) {
    const start = Date.parse(startedAt);
    const end = Date.parse(endedAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article browser timing evidence is invalid or reversed');
    }
    return (end - start) / 1000;
}
//# sourceMappingURL=article-browser-protocol.js.map