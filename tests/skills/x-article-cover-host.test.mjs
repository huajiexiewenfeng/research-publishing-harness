import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runCoverUpload } from '../../skills/x-publishing-copilot/scripts/x-article-cover-host.mjs';

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('cover-host-fixture')
]);

async function coverFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'x-article-cover-host-'));
  const absoluteAssetPath = join(directory, 'cover.png');
  await writeFile(absoluteAssetPath, pngBytes);
  const digest = `sha256:${createHash('sha256').update(pngBytes).digest('hex')}`;
  return { absoluteAssetPath, digest };
}

function command(digest) {
  return {
    schema_version: '1.0',
    execution_id: 'execution_cover_host_1',
    run_id: 'run_cover_host_1',
    draft_id: '2093554993261654016',
    kind: 'upload_article_cover',
    purpose: 'upload_article_cover',
    expected_page_revision: `sha256:${'a'.repeat(64)}`,
    allowed_origin: 'https://x.com',
    side_effect: 'write',
    payload: {
      kind: 'upload_article_cover',
      package_root: 'articles/shared-agent-knowledge',
      package_digest: `sha256:${'b'.repeat(64)}`,
      asset: {
        asset_id: 'asset-cover-shared-agent-knowledge',
        relative_path: 'assets/cover.png',
        digest,
        mime_type: 'image/png',
        alt_text: 'Shared Agent knowledge cover',
        claim_refs: ['claim-cover']
      }
    },
    command_id: 'command_cover_host_1',
    payload_digest: `sha256:${'c'.repeat(64)}`,
    issued_at: '2026-08-29T08:00:00.000Z'
  };
}

function claim(overrides = {}) {
  return {
    schema_version: '1.0',
    execution_id: 'execution_cover_host_1',
    command_id: 'command_cover_host_1',
    claimed: true,
    claimed_at: '2026-08-29T08:00:01.000Z',
    ...overrides
  };
}

function uploadedObservation() {
  return {
    editor: {
      visuals: [{
        kind: 'cover',
        asset_id: 'asset-cover-shared-agent-knowledge',
        status: 'uploaded'
      }],
      autosave_state: 'saved'
    }
  };
}

function emptySavedObservation() {
  return { editor: { visuals: [], autosave_state: 'saved' } };
}

function fakeTab({ count = 1, visible = true, chooserError = null, setFilesError = null } = {}) {
  const calls = [];
  const chooser = {
    async setFiles(files) {
      calls.push(['setFiles', files]);
      if (setFilesError !== null) throw setFilesError;
    }
  };
  const trigger = {
    async count() { return count; },
    async isVisible() { return visible; },
    async click() { calls.push(['click']); }
  };
  return {
    calls,
    tab: {
      playwright: {
        getByRole(role, options) {
          expect(role).toBe('button');
          expect(options).toEqual({ name: 'Choose File', exact: true });
          return trigger;
        },
        waitForEvent(name, options) {
          calls.push(['waitForEvent', name, options]);
          return chooserError === null ? Promise.resolve(chooser) : Promise.reject(chooserError);
        }
      }
    }
  };
}

async function validInput(overrides = {}) {
  const fixture = await coverFixture();
  const browser = fakeTab();
  return {
    tab: browser.tab,
    command: command(fixture.digest),
    claim: claim(),
    absoluteAssetPath: fixture.absoluteAssetPath,
    observe: async () => uploadedObservation(),
    timeoutMs: 10_000,
    browser,
    ...overrides
  };
}

describe('X Article executable cover Host', () => {
  it('arms the chooser before the exact cover click and selects one absolute file', async () => {
    const input = await validInput();

    const result = await runCoverUpload(input);

    expect(input.browser.calls).toEqual([
      ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
      ['click'],
      ['setFiles', [input.absoluteAssetPath]]
    ]);
    expect(result).toMatchObject({
      status: 'success', effect: 'complete',
      observation: uploadedObservation(), retry_authorized: false
    });
  });

  it('rejects a claim that does not identify the exact command', async () => {
    const input = await validInput({ claim: claim({ command_id: 'foreign_command' }) });

    await expect(runCoverUpload(input)).resolves.toEqual({
      status: 'rejected', effect: 'none', observation: null, retry_authorized: false
    });
    expect(input.browser.calls).toEqual([]);
  });

  it('rejects a relative asset path before touching Chrome', async () => {
    const input = await validInput({ absoluteAssetPath: 'assets/cover.png' });

    await expect(runCoverUpload(input)).resolves.toMatchObject({ status: 'rejected', effect: 'none' });
    expect(input.browser.calls).toEqual([]);
  });

  it('rejects file bytes that do not match the locked digest', async () => {
    const input = await validInput();
    input.command.payload.asset.digest = `sha256:${'0'.repeat(64)}`;

    await expect(runCoverUpload(input)).resolves.toMatchObject({ status: 'rejected', effect: 'none' });
    expect(input.browser.calls).toEqual([]);
  });

  it('rejects file signatures that do not match the locked MIME type', async () => {
    const input = await validInput();
    input.command.payload.asset.mime_type = 'image/jpeg';

    await expect(runCoverUpload(input)).resolves.toMatchObject({ status: 'rejected', effect: 'none' });
    expect(input.browser.calls).toEqual([]);
  });

  it.each([
    ['duplicate', { count: 2, visible: true }],
    ['hidden', { count: 1, visible: false }]
  ])('rejects a %s cover control', async (_name, control) => {
    const browser = fakeTab(control);
    const input = await validInput({ tab: browser.tab, browser });

    await expect(runCoverUpload(input)).resolves.toMatchObject({ status: 'rejected', effect: 'none' });
    expect(browser.calls).toEqual([]);
  });

  it('reports no effect when the causal chooser does not open', async () => {
    const browser = fakeTab({ chooserError: new Error('chooser timeout') });
    const input = await validInput({ tab: browser.tab, browser });

    await expect(runCoverUpload(input)).resolves.toEqual({
      status: 'transient_failure', effect: 'none', observation: null, retry_authorized: false
    });
    expect(browser.calls).toEqual([
      ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
      ['click']
    ]);
  });

  it('reports an unknown effect when file selection throws', async () => {
    const browser = fakeTab({ setFilesError: new Error('transport failed') });
    const input = await validInput({ tab: browser.tab, browser });

    await expect(runCoverUpload(input)).resolves.toEqual({
      status: 'uncertain', effect: 'unknown', observation: null, retry_authorized: false
    });
  });

  it('reports no effect when a fresh saved observation still has no cover', async () => {
    const input = await validInput({ observe: async () => emptySavedObservation() });

    await expect(runCoverUpload(input)).resolves.toEqual({
      status: 'transient_failure', effect: 'none',
      observation: emptySavedObservation(), retry_authorized: false
    });
  });

  it('reports an unknown effect when the fresh observation cannot be obtained', async () => {
    const input = await validInput({ observe: async () => { throw new Error('observation failed'); } });

    await expect(runCoverUpload(input)).resolves.toEqual({
      status: 'uncertain', effect: 'unknown', observation: null, retry_authorized: false
    });
  });
});
