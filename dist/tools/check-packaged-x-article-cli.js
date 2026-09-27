import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { X_ARTICLE_CONTROL_ROUTES, X_ARTICLE_HOST_PROTOCOL } from '../harnesses/research-publishing/cli/x-article-control-surface.js';
export function assertPackagedXArticleCliHelp(input) {
    const protocolMarker = `Host protocol: ${input.protocol}`;
    if (!input.help.includes(protocolMarker)) {
        throw new Error(`Packaged X Article CLI is missing Host protocol ${input.protocol}`);
    }
    for (const route of input.routes) {
        if (!input.help.includes(route)) {
            throw new Error(`Packaged X Article CLI is missing source route: ${route}`);
        }
    }
}
export function checkPackagedXArticleCli(input) {
    const result = spawnSync(process.execPath, [resolve(input.cliPath), '--help'], {
        encoding: 'utf8',
        windowsHide: true
    });
    if (result.error !== undefined)
        throw result.error;
    if (result.status !== 0) {
        throw new Error(`Packaged X Article CLI help failed with status ${result.status}: ${result.stderr.trim()}`);
    }
    assertPackagedXArticleCliHelp({
        help: result.stdout,
        protocol: input.protocol,
        routes: input.routes
    });
}
if (process.argv[1] !== undefined
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        checkPackagedXArticleCli({
            cliPath: resolve('dist/harnesses/research-publishing/cli/index.js'),
            protocol: X_ARTICLE_HOST_PROTOCOL,
            routes: X_ARTICLE_CONTROL_ROUTES
        });
        process.stdout.write(`Packaged X Article CLI matches ${X_ARTICLE_HOST_PROTOCOL}.\n`);
    }
    catch (error) {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    }
}
//# sourceMappingURL=check-packaged-x-article-cli.js.map