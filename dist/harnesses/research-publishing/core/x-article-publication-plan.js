import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
const ACCOUNT = /^@[A-Za-z0-9_]{1,15}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
function assertSafeRoot(root) {
    if (root.length === 0 || root.includes('\\') || root.startsWith('/') ||
        /^[A-Za-z]:/.test(root) || root.split('/').includes('..')) {
        throw new HarnessError('WORKSPACE_PATH_INVALID', 'Article Package root must be a safe workspace-relative path');
    }
}
export function assertXArticlePublicationPlan(plan) {
    validateContract('x-article-publication-plan', plan);
    validateContract('x-article-document', plan.intent.document);
    assertSafeRoot(plan.intent.article_package.root);
    if (!ACCOUNT.test(plan.intent.target_account) || !DIGEST.test(plan.intent.article_package.digest)) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article account or Package Digest is invalid');
    }
    const assetIds = new Set();
    for (const binding of plan.intent.visuals) {
        validateContract('visual-asset-ref', binding.asset);
        if (assetIds.has(binding.asset.asset_id)) {
            throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'X Article visual bindings contain a duplicate asset');
        }
        assetIds.add(binding.asset.asset_id);
    }
    const cover = plan.intent.visuals.filter((binding) => binding.placement.kind === 'cover');
    if ((plan.intent.document.cover_asset_id === null && cover.length !== 0) ||
        (plan.intent.document.cover_asset_id !== null &&
            (cover.length !== 1 || cover[0].asset.asset_id !== plan.intent.document.cover_asset_id))) {
        throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'X Article cover binding differs from its document');
    }
    const documentImages = plan.intent.document.blocks.flatMap((block, index) => block.kind === 'image' ? [{ asset_id: block.asset_id, block_ordinal: index + 1 }] : []);
    const inlineBindings = plan.intent.visuals.flatMap((binding) => binding.placement.kind === 'block'
        ? [{ asset_id: binding.asset.asset_id, block_ordinal: binding.placement.block_ordinal }]
        : []);
    if (sha256(documentImages) !== sha256(inlineBindings)) {
        throw new HarnessError('ARTICLE_ASSET_MISMATCH', 'X Article inline visual bindings differ from its document');
    }
    if (plan.plan_digest !== sha256(plan.intent)) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article Plan Digest does not match its Intent');
    }
}
export function createXArticlePublicationPlan(input) {
    assertSafeRoot(input.articlePackage.root);
    const intent = {
        schema_version: '1.0',
        platform: 'x',
        target_account: input.targetAccount,
        adapter: 'browser',
        audience: 'everyone',
        action: 'publish_once',
        article_package: input.articlePackage,
        document: input.document,
        visuals: input.visuals
    };
    const plan = {
        schema_version: '1.0',
        plan_id: input.planId,
        run_id: input.runId,
        intent,
        plan_digest: sha256(intent),
        planned_at: input.plannedAt,
        provenance: input.provenance
    };
    assertXArticlePublicationPlan(plan);
    return plan;
}
//# sourceMappingURL=x-article-publication-plan.js.map