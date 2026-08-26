import { HarnessError } from './errors.js';
function textLike(mediaType) {
    return mediaType.startsWith('text/') ||
        mediaType === 'application/json' ||
        mediaType === 'application/yaml' ||
        mediaType === 'application/x-yaml';
}
export function normalizeCanonicalUtf8(bytes, declaredMediaType) {
    if (!textLike(declaredMediaType)) {
        return { status: 'evidence_only', reason: 'non_text_media' };
    }
    try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        const withoutBom = decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded;
        return {
            status: 'normalized',
            text: withoutBom.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
        };
    }
    catch {
        return { status: 'evidence_only', reason: 'lossy_decode' };
    }
}
function chooseCut(text, start, maxChars) {
    const remaining = text.length - start;
    if (remaining <= maxChars)
        return text.length;
    const window = text.slice(start, start + maxChars);
    const blockBoundary = window.lastIndexOf('\n\n');
    if (blockBoundary >= 0)
        return start + blockBoundary + 2;
    const lineBoundary = window.lastIndexOf('\n');
    if (lineBoundary >= 0)
        return start + lineBoundary + 1;
    return start + maxChars;
}
function headingPathAt(text, start) {
    const lineEnd = text.indexOf('\n', start);
    const scanEnd = lineEnd === -1 ? text.length : lineEnd + 1;
    const prefix = text.slice(0, scanEnd);
    const hierarchy = [];
    const pattern = /^(#{1,6})[ \t]+(.+?)[ \t]*$/gm;
    for (const match of prefix.matchAll(pattern)) {
        const level = match[1]?.length ?? 1;
        const heading = match[2] ?? '';
        hierarchy.length = level - 1;
        hierarchy[level - 1] = heading;
    }
    return hierarchy.filter((item) => item !== undefined);
}
export function chunkCanonicalMarkdown(text, maxChars) {
    if (!Number.isInteger(maxChars) || maxChars <= 0) {
        throw new HarnessError('CONTRACT_INVALID', 'chunk character limit must be a positive integer');
    }
    if (text.length === 0)
        return [];
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        const end = chooseCut(text, start, maxChars);
        chunks.push({
            ordinal: chunks.length + 1,
            text: text.slice(start, end),
            char_start: start,
            char_end: end,
            heading_path: headingPathAt(text, start)
        });
        start = end;
    }
    return chunks;
}
//# sourceMappingURL=markdown-chunker.js.map