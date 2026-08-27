import type {
  XArticleBlockV1,
  XArticleDocumentV1
} from '../../../branches/x-article-harness/article-document.js';
import { sha256 } from '../../../core/digest.js';
import { HarnessError } from '../../../core/errors.js';
import { validateContract } from '../../../core/schema-validator.js';
import type {
  XArticleEditorObservation,
  XArticleVisualObservation
} from './article-browser-protocol.js';
import type {
  XArticleImportTemplateV1,
  XArticleVisualAnchorV1
} from './article-import-template.js';

export type XArticleHostEditorBlockV1 =
  | XArticleBlockV1
  | {
      readonly kind: 'visual_anchor';
      readonly anchor_id: string;
      readonly marker: string;
    };

export interface XArticleHostEditorSnapshotV1 {
  readonly draft_id: string;
  readonly title: string;
  readonly blocks: readonly XArticleHostEditorBlockV1[];
  readonly visuals: readonly XArticleVisualObservation[];
  readonly has_unknown_content: boolean;
  readonly autosave_state: XArticleEditorObservation['autosave_state'];
}

function rejectAnchor(message: string): never {
  throw new HarnessError('ARTICLE_DRAFT_CONFLICT', message);
}

function assertTemplate(template: XArticleImportTemplateV1): void {
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

function assertAnchor(
  actual: Extract<XArticleHostEditorBlockV1, { readonly kind: 'visual_anchor' }>,
  expected: XArticleVisualAnchorV1 | undefined,
  observedOrdinal: number
): XArticleVisualAnchorV1 {
  if (
    expected === undefined
    || actual.anchor_id !== expected.anchor_id
    || actual.marker !== expected.marker
    || expected.block_ordinal !== observedOrdinal
  ) {
    rejectAnchor('X Article Host observed a foreign, reordered, or misplaced visual anchor');
  }
  return expected;
}

export function normalizeXArticleHostEditor(input: {
  readonly editor: XArticleHostEditorSnapshotV1;
  readonly template: XArticleImportTemplateV1;
}): XArticleEditorObservation {
  assertTemplate(input.template);
  const blocks: XArticleBlockV1[] = [];
  const unresolved: XArticleVisualAnchorV1[] = [];
  const seenAnchorIds = new Set<string>();

  for (const block of input.editor.blocks) {
    if (block.kind !== 'visual_anchor') {
      blocks.push(structuredClone(block));
      continue;
    }
    if (seenAnchorIds.has(block.anchor_id)) {
      rejectAnchor('X Article Host observed a duplicate visual anchor');
    }
    const expected = input.template.anchors.find((anchor) => anchor.anchor_id === block.anchor_id);
    const anchor = assertAnchor(
      block,
      expected,
      blocks.length + unresolved.length + 1
    );
    seenAnchorIds.add(anchor.anchor_id);
    unresolved.push(structuredClone(anchor));
  }

  const expectedSuffix = input.template.anchors.slice(
    input.template.anchors.length - unresolved.length
  );
  if (sha256(unresolved) !== sha256(expectedSuffix)) {
    rejectAnchor('X Article Host unresolved visual anchors are not the planned suffix');
  }

  const canonical = validateContract<XArticleDocumentV1>('x-article-document', {
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
