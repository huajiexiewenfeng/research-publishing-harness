import { describe, expect, it } from 'vitest';

import { materializeXArticleUrl } from '../../harnesses/research-publishing/core/x-article-url-materializer.js';

describe('materializeXArticleUrl', () => {
  it('materializes a long Single without truncating its body', () => {
    const body = 'Skills are replaceable. Their knowledge should survive. '.repeat(70);
    const url = 'https://x.com/Glen56121/status/2091000000000000000';
    expect(materializeXArticleUrl(`${body}{{X_ARTICLE_URL}}`, url, '@Glen56121')).toBe(`${body}${url}`);
  });

  it('rejects invalid text even in a long Single', () => {
    expect(() => materializeXArticleUrl(
      `${'a'.repeat(500)}\uFFFE {{X_ARTICLE_URL}}`,
      'https://x.com/Glen56121/status/2091000000000000000', '@Glen56121'
    )).toThrowError(/invalid text/i);
  });

  it('replaces exactly one token with the canonical account URL', () => {
    expect(materializeXArticleUrl(
      'Read the full argument: {{X_ARTICLE_URL}}',
      'https://x.com/Glen56121/article/2091000000000000000',
      '@Glen56121'
    )).toBe('Read the full argument: https://x.com/Glen56121/article/2091000000000000000');
  });

  it.each([
    'http://x.com/Glen56121/article/2091000000000000000',
    'https://evil.example/Glen56121/article/2091000000000000000',
    'https://x.com/OtherUser/article/2091000000000000000',
    'https://x.com/Glen56121/article/2091000000000000000?utm=unsafe'
  ])('rejects an unapproved canonical URL %s', (url) => {
    expect(() => materializeXArticleUrl('Read {{X_ARTICLE_URL}}', url, '@Glen56121'))
      .toThrowError(/outside the approved X account/);
  });
});
