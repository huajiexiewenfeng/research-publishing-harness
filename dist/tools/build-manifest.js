import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { canonicalManifestBytes } from './manifest-content.js';
const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'registry/manifests/research-publishing.json');
const sourceRoots = [
    'harnesses/research-publishing',
    'skills/article-publishing-copilot',
    'skills/x-publishing-copilot'
];
const excludedNames = new Set(['.git', 'dist', 'node_modules', 'workspaces', 'receipts', 'secrets']);
async function filesBelow(directory) {
    const outputFiles = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (excludedNames.has(entry.name))
            continue;
        const absolute = resolve(directory, entry.name);
        if (entry.isDirectory())
            outputFiles.push(...(await filesBelow(absolute)));
        else if (entry.isFile())
            outputFiles.push(absolute);
    }
    return outputFiles;
}
const paths = (await Promise.all(sourceRoots.map((sourceRoot) => filesBelow(resolve(root, sourceRoot)))))
    .flat()
    .filter((path) => resolve(path) !== output)
    .map((path) => ({ absolute: path, relative: relative(root, path).split(sep).join('/') }))
    .sort((left, right) => left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0);
const files = await Promise.all(paths.map(async (path) => {
    const bytes = canonicalManifestBytes(await readFile(path.absolute));
    return {
        path: path.relative,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.byteLength
    };
}));
const manifest = {
    schema_version: '1.0',
    harness: { id: 'research-publishing', version: '0.1.0-alpha.0' },
    compatibility: {
        node: '>=20.19',
        contracts: '1.0',
        skills: ['article-publishing-copilot', 'x-publishing-copilot']
    },
    interfaces: {
        x_article_browser: {
            command_contract: 'x-article-browser-command/1.0',
            observation_contract: 'x-article-browser-observation/1.0',
            capabilities: {
                import_article_document: 'Import one deterministic Article Document template bound to the approved Article Package and document digests.',
                replace_article_visual_anchor: 'Replace one verified temporary visual anchor with its approved digest-bound inline asset at the planned block ordinal.'
            }
        }
    },
    files
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ ok: true, files: files.length, output: relative(root, output) })}\n`);
//# sourceMappingURL=build-manifest.js.map