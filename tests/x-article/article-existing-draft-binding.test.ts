import { describe, expect, it } from 'vitest';

import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  computeXArticleExistingDraftRevision,
  createXArticleExistingDraftBinding,
  verifyXArticleExistingDraftBinding
} from '../../harnesses/research-publishing/core/x-article-existing-draft-binding.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { computeXArticlePageRevision } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';

const inlineAsset = {
  asset_id: 'asset_runtime_boundary', relative_path: 'assets/runtime-boundary.png',
  digest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`, mime_type: 'image/png' as const,
  alt_text: 'Runtime boundary diagram', claim_refs: ['claim_runtime']
};
const publicationPlan = createXArticlePublicationPlan({
  planId: 'plan_existing_body', runId: 'run_existing_body', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/existing-body', digest: `sha256:${'b'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: null,
    blocks: [
      { kind: 'paragraph', runs: [{ text: 'Skills own semantics.', marks: [], link: null }] },
      { kind: 'image', asset_id: inlineAsset.asset_id, alt_text: inlineAsset.alt_text }
    ]
  },
  visuals: [{ asset: inlineAsset, placement: { kind: 'block', block_ordinal: 2 } }],
  plannedAt: '2026-08-27T05:55:00.000Z', provenance: {}
});

function observation(plan: typeof publicationPlan) {
  const template = createXArticleImportTemplate(plan.intent.document);
  const body = {
    schema_version: '1.0' as const,
    observation_id: 'obs_existing_body',
    execution_id: 'source_execution',
    command_id: 'source_command',
    origin: 'https://x.com' as const,
    canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
    observed_at: '2026-08-27T05:56:04.000Z',
    account_handle: '@Glen56121',
    page_kind: 'article_editor' as const,
    controls: [],
    editor: {
      draft_id: '2092851979932647424',
      title: plan.intent.document.title,
      blocks: plan.intent.document.blocks.filter((block) => block.kind !== 'image'),
      visuals: [],
      import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: template.anchors
      },
      has_unknown_content: false,
      autosave_state: 'saved' as const
    },
    preview: null,
    publish_review: null,
    public_article: null
  };
  return { ...body, page_revision: computeXArticlePageRevision(body) };
}

function resign(value: ReturnType<typeof observation>) {
  const { page_revision: _pageRevision, ...body } = value;
  return { ...body, page_revision: computeXArticlePageRevision(body) };
}

describe('X Article existing Draft binding', () => {
  it('locks an exact body-complete zero-media Draft', () => {
    const plan = publicationPlan;
    const observed = observation(plan);
    const binding = createXArticleExistingDraftBinding({ publication_plan: plan, observation: observed });
    expect(binding).toMatchObject({
      schema_version: 'x-article-existing-draft-binding/v1',
      mode: 'adopt_existing',
      draft_id: '2092851979932647424',
      expected_account: '@Glen56121',
      expected_editor_revision: computeXArticleExistingDraftRevision(observed),
      expected_cover_count: 0,
      expected_inline_media_count: 0
    });
    expect(binding.binding_digest).toBe(sha256(
      Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'binding_digest'))
    ));
    expect(verifyXArticleExistingDraftBinding(binding, plan, observed)).toEqual(binding);
  });

  it.each([
    ['account', (value: any) => ({ ...value, account_handle: '@Foreign' })],
    ['draft', (value: any) => ({ ...value, editor: { ...value.editor, draft_id: '2090000000000000000' } })],
    ['title', (value: any) => ({ ...value, editor: { ...value.editor, title: 'Changed' } })],
    ['body', (value: any) => ({ ...value, editor: { ...value.editor, blocks: [] } })],
    ['anchors', (value: any) => ({ ...value, editor: { ...value.editor, import_state: null } })],
    ['cover', (value: any) => ({ ...value, editor: { ...value.editor, visuals: [{
      ref: 'cover', asset_id: 'cover', kind: 'cover', block_ordinal: null,
      alt_text: null, status: 'uploaded', owned_by_execution: false
    }] } })],
    ['unknown', (value: any) => ({ ...value, editor: { ...value.editor, has_unknown_content: true } })],
    ['saving', (value: any) => ({ ...value, editor: { ...value.editor, autosave_state: 'saving' } })]
  ])('rejects %s drift before binding', (_name, mutate) => {
    const plan = publicationPlan;
    expect(() => createXArticleExistingDraftBinding({
      publication_plan: plan,
      observation: resign(mutate(observation(plan)))
    })).toThrowError(/existing X Article Draft/i);
  });
});
