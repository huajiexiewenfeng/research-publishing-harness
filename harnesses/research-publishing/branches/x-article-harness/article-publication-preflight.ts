import { sha256 } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
import { validateContract } from '../../core/schema-validator.js';
import type { VisualAssetRef } from '../../core/types.js';
import type { XArticleVisualBindingV1 } from '../../core/x-article-publication-plan.js';
import type {
  XArticleBlockV1,
  XArticleDocumentV1
} from './article-document.js';

export interface XArticleEditorialRemovalV1 {
  readonly block_ordinal: number;
  readonly block_digest: `sha256:${string}`;
  readonly text: string;
  readonly reason: 'draft_status' | 'evidence_review_date';
}

export interface XArticlePublicationPreflightV1 {
  readonly schema_version: 'x-article-publication-preflight/v1';
  readonly source_document_digest: `sha256:${string}`;
  readonly sanitized_document: XArticleDocumentV1;
  readonly sanitized_document_digest: `sha256:${string}`;
  readonly removals: readonly XArticleEditorialRemovalV1[];
  readonly cover: {
    readonly asset_id: string;
    readonly asset_digest: `sha256:${string}`;
    readonly alt_text: string;
  };
  readonly inline_assets: readonly {
    readonly asset_id: string;
    readonly block_ordinal: number;
    readonly asset_digest: `sha256:${string}`;
    readonly alt_text: string;
  }[];
  readonly preflight_digest: `sha256:${string}`;
}

export interface CreateXArticlePublicationPreflightInput {
  readonly document: XArticleDocumentV1;
  readonly visuals: readonly XArticleVisualBindingV1[];
}

function preflightDigestBody(
  preflight: XArticlePublicationPreflightV1
): Omit<XArticlePublicationPreflightV1, 'preflight_digest'> {
  const { preflight_digest: _preflightDigest, ...body } = preflight;
  void _preflightDigest;
  return body;
}

const KNOWN_DRAFT_STATUS = /^Status:\s*X Article Draft(?:\s*\(v\d+(?:\.\d+)*\))?(?:\s*[·•|—-]\s*Derived from a longer evidence note)?(?:\s*[·•|—-]\s*Evidence review date:\s*\d{4}-\d{2}-\d{2})?$/i;
const KNOWN_EVIDENCE_REVIEW_DATE = /^Evidence review date:\s*\d{4}-\d{2}-\d{2}$/i;
const SUSPICIOUS_EDITORIAL_MARKER = /^(?:Status|Evidence review date|Internal note)\s*:/i;

function blockText(block: XArticleBlockV1): string | null {
  if (
    block.kind !== 'heading'
    && block.kind !== 'subheading'
    && block.kind !== 'paragraph'
    && block.kind !== 'quote'
  ) {
    return null;
  }
  return block.runs.map((run) => run.text).join('').trim();
}

function editorialReason(text: string): XArticleEditorialRemovalV1['reason'] | null {
  if (KNOWN_DRAFT_STATUS.test(text)) return 'draft_status';
  if (KNOWN_EVIDENCE_REVIEW_DATE.test(text)) return 'evidence_review_date';
  return null;
}

function requireCover(
  document: XArticleDocumentV1,
  visuals: readonly XArticleVisualBindingV1[]
): VisualAssetRef {
  const covers = visuals.filter((binding) => binding.placement.kind === 'cover');
  if (
    document.cover_asset_id === null
    || covers.length !== 1
    || covers[0]!.asset.asset_id !== document.cover_asset_id
  ) {
    throw new HarnessError(
      'ARTICLE_ASSET_MISMATCH',
      'X Article Fast Path requires exactly one cover bound to the document'
    );
  }
  return covers[0]!.asset;
}

function requireNonEmptyAlt(asset: VisualAssetRef): void {
  if (asset.alt_text.trim().length === 0) {
    throw new HarnessError(
      'ARTICLE_ASSET_MISMATCH',
      `X Article visual ${asset.asset_id} requires non-empty Alt text`
    );
  }
}

function sanitizedBlockOrdinal(
  originalOrdinal: number,
  removals: readonly XArticleEditorialRemovalV1[]
): number {
  return originalOrdinal - removals.filter((removal) => removal.block_ordinal < originalOrdinal).length;
}

function validateInlineBindings(
  document: XArticleDocumentV1,
  visuals: readonly XArticleVisualBindingV1[],
  removals: readonly XArticleEditorialRemovalV1[],
  coverAssetId: string
): XArticlePublicationPreflightV1['inline_assets'] {
  const documentImages = document.blocks.flatMap((block, index) =>
    block.kind === 'image'
      ? [{ block, original_ordinal: index + 1 }]
      : []
  );
  if (documentImages.length > 10) {
    throw new HarnessError(
      'ARTICLE_ASSET_MISMATCH',
      'X Article Fast Path supports at most ten inline images'
    );
  }

  const inlineBindings = visuals.filter((binding) => binding.placement.kind === 'block');
  if (inlineBindings.length !== documentImages.length) {
    throw new HarnessError(
      'ARTICLE_ASSET_MISMATCH',
      'X Article inline visual bindings differ from the document image count'
    );
  }

  const seenAssets = new Set<string>([coverAssetId]);
  return documentImages.map(({ block, original_ordinal }, index) => {
    const binding = inlineBindings[index];
    if (
      binding === undefined
      || binding.placement.kind !== 'block'
      || binding.placement.block_ordinal !== original_ordinal
      || binding.asset.asset_id !== block.asset_id
      || binding.asset.alt_text !== block.alt_text
      || seenAssets.has(binding.asset.asset_id)
    ) {
      throw new HarnessError(
        'ARTICLE_ASSET_MISMATCH',
        'X Article inline visual identity, order, placement, or Alt differs from the document'
      );
    }
    seenAssets.add(binding.asset.asset_id);
    requireNonEmptyAlt(binding.asset);
    return {
      asset_id: binding.asset.asset_id,
      block_ordinal: sanitizedBlockOrdinal(original_ordinal, removals),
      asset_digest: binding.asset.digest,
      alt_text: binding.asset.alt_text
    };
  });
}

export function createXArticlePublicationPreflight(
  input: CreateXArticlePublicationPreflightInput
): XArticlePublicationPreflightV1 {
  const document = validateContract<XArticleDocumentV1>('x-article-document', structuredClone(input.document));
  const visuals = structuredClone(input.visuals);
  for (const binding of visuals) {
    validateContract<VisualAssetRef>('visual-asset-ref', binding.asset);
  }

  const cover = requireCover(document, visuals);
  requireNonEmptyAlt(cover);
  const removals: XArticleEditorialRemovalV1[] = [];
  const sanitizedBlocks: XArticleBlockV1[] = [];

  document.blocks.forEach((block, index) => {
    const text = block.kind === 'paragraph' ? blockText(block) : null;
    const reason = text === null ? null : editorialReason(text);
    if (text !== null && reason !== null) {
      removals.push({
        block_ordinal: index + 1,
        block_digest: sha256(block),
        text,
        reason
      });
      return;
    }
    if (text !== null && SUSPICIOUS_EDITORIAL_MARKER.test(text)) {
      throw new HarnessError(
        'ARTICLE_PREFLIGHT_REVIEW_REQUIRED',
        `X Article paragraph ${index + 1} contains an unknown editorial marker`
      );
    }
    sanitizedBlocks.push(block);
  });

  const sanitizedDocument: XArticleDocumentV1 = {
    ...document,
    blocks: sanitizedBlocks
  };
  if (!sanitizedBlocks.some((block) => block.kind !== 'image')) {
    throw new HarnessError(
      'ARTICLE_PREFLIGHT_REVIEW_REQUIRED',
      'X Article has no publishable body after editorial metadata removal'
    );
  }
  const inlineAssets = validateInlineBindings(document, visuals, removals, cover.asset_id);
  const body: Omit<XArticlePublicationPreflightV1, 'preflight_digest'> = {
    schema_version: 'x-article-publication-preflight/v1',
    source_document_digest: sha256(document),
    sanitized_document: sanitizedDocument,
    sanitized_document_digest: sha256(sanitizedDocument),
    removals,
    cover: {
      asset_id: cover.asset_id,
      asset_digest: cover.digest,
      alt_text: cover.alt_text
    },
    inline_assets: inlineAssets
  };
  return validateContract<XArticlePublicationPreflightV1>('x-article-publication-preflight', {
    ...body,
    preflight_digest: sha256(body)
  });
}

export function assertXArticlePublicationPreflight(
  preflight: XArticlePublicationPreflightV1
): void {
  validateContract<XArticlePublicationPreflightV1>('x-article-publication-preflight', preflight);
  validateContract<XArticleDocumentV1>('x-article-document', preflight.sanitized_document);
  const documentImages = preflight.sanitized_document.blocks.flatMap((block, index) =>
    block.kind === 'image'
      ? [{ asset_id: block.asset_id, block_ordinal: index + 1, alt_text: block.alt_text }]
      : []
  );
  const inlineImages = preflight.inline_assets.map((asset) => ({
    asset_id: asset.asset_id,
    block_ordinal: asset.block_ordinal,
    alt_text: asset.alt_text
  }));
  const removalOrdinals = preflight.removals.map((removal) => removal.block_ordinal);
  const valid =
    preflight.sanitized_document_digest === sha256(preflight.sanitized_document)
    && preflight.preflight_digest === sha256(preflightDigestBody(preflight))
    && preflight.sanitized_document.cover_asset_id === preflight.cover.asset_id
    && sha256(documentImages) === sha256(inlineImages)
    && new Set([
      preflight.cover.asset_id,
      ...preflight.inline_assets.map((asset) => asset.asset_id)
    ]).size === preflight.inline_assets.length + 1
    && removalOrdinals.every((ordinal, index) => index === 0 || ordinal > removalOrdinals[index - 1]!);
  if (!valid) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'X Article publication preflight is internally inconsistent'
    );
  }
}
