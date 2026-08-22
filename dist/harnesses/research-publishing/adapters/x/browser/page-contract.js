import { HarnessError } from '../../../core/errors.js';
export function requireUniqueNode(nodes, predicate, purpose) {
    const matches = nodes.filter(predicate);
    if (matches.length !== 1) {
        throw new HarnessError('PAGE_CONTRACT_UNSUPPORTED', `expected one ${purpose} node, observed ${matches.length}`);
    }
    return matches[0];
}
//# sourceMappingURL=page-contract.js.map