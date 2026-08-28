import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { canonicalManifestBytes } from '../../tools/manifest-content.js';

const inventoryRoots = [
  'harnesses/research-publishing',
  'skills/article-publishing-copilot',
  'skills/x-publishing-copilot',
  'skills/research-synthesis-copilot',
  'docs/guides',
  'docs/examples',
  'tools'
] as const;
const inventoryFiles = ['README.md'] as const;
const excludedInventoryNames = new Set([
  '.git', 'dist', 'node_modules', 'workspaces', 'receipts', 'secrets'
]);

async function intendedInventory(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(resolve(directory), { withFileTypes: true })) {
    if (excludedInventoryNames.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await intendedInventory(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

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
      schema_version: string;
      harness: Record<string, unknown>;
      compatibility: { llm_wiki_runtime: string; skills: string[] };
      interfaces: Record<string, unknown>;
      files: Array<{ path: string }>;
    };
    const paths = manifest.files.map((file) => file.path);
    expect(Object.keys(manifest).sort()).toEqual([
      'compatibility', 'files', 'harness', 'interfaces', 'schema_version'
    ]);
    expect(paths).toContain(
      'harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts'
    );
    expect(paths).toContain(
      'skills/x-publishing-copilot/references/x-article-browser-flow.md'
    );
    expect(paths).toContain(
      'skills/x-publishing-copilot/references/x-article-materialization-v3-2.md'
    );
    expect(paths).toContain(
      'skills/x-publishing-copilot/references/x-article-existing-draft-media-completion-v3-3.md'
    );
    expect(paths.every((path) => !/^(?:[A-Za-z]:|\/|\\\\)/.test(path))).toBe(true);
    expect(paths.every((path) => !path.includes('\\'))).toBe(true);
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
          materialization: Record<string, unknown>;
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
      },
      materialization: {
        protocol: 'x-article-materialization/v3.3',
        modes: {
          new_draft: 'materialization_v3_2',
          existing_draft_media_completion: 'media_completion_v3_3'
        },
        default_strategy: 'rich_text_anchor_import/v1',
        required_host_capabilities: {
          account_and_product: [
            'authenticated_target_account',
            'premium_articles_available'
          ],
          page_contract: 'x-article-web/2026-08',
          bulk_import: [
            'import_article_document',
            'structured_rich_text_paste'
          ],
          visual_anchor: [
            'replace_article_visual_anchor',
            'set_article_image_alt',
            'read_article_image_alt'
          ],
          cover: [
            'upload_article_cover',
            'report_cover_alt_capability_state'
          ],
          preview: [
            'open_article_preview',
            'observe_article_preview'
          ],
          release_set: 'compatible_runtime_skill_manifest_browser_host'
        },
        incremental_fallback: 'explicit_only',
        compatibility_modes: ['legacy_preapproved']
      }
    });

    const root = resolve('.');
    const expectedPaths = (
      await Promise.all(inventoryRoots.map((directory) => intendedInventory(directory)))
    ).flat()
      .concat(inventoryFiles.map((file) => resolve(file)))
      .map((path) => path.slice(root.length + 1).replaceAll('\\', '/'))
      .sort();
    expect(manifest.files.map((file) => file.path)).toEqual(expectedPaths);

    for (const file of manifest.files) {
      const bytes = canonicalManifestBytes(await readFile(resolve(file.path)));
      expect(file, file.path).toMatchObject({
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength
      });
    }

    const first = await readFile(resolve('registry/manifests/research-publishing.json'));
    const secondGenerator = spawnSync(
      process.execPath,
      ['--import', 'tsx', resolve('tools/build-manifest.ts')],
      { encoding: 'utf8' }
    );
    expect(secondGenerator.status, secondGenerator.stderr).toBe(0);
    const second = await readFile(resolve('registry/manifests/research-publishing.json'));
    expect(second).toEqual(first);
  });
});
