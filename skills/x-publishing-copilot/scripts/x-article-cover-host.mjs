import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

function outcome(status, effect, observation) {
  return { status, effect, observation, retry_authorized: false };
}

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

async function verifyCoverInput({ command, claim, absoluteAssetPath, tab, observe }) {
  if (
    command?.kind !== 'upload_article_cover'
    || command?.payload?.kind !== 'upload_article_cover'
    || command?.side_effect !== 'write'
    || command?.allowed_origin !== 'https://x.com'
    || claim?.claimed !== true
    || claim?.execution_id !== command.execution_id
    || claim?.command_id !== command.command_id
    || !isAbsolute(absoluteAssetPath)
    || typeof observe !== 'function'
    || typeof tab?.playwright?.getByRole !== 'function'
    || typeof tab?.playwright?.waitForEvent !== 'function'
  ) return false;

  let file;
  let bytes;
  try {
    file = await stat(absoluteAssetPath);
    bytes = await readFile(absoluteAssetPath);
  } catch {
    return false;
  }
  if (!file.isFile()) return false;

  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  return digest === command.payload.asset?.digest
    && matchesMime(bytes, command.payload.asset?.mime_type);
}

export async function runCoverUpload({
  tab,
  command,
  claim,
  absoluteAssetPath,
  observe,
  timeoutMs = 10_000
}) {
  if (!await verifyCoverInput({ command, claim, absoluteAssetPath, tab, observe })) {
    return outcome('rejected', 'none', null);
  }

  let trigger;
  try {
    trigger = tab.playwright.getByRole('button', { name: 'Choose File', exact: true });
    if (await trigger.count() !== 1 || !await trigger.isVisible()) {
      return outcome('rejected', 'none', null);
    }
  } catch {
    return outcome('rejected', 'none', null);
  }

  let chooserPromise;
  let chooser;
  try {
    chooserPromise = tab.playwright.waitForEvent('filechooser', { timeoutMs });
    await trigger.click();
    chooser = await chooserPromise;
  } catch {
    if (chooserPromise !== undefined) void chooserPromise.catch(() => undefined);
    return outcome('transient_failure', 'none', null);
  }

  try {
    await chooser.setFiles([absoluteAssetPath]);
  } catch {
    return outcome('uncertain', 'unknown', null);
  }

  let observation;
  try {
    observation = await observe();
  } catch {
    return outcome('uncertain', 'unknown', null);
  }

  const visuals = observation?.editor?.visuals ?? [];
  const matches = visuals.filter((visual) =>
    visual.kind === 'cover'
    && visual.asset_id === command.payload.asset.asset_id
    && visual.status === 'uploaded'
  );
  if (matches.length === 1 && observation?.editor?.autosave_state === 'saved') {
    return outcome('success', 'complete', observation);
  }
  if (matches.length === 0 && observation?.editor?.autosave_state === 'saved') {
    return outcome('transient_failure', 'none', observation);
  }
  return outcome('uncertain', 'unknown', observation ?? null);
}
