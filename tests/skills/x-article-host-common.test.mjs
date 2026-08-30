import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as hostCommon from '../../skills/x-publishing-copilot/scripts/x-article-host-common.mjs';

const {
  completeMediaEditor,
  verifyHostMediaInput,
  waitForStableHostObservation
} = hostCommon;

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('host-common-fixture')
]);
const selectionPath = resolve('verified', 'asset.png');
const temporaryRoots = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

async function verifiedMediaInput(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'x-article-host-common-'));
  temporaryRoots.push(directory);
  const absoluteAssetPath = join(directory, 'asset.png');
  await writeFile(absoluteAssetPath, pngBytes);
  const digest = `sha256:${createHash('sha256').update(pngBytes).digest('hex')}`;
  const command = {
    execution_id: 'execution_1',
    command_id: 'command_1',
    kind: 'upload_article_cover',
    side_effect: 'write',
    allowed_origin: 'https://x.com',
    payload: {
      kind: 'upload_article_cover',
      asset: { digest, mime_type: 'image/png' }
    }
  };
  const claim = {
    claimed: true,
    execution_id: command.execution_id,
    command_id: command.command_id
  };
  return { command, claim, absoluteAssetPath, ...overrides };
}

function selectionFixture({ files, multiple = false, setFilesError = null } = {}) {
  const calls = [];
  const binding = files ?? [{ byte_length: pngBytes.length, mime_type: 'image/png' }];
  const input = {
    async click() { calls.push(['input.click']); },
    async evaluate() {
      calls.push(['input.binding']);
      return binding;
    }
  };
  const chooser = {
    async isMultiple() {
      calls.push(['chooser.isMultiple']);
      return multiple;
    },
    async setFiles(paths, options) {
      calls.push(['setFiles', paths, options]);
      if (setFilesError !== null) throw setFilesError;
    }
  };
  const tab = {
    playwright: {
      waitForEvent(name, options) {
        calls.push(['waitForEvent', name, options]);
        return Promise.resolve(chooser);
      }
    }
  };
  return { calls, input, tab };
}

describe('X Article Host media verification', () => {
  it('verifies the exact file bytes, digest, and MIME signature', async () => {
    const input = await verifiedMediaInput();

    await expect(verifyHostMediaInput(input)).resolves.toEqual({
      byte_length: pngBytes.length,
      digest: input.command.payload.asset.digest,
      mime_type: 'image/png'
    });
  });

  it.each([
    ['foreign claim', { claim: { claimed: true, execution_id: 'execution_1', command_id: 'foreign' } }],
    ['relative path', { absoluteAssetPath: 'asset.png' }],
    ['wrong MIME', { mime_type: 'image/jpeg' }]
  ])('rejects %s before browser selection', async (_name, patch) => {
    const input = await verifiedMediaInput();
    if (patch.mime_type !== undefined) input.command.payload.asset.mime_type = patch.mime_type;
    else Object.assign(input, patch);

    await expect(verifyHostMediaInput(input)).resolves.toBeNull();
  });
});

describe('one verified Browser file delivery', () => {
  it('submits one file without reading the transient file input binding', async () => {
    const browser = selectionFixture({ files: [] });

    await expect(hostCommon.deliverOneFile({
      tab: browser.tab,
      causalTrigger: browser.input,
      absoluteAssetPath: selectionPath,
      timeoutMs: 10_000
    })).resolves.toEqual({ kind: 'submitted' });
    expect(browser.calls).toEqual([
      ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
      ['input.click'],
      ['chooser.isMultiple'],
      ['setFiles', [selectionPath], { timeoutMs: 10_000 }]
    ]);
    expect(browser.calls).not.toContainEqual(['input.binding']);
  });

  it('fails closed for a multiple chooser before selecting a file', async () => {
    const browser = selectionFixture({ multiple: true });

    await expect(hostCommon.deliverOneFile({
      tab: browser.tab,
      causalTrigger: browser.input,
      absoluteAssetPath: selectionPath,
      timeoutMs: 10_000
    })).rejects.toThrow(/multiple/i);
    expect(browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(0);
  });

  it('marks a setFiles error as a possibly completed selection', async () => {
    const browser = selectionFixture({ setFilesError: new Error('transport uncertain') });

    const error = await hostCommon.deliverOneFile({
      tab: browser.tab,
      causalTrigger: browser.input,
      absoluteAssetPath: selectionPath,
      timeoutMs: 10_000
    }).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error.selection_may_have_occurred).toBe(true);
    expect(browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });
});

describe('bounded X media editor completion', () => {
  it('waits for image loading, applies once, and waits for the dialog to close', async () => {
    const calls = [];
    let visible = true;
    const loading = {
      async count() { return 1; },
      async waitFor(options) { calls.push(['loading.waitFor', options]); }
    };
    const apply = {
      async count() { return 1; },
      async isVisible() { return true; },
      async isEnabled() { return true; },
      async click(options) { calls.push(['apply.click', options]); visible = false; }
    };
    const dialog = {
      async count() { return visible ? 1 : 0; },
      async isVisible() { return visible; },
      async waitFor(options) { calls.push(['dialog.waitFor', options]); },
      getByRole(role, options) {
        if (role === 'progressbar' && options.name === 'Loading image') return loading;
        if (role === 'button' && options.name === 'Apply') return apply;
        throw new Error(`unexpected media editor role: ${role}/${options.name}`);
      }
    };
    const tab = {
      playwright: {
        getByRole(role, options) {
          expect([role, options]).toEqual(['dialog', { name: 'Edit media', exact: true }]);
          return dialog;
        }
      }
    };

    await expect(completeMediaEditor({
      tab,
      timeoutMs: 10_000,
      appearanceTimeoutMs: 0
    })).resolves.toEqual({ kind: 'applied' });
    expect(calls).toEqual([
      ['loading.waitFor', { state: 'hidden', timeoutMs: 10_000 }],
      ['apply.click', { timeoutMs: 10_000 }],
      ['dialog.waitFor', { state: 'hidden', timeoutMs: 10_000 }]
    ]);
  });

  it('returns not_present when X does not use a media editor', async () => {
    const dialog = {
      async count() { return 0; },
      async isVisible() { return false; }
    };
    const tab = { playwright: { getByRole: () => dialog } };

    await expect(completeMediaEditor({
      tab,
      timeoutMs: 10_000,
      appearanceTimeoutMs: 0
    })).resolves.toEqual({ kind: 'not_present' });
  });
});

describe('bounded Host Observation stability', () => {
  it('polls read-only observations until the first stable result', async () => {
    const observations = [
      { editor: { autosave_state: 'saving' } },
      { editor: { autosave_state: 'saved' } }
    ];
    const observe = vi.fn(async () => observations.shift());

    await expect(waitForStableHostObservation({
      observe,
      timeoutMs: 100,
      pollMs: 1,
      isStable: (observation) => observation?.editor?.autosave_state !== 'saving'
    })).resolves.toEqual({ editor: { autosave_state: 'saved' } });
    expect(observe).toHaveBeenCalledTimes(2);
  });

  it('stops before another poll when the shared deadline expires', async () => {
    const observe = vi.fn(async () => ({ editor: { autosave_state: 'saving' } }));
    const deadlineExceeded = vi.fn()
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    await expect(waitForStableHostObservation({
      observe,
      timeoutMs: 100,
      pollMs: 1,
      deadlineExceeded,
      isStable: () => false
    })).rejects.toThrow(/deadline/i);
    expect(observe).toHaveBeenCalledOnce();
  });
});
