import { createXArticleImportTemplate } from '../adapters/x/article-browser/article-import-template.js';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import { assertXArticlePublicationPlan } from './x-article-publication-plan.js';
import { verifyXArticleExistingDraftBinding } from './x-article-existing-draft-binding.js';
import { computeXArticlePageRevision } from '../adapters/x/article-browser/article-browser-protocol.js';
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
function assertDraftBindingMatchesPlan(binding, publicationPlan, importTemplate) {
    const bindingBody = Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'binding_digest'));
    if (binding.binding_digest !== sha256(bindingBody)
        || binding.expected_account !== publicationPlan.intent.target_account
        || binding.expected_title_digest !== sha256(publicationPlan.intent.document.title)
        || binding.expected_document_digest !== importTemplate.source_document_digest
        || binding.expected_import_template_digest !== importTemplate.template_digest
        || binding.expected_anchor_manifest_digest !== sha256(importTemplate.anchors)
        || binding.expected_cover_count !== 0
        || binding.expected_inline_media_count !== 0) {
        throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'existing Draft binding does not match the locked publication plan');
    }
}
export function createXArticleMaterializationPlan(input) {
    assertXArticlePublicationPlan(input.publication_plan);
    const canonicalImportTemplate = assertImportTemplateMatchesPlan(input.publication_plan, input.import_template);
    const visualAnchors = canonicalImportTemplate.anchors.map((_anchor, index) => materializationAnchor(input.publication_plan, canonicalImportTemplate, index));
    const draftBinding = input.draft_binding ?? null;
    if (draftBinding !== null) {
        if (input.strategy !== 'rich_text_anchor_import/v1') {
            throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'existing Draft binding requires rich-text anchor import');
        }
        assertDraftBindingMatchesPlan(draftBinding, input.publication_plan, canonicalImportTemplate);
    }
    const existingDraft = draftBinding !== null;
    const body = {
        schema_version: 'x-article-materialization-plan/v1',
        execution_id: input.execution_id,
        publication_plan_digest: input.publication_plan.plan_digest,
        target_account: input.publication_plan.intent.target_account,
        strategy: input.strategy,
        document_digest: canonicalImportTemplate.source_document_digest,
        import_template_digest: canonicalImportTemplate.template_digest,
        draft_binding: draftBinding,
        visual_anchors: visualAnchors,
        expected_command_ceiling: (existingDraft ? 4 : 12) + visualAnchors.length,
        expected_observation_ceiling: (existingDraft ? 3 : 9) + visualAnchors.length,
        budget: MATERIALIZATION_BUDGET
    };
    return validateContract('x-article-materialization-plan', {
        ...body,
        materialization_digest: sha256(body)
    });
}
function initialCheckpointBody(plan, updatedAt) {
    return {
        schema_version: 'x-article-materialization-checkpoint/v1',
        execution_id: plan.execution_id,
        draft_id: null,
        draft_origin: 'created_new',
        source_execution_id: null,
        materialization_digest: plan.materialization_digest,
        revision: 0,
        phase: 'preflight_pending',
        body: { status: 'pending', observed_digest: null },
        media: plan.visual_anchors.map((anchor) => ({
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
        updated_at: updatedAt
    };
}
function assertFreshAdoptedDraftObservation(plan, binding, observation) {
    const observed = validateContract('x-article-browser-observation', structuredClone(observation));
    const { page_revision: _pageRevision, ...revisionBody } = observed;
    const observedAt = Date.parse(observed.observed_at);
    const boundAt = Date.parse(binding.observed_at);
    if (observed.page_revision !== computeXArticlePageRevision(revisionBody)
        || sha256(observed) === binding.source_observation_digest
        || !Number.isFinite(observedAt)
        || !Number.isFinite(boundAt)
        || observedAt <= boundAt
        || observed.execution_id !== plan.execution_id) {
        throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'existing Draft adoption requires a fresh matching editor observation');
    }
    return observed;
}
export function createInitialXArticleMaterializationCheckpoint(input) {
    const plan = validateContract('x-article-materialization-plan', input.plan);
    if (plan.draft_binding !== null) {
        throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'existing Draft Plan requires an adopted checkpoint');
    }
    return validateContract('x-article-materialization-checkpoint', initialCheckpointBody(plan, input.updated_at));
}
export function createAdoptedXArticleMaterializationCheckpoint(input) {
    const plan = validateContract('x-article-materialization-plan', structuredClone(input.plan));
    assertXArticlePublicationPlan(input.publication_plan);
    if (plan.draft_binding === null
        || plan.strategy !== 'rich_text_anchor_import/v1'
        || plan.publication_plan_digest !== input.publication_plan.plan_digest) {
        throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'existing Draft binding is absent or foreign');
    }
    const observation = assertFreshAdoptedDraftObservation(plan, plan.draft_binding, input.observation);
    verifyXArticleExistingDraftBinding(plan.draft_binding, input.publication_plan, observation);
    return validateContract('x-article-materialization-checkpoint', {
        ...initialCheckpointBody(plan, input.updated_at),
        draft_id: plan.draft_binding.draft_id,
        draft_origin: 'adopted_existing',
        source_execution_id: null,
        phase: 'body_verified',
        body: { status: 'adopted_verified', observed_digest: plan.import_template_digest },
        last_editor_revision: observation.page_revision
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
function progressSummary(plan, progress, coverAssetId, startedAt, verifiedAt) {
    const assetIds = new Set(plan.visual_anchors.map((anchor) => anchor.asset_id));
    if (coverAssetId !== null) {
        if (typeof coverAssetId !== 'string'
            || coverAssetId.length === 0
            || assetIds.has(coverAssetId)) {
            throw new HarnessError('CONTRACT_INVALID', 'X Article materialization cover identity is invalid or duplicates an inline anchor');
        }
        assetIds.add(coverAssetId);
    }
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
    const summary = progressSummary(plan, progress, input.cover_asset_id, startedAt, verifiedAt);
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