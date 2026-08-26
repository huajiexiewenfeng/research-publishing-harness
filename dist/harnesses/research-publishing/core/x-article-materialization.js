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
function finiteNonnegative(value, label, integer = false) {
    if (!Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
        throw new HarnessError('CONTRACT_INVALID', `${label} must be a finite nonnegative${integer ? ' integer' : ''}`);
    }
}
function receiptBody(receipt) {
    return Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== 'receipt_digest'));
}
function startEvidenceBody(evidence) {
    return Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== 'start_digest'));
}
export function createXArticleMaterializationStartEvidence(input) {
    const plan = validateContract('x-article-materialization-plan', structuredClone(input.plan));
    if (!Number.isFinite(Date.parse(input.started_at))) {
        throw new HarnessError('CONTRACT_INVALID', 'materialization start timestamp is invalid');
    }
    const body = {
        schema_version: 'x-article-materialization-start/v1',
        execution_id: plan.execution_id,
        publication_plan_digest: plan.publication_plan_digest,
        materialization_digest: plan.materialization_digest,
        started_at: input.started_at
    };
    return Object.freeze({ ...body, start_digest: sha256(body) });
}
export function verifyXArticleMaterializationStartEvidence(evidence, plan) {
    const expected = createXArticleMaterializationStartEvidence({
        plan,
        started_at: evidence.started_at
    });
    if (evidence.schema_version !== 'x-article-materialization-start/v1'
        || sha256(evidence) !== sha256(expected)
        || evidence.start_digest !== sha256(startEvidenceBody(evidence))) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'materialization start evidence changed');
    }
    return expected;
}
function validatePreviewEvidence(plan, checkpoint) {
    const mediaMatches = checkpoint.media.length === plan.visual_anchors.length
        && checkpoint.media.every((entry, index) => {
            const anchor = plan.visual_anchors[index];
            return anchor !== undefined
                && entry.anchor_id === anchor.anchor_id
                && entry.asset_id === anchor.asset_id
                && entry.block_ordinal === anchor.block_ordinal
                && entry.asset_digest === anchor.asset_digest
                && entry.status === 'completed'
                && entry.observed_media_ref !== null
                && entry.observed_context_digest === anchor.context_digest;
        });
    const mediaRefs = checkpoint.media.map((entry) => entry.observed_media_ref);
    if (checkpoint.execution_id !== plan.execution_id
        || checkpoint.materialization_digest !== plan.materialization_digest
        || checkpoint.draft_id === null
        || checkpoint.phase !== 'preview_verified'
        || checkpoint.body.status !== 'verified'
        || checkpoint.body.observed_digest !== plan.import_template_digest
        || checkpoint.last_editor_revision === null
        || checkpoint.publish_confirmation !== 'absent'
        || !mediaMatches
        || new Set(mediaRefs).size !== mediaRefs.length) {
        throw new HarnessError('ARTICLE_CHECKPOINT_CONFLICT', 'X Article materialization receipt lacks complete Preview checkpoint evidence');
    }
}
function progressSummary(plan, progress, startedAt, verifiedAt) {
    const assetIds = new Set(plan.visual_anchors.map((anchor) => anchor.asset_id));
    const stageSeconds = {};
    let previous = startedAt;
    let retryCount = 0;
    let recoveryCount = 0;
    for (const event of progress) {
        validateContract('x-article-materialization-progress', event);
        const recordedAt = Date.parse(event.recorded_at);
        finiteNonnegative(event.elapsed_seconds, 'progress elapsed_seconds');
        finiteNonnegative(event.retry_count, 'progress retry_count', true);
        if (event.execution_id !== plan.execution_id
            || (event.asset_id !== null && !assetIds.has(event.asset_id))
            || !Number.isFinite(recordedAt)
            || recordedAt < previous
            || recordedAt > verifiedAt) {
            throw new HarnessError('CONTRACT_INVALID', 'X Article materialization progress is unordered or foreign');
        }
        if (event.elapsed_seconds > plan.budget.no_progress_seconds
            && event.waiting_for === null
            && event.observed_effect === 'unknown') {
            throw new HarnessError('ARTICLE_MATERIALIZATION_NO_PROGRESS', 'slow stage lacks a progress reason', event);
        }
        const stage = event.stage.split('#', 1)[0];
        stageSeconds[stage] = (stageSeconds[stage] ?? 0) + event.elapsed_seconds;
        retryCount += event.retry_count;
        if (event.observed_effect === 'unknown' || event.observed_effect === 'partial')
            recoveryCount += 1;
        previous = recordedAt;
    }
    return { stageSeconds, retryCount, recoveryCount };
}
export function createXArticleMaterializationReceipt(input) {
    if (Object.prototype.hasOwnProperty.call(input, 'supersedes_receipt_digest')) {
        throw new HarnessError('CONTRACT_INVALID', 'base materialization receipts cannot supersede evidence');
    }
    const plan = validateContract('x-article-materialization-plan', structuredClone(input.plan));
    const checkpoint = validateContract('x-article-materialization-checkpoint', structuredClone(input.checkpoint));
    validatePreviewEvidence(plan, checkpoint);
    finiteNonnegative(input.body_block_count, 'body_block_count', true);
    finiteNonnegative(input.command_count, 'command_count', true);
    finiteNonnegative(input.observation_count, 'observation_count', true);
    finiteNonnegative(input.human_wait_seconds, 'human_wait_seconds');
    const startedAt = Date.parse(input.automation_started_at);
    const verifiedAt = Date.parse(input.preview_verified_at);
    const issuedAt = Date.parse(input.issued_at);
    if (!Number.isFinite(startedAt)
        || !Number.isFinite(verifiedAt)
        || !Number.isFinite(issuedAt)
        || startedAt > verifiedAt
        || verifiedAt > issuedAt
        || checkpoint.updated_at !== input.preview_verified_at) {
        throw new HarnessError('CONTRACT_INVALID', 'X Article materialization receipt timestamps are invalid or reversed');
    }
    if (input.command_count > plan.expected_command_ceiling
        || input.observation_count > plan.expected_observation_ceiling) {
        throw new HarnessError('ARTICLE_MATERIALIZATION_TIMEOUT', 'X Article materialization activity exceeded its trusted ceiling');
    }
    const progress = input.progress.map((event) => structuredClone(event));
    const summary = progressSummary(plan, progress, startedAt, verifiedAt);
    const automationSeconds = (verifiedAt - startedAt) / 1000;
    finiteNonnegative(automationSeconds, 'automation_seconds');
    const body = {
        schema_version: 'x-article-materialization-receipt/v1',
        execution_id: plan.execution_id,
        draft_id: checkpoint.draft_id,
        materialization_digest: plan.materialization_digest,
        strategy: plan.strategy,
        body_block_count: input.body_block_count,
        inline_image_count: plan.visual_anchors.length,
        stage_seconds: Object.freeze({ ...summary.stageSeconds }),
        automation_seconds: automationSeconds,
        human_wait_seconds: input.human_wait_seconds,
        command_count: input.command_count,
        command_ceiling: plan.expected_command_ceiling,
        observation_count: input.observation_count,
        observation_ceiling: plan.expected_observation_ceiling,
        retry_count: summary.retryCount,
        recovery_count: summary.recoveryCount,
        within_budget: automationSeconds <= (plan.budget.fixed_seconds
            + (plan.budget.per_inline_visual_seconds * plan.visual_anchors.length)),
        preview_revision: input.preview_revision,
        supersedes_receipt_digest: null,
        issued_at: input.issued_at
    };
    const receipt = validateContract('x-article-materialization-receipt', { ...body, receipt_digest: sha256(body) });
    return Object.freeze(receipt);
}
export function createSupersedingXArticleMaterializationReceipt(input) {
    const preview = validateContract('x-article-materialization-receipt', structuredClone(input.preview_receipt));
    if (preview.receipt_digest !== sha256(receiptBody(preview))
        || preview.receipt_digest !== input.expected_preview_receipt_digest
        || preview.supersedes_receipt_digest !== null) {
        throw new HarnessError('CONTRACT_INVALID', 'Preview materialization receipt is corrupt or already superseding');
    }
    finiteNonnegative(input.human_wait_seconds, 'human_wait_seconds');
    const issuedAt = Date.parse(input.issued_at);
    if (!Number.isFinite(issuedAt) || issuedAt < Date.parse(preview.issued_at)) {
        throw new HarnessError('CONTRACT_INVALID', 'superseding materialization receipt timestamp is invalid');
    }
    const body = {
        ...receiptBody(preview),
        stage_seconds: Object.freeze({ ...preview.stage_seconds }),
        human_wait_seconds: input.human_wait_seconds,
        supersedes_receipt_digest: preview.receipt_digest,
        issued_at: input.issued_at
    };
    const receipt = validateContract('x-article-materialization-receipt', { ...body, receipt_digest: sha256(body) });
    return Object.freeze(receipt);
}
//# sourceMappingURL=x-article-materialization.js.map