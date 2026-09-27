import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  extractXArticleEditorSnapshot,
  extractXArticleIndexSnapshot,
  normalizeXArticleIndexProbe,
  normalizeXArticleEditorProbe
} from '../../skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs';

const probe = JSON.parse(await readFile(
  resolve('tests/fixtures/x-article/editor-dom-probe-v1.json'),
  'utf8'
));

function cloneProbe() {
  return structuredClone(probe);
}

describe('bounded X Article editor extraction', () => {
  it('ignores only empty media-adjacent spacer paragraphs when computing ordinals', () => {
    const changed = cloneProbe();
    const media = { ref: 'inline-1', block_ordinal: 1, alt_text: 'Diagram', status: 'uploaded' };
    const spacer = { parent_tag: 'DIV', parent_class: 'longform-unstyled', runs: [], has_unknown_content: false };
    changed.media = [media];
    changed.composers[0].blocks = [
      { parent_tag: 'FIGURE', parent_class: 'longform-atomic', runs: [], media },
      spacer,
      { parent_tag: 'DIV', parent_class: 'longform-unstyled', runs: [{ text: 'RPH_VISUAL_ANCHOR:asset-next:2', bold: false, italic: false, link: null }] }
    ];
    expect(normalizeXArticleEditorProbe(changed).editor.blocks).toHaveLength(2);
    changed.composers[0].blocks[1] = { ...spacer, runs: [{ text: 'Do not discard me', bold: false, italic: false, link: null }] };
    expect(() => normalizeXArticleEditorProbe(changed)).toThrow(/anchor ordinal/);
  });
  it('exposes the observed unique title textarea to the title transaction', () => {
    expect(normalizeXArticleEditorProbe(probe).controls).toContainEqual({
      ref: 'role:textbox|name:Add a title', role: 'textbox', name: 'Add a title',
      test_id: null, disabled: false
    });
  });
  it('observes a newly created draft with an empty title and body', () => {
    const changed = cloneProbe();
    changed.title_controls[0].value = '';
    changed.composers[0].blocks = [];
    changed.media = [];
    expect(normalizeXArticleEditorProbe(changed).editor).toMatchObject({
      draft_id: '2093554993261654016', title: '', blocks: [], cover: null
    });
  });

  it.each([null, undefined, 42])('rejects a non-string title: %s', (value) => {
    const changed = cloneProbe();
    changed.title_controls[0].value = value;
    expect(() => normalizeXArticleEditorProbe(changed)).toThrow(/X Article title must be a string/);
  });

  it('groups DraftJS list rows and preserves marks, links, and exact anchors', () => {
    const snapshot = normalizeXArticleEditorProbe(probe);

    expect(snapshot).toMatchObject({
      schema_version: 'x-article-host-page-snapshot/v1',
      canonical_url: probe.canonical_url,
      account_handle: '@Glen56121',
      page_kind: 'article_editor',
      controls: [
        {
          ref: 'role:button|name:Add Media',
          role: 'button',
          name: 'Add Media',
          test_id: null,
          disabled: false
        },
        {
          ref: 'role:button|name:Publish',
          role: 'button',
          name: 'Publish',
          test_id: null,
          disabled: false
        },
        {
          ref: 'role:textbox|name:Add a title', role: 'textbox', name: 'Add a title',
          test_id: null, disabled: false
        }
      ],
      editor: {
        draft_id: '2093554993261654016',
        title: 'From Skill Memory to Shared Agent Knowledge',
        cover: null,
        autosave_state: 'saved',
        has_unknown_content: false
      }
    });
    expect(snapshot.editor.blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'Opening.', marks: ['italic'], link: null }] },
      { kind: 'heading', runs: [{ text: 'Boundary', marks: [], link: null }] },
      {
        kind: 'bullet_list',
        items: [
          [{ text: 'First item', marks: [], link: null }],
          [{ text: 'Second item', marks: ['bold'], link: null }]
        ]
      },
      { kind: 'quote', runs: [{ text: 'Runtime boundary.', marks: [], link: null }] },
      {
        kind: 'visual_anchor',
        marker: 'RPH_VISUAL_ANCHOR:asset-architecture-runtime-boundary:5'
      },
      {
        kind: 'paragraph',
        runs: [{
          text: 'Repository',
          marks: [],
          link: 'https://github.com/example/runtime'
        }]
      },
      {
        kind: 'visual_anchor',
        marker: 'RPH_VISUAL_ANCHOR:asset-process-consumer-agent-connection:7'
      },
      { kind: 'paragraph', runs: [{ text: 'Closing.', marks: [], link: null }] },
      {
        kind: 'visual_anchor',
        marker: 'RPH_VISUAL_ANCHOR:asset-comparison-knowledge-vs-context:9'
      }
    ]);
  });

  it('groups consecutive ordered rows and assigns media its canonical ordinal', () => {
    const changed = cloneProbe();
    const blocks = changed.composers[0].blocks;
    blocks[2].parent_class = blocks[2].parent_class
      .replaceAll('unordered', 'ordered')
      .replaceAll('Unordered', 'Ordered');
    blocks[3].parent_class = blocks[3].parent_class
      .replaceAll('unordered', 'ordered')
      .replaceAll('Unordered', 'Ordered');
    const media = {
      ref: 'inline-media-5',
      block_ordinal: 5,
      alt_text: 'Runtime architecture boundary',
      status: 'uploaded'
    };
    blocks.splice(4, 0, {
      parent_tag: 'FIGURE',
      parent_class: 'longform-atomic',
      runs: [],
      media
    });
    changed.media = [media];
    blocks[6].runs[0].text = 'RPH_VISUAL_ANCHOR:asset-architecture-runtime-boundary:6';
    blocks[8].runs[0].text = 'RPH_VISUAL_ANCHOR:asset-process-consumer-agent-connection:8';
    blocks[10].runs[0].text = 'RPH_VISUAL_ANCHOR:asset-comparison-knowledge-vs-context:10';

    const snapshot = normalizeXArticleEditorProbe(changed);

    expect(snapshot.editor.blocks[2]).toMatchObject({ kind: 'ordered_list' });
    expect(snapshot.editor.blocks[3]).toEqual({
      kind: 'media',
      ref: 'inline-media-5',
      block_ordinal: 4,
      alt_text: 'Runtime architecture boundary',
      status: 'uploaded'
    });
  });

  it('normalizes the unobservable cover Alt value to null', () => {
    const changed = cloneProbe();
    changed.media = [{
      kind: 'cover',
      ref: 'cover-media',
      block_ordinal: 1,
      alt_text: '',
      status: 'uploaded'
    }];

    expect(normalizeXArticleEditorProbe(changed).editor.cover).toEqual({
      ref: 'cover-media',
      alt_text: null,
      status: 'uploaded'
    });
  });

  it('rejects ambiguous identity, unsupported block classes, and foreign top-level keys', () => {
    expect(() => normalizeXArticleEditorProbe({ ...probe, title_controls: [] }))
      .toThrow(/title/i);
    expect(() => normalizeXArticleEditorProbe({
      ...probe,
      composers: [...probe.composers, probe.composers[0]]
    })).toThrow(/composer/i);

    const unsupportedBlock = cloneProbe();
    unsupportedBlock.composers[0].blocks[0].parent_class = 'unknown-editor-block';
    expect(() => normalizeXArticleEditorProbe(unsupportedBlock)).toThrow(/block class/i);

    expect(() => normalizeXArticleEditorProbe({ ...probe, cookies: ['forbidden'] }))
      .toThrow(/unexpected snapshot key/i);
  });

  it('fails closed on a marker whose ordinal does not match the canonical block order', () => {
    const changed = cloneProbe();
    changed.composers[0].blocks[5].runs[0].text =
      'RPH_VISUAL_ANCHOR:asset-architecture-runtime-boundary:6';

    expect(() => normalizeXArticleEditorProbe(changed)).toThrow(/anchor ordinal/i);
  });

  it('marks unsupported nested editor data instead of silently claiming complete content', () => {
    const changed = cloneProbe();
    changed.composers[0].blocks[0].runs[0].underline = true;

    expect(normalizeXArticleEditorProbe(changed).editor.has_unknown_content).toBe(true);
  });

  it('evaluates one read-only page function without Node or browser-storage dependencies', async () => {
    let evaluations = 0;
    let pageFunctionText = '';
    const tab = {
      playwright: {
        evaluate: async (pageFunction) => {
          evaluations += 1;
          pageFunctionText = String(pageFunction);
          return probe;
        }
      }
    };

    await expect(extractXArticleEditorSnapshot({ tab })).resolves.toMatchObject({
      canonical_url: probe.canonical_url,
      editor: { title: 'From Skill Memory to Shared Agent Knowledge' }
    });
    expect(evaluations).toBe(1);
    expect(pageFunctionText).toContain('textarea[placeholder="Add a title"]');
    expect(pageFunctionText).toContain('[data-testid="composer"][contenteditable="true"]');
    expect(pageFunctionText).toContain('[data-block="true"]');
    expect(pageFunctionText).toContain('{ ...block.media }');
    expect(pageFunctionText).toContain("closest('[role=\"group\"][aria-label]')");
    expect(pageFunctionText).not.toMatch(/\bprocess\b|localStorage|sessionStorage|cookie/i);
  });

  it('reads outer block semantics and nested X link runs from the live DraftJS editor', async () => {
    const link = {
      getAttribute: (name) => name === 'href' ? 'https://example.com/reference' : null
    };
    const run = {
      textContent: 'Opening.',
      getAttribute: (name) => name === 'style' ? '' : null,
      closest: (selector) => selector === 'a[href]' ? link : null
    };
    const innerBlock = {
      tagName: 'DIV',
      className: 'public-DraftStyleDefault-block public-DraftStyleDefault-ltr',
      textContent: 'Opening.',
      querySelectorAll: (selector) => selector === 'span[data-offset-key]' ? [run] : []
    };
    const container = {
      tagName: 'DIV',
      className: 'longform-unstyled',
      textContent: 'Opening.',
      children: [innerBlock],
      querySelector: (selector) => selector === '.public-DraftStyleDefault-block'
        ? innerBlock
        : null
    };
    const composer = {
      getAttribute: (name) => ({
        'data-testid': 'composer',
        role: 'textbox',
        contenteditable: 'true'
      })[name] ?? null,
      querySelectorAll: (selector) => selector === '[data-block="true"]' ? [container] : []
    };
    const title = {
      tagName: 'TEXTAREA',
      value: 'From Skill Memory to Shared Agent Knowledge',
      getAttribute: (name) => name === 'placeholder' ? 'Add a title' : null
    };
    const profile = {
      getAttribute: (name) => name === 'href' ? '/Glen56121' : null
    };
    const documentBefore = globalThis.document;
    const locationBefore = globalThis.location;
    globalThis.document = {
      querySelectorAll: (selector) => {
        if (selector === 'textarea[placeholder="Add a title"]') return [title];
        if (selector === '[data-testid="composer"][contenteditable="true"]') return [composer];
        if (selector === 'span,div') return [{ textContent: 'Last saved just now' }];
        return [];
      },
      querySelector: (selector) => selector === 'a[data-testid="AppTabBar_Profile_Link"]'
        ? profile
        : null
    };
    globalThis.location = {
      href: 'https://x.com/compose/articles/edit/2093554993261654016'
    };
    const tab = { playwright: { evaluate: async (pageFunction) => pageFunction() } };

    try {
      await expect(extractXArticleEditorSnapshot({ tab })).resolves.toMatchObject({
        editor: {
          blocks: [{
            kind: 'paragraph',
            runs: [{
              text: 'Opening.',
              marks: [],
              link: 'https://example.com/reference'
            }]
          }]
        },
      controls: [{
        ref: 'testid:composer',
        role: 'textbox',
        name: '',
        test_id: 'composer'
      }, {
        ref: 'role:textbox|name:Add a title', role: 'textbox', name: 'Add a title', test_id: null
      }]
      });
    } finally {
      if (documentBefore === undefined) delete globalThis.document;
      else globalThis.document = documentBefore;
      if (locationBefore === undefined) delete globalThis.location;
      else globalThis.location = locationBefore;
    }
  });
});

describe('bounded X Articles index extraction', () => {
  const indexProbe = {
    canonical_url: 'https://x.com/compose/articles',
    account_handle: '@Glen56121',
    controls: [{
      role: 'button',
      name: 'Create',
      test_id: null,
      disabled: false
    }]
  };

  it('normalizes the unique create control into the page contract', () => {
    expect(normalizeXArticleIndexProbe(indexProbe)).toEqual({
      schema_version: 'x-article-host-page-snapshot/v1',
      canonical_url: 'https://x.com/compose/articles',
      account_handle: '@Glen56121',
      page_kind: 'articles_index',
      controls: [{
        ref: 'role:button|name:Create',
        role: 'button',
        name: 'create',
        test_id: null,
        disabled: false
      }]
    });
  });

  it('evaluates one read-only index page function', async () => {
    let pageFunctionText = '';
    const tab = {
      playwright: {
        evaluate: async (pageFunction) => {
          pageFunctionText = String(pageFunction);
          return indexProbe;
        }
      }
    };

    await expect(extractXArticleIndexSnapshot({ tab })).resolves.toMatchObject({
      page_kind: 'articles_index',
      controls: [{ name: 'create' }]
    });
    expect(pageFunctionText).toContain('compose/articles');
    expect(pageFunctionText).not.toMatch(/localStorage|sessionStorage|cookie/i);
  });
});
