export const canonicalLf = [
  '# Runtime Boundary',
  '',
  'Domain semantics belong in the Skill.',
  '',
  '## Deterministic Access',
  '',
  'Deterministic knowledge access belongs in the Runtime.',
  ''
].join('\n');

export const canonicalDocumentFixtures = {
  canonicalLf,
  lf: Buffer.from(canonicalLf, 'utf8'),
  crlf: Buffer.from(canonicalLf.replaceAll('\n', '\r\n'), 'utf8'),
  utf8Bom: Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(canonicalLf, 'utf8')]),
  invalidUtf8: Buffer.from([0xc3, 0x28]),
  binary: Buffer.from([0x89, 0x50, 0x4e, 0x47])
} as const;
