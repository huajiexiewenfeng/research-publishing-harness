import { describe, expect, it } from 'vitest';

import {
  chunkCanonicalMarkdown,
  normalizeCanonicalUtf8
} from '../../harnesses/research-publishing/core/markdown-chunker.js';
import { canonicalDocumentFixtures } from '../fixtures/canonical-documents.js';

describe('canonical Markdown normalization', () => {
  it.each([
    ['LF', canonicalDocumentFixtures.lf],
    ['CRLF', canonicalDocumentFixtures.crlf],
    ['UTF-8 BOM', canonicalDocumentFixtures.utf8Bom]
  ])('normalizes %s to the same canonical text', (_label, bytes) => {
    expect(normalizeCanonicalUtf8(bytes, 'text/markdown')).toEqual({
      status: 'normalized',
      text: canonicalDocumentFixtures.canonicalLf
    });
  });

  it('refuses lossy decoding and binary media', () => {
    expect(normalizeCanonicalUtf8(canonicalDocumentFixtures.invalidUtf8, 'text/markdown'))
      .toEqual({ status: 'evidence_only', reason: 'lossy_decode' });
    expect(normalizeCanonicalUtf8(canonicalDocumentFixtures.binary, 'image/png'))
      .toEqual({ status: 'evidence_only', reason: 'non_text_media' });
  });
});

describe('canonical Markdown chunking', () => {
  it('uses stable boundaries and reconstructs without loss or overlap', () => {
    const text = [
      '# 第一章', '', '这是第一段。'.repeat(20), '',
      '## 第二节', '', 'A'.repeat(90), '', '尾段。', ''
    ].join('\n');
    const chunks = chunkCanonicalMarkdown(text, 48);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe(text);
    expect(chunks.every((chunk) => chunk.text.length <= 48)).toBe(true);
    expect(chunks.map((chunk) => chunk.ordinal)).toEqual(
      chunks.map((_chunk, index) => index + 1)
    );
    expect(chunks[0]?.char_start).toBe(0);
    expect(chunks.at(-1)?.char_end).toBe(text.length);
    for (let index = 1; index < chunks.length; index += 1) {
      expect(chunks[index]?.char_start).toBe(chunks[index - 1]?.char_end);
    }
  });

  it('rejects invalid chunk limits and preserves an empty trailing line', () => {
    expect(() => chunkCanonicalMarkdown('text', 0)).toThrowError(/positive/);
    const chunks = chunkCanonicalMarkdown('# H\n\nbody\n', 8);
    expect(chunks.map((chunk) => chunk.text).join('')).toBe('# H\n\nbody\n');
  });
});
