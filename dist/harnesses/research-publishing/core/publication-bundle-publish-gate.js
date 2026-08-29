import { HarnessError } from './errors.js';
import { assertPublicationBundleApproval } from './publication-bundle-contracts.js';
function failed(findings) {
    return { gate: 'publish', passed: false, findings };
}
export function runPublicationBundlePublishGate(plan, approval, now) {
    if (approval === undefined) {
        return failed([{
                code: 'APPROVAL_REQUIRED',
                severity: 'error',
                message: 'one exact Publication Bundle Approval is required'
            }]);
    }
    assertPublicationBundleApproval(plan, approval);
    const expiry = Date.parse(approval.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now.getTime()) {
        return failed([{
                code: 'APPROVAL_EXPIRED',
                severity: 'error',
                message: 'Publication Bundle Approval is expired'
            }]);
    }
    if (approval.target_account !== plan.single_intent.target_account) {
        throw new HarnessError('APPROVAL_STALE', 'Publication Bundle target account changed');
    }
    return { gate: 'publish', passed: true, findings: [] };
}
//# sourceMappingURL=publication-bundle-publish-gate.js.map