import { describe, expect, it } from 'vitest';

import { XWeb202608Contract } from '../../harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.js';
import {
  activeDraft,
  filledThread,
  loggedIn,
  loginPage,
  publicThread,
  securityChallenge,
  unknownPage
} from '../fixtures/x-browser-observations.js';

describe('XWeb202608Contract', () => {
  const contract = new XWeb202608Contract();

  it('detects the logged-in account and ordered composer items', () => {
    expect(contract.detectAccount(loggedIn)).toEqual({ handle: '@runtime_ai' });
    expect(contract.readComposerItems(filledThread).map((item) => item.text)).toEqual([
      'First locked item',
      'Second locked item',
      'Third locked item'
    ]);
    expect(contract.detectSubmitControl(filledThread)).toEqual({
      ref: 'submit_all',
      enabled: true,
      label: 'Post all'
    });
  });

  it('recognizes login and security states before composer semantics', () => {
    expect(contract.detectPage(loginPage)).toEqual({ kind: 'login_required' });
    expect(contract.detectPage(securityChallenge)).toEqual({ kind: 'security_challenge' });
  });

  it('rejects an active unknown draft and unsupported pages', () => {
    expect(() => contract.detectComposer(activeDraft)).toThrowError(
      expect.objectContaining({ code: 'DRAFT_CONFLICT' })
    );
    expect(() => contract.detectPage(unknownPage)).toThrowError(
      expect.objectContaining({ code: 'PAGE_CONTRACT_UNSUPPORTED' })
    );
  });

  it('returns only sanitized public post observations', () => {
    expect(contract.detectPage(publicThread)).toEqual({ kind: 'public_thread' });
    expect(contract.detectPublishedPosts(publicThread)).toHaveLength(2);
  });
});
