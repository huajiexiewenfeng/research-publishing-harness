export function canonicalManifestBytes(bytes: Buffer): Buffer {
  return Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n'), 'utf8');
}
