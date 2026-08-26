export function renderPublicationBundleAudit(plan) {
    const visual = plan.single_intent.visual_asset;
    return {
        target_account: plan.article_plan.intent.target_account,
        article_title: plan.article_plan.intent.document.title,
        article_plan_digest: plan.article_plan.plan_digest,
        article_package_digest: plan.canonical_article_package.package_digest,
        single_template: plan.single_intent.text_template,
        final_single_bytes_known: false,
        substitution_rule: 'verified-x-article-canonical-url/v1',
        visual: visual === null ? null : {
            asset_id: visual.asset_id,
            digest: visual.digest,
            alt_text: visual.alt_text
        },
        claim_refs: plan.single_intent.claim_refs,
        execution_order: ['x_article', 'x_single'],
        authorization_ttl_ms: plan.authorization_ttl_ms,
        bundle_digest: plan.bundle_digest
    };
}
//# sourceMappingURL=publication-bundle-audit.js.map