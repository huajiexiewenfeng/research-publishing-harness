import { lstat, open, realpath } from 'node:fs/promises';
import { extname } from 'node:path';
import sharp from 'sharp';
import { sha256Bytes } from './digest.js';
import { HarnessError } from './errors.js';
import { validateContract } from './schema-validator.js';
export const VISUAL_NORMALIZATION_VERSION = 'sharp-0.34.4-v1';
const DEFAULT_LIMITS = {
    maxInputBytes: 20 * 1024 * 1024,
    maxWidth: 8192,
    maxHeight: 8192,
    maxPixels: 40_000_000
};
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
export class VisualAssetImporter {
    store;
    limits;
    constructor(store, limits = DEFAULT_LIMITS) {
        this.store = store;
        this.limits = limits;
    }
    async attach(input) {
        for (const [name, value] of [['runId', input.runId], ['candidateId', input.candidateId], ['assetId', input.assetId], ['slotId', input.slotId]]) {
            if (!SAFE_ID.test(value))
                throw new HarnessError('CONTRACT_INVALID', `${name} contains unsafe characters`);
        }
        if (input.altText.trim().length === 0 || input.claimRefs.length === 0) {
            throw new HarnessError('VISUAL_ASSET_INVALID', 'visual asset requires Alt Text and Claim references');
        }
        const source = await readSafeSource(input.sourcePath, this.limits.maxInputBytes);
        const signatureFormat = detectSignature(source.bytes);
        const extensionFormat = formatFromExtension(input.sourcePath);
        if (signatureFormat === null || extensionFormat !== signatureFormat) {
            throw new HarnessError('VISUAL_FORMAT_UNSUPPORTED', 'visual file extension and signature must identify PNG, JPEG, or WebP');
        }
        let image = sharp(source.bytes, {
            animated: true,
            failOn: 'error',
            limitInputPixels: this.limits.maxPixels
        });
        let metadata;
        try {
            metadata = await image.metadata();
        }
        catch (error) {
            throw new HarnessError('VISUAL_ASSET_INVALID', 'visual asset cannot be decoded safely', error);
        }
        if (metadata.format !== signatureFormat || (metadata.pages ?? 1) !== 1) {
            throw new HarnessError('VISUAL_FORMAT_UNSUPPORTED', 'animated or unsupported visual assets are not allowed');
        }
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;
        if (width < 1 || height < 1 || width > this.limits.maxWidth || height > this.limits.maxHeight || width * height > this.limits.maxPixels) {
            throw new HarnessError('VISUAL_ASSET_INVALID', 'visual dimensions exceed configured limits');
        }
        image = image.rotate();
        let normalized;
        try {
            normalized = signatureFormat === 'png'
                ? await image.png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer()
                : signatureFormat === 'jpeg'
                    ? await image.jpeg({ quality: 90, chromaSubsampling: '4:4:4', progressive: false, optimizeCoding: false }).toBuffer()
                    : await image.webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: false }).toBuffer();
        }
        catch (error) {
            throw new HarnessError('VISUAL_ASSET_INVALID', 'visual asset normalization failed', error);
        }
        const extension = signatureFormat === 'jpeg' ? 'jpg' : signatureFormat;
        const mimeType = signatureFormat === 'jpeg' ? 'image/jpeg' : `image/${signatureFormat}`;
        const staged = `runs/${input.runId}/article/visual-candidates/${input.candidateId}/asset.${extension}`;
        await this.store.writeNewBytes(staged, normalized);
        const editable = input.editableSourcePath === undefined
            ? null
            : await this.importEditableSource(input, input.editableSourcePath);
        const asset = validateContract('visual-asset-ref', {
            asset_id: input.assetId,
            relative_path: `assets/${input.assetId}.${extension}`,
            digest: sha256Bytes(normalized),
            mime_type: mimeType,
            alt_text: input.altText.trim(),
            claim_refs: [...input.claimRefs]
        });
        return {
            candidate_id: input.candidateId,
            slot_id: input.slotId,
            asset,
            staged_relative_path: staged,
            width,
            height,
            byte_size: normalized.length,
            normalization_version: VISUAL_NORMALIZATION_VERSION,
            provenance: { ...input.provenance, source_digest: sha256Bytes(source.bytes) },
            editable_source: editable
        };
    }
    async importEditableSource(input, sourcePath) {
        const source = await readSafeSource(sourcePath, this.limits.maxInputBytes);
        const suffix = extname(sourcePath).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.source';
        const staged = `runs/${input.runId}/article/visual-candidates/${input.candidateId}/editable${suffix}`;
        await this.store.writeNewBytes(staged, source.bytes);
        return {
            staged_relative_path: staged,
            relative_path: `assets/editable/${input.assetId}${suffix}`,
            digest: sha256Bytes(source.bytes)
        };
    }
}
export async function verifyPackageVisualAsset(store, packageRoot, asset) {
    if (!packageRoot.startsWith('articles/') ||
        packageRoot.split('/').some((segment) => segment.length === 0 || segment === '..' || segment === '.') ||
        !asset.relative_path.startsWith('assets/') ||
        asset.relative_path.split('/').some((segment) => segment.length === 0 || segment === '..' || segment === '.')) {
        throw new HarnessError('VISUAL_PATH_OUTSIDE_PACKAGE', 'visual asset path is outside package assets');
    }
    const relativePath = `${packageRoot}/${asset.relative_path}`;
    await store.resolveRegularFile(relativePath);
    const bytes = await store.readBytes(relativePath);
    if (sha256Bytes(bytes) !== asset.digest || detectSignature(bytes) !== formatFromMime(asset.mime_type)) {
        throw new HarnessError('VISUAL_DIGEST_MISMATCH', 'package visual asset does not match its locked digest and MIME');
    }
}
async function readSafeSource(sourcePath, maxBytes) {
    let metadata;
    try {
        metadata = await lstat(sourcePath);
    }
    catch (error) {
        throw new HarnessError('VISUAL_ASSET_INVALID', 'visual source cannot be opened', error);
    }
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maxBytes) {
        throw new HarnessError('VISUAL_ASSET_INVALID', 'visual source must be a bounded regular non-symlink file');
    }
    const opened = await open(sourcePath, 'r');
    try {
        const openedStat = await opened.stat();
        const current = await lstat(sourcePath);
        await realpath(sourcePath);
        if (!openedStat.isFile() ||
            current.isSymbolicLink() ||
            openedStat.dev !== metadata.dev ||
            openedStat.ino !== metadata.ino ||
            current.dev !== openedStat.dev ||
            current.ino !== openedStat.ino ||
            openedStat.size !== metadata.size ||
            current.size !== openedStat.size) {
            throw new HarnessError('VISUAL_ASSET_INVALID', 'visual source changed while it was opened');
        }
        return { bytes: await opened.readFile() };
    }
    finally {
        await opened.close();
    }
}
function detectSignature(bytes) {
    if (bytes.length >= 8 && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return 'png';
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return 'jpeg';
    if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP')
        return 'webp';
    return null;
}
function formatFromExtension(path) {
    const extension = extname(path).toLowerCase();
    if (extension === '.png')
        return 'png';
    if (extension === '.jpg' || extension === '.jpeg')
        return 'jpeg';
    if (extension === '.webp')
        return 'webp';
    return null;
}
function formatFromMime(mime) {
    return mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : 'webp';
}
//# sourceMappingURL=visual-assets.js.map