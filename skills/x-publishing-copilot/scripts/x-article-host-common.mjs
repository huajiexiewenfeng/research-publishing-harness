import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const MEDIA_COMMANDS = new Set([
  'upload_article_cover',
  'replace_article_visual_anchor'
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

export async function selectOneVerifiedFile({
  tab,
  causalTrigger,
  resolveInput,
  absoluteAssetPath,
  expected,
  timeoutMs
}) {
  if (
    typeof tab?.playwright?.waitForEvent !== 'function'
    || typeof causalTrigger?.click !== 'function'
    || typeof resolveInput !== 'function'
    || !isAbsolute(absoluteAssetPath)
    || !Number.isSafeInteger(expected?.byte_length)
    || expected.byte_length < 0
    || typeof expected?.mime_type !== 'string'
    || !Number.isFinite(timeoutMs)
    || timeoutMs <= 0
  ) {
    throw selectionFailure('X Article file selection input is invalid', false);
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

  let multiple;
  try {
    multiple = await chooser.isMultiple();
  } catch (error) {
    throw selectionFailure('X Article file chooser multiplicity is unavailable', false, error);
  }
  if (multiple) {
    throw selectionFailure('X Article multiple file chooser is not allowed', false);
  }

  try {
    await chooser.setFiles([absoluteAssetPath], { timeoutMs });
  } catch (error) {
    throw selectionFailure('X Article file selection transport is uncertain', true, error);
  }

  let input;
  let bindings;
  try {
    input = await resolveInput();
    if (typeof input?.evaluate !== 'function') {
      throw new Error('Resolved X Article file input is incompatible');
    }
    bindings = await input.evaluate((element) =>
      Array.from(element.files || []).map((file) => ({
        byte_length: file.size,
        mime_type: file.type
      }))
    );
  } catch (error) {
    throw selectionFailure('X Article file input binding is unavailable', true, error);
  }

  if (
    !Array.isArray(bindings)
    || bindings.length !== 1
    || bindings[0]?.byte_length !== expected.byte_length
    || bindings[0]?.mime_type !== expected.mime_type
  ) {
    return { kind: 'missing' };
  }
  return {
    kind: 'bound',
    byte_length: bindings[0].byte_length,
    mime_type: bindings[0].mime_type
  };
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
