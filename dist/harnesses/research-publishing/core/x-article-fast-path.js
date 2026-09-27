import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import { assertXArticlePublicationPlan } from './x-article-publication-plan.js';
import { assertXArticlePublicationPreflight } from '../branches/x-article-harness/article-publication-preflight.js';
function auditDigestBody(audit) {
    const { audit_digest: _auditDigest, ...body } = audit;
    void _auditDigest;
    return body;
}
function confirmationDigestBody(confirmation) {
    const { confirmation_digest: _confirmationDigest, ...body } = confirmation;
    void _confirmationDigest;
    return body;
}
export function assertXArticleFastPathAudit(audit) {
    validateContract('x-article-fast-path-audit', audit);
    assertXArticlePublicationPreflight(audit.preflight);
    assertXArticlePublicationPlan(audit.publication_plan);
    const plan = audit.publication_plan;
    const planCover = plan.intent.visuals.find((binding) => binding.placement.kind === 'cover');
    const planInline = plan.intent.visuals.flatMap((binding) => binding.placement.kind === 'block'
        ? [{
                asset_id: binding.asset.asset_id,
                block_ordinal: binding.placement.block_ordinal,
                asset_digest: binding.asset.digest,
                alt_text: binding.asset.alt_text
            }]
        : []);
    const valid = audit.protocol === 'x-article-materialization/v3.4'
        && (audit.time_budget_seconds === 600 || audit.time_budget_seconds === 900)
        && audit.recovery_budget_seconds === 120
        && audit.target_account === plan.intent.target_account
        && audit.preflight.sanitized_document_digest === sha256(plan.intent.document)
        && planCover?.asset.asset_id === audit.preflight.cover.asset_id
        && planCover.asset.digest === audit.preflight.cover.asset_digest
        && planCover.asset.alt_text === audit.preflight.cover.alt_text
        && sha256(planInline) === sha256(audit.preflight.inline_assets)
        && audit.audit_digest === sha256(auditDigestBody(audit));
    if (!valid) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article Fast Path Audit is internally inconsistent');
    }
}
export function createXArticleFastPathAudit(input) {
    const body = {
        schema_version: 'x-article-fast-path-audit/v1',
        protocol: 'x-article-materialization/v3.4',
        target_account: input.publication_plan.intent.target_account,
        draft_target: structuredClone(input.draft_target),
        preflight: structuredClone(input.preflight),
        publication_plan: structuredClone(input.publication_plan),
        time_budget_seconds: 900,
        recovery_budget_seconds: 120
    };
    const audit = validateContract('x-article-fast-path-audit', {
        ...body,
        audit_digest: sha256(body)
    });
    assertXArticleFastPathAudit(audit);
    return audit;
}
export function confirmXArticleFastPath(audit, confirmedBy, ttlMs, now = new Date()) {
    assertXArticleFastPathAudit(audit);
    if (confirmedBy.trim().length === 0
        || !Number.isFinite(ttlMs)
        || ttlMs <= 0
        || !Number.isFinite(now.getTime())) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article Fast Path confirmation requires a confirmer, valid time, and positive TTL');
    }
    const body = {
        schema_version: 'x-article-fast-path-confirmation/v1',
        scope: 'materialize_draft_once',
        audit_digest: audit.audit_digest,
        target_account: audit.target_account,
        confirmed_by: confirmedBy,
        confirmed_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttlMs).toISOString()
    };
    return validateContract('x-article-fast-path-confirmation', {
        ...body,
        confirmation_digest: sha256(body)
    });
}
export function verifyXArticleFastPathConfirmation(audit, confirmation, now = new Date()) {
    assertXArticleFastPathAudit(audit);
    validateContract('x-article-fast-path-confirmation', confirmation);
    const confirmedAt = Date.parse(confirmation.confirmed_at);
    const expiresAt = Date.parse(confirmation.expires_at);
    const valid = confirmation.scope === 'materialize_draft_once'
        && confirmation.audit_digest === audit.audit_digest
        && confirmation.target_account === audit.target_account
        && confirmation.confirmation_digest === sha256(confirmationDigestBody(confirmation))
        && Number.isFinite(now.getTime())
        && confirmedAt <= now.getTime()
        && expiresAt > now.getTime()
        && expiresAt > confirmedAt;
    if (!valid) {
        throw new HarnessError('APPROVAL_STALE', 'X Article Fast Path confirmation is expired or does not match this Audit');
    }
}
//# sourceMappingURL=x-article-fast-path.js.map