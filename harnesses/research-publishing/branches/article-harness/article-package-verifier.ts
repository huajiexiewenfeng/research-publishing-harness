import { sha256, sha256Bytes } from '../../core/digest.js';
import { HarnessError } from '../../core/errors.js';
import type { WorkspaceStore } from '../../core/workspace-store.js';
import type { ArticleVisualManifest } from '../../core/types.js';
import type { ArticlePackageRef } from './article-service.js';

export async function verifyFinalizedArticlePackage(
  store: WorkspaceStore,
  packageRef: ArticlePackageRef
): Promise<void> {
  const manifest = await store.readJson<ArticleVisualManifest>(
    `${packageRef.root}/visual-manifest.json`
  );
  const binaryPaths = new Set(manifest.bindings.flatMap((binding) => [
    binding.asset.relative_path,
    ...(binding.editable_source === null ? [] : [binding.editable_source.relative_path])
  ]));
  const prefix = `${packageRef.root}/`;
  const entries: Array<{ path: string; digest: string }> = [];
  for (const artifact of packageRef.artifacts) {
    if (!artifact.startsWith(prefix)) {
      throw new HarnessError(
        'CONTRACT_INVALID',
        'Article Package artifact escapes its finalized root'
      );
    }
    const path = artifact.slice(prefix.length);
    const digest = binaryPaths.has(path)
      ? sha256Bytes(await store.readBytes(artifact))
      : path.endsWith('.json')
        ? sha256(await store.readJson<object>(artifact))
        : sha256(await store.readText(artifact));
    entries.push({ path, digest });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  if (sha256(entries) !== packageRef.digest) {
    throw new HarnessError(
      'CONTRACT_INVALID',
      'Finalized Article Package Digest does not match its artifacts'
    );
  }
}
