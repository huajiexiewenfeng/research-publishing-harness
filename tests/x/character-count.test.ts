import { describe, expect, it } from 'vitest';

import { validatePostText } from '../../harnesses/research-publishing/branches/x-harness/character-count.js';

describe('X weighted character validation', () => {
  it.each([
    ['280 Latin characters', 'a'.repeat(280), true, 280],
    ['281 Latin characters', 'a'.repeat(281), false, 281],
    ['140 CJK characters', '研'.repeat(140), true, 280],
    ['141 CJK characters', '研'.repeat(141), false, 282]
  ])('%s', (_name, text, valid, weightedLength) => {
    expect(validatePostText(text)).toMatchObject({ valid, weightedLength, maxWeightedLength: 280 });
  });

  it('uses twitter-text rules for Emoji and transformed URLs', () => {
    expect(validatePostText('🤖').weightedLength).toBe(2);
    const url = validatePostText('See https://example.com/a/very/long/research/path');
    expect(url.weightedLength).toBeLessThan('See https://example.com/a/very/long/research/path'.length);
    expect(url.valid).toBe(true);
  });

  it('supports a caller-provided weighted limit', () => {
    expect(validatePostText('agent runtime', 5)).toMatchObject({ valid: false, maxWeightedLength: 5 });
  });

  it('supports Single text without a local length cap', () => {
    expect(validatePostText('a'.repeat(30000), null)).toMatchObject({
      valid: true, weightedLength: 30000, maxWeightedLength: null, permillage: null
    });
  });

  it('preserves CJK, emoji and URL weighting without a local cap', () => {
    const text = `${'研'.repeat(200)} 👨‍👩‍👧‍👦 https://example.com/research/long/path`;
    expect(validatePostText(text, null)).toMatchObject({ valid: true, weightedLength: 427 });
    expect(validatePostText(text).weightedLength).toBe(427);
  });

  it.each(['', ' \n\t ', 'invalid\uFFFEtext', `${'a'.repeat(500)}\uFFFF`])(
    'still rejects empty or invalid text without a local cap: %j', (text) => {
      expect(validatePostText(text, null).valid).toBe(false);
    }
  );

  it('passes an explicit higher limit through to twitter-text', () => {
    expect(validatePostText('a'.repeat(500), 500).valid).toBe(true);
    expect(validatePostText('a'.repeat(501), 500).valid).toBe(false);
  });
});
