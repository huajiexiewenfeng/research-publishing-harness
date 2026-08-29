import { randomUUID } from 'node:crypto';
import { sha256 } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
import { validateContract } from '../../core/schema-validator.js';
import { createXArticlePublicationPlan } from '../../core/x-article-publication-plan.js';
import { verifyFinalizedArticlePackage } from '../article-harness/article-package-verifier.js';
import { compileXArticleDocument } from './article-compiler.js';
export class XArticleService {
    store;
    runId;
    planId;
    now;
    constructor(store, options = {}) {
        this.store = store;
        this.runId = options.runId ?? (() => `x_article_${randomUUID()}`);
        this.planId = options.planId ?? (() => `x_article_plan_${randomUUID()}`);
        this.now = options.now ?? (() => new Date());
    }
    async plan(packageRef, targetAccount) {
        const storedRef = await this.store.readJson(`${packageRef.root}/package-ref.json`);
        if (sha256(storedRef) !== sha256(packageRef)) {
            throw new HarnessError('CONTRACT_INVALID', 'Article Package reference differs from its finalized artifact');
        }
        await verifyFinalizedArticlePackage(this.store, packageRef);
        const [markdown, manifest, draft] = await Promise.all([
            this.store.readText(`${packageRef.root}/article.md`),
            this.store.readJson(`${packageRef.root}/visual-manifest.json`),
            this.store.readJson(`${packageRef.root}/draft-candidate.json`)
        ]);
        validateContract('visual-manifest', manifest);
        validateContract('article-draft', draft);
        const slots = new Map((draft.visual_slots ?? []).map((slot) => [slot.slot_id, slot]));
        const compilerVisuals = manifest.bindings.map((binding) => {
            const slot = slots.get(binding.slot_id);
            if (slot === undefined) {
                throw new HarnessError('ARTICLE_ASSET_MISMATCH', `visual binding ${binding.slot_id} has no finalized slot`);
            }
            return { asset: binding.asset, placement: slot.placement };
        });
        const document = compileXArticleDocument({ markdown, visuals: compilerVisuals });
        const assets = new Map(manifest.bindings.map((binding) => [binding.asset.asset_id, binding.asset]));
        const visuals = [];
        if (document.cover_asset_id !== null) {
            visuals.push({ asset: this.requireAsset(assets, document.cover_asset_id), placement: { kind: 'cover' } });
        }
        document.blocks.forEach((block, index) => {
            if (block.kind === 'image') {
                visuals.push({
                    asset: this.requireAsset(assets, block.asset_id),
                    placement: { kind: 'block', block_ordinal: index + 1 }
                });
            }
        });
        const runId = this.runId();
        const plan = createXArticlePublicationPlan({
            planId: this.planId(),
            runId,
            targetAccount,
            articlePackage: { root: packageRef.root, digest: packageRef.digest },
            document,
            visuals,
            plannedAt: this.now().toISOString(),
            provenance: { article_run_id: manifest.article_run_id }
        });
        await this.store.writeNew(`runs/${runId}/x-article/publication-plan-v1.json`, plan);
        return plan;
    }
    requireAsset(assets, assetId) {
        const asset = assets.get(assetId);
        if (asset === undefined)
            throw new HarnessError('ARTICLE_ASSET_MISMATCH', `visual asset ${assetId} is missing`);
        return asset;
    }
}
//# sourceMappingURL=x-article-service.js.map