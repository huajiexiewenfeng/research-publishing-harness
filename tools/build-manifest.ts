import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

import { canonicalManifestBytes } from './manifest-content.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'registry/manifests/research-publishing.json');
const sourceRoots = [
  'harnesses/research-publishing',
  'skills/article-publishing-copilot',
  'skills/x-publishing-copilot',
  'skills/research-synthesis-copilot',
  'docs/guides',
  'docs/examples'
];
const excludedNames = new Set(['.git', 'dist', 'node_modules', 'workspaces', 'receipts', 'secrets']);

async function filesBelow(directory: string): Promise<string[]> {
  const outputFiles: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excludedNames.has(entry.name)) continue;
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) outputFiles.push(...(await filesBelow(absolute)));
    else if (entry.isFile()) outputFiles.push(absolute);
  }
  return outputFiles;
}

const paths = (
  await Promise.all(sourceRoots.map((sourceRoot) => filesBelow(resolve(root, sourceRoot))))
)
  .flat()
  .filter((path) => resolve(path) !== output)
  .map((path) => ({ absolute: path, relative: relative(root, path).split(sep).join('/') }))
  .sort((left, right) =>
    left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0
  );

const files = await Promise.all(
  paths.map(async (path) => {
    const bytes = canonicalManifestBytes(await readFile(path.absolute));
    return {
      path: path.relative,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.byteLength
    };
  })
);

const manifest = {
  schema_version: '1.0',
  harness: { id: 'research-publishing', version: '0.1.0-alpha.0' },
  compatibility: {
    node: '>=20.19',
    contracts: '1.1',
    llm_wiki_runtime: '0.2.0',
    skills: [
      'article-publishing-copilot', 'x-publishing-copilot', 'research-synthesis-copilot'
    ]
  },
  files
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ ok: true, files: files.length, output: relative(root, output) })}\n`);
