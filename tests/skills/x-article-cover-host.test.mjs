import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runCoverUpload } from '../../skills/x-publishing-copilot/scripts/x-article-cover-host.mjs';

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('cover-host-fixture')
]);
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function coverFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'x-article-cover-host-'));
  temporaryRoots.push(directory);
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

function coverObservation(status = 'uploaded', autosaveState = 'saved') {
  return {
    editor: {
      visuals: [{
        kind: 'cover',
        asset_id: 'asset-cover-shared-agent-knowledge',
        block_ordinal: null,
        status
      }],
      autosave_state: autosaveState
    }
  };
}

function emptySavedObservation() {
  return { editor: { visuals: [], autosave_state: 'saved' } };
}

function fakeTab({
  count = 1,
  visible = true,
  enabled = true,
  triggerCount = 1,
  triggerVisible = true,
  triggerEnabled = true,
  regionValid = true,
  chooserError = null,
  setFilesError = null,
  multiple = false,
  bindingFiles = [{ byte_length: pngBytes.length, mime_type: 'image/png' }]
} = {}) {
  const calls = [];
  let evaluateCount = 0;
  const trigger = {
    async count() { calls.push(['trigger.count']); return triggerCount; },
    async isVisible() { calls.push(['trigger.isVisible']); return triggerVisible; },
    async isEnabled() { calls.push(['trigger.isEnabled']); return triggerEnabled; },
    async click() { calls.push(['trigger.click']); }
  };
  const input = {
    async count() { calls.push(['input.count']); return count; },
    async isVisible() { calls.push(['input.isVisible']); return visible; },
    async isEnabled() { calls.push(['input.isEnabled']); return enabled; },
    async evaluate() {
      evaluateCount += 1;
      if (evaluateCount === 1) {
        calls.push(['input.region']);
        return regionValid;
      }
      calls.push(['input.binding']);
      return bindingFiles;
    },
    locator(selector) {
      calls.push(['input.locator', selector]);
      return {
        getByRole(role, options) {
          calls.push(['parent.getByRole', role, options]);
          return trigger;
        }
      };
    },
    async click() { calls.push(['input.click']); }
  };
  const chooser = {
    async isMultiple() {
      calls.push(['chooser.isMultiple']);
      return multiple;
    },
    async setFiles(files, options) {
      calls.push(['setFiles', files, options]);
      if (setFilesError !== null) throw setFilesError;
    }
  };
  return {
    calls,
    tab: {
      playwright: {
        getByTestId(testId) {
          calls.push(['getByTestId', testId]);
          return input;
        },
        waitForEvent(name, options) {
          calls.push(['waitForEvent', name, options]);
          return chooserError === null
            ? Promise.resolve(chooser)
            : Promise.reject(chooserError);
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
    observe: async () => coverObservation(),
    timeoutMs: 10_000,
    stabilityTimeoutMs: 20,
    pollMs: 1,
    deadlineExceeded: () => false,
    browser,
    ...overrides
  };
}

describe('X Article causal cover Host', () => {
  it('selects one verified cover and succeeds only after uploaded/saved evidence', async () => {
    const input = await validInput();

    await expect(runCoverUpload(input)).resolves.toMatchObject({
      status: 'success',
      effect: 'complete',
      reason: 'cover_uploaded',
      observation: coverObservation(),
      retry_authorized: false
    });
    expect(input.browser.calls).toEqual([
      ['getByTestId', 'fileInput'],
      ['input.count'],
      ['input.isEnabled'],
      ['input.region'],
      ['input.locator', '..'],
      ['parent.getByRole', 'button', { name: 'Add photos or video', exact: true }],
      ['trigger.count'],
      ['trigger.isVisible'],
      ['trigger.isEnabled'],
      ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
      ['trigger.click'],
      ['chooser.isMultiple'],
      ['setFiles', [input.absoluteAssetPath], { timeoutMs: 10_000 }],
      ['input.binding']
    ]);
  });

  it('uses the visible cover button as the chooser trigger and the file input only as the binding', async () => {
    const input = await validInput();

    await expect(runCoverUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'cover_uploaded'
    });
    expect(input.browser.calls).toContainEqual(['trigger.click']);
    expect(input.browser.calls).not.toContainEqual(['input.click']);
  });

  it.each([
    ['foreign claim', async () => ({ claim: claim({ command_id: 'foreign_command' }) })],
    ['relative asset path', async () => ({ absoluteAssetPath: 'assets/cover.png' })],
    ['changed digest', async (input) => {
      input.command.payload.asset.digest = `sha256:${'0'.repeat(64)}`;
      return {};
    }],
    ['changed MIME', async (input) => {
      input.command.payload.asset.mime_type = 'image/jpeg';
      return {};
    }]
  ])('rejects %s before touching Chrome', async (_name, patchInput) => {
    const input = await validInput();
    Object.assign(input, await patchInput(input));

    await expect(runCoverUpload(input)).resolves.toEqual({
      status: 'rejected',
      effect: 'none',
      reason: 'command_or_asset_invalid',
      observation: null,
      retry_authorized: false
    });
    expect(input.browser.calls).toEqual([]);
  });

  it.each([
    ['duplicate', { count: 2 }],
    ['hidden trigger', { triggerVisible: false }],
    ['disabled', { enabled: false }],
    ['disabled trigger', { triggerEnabled: false }],
    ['outside the 5:2 region', { regionValid: false }]
  ])('rejects a %s cover input as ambiguous', async (_name, browserOptions) => {
    const browser = fakeTab(browserOptions);
    const input = await validInput({ tab: browser.tab, browser });

    await expect(runCoverUpload(input)).resolves.toMatchObject({
      status: 'rejected', effect: 'none', reason: 'cover_control_ambiguous'
    });
    expect(browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(0);
  });

  it.each([
    [
      'file binding missing',
      { bindingFiles: [] },
      async () => coverObservation(),
      'transient_failure',
      'none',
      'file_transfer_missing'
    ],
    [
      'bound but no X effect',
      {},
      async () => emptySavedObservation(),
      'transient_failure',
      'none',
      'x_media_effect_absent'
    ],
    [
      'X still processing',
      {},
      async () => coverObservation('processing'),
      'transient_failure',
      'partial',
      'x_media_still_processing'
    ],
    [
      'observer unavailable',
      {},
      async () => { throw new Error('observer unavailable'); },
      'uncertain',
      'unknown',
      'observation_unavailable_after_selection'
    ]
  ])('%s has one stable classification', async (
    _name,
    browserOptions,
    observe,
    status,
    effect,
    reason
  ) => {
    const browser = fakeTab(browserOptions);
    const input = await validInput({ tab: browser.tab, browser, observe });

    await expect(runCoverUpload(input)).resolves.toMatchObject({
      status, effect, reason, retry_authorized: false
    });
    expect(browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });

  it('does not retry when the chooser fails before binding', async () => {
    const browser = fakeTab({ chooserError: new Error('chooser timeout') });
    const input = await validInput({ tab: browser.tab, browser });

    await expect(runCoverUpload(input)).resolves.toMatchObject({
      status: 'transient_failure', effect: 'none', reason: 'file_transfer_missing',
      retry_authorized: false
    });
    expect(browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(0);
  });

  it('does not retry or claim no effect when setFiles transport is uncertain', async () => {
    const browser = fakeTab({ setFilesError: new Error('transport failed') });
    const input = await validInput({ tab: browser.tab, browser });

    await expect(runCoverUpload(input)).resolves.toMatchObject({
      status: 'uncertain', effect: 'unknown',
      reason: 'observation_unavailable_after_selection', retry_authorized: false
    });
    expect(browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });
});
