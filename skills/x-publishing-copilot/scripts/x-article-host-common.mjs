import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

const MEDIA_COMMANDS = new Set([
  'upload_article_cover',
  'replace_article_visual_anchor'
]);
const MIME_EXTENSIONS = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/gif', '.gif'],
  ['image/webp', '.webp']
]);

function startsWith(bytes, prefix, offset = 0) {
  if (bytes.length < offset + prefix.length) return false;
  return prefix.every((value, index) => bytes[offset + index] === value);
}

function matchesMime(bytes, mimeType) {
  if (mimeType === 'image/png') {
    return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  }
  if (mimeType === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mimeType === 'image/gif') {
    return startsWith(bytes, [...Buffer.from('GIF87a')])
      || startsWith(bytes, [...Buffer.from('GIF89a')]);
  }
  if (mimeType === 'image/webp') {
    return startsWith(bytes, [...Buffer.from('RIFF')])
      && startsWith(bytes, [...Buffer.from('WEBP')], 8);
  }
  return false;
}

function selectionFailure(message, selectionMayHaveOccurred, cause) {
  const error = new Error(message, cause === undefined ? undefined : { cause });
  error.selection_may_have_occurred = selectionMayHaveOccurred;
  return error;
}

function selectionMayHaveOccurred(error) {
  return error?.selection_may_have_occurred === true;
}

export async function verifyHostMediaInput({ command, claim, absoluteAssetPath }) {
  if (
    !MEDIA_COMMANDS.has(command?.kind)
    || command?.payload?.kind !== command.kind
    || command?.side_effect !== 'write'
    || command?.allowed_origin !== 'https://x.com'
    || claim?.claimed !== true
    || claim?.execution_id !== command.execution_id
    || claim?.command_id !== command.command_id
    || typeof absoluteAssetPath !== 'string'
    || !isAbsolute(absoluteAssetPath)
    || typeof command.payload.asset?.digest !== 'string'
    || typeof command.payload.asset?.mime_type !== 'string'
  ) return null;

  let file;
  let bytes;
  try {
    file = await stat(absoluteAssetPath);
    bytes = await readFile(absoluteAssetPath);
  } catch {
    return null;
  }
  if (!file.isFile()) return null;

  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const mimeType = command.payload.asset.mime_type;
  if (digest !== command.payload.asset.digest || !matchesMime(bytes, mimeType)) return null;

  return {
    byte_length: bytes.length,
    digest,
    mime_type: mimeType
  };
}

export async function prepareBrowserUploadPath({
  command,
  claim,
  absoluteAssetPath,
  maxPathLength = 240
}) {
  if (!Number.isSafeInteger(maxPathLength) || maxPathLength <= 0) {
    throw new Error('X Article browser upload path limit is invalid');
  }
  if (typeof absoluteAssetPath !== 'string' || absoluteAssetPath.length <= maxPathLength) {
    return {
      absoluteAssetPath,
      staged: false,
      cleanup: async () => undefined
    };
  }

  const source = await verifyHostMediaInput({ command, claim, absoluteAssetPath });
  if (!source) throw new Error('X Article browser upload source verification failed');

  const extension = MIME_EXTENSIONS.get(source.mime_type);
  if (!extension) throw new Error('X Article browser upload MIME type is unsupported');

  const stagingDirectory = await mkdtemp(join(tmpdir(), 'rph-x-upload-'));
  const stagedPath = join(stagingDirectory, `asset${extension}`);
  try {
    await copyFile(absoluteAssetPath, stagedPath);
    const staged = await verifyHostMediaInput({
      command,
      claim,
      absoluteAssetPath: stagedPath
    });
    if (
      !staged
      || staged.digest !== source.digest
      || staged.byte_length !== source.byte_length
      || staged.mime_type !== source.mime_type
    ) throw new Error('X Article browser upload staging verification failed');

    let cleaned = false;
    return {
      absoluteAssetPath: stagedPath,
      staged: true,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await rm(stagingDirectory, { recursive: true, force: true });
      }
    };
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function deliverOneFile({
  tab,
  causalTrigger,
  absoluteAssetPath,
  timeoutMs
}) {
  if (
    typeof tab?.playwright?.waitForEvent !== 'function'
    || typeof causalTrigger?.click !== 'function'
    || !isAbsolute(absoluteAssetPath)
    || !Number.isFinite(timeoutMs)
    || timeoutMs <= 0
  ) {
    throw selectionFailure('X Article file delivery input is invalid', false);
  }

  let chooserPromise;
  let chooser;
  try {
    chooserPromise = tab.playwright.waitForEvent('filechooser', { timeoutMs });
    void chooserPromise.catch(() => undefined);
    await causalTrigger.click();
    chooser = await chooserPromise;
  } catch (error) {
    throw selectionFailure('X Article file chooser was not opened', false, error);
  }

  try {
    await chooser.isMultiple();
  } catch (error) {
    throw selectionFailure('X Article file chooser multiplicity is unavailable', false, error);
  }

  try {
    await chooser.setFiles([absoluteAssetPath], { timeoutMs });
  } catch (error) {
    throw selectionFailure('X Article file delivery is uncertain', true, error);
  }
  return { kind: 'submitted' };
}

export async function completeMediaEditor({
  tab,
  timeoutMs,
  appearanceTimeoutMs = timeoutMs
}) {
  if (
    typeof tab?.playwright?.getByRole !== 'function'
    || !Number.isFinite(timeoutMs)
    || timeoutMs <= 0
    || !Number.isFinite(appearanceTimeoutMs)
    || appearanceTimeoutMs < 0
  ) return { kind: 'not_present' };

  const dialog = tab.playwright.getByRole('dialog', {
    name: 'Edit media',
    exact: true
  });
  let count = await dialog.count();
  if (count === 0 && appearanceTimeoutMs > 0) {
    try {
      await dialog.waitFor({ state: 'visible', timeoutMs: appearanceTimeoutMs });
    } catch {
      return { kind: 'not_present' };
    }
    count = await dialog.count();
  }
  if (count === 0) return { kind: 'not_present' };
  if (count !== 1 || !await dialog.isVisible()) {
    throw selectionFailure('X Article media editor is ambiguous', true);
  }

  const loading = dialog.getByRole('progressbar', {
    name: 'Loading image',
    exact: true
  });
  const loadingCount = await loading.count();
  if (loadingCount > 1) {
    throw selectionFailure('X Article media loading state is ambiguous', true);
  }
  if (loadingCount === 1) {
    await loading.waitFor({ state: 'hidden', timeoutMs });
  }

  const apply = dialog.getByRole('button', { name: 'Apply', exact: true });
  if (
    await apply.count() !== 1
    || !await apply.isVisible()
    || !await apply.isEnabled()
  ) {
    throw selectionFailure('X Article media Apply control is unavailable', true);
  }
  await apply.click({ timeoutMs });
  await dialog.waitFor({ state: 'hidden', timeoutMs });
  return { kind: 'applied' };
}

export async function waitForStableHostObservation({
  observe,
  timeoutMs = 20_000,
  pollMs = 500,
  isStable,
  deadlineExceeded = () => false
}) {
  if (
    typeof observe !== 'function'
    || typeof isStable !== 'function'
    || typeof deadlineExceeded !== 'function'
    || !Number.isFinite(timeoutMs)
    || timeoutMs <= 0
    || !Number.isFinite(pollMs)
    || pollMs <= 0
  ) throw new Error('X Article Host Observation polling input is invalid');

  const boundedTimeoutMs = Math.min(timeoutMs, 20_000);
  const expiresAt = Date.now() + boundedTimeoutMs;
  let latest = null;

  while (true) {
    if (deadlineExceeded()) throw new Error('X Article Fast Path deadline exceeded');
    latest = await observe();
    if (isStable(latest)) return latest;

    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) return latest;
    await new Promise((resolveSleep) =>
      setTimeout(resolveSleep, Math.min(pollMs, remainingMs))
    );
  }
}

export const hostSelectionMayHaveOccurred = selectionMayHaveOccurred;
