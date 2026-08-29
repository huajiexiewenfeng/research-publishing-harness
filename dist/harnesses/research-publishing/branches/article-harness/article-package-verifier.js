import { sha256, sha256Bytes } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
export async function verifyFinalizedArticlePackage(store, packageRef) {
    const manifest = await store.readJson(`${packageRef.root}/visual-manifest.json`);
    const binaryPaths = new Set(manifest.bindings.flatMap((binding) => [
        binding.asset.relative_path,
        ...(binding.editable_source === null ? [] : [binding.editable_source.relative_path])
    ]));
    const prefix = `${packageRef.root}/`;
    const entries = [];
    for (const artifact of packageRef.artifacts) {
        if (!artifact.startsWith(prefix)) {
            throw new HarnessError('CONTRACT_INVALID', 'Article Package artifact escapes its finalized root');
        }
        const path = artifact.slice(prefix.length);
        const digest = binaryPaths.has(path)
            ? sha256Bytes(await store.readBytes(artifact))
            : path.endsWith('.json')
                ? sha256(await store.readJson(artifact))
                : sha256(await store.readText(artifact));
        entries.push({ path, digest });
    }
    entries.sort((left, right) => left.path.localeCompare(right.path));
    if (sha256(entries) !== packageRef.digest) {
        throw new HarnessError('CONTRACT_INVALID', 'Finalized Article Package Digest does not match its artifacts');
    }
}
//# sourceMappingURL=article-package-verifier.js.map