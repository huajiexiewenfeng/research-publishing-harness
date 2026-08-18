import { describe, expect, it } from 'vitest';

import {
  canonicalJson,
  sha256
} from '../../harnesses/research-publishing/core/digest.js';

describe('canonical digest', () => {
  it('is stable across object key order', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(sha256({ b: 2, a: 1 })).toBe(sha256({ a: 1, b: 2 }));
  });

  it('preserves array order as meaningful content', () => {
    expect(sha256({ values: ['first', 'second'] })).not.toBe(
      sha256({ values: ['second', 'first'] })
    );
  });

  it('rejects non-JSON values', () => {
    expect(() => canonicalJson({ value: undefined })).toThrowError(
      expect.objectContaining({ code: 'CONTRACT_INVALID' })
    );
  });
});
