import { createHash } from 'node:crypto';

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
});
