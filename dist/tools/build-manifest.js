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
    'docs/examples',
    'tools'
];
const sourceFiles = ['README.md'];
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
    .concat(sourceFiles.map((sourceFile) => resolve(root, sourceFile)))
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
        contracts: '1.1',
        llm_wiki_runtime: '0.2.0',
        skills: [
            'article-publishing-copilot', 'x-publishing-copilot', 'research-synthesis-copilot'
        ]
    },
    interfaces: {
        x_article_browser: {
            command_contract: 'x-article-browser-command/1.0',
            observation_contract: 'x-article-browser-observation/1.0',
            capabilities: {
                import_article_document: 'Import one deterministic Article Document template bound to the approved Article Package and document digests.',
                replace_article_visual_anchor: 'Replace one verified temporary visual anchor with its approved digest-bound inline asset at the planned block ordinal.'
            },
            materialization: {
                protocol: 'x-article-materialization/v3.4',
                modes: {
                    new_draft: 'materialization_v3_2',
                    existing_draft_media_completion: 'media_completion_v3_3',
                    fast_path: 'fast_path_v3_4'
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
        }
    },
    files
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ ok: true, files: files.length, output: relative(root, output) })}\n`);
//# sourceMappingURL=build-manifest.js.map