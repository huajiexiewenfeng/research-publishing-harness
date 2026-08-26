import { isDeepStrictEqual } from 'node:util';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
function confirmationBody(confirmation) {
    return Object.fromEntries(Object.entries(confirmation).filter(([key]) => key !== 'confirmation_digest'));
}
export function createXArticlePublishConfirmation(input) {
    if (input.confirmed_by.trim().length === 0) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article Publish confirmation requires a human identity');
    }
    const body = {
        schema_version: 'x-article-publish-confirmation/v1',
        confirmation_id: input.confirmation_id,
        execution_id: input.execution_id,
        draft_id: input.draft_id,
        target_account: input.target_account,
        audience: input.audience,
        scope: 'publish_article_once',
        plan_digest: input.plan_digest,
        document_digest: input.document_digest,
        preview_revision: input.preview_revision,
        asset_digests: Object.freeze([...input.asset_digests]),
        confirmed_by: input.confirmed_by,
        confirmed_at: input.confirmed_at
    };
    const confirmation = validateContract('x-article-publish-confirmation', { ...body, confirmation_digest: sha256(body) });
    return Object.freeze(confirmation);
}
export function verifyXArticlePublishConfirmation(confirmation, binding) {
    validateContract('x-article-publish-confirmation', confirmation);
    if (confirmation.confirmation_digest !== sha256(confirmationBody(confirmation))) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article Publish confirmation digest does not match its canonical body');
    }
    if (confirmation.confirmed_by.trim().length === 0) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article Publish confirmation requires a human identity');
    }
    const bound = {
        execution_id: confirmation.execution_id,
        draft_id: confirmation.draft_id,
        target_account: confirmation.target_account,
        audience: confirmation.audience,
        plan_digest: confirmation.plan_digest,
        document_digest: confirmation.document_digest,
        preview_revision: confirmation.preview_revision,
        asset_digests: confirmation.asset_digests
    };
    const expected = {
        execution_id: binding.execution_id,
        draft_id: binding.draft_id,
        target_account: binding.target_account,
        audience: binding.audience,
        plan_digest: binding.plan_digest,
        document_digest: binding.document_digest,
        preview_revision: binding.preview_revision,
        asset_digests: binding.asset_digests
    };
    const confirmedAt = Date.parse(confirmation.confirmed_at);
    const notBefore = Date.parse(binding.confirmed_at_not_before);
    const notAfter = Date.parse(binding.confirmed_at_not_after);
    if (!isDeepStrictEqual(bound, expected)
        || !Number.isFinite(confirmedAt)
        || !Number.isFinite(notBefore)
        || !Number.isFinite(notAfter)
        || notBefore > notAfter
        || confirmedAt < notBefore
        || confirmedAt > notAfter) {
        throw new HarnessError('PUBLISH_GATE_BLOCKED', 'X Article Publish confirmation is stale or belongs to a different publication');
    }
    return confirmation;
}
//# sourceMappingURL=x-article-publish-confirmation.js.map