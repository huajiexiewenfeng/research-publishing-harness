import { describe, expect, it } from 'vitest';

import { compileXArticleDocument } from '../../harnesses/research-publishing/branches/x-article-harness/article-compiler.js';

const cover = {
  asset: {
    asset_id: 'cover_runtime',
    relative_path: 'assets/cover.png',
    digest: `sha256:${'a'.repeat(64)}`,
    mime_type: 'image/png',
    alt_text: 'Skill and Runtime boundary',
    claim_refs: ['claim_boundary']
  },
  placement: { kind: 'cover' as const }
} as const;

const architecture = {
  asset: {
    asset_id: 'runtime_architecture',
    relative_path: 'assets/runtime.png',
    digest: `sha256:${'b'.repeat(64)}`,
    mime_type: 'image/png',
    alt_text: 'Runtime architecture',
    claim_refs: ['claim_boundary']
  },
  placement: { kind: 'after_section' as const, section_id: 'runtime' }
} as const;

describe('compileXArticleDocument', () => {
  it('preserves inline code and its delimiters as literal text without parsing its markup', () => {
    const code = '`submitted * [literal](https://example.com) <tag> ~~`';
    const document = compileXArticleDocument({ markdown: `# Code\n\nState: ${code}. **Review** next.\n\n- Call \`submit\`.`, visuals: [] });
    expect(document.blocks).toEqual([
      { kind: 'paragraph', runs: [
        { text: `State: ${code}. `, marks: [], link: null },
        { text: 'Review', marks: ['bold'], link: null },
        { text: ' next.', marks: [], link: null }
      ] },
      { kind: 'bullet_list', items: [[{ text: 'Call `submit`.', marks: [], link: null }]] }
    ]);
  });

  it('keeps inline code literal inside bold text', () => {
    const document = compileXArticleDocument({ markdown: '# Code\n\n**State `submitted`**', visuals: [] });
    expect(document.blocks).toEqual([{ kind: 'paragraph', runs: [{ text: 'State `submitted`', marks: ['bold'], link: null }] }]);
  });

  it.each(['Unclosed `submitted', 'Empty `` span'])('rejects malformed inline code: %s', text => {
    expect(() => compileXArticleDocument({ markdown: `# Code\n\n${text}`, visuals: [] }))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_FORMAT_UNSUPPORTED' }));
  });

  const headingVisual = {
    ...architecture,
    placement: { kind: 'after_heading' as const, heading_id: 'runtime', heading_text: 'Runtime' }
  };
  const sections = [{ section_id: 'runtime', heading: 'Runtime' }];

  it('accepts an explicitly bound image immediately after its heading', () => {
    const document = compileXArticleDocument({
      markdown: '# T\n\n## Runtime\n\n![Runtime architecture](assets/runtime.png)\n\nBody.',
      sections,
      visuals: [headingVisual]
    });
    expect(document.blocks.map((block) => block.kind)).toEqual(['heading', 'image', 'paragraph']);
  });

  it('rejects a heading-bound image placed at the end of its section', () => {
    expect(() => compileXArticleDocument({
      markdown: '# T\n\n## Runtime\n\nBody.\n\n![Runtime architecture](assets/runtime.png)',
      sections,
      visuals: [headingVisual]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it.each([
    ['missing heading', '# T\n\n![Runtime architecture](assets/runtime.png)'],
    ['changed heading text', '# T\n\n## Other\n\n![Runtime architecture](assets/runtime.png)'],
    ['undeclared duplicate heading', '# T\n\n## Runtime\n\n## Runtime\n\n![Runtime architecture](assets/runtime.png)']
  ])('rejects %s instead of guessing placement', (_name, markdown) => {
    expect(() => compileXArticleDocument({ markdown, sections, visuals: [headingVisual] }))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('rejects an unknown heading ID even when its text exists', () => {
    expect(() => compileXArticleDocument({
      markdown: '# T\n\n## Runtime\n\n![Runtime architecture](assets/runtime.png)',
      sections: [{ section_id: 'other', heading: 'Runtime' }],
      visuals: [headingVisual]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('resolves duplicate heading texts using explicit source section IDs', () => {
    const document = compileXArticleDocument({
      markdown: '# T\n\n## Runtime\n\nFirst.\n\n## Runtime\n\n![Runtime architecture](assets/runtime.png)\n\nSecond.',
      sections: [{ section_id: 'first', heading: 'Runtime' }, ...sections],
      visuals: [headingVisual]
    });
    expect(document.blocks[3]).toMatchObject({ kind: 'image', asset_id: architecture.asset.asset_id });
    expect(() => compileXArticleDocument({
      markdown: '# T\n\n## Runtime\n\n![Runtime architecture](assets/runtime.png)\n\nFirst.\n\n## Runtime\n\nSecond.',
      sections: [{ section_id: 'first', heading: 'Runtime' }, ...sections],
      visuals: [headingVisual]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('rejects duplicate source section IDs', () => {
    expect(() => compileXArticleDocument({
      markdown: '# T\n\n## Runtime\n\n![Runtime architecture](assets/runtime.png)',
      sections: [...sections, ...sections], visuals: [headingVisual]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('accepts a declared image group and rejects its reversed order', () => {
    const second = { ...headingVisual, asset: { ...architecture.asset, asset_id: 'second', relative_path: 'assets/second.png', alt_text: 'Second diagram' } };
    const firstImage = '![Runtime architecture](assets/runtime.png)';
    const secondImage = '![Second diagram](assets/second.png)';
    const compile = (images: string) => compileXArticleDocument({
      markdown: `# T\n\n## Runtime\n\n${images}\n\nBody.`, sections, visuals: [headingVisual, second]
    });
    expect(compile(`${firstImage}\n\n${secondImage}`).blocks.map((block) => block.kind))
      .toEqual(['heading', 'image', 'image', 'paragraph']);
    expect(() => compile(`${secondImage}\n\n${firstImage}`))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('requires source heading identities for the new placement', () => {
    expect(() => compileXArticleDocument({
      markdown: '# T\n\n## Runtime\n\n![Runtime architecture](assets/runtime.png)', visuals: [headingVisual]
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });

  it('supports Chinese heading text without slug guessing', () => {
    expect(compileXArticleDocument({
      markdown: '# 项目知识\n\n## 运行时边界\n\n![Runtime architecture](assets/runtime.png)\n\n正文。',
      sections: [{ section_id: 'runtime', heading: '运行时边界' }],
      visuals: [{ ...architecture, placement: { kind: 'after_heading', heading_id: 'runtime', heading_text: '运行时边界' } }]
    }).blocks.map((block) => block.kind)).toEqual(['heading', 'image', 'paragraph']);
  });

  it('compiles the supported canonical Markdown subset into a stable document', () => {
    expect(compileXArticleDocument({
      markdown: [
        '# Boundary',
        '',
        'A **deterministic** [contract](https://example.com).',
        '',
        '![Skill and Runtime boundary](assets/cover.png)',
        '',
        '## Runtime',
        '',
        '> Skills own meaning.',
        '',
        '- provenance',
        '- path safety',
        '',
        '![Runtime architecture](assets/runtime.png)'
      ].join('\n'),
      visuals: [cover, architecture]
    })).toEqual({
      schema_version: '1.0',
      title: 'Boundary',
      cover_asset_id: 'cover_runtime',
      blocks: [
        {
          kind: 'paragraph',
          runs: [
            { text: 'A ', marks: [], link: null },
            { text: 'deterministic', marks: ['bold'], link: null },
            { text: ' ', marks: [], link: null },
            { text: 'contract', marks: [], link: 'https://example.com' },
            { text: '.', marks: [], link: null }
          ]
        },
        { kind: 'heading', runs: [{ text: 'Runtime', marks: [], link: null }] },
        { kind: 'quote', runs: [{ text: 'Skills own meaning.', marks: [], link: null }] },
        {
          kind: 'bullet_list',
          items: [
            [{ text: 'provenance', marks: [], link: null }],
            [{ text: 'path safety', marks: [], link: null }]
          ]
        },
        { kind: 'image', asset_id: 'runtime_architecture', alt_text: 'Runtime architecture' }
      ]
    });
  });

  it('normalizes CRLF and Unicode without rewriting visible content', () => {
    const composed = 'Caf\u00e9';
    const decomposed = 'Cafe\u0301';
    expect(compileXArticleDocument({
      markdown: `# ${decomposed}\r\n\r\n${decomposed}`,
      visuals: []
    })).toEqual({
      schema_version: '1.0',
      title: composed,
      cover_asset_id: null,
      blocks: [{ kind: 'paragraph', runs: [{ text: composed, marks: [], link: null }] }]
    });
  });

  it.each([
    ['HTML', '# T\n\n<div>unsafe</div>'],
    ['table', '# T\n\n| a | b |\n| - | - |'],
    ['code fence', '# T\n\n```ts\nconst x = 1;\n```'],
    ['nested list', '# T\n\n- first\n  - nested']
  ])('rejects unsupported %s instead of dropping it', (_name, markdown) => {
    expect(() => compileXArticleDocument({ markdown, visuals: [] }))
      .toThrowError(expect.objectContaining({ code: 'ARTICLE_FORMAT_UNSUPPORTED' }));
  });

  it('rejects an image that is not bound by the finalized visual manifest', () => {
    expect(() => compileXArticleDocument({
      markdown: '# T\n\n![unknown](assets/unknown.png)',
      visuals: []
    })).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
  });
});
