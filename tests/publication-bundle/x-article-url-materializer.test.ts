import { describe, expect, it } from 'vitest';

import { materializeXArticleUrl } from '../../harnesses/research-publishing/core/x-article-url-materializer.js';

describe('materializeXArticleUrl', () => {
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
