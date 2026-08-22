import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalManifestBytes } from '../../tools/manifest-content.js';

describe('canonicalManifestBytes', () => {
  it('produces identical manifest evidence for LF and CRLF checkouts', () => {
    const lf = canonicalManifestBytes(Buffer.from('first\nsecond\n', 'utf8'));
    const crlf = canonicalManifestBytes(Buffer.from('first\r\nsecond\r\n', 'utf8'));

    expect(crlf).toEqual(lf);
    expect(crlf.byteLength).toBe(lf.byteLength);
    expect(createHash('sha256').update(crlf).digest('hex')).toBe(
      createHash('sha256').update(lf).digest('hex')
    );
  });

  it('includes the X Article production branch and Skill flow reference', async () => {
    const manifest = JSON.parse(
      await readFile(resolve('registry/manifests/research-publishing.json'), 'utf8')
    ) as { files: Array<{ path: string }> };
    const paths = manifest.files.map((file) => file.path);
    expect(paths).toContain(
      'harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts'
    );
    expect(paths).toContain(
      'skills/x-publishing-copilot/references/x-article-browser-flow.md'
    );
  });

  it('generates reproducible X Article interface metadata and current file evidence', async () => {
    const generator = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve('tools/build-manifest.ts')],
      { encoding: 'utf8' }
    );

    expect(generator.status, generator.stderr).toBe(0);

    const manifest = JSON.parse(
      await readFile(resolve('registry/manifests/research-publishing.json'), 'utf8')
    ) as {
      interfaces: {
        x_article_browser: {
          command_contract: string;
          observation_contract: string;
          capabilities: Record<string, string>;
        };
      };
      files: Array<{ path: string; sha256: string; bytes: number }>;
    };

    expect(manifest.interfaces.x_article_browser).toEqual({
      command_contract: 'x-article-browser-command/1.0',
      observation_contract: 'x-article-browser-observation/1.0',
      capabilities: {
        import_article_document:
          'Import one deterministic Article Document template bound to the approved Article Package and document digests.',
        replace_article_visual_anchor:
          'Replace one verified temporary visual anchor with its approved digest-bound inline asset at the planned block ordinal.'
      }
    });

    for (const file of manifest.files) {
      const bytes = canonicalManifestBytes(await readFile(resolve(file.path)));
      expect(file, file.path).toMatchObject({
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength
      });
    }
  });
});
