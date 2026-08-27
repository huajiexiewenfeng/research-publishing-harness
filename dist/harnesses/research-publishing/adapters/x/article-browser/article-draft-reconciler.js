import { sha256 } from '../../../core/digest.js';
import { computeXArticlePageRevision } from './article-browser-protocol.js';
import { createXArticleImportTemplate } from './article-import-template.js';
function planWithoutDigest(plan) {
    return Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'materialization_digest'));
}
function normalizeRun(run) {
    return {
        text: run.text.normalize('NFC'),
        marks: run.marks,
        link: run.link?.normalize('NFC') ?? null
    };
}
function normalizeBlock(block) {
    if (block.kind === 'image') {
        return { ...block, alt_text: block.alt_text.normalize('NFC') };
    }
    if ('items' in block) {
        return { ...block, items: block.items.map((item) => item.map(normalizeRun)) };
    }
    return { ...block, runs: block.runs.map(normalizeRun) };
}
function normalizedDigest(value) {
    if (Array.isArray(value))
        return sha256(value.map(normalizeBlock));
    return sha256(normalizeBlock(value));
}
function rawBlocksEqual(expected, observed) {
    return sha256(expected) === sha256(observed);
}
function normalizedBlocksEqual(expected, observed) {
    return normalizedDigest(expected) === normalizedDigest(observed);
}
function difference(path, expected, observed, reason) {
    return {
        path,
        expected_digest: expected === undefined ? null : sha256(expected),
        observed_digest: observed === undefined ? null : sha256(observed),
        reason
    };
}
function blockDifferences(expected, observed) {
    const differences = [];
    const expectedDigests = expected.map((block) => normalizedDigest(block));
    const observedDigests = observed.map((block) => normalizedDigest(block));
    const length = Math.max(expected.length, observed.length);
    for (let index = 0; index < length; index += 1) {
        const expectedBlock = expected[index];
        const observedBlock = observed[index];
        if (expectedBlock === undefined) {
            differences.push(difference(`editor.blocks[${index}]`, undefined, observedBlock, 'extra'));
            continue;
        }
        if (observedBlock === undefined) {
            differences.push(difference(`editor.blocks[${index}]`, expectedBlock, undefined, 'missing'));
            continue;
        }
        if (expectedDigests[index] === observedDigests[index])
            continue;
        const reordered = observedDigests.includes(expectedDigests[index])
            || expectedDigests.includes(observedDigests[index]);
        differences.push(difference(`editor.blocks[${index}]`, expectedBlock, observedBlock, reordered ? 'reordered' : 'changed'));
    }
    return differences;
}
function expectedBlocksForPrefix(document, plan, completedCount) {
    const completedOrdinals = new Set(plan.visual_anchors.slice(0, completedCount).map((anchor) => anchor.block_ordinal));
    return document.blocks.filter((block, index) => block.kind !== 'image' || completedOrdinals.has(index + 1));
}
function observedPrefix(editor, plan, document) {
    const matches = [];
    for (let completedCount = 0; completedCount <= plan.visual_anchors.length; completedCount += 1) {
        if (normalizedBlocksEqual(expectedBlocksForPrefix(document, plan, completedCount), editor.blocks)) {
            matches.push(completedCount);
        }
    }
    return matches.length === 1 ? matches[0] : null;
}
function observationWithoutRevision(observation) {
    return Object.fromEntries(Object.entries(observation).filter(([key]) => key !== 'page_revision'));
}
function isPreBodyEmptyShell(checkpoint, editor) {
    return editorIsEmpty(editor)
        && isPreBodyImportableShell(checkpoint, editor, '');
}
function isPreBodyImportableShell(checkpoint, editor, approvedTitle) {
    return (checkpoint.phase === 'draft_bound' || checkpoint.phase === 'article_shell_ready')
        && checkpoint.body.status === 'pending'
        && checkpoint.body.observed_digest === null
        && checkpoint.media.every((media) => media.status === 'pending'
            && media.observed_media_ref === null
            && media.observed_context_digest === null)
        && checkpoint.publish_confirmation === 'absent'
        && editor.autosave_state === 'saved'
        && (editor.title.length === 0 || editor.title === approvedTitle)
        && editor.blocks.length === 0
        && editor.visuals.length === 0
        && editor.import_state === null
        && !editor.has_unknown_content;
}
function observationIdentityReasons(plan, checkpoint, observation) {
    const reasons = [];
    if (observation.page_revision !== computeXArticlePageRevision(observationWithoutRevision(observation))) {
        reasons.push('browser observation page revision does not match its content');
    }
    if (observation.execution_id !== plan.execution_id) {
        reasons.push('browser observation execution identity does not match the materialization plan');
    }
    if (observation.execution_id !== checkpoint.execution_id) {
        reasons.push('browser observation execution identity does not match the checkpoint');
    }
    if (observation.account_handle !== plan.target_account) {
        reasons.push('browser observation account identity does not match the materialization plan');
    }
    if (observation.page_kind !== 'article_editor') {
        reasons.push('browser observation is not an Article editor page');
    }
    if (observation.editor === null) {
        reasons.push('browser observation has no Article editor');
        return reasons;
    }
    if (checkpoint.draft_id === null || observation.editor.draft_id !== checkpoint.draft_id) {
        reasons.push('editor draft identity does not match the checkpoint');
    }
    if (checkpoint.last_editor_revision === null) {
        if (!isPreBodyEmptyShell(checkpoint, observation.editor)) {
            reasons.push('checkpoint has no stable editor revision for materialized draft content');
        }
    }
    else if (checkpoint.last_editor_revision !== observation.page_revision) {
        reasons.push('checkpoint editor revision does not match the browser observation');
    }
    return reasons;
}
function checkpointIdentityReasons(plan, checkpoint, document) {
    const reasons = [];
    const template = createXArticleImportTemplate(document);
    if (plan.materialization_digest !== sha256(planWithoutDigest(plan))) {
        reasons.push('materialization plan digest does not match the plan body');
    }
    if (plan.document_digest !== sha256(document)) {
        reasons.push('materialization plan document identity does not match the approved document');
    }
    if (plan.import_template_digest !== template.template_digest) {
        reasons.push('materialization plan import-template identity does not match the approved document');
    }
    if (checkpoint.execution_id !== plan.execution_id) {
        reasons.push('checkpoint execution identity does not match the materialization plan');
    }
    if (checkpoint.materialization_digest !== plan.materialization_digest) {
        reasons.push('checkpoint materialization identity does not match the materialization plan');
    }
    if ((checkpoint.body.status === 'verified'
        && checkpoint.body.observed_digest !== plan.import_template_digest)
        || (checkpoint.body.status !== 'verified' && checkpoint.body.observed_digest !== null)) {
        reasons.push('checkpoint body observation does not match the materialization plan');
    }
    if (checkpoint.media.length !== plan.visual_anchors.length) {
        reasons.push('checkpoint media identity count does not match the materialization plan');
    }
    const anchorCount = Math.max(checkpoint.media.length, plan.visual_anchors.length);
    for (let index = 0; index < anchorCount; index += 1) {
        const expected = plan.visual_anchors[index];
        const observed = checkpoint.media[index];
        if (expected === undefined
            || observed === undefined
            || observed.anchor_id !== expected.anchor_id
            || observed.asset_id !== expected.asset_id
            || observed.block_ordinal !== expected.block_ordinal
            || observed.asset_digest !== expected.asset_digest) {
            reasons.push(`checkpoint media identity differs at index ${index}`);
            continue;
        }
        if ((observed.status === 'completed'
            && (observed.observed_media_ref === null
                || observed.observed_context_digest !== expected.context_digest))
            || (observed.status === 'pending'
                && (observed.observed_media_ref !== null || observed.observed_context_digest !== null))) {
            reasons.push(`checkpoint media observation differs at index ${index}`);
        }
    }
    if (plan.visual_anchors.length !== template.anchors.length) {
        reasons.push('materialization plan anchor count does not match the approved document');
    }
    for (let index = 0; index < Math.max(plan.visual_anchors.length, template.anchors.length); index += 1) {
        const planned = plan.visual_anchors[index];
        const canonical = template.anchors[index];
        const block = canonical === undefined ? undefined : document.blocks[canonical.block_ordinal - 1];
        const contextDigest = canonical === undefined ? null : sha256({
            previous_block: template.blocks[canonical.block_ordinal - 2] ?? null,
            anchor_block: template.blocks[canonical.block_ordinal - 1] ?? null,
            next_block: template.blocks[canonical.block_ordinal] ?? null
        });
        if (planned === undefined
            || canonical === undefined
            || block?.kind !== 'image'
            || planned.anchor_id !== canonical.anchor_id
            || planned.asset_id !== canonical.asset_id
            || planned.block_ordinal !== canonical.block_ordinal
            || planned.alt_text !== block.alt_text
            || planned.context_digest !== contextDigest) {
            reasons.push(`materialization plan anchor identity differs at index ${index}`);
        }
    }
    return reasons;
}
function mediaUnverifiableReasons(editor, checkpoint, plan, document) {
    const reasons = [];
    if (editor.has_unknown_content)
        reasons.push('editor reports unknown content');
    const knownAssets = new Set(plan.visual_anchors.map((anchor) => anchor.asset_id));
    const editorRefs = new Set();
    if (document.cover_asset_id !== null)
        knownAssets.add(document.cover_asset_id);
    for (let index = 0; index < editor.visuals.length; index += 1) {
        const visual = editor.visuals[index];
        if (visual.ref.length === 0)
            reasons.push(`media reference is unknown at index ${index}`);
        if (editorRefs.has(visual.ref))
            reasons.push(`media reference is duplicated at index ${index}`);
        editorRefs.add(visual.ref);
        if (visual.asset_id === null || !knownAssets.has(visual.asset_id)) {
            reasons.push(`media asset identity is unknown at index ${index}`);
        }
        if (!visual.owned_by_execution)
            reasons.push(`media ownership is unverifiable at index ${index}`);
        if (visual.status !== 'uploaded')
            reasons.push(`media upload state is unverifiable at index ${index}`);
    }
    const checkpointRefs = new Set();
    for (let index = 0; index < checkpoint.media.length; index += 1) {
        const media = checkpoint.media[index];
        if (media.observed_media_ref !== null) {
            if (checkpointRefs.has(media.observed_media_ref)) {
                reasons.push(`checkpoint media reference is duplicated at index ${index}`);
            }
            checkpointRefs.add(media.observed_media_ref);
        }
        if (media.status === 'ambiguous')
            reasons.push(`checkpoint media is ambiguous at index ${index}`);
        if (media.status !== 'pending' && media.status !== 'completed' && media.status !== 'ambiguous') {
            reasons.push(`checkpoint media is incomplete at index ${index}`);
        }
    }
    return reasons;
}
function checkpointCompletedPrefix(checkpoint) {
    let completedCount = 0;
    let observedPending = false;
    for (const media of checkpoint.media) {
        if (media.status === 'completed') {
            if (observedPending)
                return null;
            completedCount += 1;
        }
        else if (media.status === 'pending') {
            observedPending = true;
        }
    }
    return completedCount;
}
function lifecycleReasons(checkpoint, editor, checkpointPrefix, anchorCount, importableShell) {
    const reasons = [];
    if (editor.autosave_state !== 'saved') {
        reasons.push(`editor autosave state is ${editor.autosave_state}`);
    }
    if (checkpoint.publish_confirmation !== 'absent') {
        reasons.push('checkpoint publish confirmation is not absent during draft reconciliation');
    }
    if (importableShell) {
        if (checkpoint.phase !== 'draft_bound' && checkpoint.phase !== 'article_shell_ready') {
            reasons.push(`checkpoint phase ${checkpoint.phase} cannot import an empty editor body`);
        }
        if (checkpoint.body.status !== 'pending' || checkpoint.body.observed_digest !== null) {
            reasons.push('empty editor does not have a pending checkpoint body');
        }
        if (checkpointPrefix !== 0)
            reasons.push('empty editor conflicts with completed checkpoint media');
        return reasons;
    }
    const materializedPhase = checkpoint.phase === 'body_imported'
        || checkpoint.phase === 'body_verified'
        || checkpoint.phase === 'media_materializing'
        || checkpoint.phase === 'draft_reconciled';
    if (!materializedPhase) {
        reasons.push(`checkpoint phase ${checkpoint.phase} cannot reconcile materialized draft content`);
    }
    if (checkpoint.body.status !== 'verified'
        || checkpoint.body.observed_digest === null) {
        reasons.push('populated editor does not have a verified checkpoint body');
    }
    if ((checkpoint.phase === 'body_imported' || checkpoint.phase === 'body_verified')
        && checkpointPrefix !== 0) {
        reasons.push(`checkpoint phase ${checkpoint.phase} cannot contain completed media`);
    }
    if (checkpoint.phase === 'draft_reconciled' && checkpointPrefix !== anchorCount) {
        reasons.push('draft_reconciled checkpoint does not contain the complete media prefix');
    }
    return reasons;
}
function mediaBindingReasons(editor, checkpoint, plan, completedCount) {
    const reasons = [];
    const inlineVisuals = editor.visuals.filter((visual) => visual.kind === 'inline');
    for (let index = 0; index < completedCount; index += 1) {
        const anchor = plan.visual_anchors[index];
        const visual = inlineVisuals[index];
        const checkpointRef = checkpoint.media[index].observed_media_ref;
        if (visual !== undefined
            && visual.asset_id === anchor.asset_id
            && visual.block_ordinal === anchor.block_ordinal
            && visual.ref !== checkpointRef) {
            reasons.push(`editor media reference does not match checkpoint binding at index ${index}`);
        }
    }
    return reasons;
}
function visualDifferences(editor, checkpoint, plan, document, completedCount) {
    const differences = [];
    const inlineVisuals = editor.visuals.filter((visual) => visual.kind === 'inline');
    const coverVisuals = editor.visuals.filter((visual) => visual.kind === 'cover');
    if (document.cover_asset_id === null) {
        for (let index = 0; index < coverVisuals.length; index += 1) {
            differences.push(difference(`editor.visuals.cover[${index}]`, undefined, coverVisuals[index], 'extra'));
        }
    }
    else {
        const cover = coverVisuals[0];
        if (cover === undefined) {
            differences.push(difference('editor.visuals.cover[0]', { asset_id: document.cover_asset_id }, undefined, 'missing'));
        }
        else if (cover.asset_id !== document.cover_asset_id
            || cover.block_ordinal !== null) {
            differences.push(difference('editor.visuals.cover[0]', { asset_id: document.cover_asset_id, block_ordinal: null }, { asset_id: cover.asset_id, block_ordinal: cover.block_ordinal }, 'changed'));
        }
        for (let index = 1; index < coverVisuals.length; index += 1) {
            differences.push(difference(`editor.visuals.cover[${index}]`, undefined, coverVisuals[index], 'extra'));
        }
    }
    const expected = plan.visual_anchors.slice(0, completedCount);
    const length = Math.max(expected.length, inlineVisuals.length);
    for (let index = 0; index < length; index += 1) {
        const anchor = expected[index];
        const visual = inlineVisuals[index];
        if (anchor === undefined) {
            differences.push(difference(`editor.visuals.inline[${index}]`, undefined, visual, 'extra'));
            continue;
        }
        if (visual === undefined) {
            differences.push(difference(`editor.visuals.inline[${index}]`, anchor, undefined, 'missing'));
            continue;
        }
        const expectedVisual = {
            ref: checkpoint.media[index].observed_media_ref,
            asset_id: anchor.asset_id,
            kind: 'inline',
            block_ordinal: anchor.block_ordinal,
            alt_text: anchor.alt_text.normalize('NFC'),
            status: 'uploaded',
            owned_by_execution: true
        };
        const normalizedVisual = { ...visual, alt_text: visual.alt_text?.normalize('NFC') ?? null };
        if (sha256(expectedVisual) !== sha256(normalizedVisual)) {
            const reordered = expected.some((candidate) => candidate.asset_id === visual.asset_id)
                && anchor.asset_id !== visual.asset_id;
            differences.push(difference(`editor.visuals.inline[${index}]`, expectedVisual, normalizedVisual, reordered ? 'reordered' : 'changed'));
        }
    }
    return differences;
}
function importStateDifferences(editor, document, checkpoint, anchorCount, completedCount) {
    const template = createXArticleImportTemplate(document);
    const expected = {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: template.anchors.slice(completedCount)
    };
    const observed = editor.import_state;
    if (observed === null) {
        return completedCount < anchorCount
            ? [difference('editor.import_state', expected, undefined, 'missing')]
            : [];
    }
    if (checkpoint.phase === 'draft_reconciled') {
        return [difference('editor.import_state', undefined, observed, 'extra')];
    }
    const differences = [];
    if (observed.template_digest !== expected.template_digest) {
        differences.push(difference('editor.import_state.template_digest', expected.template_digest, observed.template_digest, 'changed'));
    }
    if (observed.source_document_digest !== expected.source_document_digest) {
        differences.push(difference('editor.import_state.source_document_digest', expected.source_document_digest, observed.source_document_digest, 'changed'));
    }
    if (sha256(observed.unresolved_anchors) !== sha256(expected.unresolved_anchors)) {
        differences.push(difference('editor.import_state.unresolved_anchors', expected.unresolved_anchors, observed.unresolved_anchors, 'changed'));
    }
    return differences;
}
function editorIsEmpty(editor) {
    return editor.title.length === 0
        && editor.blocks.length === 0
        && editor.visuals.length === 0
        && editor.import_state === null
        && !editor.has_unknown_content;
}
export function reconcileXArticleDraft(input) {
    const { plan, checkpoint, document, observation } = input;
    const observationReasons = observationIdentityReasons(plan, checkpoint, observation);
    const identityReasons = checkpointIdentityReasons(plan, checkpoint, document);
    const editor = observation.editor;
    if (editor === null) {
        return { kind: 'unverifiable', reasons: [...observationReasons, ...identityReasons] };
    }
    const unverifiableReasons = [
        ...observationReasons,
        ...identityReasons,
        ...mediaUnverifiableReasons(editor, checkpoint, plan, document)
    ];
    if (unverifiableReasons.length > 0) {
        return { kind: 'unverifiable', reasons: unverifiableReasons };
    }
    const checkpointPrefix = checkpointCompletedPrefix(checkpoint);
    if (checkpointPrefix === null) {
        return { kind: 'unverifiable', reasons: ['checkpoint completed media is not an ordered prefix'] };
    }
    const empty = isPreBodyImportableShell(checkpoint, editor, document.title);
    const prefix = empty ? null : observedPrefix(editor, plan, document);
    const phaseReasons = lifecycleReasons(checkpoint, editor, checkpointPrefix, plan.visual_anchors.length, empty);
    if (phaseReasons.length > 0)
        return { kind: 'unverifiable', reasons: phaseReasons };
    if (empty)
        return { kind: 'empty', next_action: 'import_body' };
    if (prefix === null) {
        const expected = expectedBlocksForPrefix(document, plan, checkpointPrefix);
        const differences = blockDifferences(expected, editor.blocks);
        return {
            kind: 'content_drift',
            differences: differences.length > 0
                ? differences
                : [difference('editor.blocks', expected, editor.blocks, 'ambiguous')]
        };
    }
    if (prefix !== checkpointPrefix) {
        return { kind: 'unverifiable', reasons: ['checkpoint and editor completed-anchor prefixes differ'] };
    }
    const bindingReasons = mediaBindingReasons(editor, checkpoint, plan, prefix);
    if (bindingReasons.length > 0)
        return { kind: 'unverifiable', reasons: bindingReasons };
    const differences = [];
    const normalizedTitleMatches = document.title.normalize('NFC') === editor.title.normalize('NFC');
    if (!normalizedTitleMatches)
        differences.push(difference('editor.title', document.title, editor.title, 'changed'));
    differences.push(...visualDifferences(editor, checkpoint, plan, document, prefix));
    differences.push(...importStateDifferences(editor, document, checkpoint, plan.visual_anchors.length, prefix));
    if (differences.length > 0)
        return { kind: 'content_drift', differences };
    if (prefix < plan.visual_anchors.length || editor.import_state !== null) {
        return {
            kind: 'recoverable_partial',
            completed_anchor_ids: plan.visual_anchors.slice(0, prefix).map((anchor) => anchor.anchor_id),
            next_anchor_id: plan.visual_anchors[prefix]?.anchor_id ?? null,
            next_action: prefix < plan.visual_anchors.length ? 'replace_anchor' : 'reconcile_final'
        };
    }
    const exact = document.title === editor.title
        && rawBlocksEqual(document.blocks, editor.blocks)
        && plan.visual_anchors.every((anchor, index) => {
            const visual = editor.visuals.filter((candidate) => candidate.kind === 'inline')[index];
            return visual?.alt_text === anchor.alt_text;
        });
    return { kind: exact ? 'exact' : 'semantically_equivalent', next_action: 'open_preview' };
}
//# sourceMappingURL=article-draft-reconciler.js.map