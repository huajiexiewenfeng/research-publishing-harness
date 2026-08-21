import { computeXArticlePageRevision } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';

export const plannedArticleDocument = {
  schema_version: '1.0',
  title: 'Runtime boundary',
  cover_asset_id: null,
  blocks: [{
    kind: 'paragraph',
    runs: [{ text: 'Skills own semantics.', marks: [], link: null }]
  }]
} as const;

function observation(overrides: Record<string, unknown> = {}) {
  const input = {
    schema_version: '1.0',
    observation_id: 'article_obs_1',
    execution_id: 'article_exec_1',
    command_id: 'article_command_1',
    origin: 'https://x.com',
    canonical_url: 'https://x.com/compose/articles/edit/2090731994279755776',
    observed_at: '2026-08-21T09:00:00.000Z',
    account_handle: '@Glen56121',
    page_kind: 'article_editor',
    controls: [
      { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
      { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
      { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
      { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: true }
    ],
    editor: {
      draft_id: '2090731994279755776', title: '', blocks: [], visuals: [],
      import_state: null, has_unknown_content: false, autosave_state: 'saved'
    },
    preview: null,
    publish_review: null,
    public_article: null,
    ...overrides
  } as const;
  return { ...input, page_revision: computeXArticlePageRevision(input) };
}

export const emptyArticleEditor = observation();

export const populatedArticleEditor = observation({
  observation_id: 'article_obs_2',
  editor: {
    draft_id: '2090731994279755776',
    title: plannedArticleDocument.title,
    blocks: plannedArticleDocument.blocks,
    visuals: [],
    import_state: null,
    has_unknown_content: false,
    autosave_state: 'saved'
  },
  controls: [
    { ref: 'title', role: 'textbox', name: 'Add a title', test_id: null, disabled: false },
    { ref: 'body', role: 'textbox', name: '', test_id: 'composer', disabled: false },
    { ref: 'preview', role: 'link', name: 'Preview', test_id: null, disabled: false },
    { ref: 'publish', role: 'button', name: 'Publish', test_id: null, disabled: false }
  ]
});

export const unknownArticleDraft = observation({
  observation_id: 'article_obs_3',
  editor: {
    draft_id: '2090731994279755776', title: 'Human draft', blocks: [], visuals: [],
    import_state: null, has_unknown_content: true, autosave_state: 'saved'
  }
});
