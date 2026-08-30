import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';

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

  it('treats a plain JSON object from a foreign Host realm canonically', () => {
    const foreign = runInNewContext('({ nested: { value: 1 }, values: [2, 3] })');

    expect(sha256(foreign)).toBe(sha256({
      nested: { value: 1 },
      values: [2, 3]
    }));
  });

  it('still rejects class instances after accepting foreign plain objects', () => {
    class ContractLike {
      readonly value = 1;
    }

    expect(() => canonicalJson(new ContractLike())).toThrowError(
      expect.objectContaining({ code: 'CONTRACT_INVALID' })
    );
  });

  it('rejects non-JSON values', () => {
    expect(() => canonicalJson({ value: undefined })).toThrowError(
      expect.objectContaining({ code: 'CONTRACT_INVALID' })
    );
  });
});
