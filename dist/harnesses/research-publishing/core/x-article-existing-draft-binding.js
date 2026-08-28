import { createXArticleImportTemplate } from '../adapters/x/article-browser/article-import-template.js';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
import { assertXArticlePublicationPlan } from './x-article-publication-plan.js';
function normalizeRun(run) {
    return {
        text: run.text.normalize('NFC'),
        marks: run.marks,
        link: run.link?.normalize('NFC') ?? null
    };
}
function normalizeBlock(block) {
    if (block.kind === 'image')
        return { ...block, alt_text: block.alt_text.normalize('NFC') };
    if ('items' in block)
        return { ...block, items: block.items.map((item) => item.map(normalizeRun)) };
    return { ...block, runs: block.runs.map(normalizeRun) };
}
function normalizedBlockDigest(blocks) {
    return sha256(blocks.map(normalizeBlock));
}
function draftIdFromCanonicalUrl(canonicalUrl) {
    try {
        const url = new URL(canonicalUrl);
        if (url.origin !== 'https://x.com')
            return null;
        return /^\/compose\/articles\/edit\/([0-9]+)\/?$/.exec(url.pathname)?.[1] ?? null;
    }
    catch {
        return null;
    }
}
function rejectExistingDraft(reason) {
    throw new HarnessError('ARTICLE_DRAFT_CONFLICT', `existing X Article Draft cannot be adopted: ${reason}`);
}
function assertAdoptableEditor(publicationPlan, observation) {
    assertXArticlePublicationPlan(publicationPlan);
    const editor = observation.editor;
    if (observation.account_handle !== publicationPlan.intent.target_account) {
        rejectExistingDraft('account does not match the publication plan');
    }
    if (observation.page_kind !== 'article_editor' || editor === null) {
        rejectExistingDraft('observation is not an Article editor');
    }
    if (draftIdFromCanonicalUrl(observation.canonical_url) !== editor.draft_id) {
        rejectExistingDraft('editor Draft ID does not match the canonical URL');
    }
    if (editor.title !== publicationPlan.intent.document.title) {
        rejectExistingDraft('editor title does not match the publication document');
    }
    const expectedBlocks = publicationPlan.intent.document.blocks.filter((block) => block.kind !== 'image');
    if (normalizedBlockDigest(editor.blocks) !== normalizedBlockDigest(expectedBlocks)) {
        rejectExistingDraft('editor body does not match the publication document');
    }
    const template = createXArticleImportTemplate(publicationPlan.intent.document);
    const importState = editor.import_state;
    if (importState === null
        || importState.template_digest !== template.template_digest
        || importState.source_document_digest !== template.source_document_digest
        || sha256(importState.unresolved_anchors) !== sha256(template.anchors)) {
        rejectExistingDraft('editor import state does not match the complete template');
    }
    if (editor.visuals.length !== 0)
        rejectExistingDraft('editor already contains media');
    if (editor.has_unknown_content)
        rejectExistingDraft('editor contains unknown content');
    if (editor.autosave_state !== 'saved')
        rejectExistingDraft('editor autosave is not saved');
    return editor;
}
function bindingBody(binding) {
    return Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'binding_digest'));
}
export function computeXArticleExistingDraftRevision(observation) {
    return sha256({
        origin: observation.origin,
        canonical_url: observation.canonical_url,
        account_handle: observation.account_handle,
        page_kind: observation.page_kind,
        editor: observation.editor
    });
}
export function createXArticleExistingDraftBinding(input) {
    const editor = assertAdoptableEditor(input.publication_plan, input.observation);
    const template = createXArticleImportTemplate(input.publication_plan.intent.document);
    const body = {
        schema_version: 'x-article-existing-draft-binding/v1',
        mode: 'adopt_existing',
        draft_id: editor.draft_id,
        expected_account: input.publication_plan.intent.target_account,
        expected_editor_revision: computeXArticleExistingDraftRevision(input.observation),
        expected_title_digest: sha256(input.publication_plan.intent.document.title),
        expected_document_digest: template.source_document_digest,
        expected_import_template_digest: template.template_digest,
        expected_anchor_manifest_digest: sha256(template.anchors),
        expected_cover_count: 0,
        expected_inline_media_count: 0,
        source_observation_digest: sha256(input.observation),
        observed_at: input.observation.observed_at
    };
    return validateContract('x-article-existing-draft-binding', {
        ...body,
        binding_digest: sha256(body)
    });
}
export function verifyXArticleExistingDraftBinding(binding, publicationPlan, observation) {
    if (binding.binding_digest !== sha256(bindingBody(binding))) {
        rejectExistingDraft('binding digest is invalid');
    }
    validateContract('x-article-existing-draft-binding', binding);
    const editor = assertAdoptableEditor(publicationPlan, observation);
    const template = createXArticleImportTemplate(publicationPlan.intent.document);
    if (binding.draft_id !== editor.draft_id
        || binding.expected_account !== publicationPlan.intent.target_account
        || binding.expected_editor_revision !== computeXArticleExistingDraftRevision(observation)
        || binding.expected_title_digest !== sha256(publicationPlan.intent.document.title)
        || binding.expected_document_digest !== template.source_document_digest
        || binding.expected_import_template_digest !== template.template_digest
        || binding.expected_anchor_manifest_digest !== sha256(template.anchors)
        || binding.expected_cover_count !== 0
        || binding.expected_inline_media_count !== 0) {
        rejectExistingDraft('binding does not match the current Draft and publication plan');
    }
    return binding;
}
//# sourceMappingURL=x-article-existing-draft-binding.js.map