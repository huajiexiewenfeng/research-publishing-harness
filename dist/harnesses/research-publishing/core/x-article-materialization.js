import { createXArticleImportTemplate } from '../adapters/x/article-browser/article-import-template.js';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import { assertXArticlePublicationPlan } from './x-article-publication-plan.js';
const MATERIALIZATION_BUDGET = {
    fixed_seconds: 180,
    per_inline_visual_seconds: 60,
    no_progress_seconds: 20
};
function assertImportTemplateMatchesPlan(publicationPlan, importTemplate) {
    const expectedDocumentDigest = sha256(publicationPlan.intent.document);
    const canonicalTemplate = createXArticleImportTemplate(publicationPlan.intent.document);
    const templateBody = Object.fromEntries(Object.entries(importTemplate).filter(([key]) => key !== 'template_digest'));
    if (importTemplate.source_document_digest !== expectedDocumentDigest
        || importTemplate.template_digest !== sha256(templateBody)
        || importTemplate.template_digest !== canonicalTemplate.template_digest) {
        throw new HarnessError('ARTICLE_MATERIALIZATION_DRIFT', 'X Article import template does not match the locked publication document');
    }
    return canonicalTemplate;
}
function materializationAnchor(publicationPlan, importTemplate, index) {
    const anchor = importTemplate.anchors[index];
    const binding = publicationPlan.intent.visuals.find((candidate) => candidate.placement.kind === 'block'
        && candidate.placement.block_ordinal === anchor.block_ordinal
        && candidate.asset.asset_id === anchor.asset_id);
    if (binding === undefined) {
        throw new HarnessError('ARTICLE_ASSET_MISMATCH', `X Article materialization anchor ${anchor.anchor_id} has no locked visual binding`);
    }
    const templateBlock = importTemplate.blocks[anchor.block_ordinal - 1];
    if (templateBlock === undefined
        || templateBlock.kind !== 'visual_anchor'
        || templateBlock.anchor_id !== anchor.anchor_id
        || templateBlock.marker !== anchor.marker) {
        throw new HarnessError('ARTICLE_MATERIALIZATION_DRIFT', `X Article import template anchor ${anchor.anchor_id} is inconsistent`);
    }
    return {
        anchor_id: anchor.anchor_id,
        asset_id: anchor.asset_id,
        block_ordinal: anchor.block_ordinal,
        asset_digest: binding.asset.digest,
        alt_text: binding.asset.alt_text,
        context_digest: sha256({
            previous_block: importTemplate.blocks[anchor.block_ordinal - 2] ?? null,
            anchor_block: templateBlock,
            next_block: importTemplate.blocks[anchor.block_ordinal] ?? null
        })
    };
}
export function createXArticleMaterializationPlan(input) {
    assertXArticlePublicationPlan(input.publication_plan);
    const canonicalImportTemplate = assertImportTemplateMatchesPlan(input.publication_plan, input.import_template);
    const visualAnchors = canonicalImportTemplate.anchors.map((_anchor, index) => materializationAnchor(input.publication_plan, canonicalImportTemplate, index));
    const body = {
        schema_version: 'x-article-materialization-plan/v1',
        execution_id: input.execution_id,
        publication_plan_digest: input.publication_plan.plan_digest,
        target_account: input.publication_plan.intent.target_account,
        strategy: input.strategy,
        document_digest: canonicalImportTemplate.source_document_digest,
        import_template_digest: canonicalImportTemplate.template_digest,
        visual_anchors: visualAnchors,
        expected_command_ceiling: 12 + visualAnchors.length,
        expected_observation_ceiling: 9 + visualAnchors.length,
        budget: MATERIALIZATION_BUDGET
    };
    return validateContract('x-article-materialization-plan', {
        ...body,
        materialization_digest: sha256(body)
    });
}
export function createInitialXArticleMaterializationCheckpoint(input) {
    validateContract('x-article-materialization-plan', input.plan);
    return validateContract('x-article-materialization-checkpoint', {
        schema_version: 'x-article-materialization-checkpoint/v1',
        execution_id: input.plan.execution_id,
        draft_id: null,
        materialization_digest: input.plan.materialization_digest,
        revision: 0,
        phase: 'preflight_pending',
        body: { status: 'pending', observed_digest: null },
        media: input.plan.visual_anchors.map((anchor) => ({
            anchor_id: anchor.anchor_id,
            asset_id: anchor.asset_id,
            block_ordinal: anchor.block_ordinal,
            asset_digest: anchor.asset_digest,
            status: 'pending',
            observed_media_ref: null,
            observed_context_digest: null
        })),
        last_editor_revision: null,
        publish_confirmation: 'absent',
        updated_at: input.updated_at
    });
}
export function createXArticleStageProgress(input) {
    return validateContract('x-article-materialization-progress', {
        schema_version: 'x-article-materialization-progress/v1',
        ...input
    });
}
//# sourceMappingURL=x-article-materialization.js.map