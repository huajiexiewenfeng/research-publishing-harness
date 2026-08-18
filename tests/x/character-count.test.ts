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
});
