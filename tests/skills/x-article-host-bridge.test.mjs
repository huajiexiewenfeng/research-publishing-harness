import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runXArticleHostBridge } from '../../skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs';

function bridgeInput(kind, { deadlineExceeded = false } = {}) {
  const calls = [];
  const command = {
    kind,
    payload: { kind },
    execution_id: 'execution_bridge_1',
    command_id: `command_${kind}`
  };
  const transaction = (name) => vi.fn(async (input) => {
    calls.push(name);
    return {
      status: 'success',
      effect: 'complete',
      reason: kind === 'observe_article_page' || kind === 'navigate'
        ? 'observation_captured'
        : kind === 'upload_article_cover'
          ? 'cover_uploaded'
          : 'inline_image_uploaded',
      observation: { command_id: input.command.command_id },
      retry_authorized: false
    };
  });
  return {
    tab: {},
    command,
    claim: { claimed: true },
    context: {},
    previousObservation: null,
    observationId: 'observation_bridge_1',
    observedAt: '2026-08-29T08:00:00.000Z',
    absoluteAssetPath: null,
    deadline: { exceeded: () => deadlineExceeded },
    dependencies: {
      runNavigate: transaction('runNavigate'),
      runObserve: transaction('runObserve'),
      runCoverUpload: transaction('runCoverUpload'),
      runInlineImageUpload: transaction('runInlineImageUpload')
    },
    calls
  };
}

async function stagedCoverBridgeInput() {
  const fixtureDir = await mkdtemp(join(tmpdir(), 'rph-host-bridge-source-'));
  const sourcePath = join(fixtureDir, 'cover.png');
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  await writeFile(sourcePath, bytes);

  const input = bridgeInput('upload_article_cover');
  input.absoluteAssetPath = sourcePath;
  input.command = {
    ...input.command,
    side_effect: 'write',
    allowed_origin: 'https://x.com',
    payload: {
      kind: 'upload_article_cover',
      asset: { digest, mime_type: 'image/png' }
    }
  };
  input.claim = {
    claimed: true,
    execution_id: input.command.execution_id,
    command_id: input.command.command_id
  };
  input.dependencies.maxBrowserUploadPathLength = 1;
  return { bytes, fixtureDir, input, sourcePath };
}

describe('complete Draft-only X Article Host Bridge', () => {
  it.each([
    ['navigate', 'runNavigate'],
    ['observe_article_page', 'runObserve'],
    ['upload_article_cover', 'runCoverUpload'],
    ['replace_article_visual_anchor', 'runInlineImageUpload']
  ])('dispatches %s to exactly one transaction', async (kind, expectedCall) => {
    const input = bridgeInput(kind);

    const outcome = await runXArticleHostBridge(input);

    expect(input.calls).toEqual([expectedCall]);
    expect(outcome.report).toEqual({
      command: input.command,
      status: outcome.status,
      host_reason: outcome.reason,
      observation: outcome.observation
    });
  });

  it.each([
    'open_article_preview',
    'open_publish_review',
    'publish_article_once'
  ])('rejects %s before any transaction', async (kind) => {
    const input = bridgeInput(kind);

    await expect(runXArticleHostBridge(input)).rejects.toThrow(/Draft-only/i);
    expect(input.calls).toEqual([]);
  });

  it('rejects an unsupported command before any transaction', async () => {
    const input = bridgeInput('set_article_title');

    await expect(runXArticleHostBridge(input)).rejects.toThrow(/Unsupported/i);
    expect(input.calls).toEqual([]);
  });

  it('stops before dispatch when the shared deadline has expired', async () => {
    const input = bridgeInput('upload_article_cover', { deadlineExceeded: true });

    await expect(runXArticleHostBridge(input)).rejects.toThrow(/deadline/i);
    expect(input.calls).toEqual([]);
  });

  it('does not call Harness claim or report callbacks supplied by a caller', async () => {
    const input = bridgeInput('observe_article_page');
    const claim = vi.fn();
    const report = vi.fn();

    await runXArticleHostBridge({ ...input, claimHarness: claim, reportHarness: report });

    expect(claim).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it('stages an exact media copy when the approved asset path exceeds the browser limit', async () => {
    const { bytes, fixtureDir, input, sourcePath } = await stagedCoverBridgeInput();

    let transportPath = null;
    try {
      input.dependencies.runCoverUpload = vi.fn(async (transactionInput) => {
        transportPath = transactionInput.absoluteAssetPath;
        expect(transportPath).not.toBe(sourcePath);
        expect(await readFile(transportPath)).toEqual(bytes);
        return {
          status: 'success',
          effect: 'complete',
          reason: 'cover_uploaded',
          observation: { command_id: transactionInput.command.command_id },
          retry_authorized: false
        };
      });

      await runXArticleHostBridge(input);

      await expect(readFile(transportPath)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readFile(sourcePath)).toEqual(bytes);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it('removes the staged copy when the media transaction throws', async () => {
    const { fixtureDir, input, sourcePath } = await stagedCoverBridgeInput();
    let transportPath = null;
    try {
      input.dependencies.runCoverUpload = vi.fn(async (transactionInput) => {
        transportPath = transactionInput.absoluteAssetPath;
        throw new Error('host transaction failed');
      });

      await expect(runXArticleHostBridge(input)).rejects.toThrow('host transaction failed');

      await expect(readFile(transportPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(sourcePath)).resolves.toBeInstanceOf(Buffer);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
});
