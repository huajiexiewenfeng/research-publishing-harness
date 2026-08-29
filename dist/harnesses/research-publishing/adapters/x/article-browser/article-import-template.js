import { HarnessError } from '../../../core/errors.js';
import { sha256 } from '../../../core/digest.js';
const SAFE_ASSET_ID = /^[A-Za-z0-9_-]+$/;
function rejectInvalidAnchorAsset(assetId, blockOrdinal) {
    throw new HarnessError('ARTICLE_ASSET_MISMATCH', `X Article inline visual asset ID is unsafe at block ordinal ${blockOrdinal}`, { asset_id: assetId, block_ordinal: blockOrdinal });
}
function rejectDuplicateAnchorAsset(assetId, blockOrdinal) {
    throw new HarnessError('ARTICLE_ASSET_MISMATCH', `X Article inline visual asset is duplicated at block ordinal ${blockOrdinal}`, { asset_id: assetId, block_ordinal: blockOrdinal });
}
export function createXArticleImportTemplate(document) {
    const seenAssetIds = new Set();
    const anchors = [];
    const blocks = document.blocks.map((block, index) => {
        if (block.kind !== 'image')
            return block;
        const blockOrdinal = index + 1;
        if (!SAFE_ASSET_ID.test(block.asset_id)) {
            rejectInvalidAnchorAsset(block.asset_id, blockOrdinal);
        }
        if (seenAssetIds.has(block.asset_id)) {
            rejectDuplicateAnchorAsset(block.asset_id, blockOrdinal);
        }
        seenAssetIds.add(block.asset_id);
        const anchorId = `anchor_${block.asset_id}_${blockOrdinal}`;
        const marker = `RPH_VISUAL_ANCHOR:${block.asset_id}:${blockOrdinal}`;
        const anchor = {
            anchor_id: anchorId,
            asset_id: block.asset_id,
            block_ordinal: blockOrdinal,
            marker
        };
        anchors.push(anchor);
        return { kind: 'visual_anchor', anchor_id: anchorId, marker };
    });
    const sourceDocumentDigest = sha256(document);
    const withoutTemplateDigest = {
        schema_version: '1.0',
        source_document_digest: sourceDocumentDigest,
        blocks,
        anchors
    };
    return {
        ...withoutTemplateDigest,
        template_digest: sha256(withoutTemplateDigest)
    };
}
//# sourceMappingURL=article-import-template.js.map