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
    ) as {
      compatibility: { llm_wiki_runtime: string; skills: string[] };
      files: Array<{ path: string }>;
    };
    const paths = manifest.files.map((file) => file.path);
    expect(paths).toContain(
      'harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts'
    );
    expect(paths).toContain(
      'skills/x-publishing-copilot/references/x-article-browser-flow.md'
    );
    expect(paths).toEqual(expect.arrayContaining([
      'harnesses/research-publishing/core/memory-query-service.ts',
      'harnesses/research-publishing/core/memory-ingest-service.ts',
      'harnesses/research-publishing/memory/llm-wiki-profile.yml',
      'harnesses/research-publishing/memory/ingest-mapping.yml',
      'harnesses/research-publishing/memory/scp.yml',
      'skills/article-publishing-copilot/scp.yml',
      'skills/article-publishing-copilot/references/memory-loop.md',
      'skills/x-publishing-copilot/scp.yml',
      'skills/x-publishing-copilot/references/memory-loop.md'
    ]));
    expect(manifest.compatibility).toMatchObject({
      llm_wiki_runtime: '0.2.0',
      skills: [
        'article-publishing-copilot',
        'x-publishing-copilot',
        'research-synthesis-copilot'
      ]
    });
    expect(paths).toEqual(expect.arrayContaining([
      'harnesses/research-publishing/core/research-synthesis-service.ts',
      'harnesses/research-publishing/contracts/research-synthesis-revision.schema.json',
      'harnesses/research-publishing/contracts/research-continuation-proposal.schema.json',
      'skills/research-synthesis-copilot/SKILL.md',
      'skills/research-synthesis-copilot/scp.yml',
      'skills/research-synthesis-copilot/references/research-synthesis-flow.md'
    ]));
    expect(paths).toEqual(expect.arrayContaining([
      'harnesses/research-publishing/core/research-terminal-hooks.ts',
      'harnesses/research-publishing/core/research-import-service.ts',
      'harnesses/research-publishing/contracts/research-terminal-hook-receipt.schema.json',
      'harnesses/research-publishing/contracts/research-import-manifest.schema.json',
      'harnesses/research-publishing/contracts/research-import-gap-report.schema.json',
      'docs/guides/memory-loop.md',
      'docs/examples/research-import-manifest.example.json'
    ]));
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
