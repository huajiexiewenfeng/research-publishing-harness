export function canonicalManifestBytes(bytes) {
    return Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n').replaceAll('\r', '\n'), 'utf8');
}
//# sourceMappingURL=manifest-content.js.map