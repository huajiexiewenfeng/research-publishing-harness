import { validatePostText } from '../branches/x-harness/character-count.js';
import { HarnessError } from './errors.js';

export function assertApprovedXArticleUrl(
  canonicalUrl: string,
  targetAccount: string
): URL {
  let url: URL;
  try {
    url = new URL(canonicalUrl);
  } catch {
    throw new HarnessError('CONTRACT_INVALID', 'Article canonical URL is invalid');
  }
  const account = targetAccount.startsWith('@') ? targetAccount.slice(1) : '';
  const path = url.pathname.match(/^\/([^/]+)\/(article|status)\/(\d+)$/);
  if (
    url.protocol !== 'https:' || url.hostname !== 'x.com' || url.port !== '' ||
    url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' ||
    path === null || path[1]!.toLowerCase() !== account.toLowerCase()
  ) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'Article canonical URL is outside the approved X account'
    );
  }
  return url;
}

export function materializeXArticleUrl(
  template: string,
  canonicalUrl: string,
  targetAccount: string
): string {
  const matches = template.match(/\{\{X_ARTICLE_URL\}\}/g) ?? [];
  if (matches.length !== 1) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'Single template requires one Article URL token'
    );
  }
  assertApprovedXArticleUrl(canonicalUrl, targetAccount);
  const text = template.replace('{{X_ARTICLE_URL}}', canonicalUrl);
  if (!validatePostText(text, null).valid) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'Materialized Single contains invalid text'
    );
  }
  return text;
}
