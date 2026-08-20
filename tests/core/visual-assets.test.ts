import { mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import { WorkspaceStore } from '../../harnesses/research-publishing/core/workspace-store.js';
import {
  VisualAssetImporter,
  verifyPackageVisualAsset
} from '../../harnesses/research-publishing/core/visual-assets.js';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'rph-visual-'));
  const source = join(root, 'candidate.png');
  await writeFile(source, ONE_PIXEL_PNG);
  return { root, source, store: await WorkspaceStore.open(join(root, 'workspace')) };
}

describe('visual asset normalization', () => {
  it('normalizes a decoded static image to stable package bytes and digest', async () => {
    const { source, store } = await fixture();
    const visualModule = '../../harnesses/research-publishing/core/visual-assets.js';
    const { VisualAssetImporter } = await import(visualModule);
    const importer = new VisualAssetImporter(store);
    const input = {
      runId: 'article_visual_1',
      candidateId: 'candidate_1',
      assetId: 'asset_cover',
      slotId: 'slot_cover',
      sourcePath: source,
      altText: 'One pixel showing a runtime boundary.',
      claimRefs: ['claim_verified'],
      provenance: { method: 'manual' as const, tool: null }
    };

    const first = await importer.attach(input);
    const bytes = await store.readBytes(first.staged_relative_path);

    expect(first.asset.digest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.asset.mime_type).toBe('image/png');
    expect(first.asset.relative_path).toBe('assets/asset_cover.png');
    expect(first.width).toBe(1);
    expect(first.height).toBe(1);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('writes binary artifacts atomically without UTF-8 conversion', async () => {
    const { store } = await fixture();
    const ref = await store.writeNewBytes('runs/binary/article/blob.bin', ONE_PIXEL_PNG);
    expect(ref.bytes).toBe(ONE_PIXEL_PNG.length);
    expect(await store.readBytes(ref.relative_path)).toEqual(ONE_PIXEL_PNG);
  });

  it('rejects unsupported or disguised formats before staging', async () => {
    const { root, store } = await fixture();
    const source = join(root, 'fake.png');
    await writeFile(source, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const visualModule = '../../harnesses/research-publishing/core/visual-assets.js';
    const { VisualAssetImporter } = await import(visualModule);
    const importer = new VisualAssetImporter(store);

    await expect(importer.attach({
      runId: 'article_visual_1', candidateId: 'candidate_bad', assetId: 'asset_bad',
      slotId: 'slot_cover', sourcePath: source, altText: 'Not an image.',
      claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: null }
    })).rejects.toMatchObject({ code: 'VISUAL_FORMAT_UNSUPPORTED' });
    await expect(readFile(join(store.root, 'runs/article_visual_1/article/visual-candidates/candidate_bad/asset.png'))).rejects.toBeDefined();
  });

  it('removes EXIF identity metadata from the normalized publication copy', async () => {
    const { root, store } = await fixture();
    const source = join(root, 'identity.jpg');
    await sharp({ create: { width: 2, height: 2, channels: 3, background: '#336699' } })
      .jpeg()
      .withExif({ IFD0: { Artist: 'private-author', Software: 'private-tool' } })
      .toFile(source);
    const visualModule = '../../harnesses/research-publishing/core/visual-assets.js';
    const { VisualAssetImporter } = await import(visualModule);
    const candidate = await new VisualAssetImporter(store).attach({
      runId: 'article_meta', candidateId: 'candidate_meta', assetId: 'asset_meta',
      slotId: 'slot_meta', sourcePath: source, altText: 'A blue square.',
      claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: null }
    });
    const metadata = await sharp(await store.readBytes(candidate.staged_relative_path)).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  it('accepts static WebP but rejects GIF and animated WebP', async () => {
    const { root, store } = await fixture();
    const staticWebp = join(root, 'static.webp');
    await sharp({ create: { width: 2, height: 2, channels: 4, background: '#224466' } }).webp().toFile(staticWebp);
    const accepted = await new VisualAssetImporter(store).attach({
      runId: 'article_webp', candidateId: 'candidate_static', assetId: 'asset_static',
      slotId: 'slot_webp', sourcePath: staticWebp, altText: 'A static blue WebP square.',
      claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: null }
    });
    expect(accepted.asset.mime_type).toBe('image/webp');

    const gif = join(root, 'animated.gif');
    await writeFile(gif, Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUQAOw==', 'base64'));
    await expect(new VisualAssetImporter(store).attach({
      runId: 'article_gif', candidateId: 'candidate_gif', assetId: 'asset_gif',
      slotId: 'slot_gif', sourcePath: gif, altText: 'A GIF.', claimRefs: ['claim_verified'],
      provenance: { method: 'manual', tool: null }
    })).rejects.toMatchObject({ code: 'VISUAL_FORMAT_UNSUPPORTED' });

    const animatedWebp = join(root, 'animated.webp');
    const frames = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
    await sharp(frames, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } })
      .webp({ loop: 0, delay: [100, 100] })
      .toFile(animatedWebp);
    await expect(new VisualAssetImporter(store).attach({
      runId: 'article_animated', candidateId: 'candidate_animated', assetId: 'asset_animated',
      slotId: 'slot_animated', sourcePath: animatedWebp, altText: 'An animated WebP.',
      claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: null }
    })).rejects.toMatchObject({ code: 'VISUAL_FORMAT_UNSUPPORTED' });
  });

  it('enforces configured input byte, dimension, and pixel limits', async () => {
    const { root, source, store } = await fixture();
    await expect(new VisualAssetImporter(store, {
      maxInputBytes: 8, maxWidth: 8192, maxHeight: 8192, maxPixels: 40_000_000
    }).attach({
      runId: 'article_bytes', candidateId: 'candidate_bytes', assetId: 'asset_bytes',
      slotId: 'slot_limits', sourcePath: source, altText: 'Too many bytes.',
      claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: null }
    })).rejects.toMatchObject({ code: 'VISUAL_ASSET_INVALID' });

    const large = join(root, 'large.png');
    await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toFile(large);
    await expect(new VisualAssetImporter(store, {
      maxInputBytes: 1024 * 1024, maxWidth: 1, maxHeight: 1, maxPixels: 1
    }).attach({
      runId: 'article_dimensions', candidateId: 'candidate_dimensions', assetId: 'asset_dimensions',
      slotId: 'slot_limits', sourcePath: large, altText: 'Too large.',
      claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: null }
    })).rejects.toMatchObject({ code: 'VISUAL_ASSET_INVALID' });
  });

  it('rejects source symlinks and package-relative traversal', async () => {
    const { root, source, store } = await fixture();
    const linked = join(root, 'linked.png');
    const visualModule = '../../harnesses/research-publishing/core/visual-assets.js';
    const { VisualAssetImporter } = await import(visualModule);
    try {
      await symlink(source, linked);
      await expect(new VisualAssetImporter(store).attach({
        runId: 'article_link', candidateId: 'candidate_link', assetId: 'asset_link',
        slotId: 'slot_link', sourcePath: linked, altText: 'Linked image.',
        claimRefs: ['claim_verified'], provenance: { method: 'manual', tool: null }
      })).rejects.toMatchObject({ code: 'VISUAL_ASSET_INVALID' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
      expect((error as NodeJS.ErrnoException).code).toBe('EPERM');
    }

    await mkdir(join(store.root, 'articles', 'safe', 'run', 'assets'), { recursive: true });
    await expect(verifyPackageVisualAsset(store, 'articles/safe/run', {
      asset_id: 'escape', relative_path: 'assets/../../../runs/escape.png',
      digest: `sha256:${'0'.repeat(64)}`, mime_type: 'image/png',
      alt_text: 'Escape.', claim_refs: ['claim_verified']
    })).rejects.toMatchObject({ code: 'VISUAL_PATH_OUTSIDE_PACKAGE' });
    await expect(verifyPackageVisualAsset(store, 'runs/not-a-canonical-package', {
      asset_id: 'outside', relative_path: 'assets/outside.png',
      digest: `sha256:${'0'.repeat(64)}`, mime_type: 'image/png',
      alt_text: 'Outside.', claim_refs: ['claim_verified']
    })).rejects.toMatchObject({ code: 'VISUAL_PATH_OUTSIDE_PACKAGE' });
  });
});
