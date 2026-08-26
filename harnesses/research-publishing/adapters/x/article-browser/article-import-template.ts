import { HarnessError } from '../../../core/errors.js';
import { sha256 } from '../../../core/digest.js';
import type {
  XArticleBlockV1,
  XArticleDocumentV1
} from '../../../branches/x-article-harness/article-document.js';

export type XArticleImportTemplateBlockV1 =
  | Exclude<XArticleBlockV1, { readonly kind: 'image' }>
  | {
      readonly kind: 'visual_anchor';
      readonly anchor_id: string;
      readonly marker: string;
    };

export interface XArticleVisualAnchorV1 {
  readonly anchor_id: string;
  readonly asset_id: string;
  readonly block_ordinal: number;
  readonly marker: string;
}

export interface XArticleImportTemplateV1 {
  readonly schema_version: '1.0';
  readonly source_document_digest: string;
  readonly blocks: readonly XArticleImportTemplateBlockV1[];
  readonly anchors: readonly XArticleVisualAnchorV1[];
  readonly template_digest: string;
}

const SAFE_ASSET_ID = /^[A-Za-z0-9_-]+$/;

function rejectInvalidAnchorAsset(assetId: string, blockOrdinal: number): never {
  throw new HarnessError(
    'ARTICLE_ASSET_MISMATCH',
    `X Article inline visual asset ID is unsafe at block ordinal ${blockOrdinal}`,
    { asset_id: assetId, block_ordinal: blockOrdinal }
  );
}

function rejectDuplicateAnchorAsset(assetId: string, blockOrdinal: number): never {
  throw new HarnessError(
    'ARTICLE_ASSET_MISMATCH',
    `X Article inline visual asset is duplicated at block ordinal ${blockOrdinal}`,
    { asset_id: assetId, block_ordinal: blockOrdinal }
  );
}

export function createXArticleImportTemplate(
  document: XArticleDocumentV1
): XArticleImportTemplateV1 {
  const seenAssetIds = new Set<string>();
  const anchors: XArticleVisualAnchorV1[] = [];
  const blocks: XArticleImportTemplateBlockV1[] = document.blocks.map((block, index) => {
    if (block.kind !== 'image') return block;

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
    const anchor: XArticleVisualAnchorV1 = {
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
    schema_version: '1.0' as const,
    source_document_digest: sourceDocumentDigest,
    blocks,
    anchors
  };
  return {
    ...withoutTemplateDigest,
    template_digest: sha256(withoutTemplateDigest)
  };
}
