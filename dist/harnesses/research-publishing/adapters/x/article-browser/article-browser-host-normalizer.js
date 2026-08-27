import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
function rejectAnchor(message) {
    throw new HarnessError('ARTICLE_DRAFT_CONFLICT', message);
}
function assertTemplate(template) {
    const body = {
        schema_version: template.schema_version,
        source_document_digest: template.source_document_digest,
        blocks: template.blocks,
        anchors: template.anchors
    };
    if (template.template_digest !== sha256(body)) {
        rejectAnchor('X Article Host import template digest is invalid');
    }
}
function assertAnchor(actual, expected, observedOrdinal) {
    if (expected === undefined
        || actual.anchor_id !== expected.anchor_id
        || actual.marker !== expected.marker
        || expected.block_ordinal !== observedOrdinal) {
        rejectAnchor('X Article Host observed a foreign, reordered, or misplaced visual anchor');
    }
    return expected;
}
export function normalizeXArticleHostEditor(input) {
    assertTemplate(input.template);
    const blocks = [];
    const unresolved = [];
    const seenAnchorIds = new Set();
    for (const block of input.editor.blocks) {
        if (block.kind !== 'visual_anchor') {
            blocks.push(structuredClone(block));
            continue;
        }
        if (seenAnchorIds.has(block.anchor_id)) {
            rejectAnchor('X Article Host observed a duplicate visual anchor');
        }
        const expected = input.template.anchors.find((anchor) => anchor.anchor_id === block.anchor_id);
        const anchor = assertAnchor(block, expected, blocks.length + unresolved.length + 1);
        seenAnchorIds.add(anchor.anchor_id);
        unresolved.push(structuredClone(anchor));
    }
    const expectedSuffix = input.template.anchors.slice(input.template.anchors.length - unresolved.length);
    if (sha256(unresolved) !== sha256(expectedSuffix)) {
        rejectAnchor('X Article Host unresolved visual anchors are not the planned suffix');
    }
    const canonical = validateContract('x-article-document', {
        schema_version: '1.0',
        title: input.editor.title,
        cover_asset_id: null,
        blocks
    });
    return {
        draft_id: input.editor.draft_id,
        title: input.editor.title,
        blocks: canonical.blocks,
        visuals: structuredClone(input.editor.visuals),
        import_state: unresolved.length === 0
            ? null
            : {
                template_digest: input.template.template_digest,
                source_document_digest: input.template.source_document_digest,
                unresolved_anchors: unresolved
            },
        has_unknown_content: input.editor.has_unknown_content,
        autosave_state: input.editor.autosave_state
    };
}
//# sourceMappingURL=article-browser-host-normalizer.js.map