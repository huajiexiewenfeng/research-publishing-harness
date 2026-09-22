import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runInlineImageUpload } from '../../skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs';

const pngBytes = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('inline-host-fixture')
]);
const marker = 'RPH_VISUAL_ANCHOR:asset-inline-runtime:2';
const anchor = {
  anchor_id: 'anchor_asset-inline-runtime_2',
  asset_id: 'asset-inline-runtime',
  block_ordinal: 2,
  marker
};
const previousBlock = {
  kind: 'paragraph',
  runs: [{ text: 'Before.', marks: [], link: null }]
};
const nextBlock = {
  kind: 'paragraph',
  runs: [{ text: 'After.', marks: [], link: null }]
};
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    rm(root, { recursive: true, force: true })
  ));
});

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')}`;
}

async function inlineFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'x-article-inline-host-'));
  temporaryRoots.push(directory);
  const absoluteAssetPath = join(directory, 'inline.png');
  await writeFile(absoluteAssetPath, pngBytes);
  return {
    absoluteAssetPath,
    assetDigest: `sha256:${createHash('sha256').update(pngBytes).digest('hex')}`
  };
}

function command(assetDigest) {
  return {
    execution_id: 'execution_inline_host_1',
    run_id: 'run_inline_host_1',
    draft_id: '2093554993261654016',
    command_id: 'command_inline_host_1',
    kind: 'replace_article_visual_anchor',
    purpose: 'replace_article_visual_anchor',
    side_effect: 'write',
    allowed_origin: 'https://x.com',
    payload: {
      kind: 'replace_article_visual_anchor',
      target_ref: 'testid:composer',
      anchor,
      package_root: 'articles/runtime',
      package_digest: `sha256:${'b'.repeat(64)}`,
      asset: {
        asset_id: anchor.asset_id,
        relative_path: 'assets/inline.png',
        digest: assetDigest,
        mime_type: 'image/png',
        alt_text: 'The shared Runtime boundary.',
        claim_refs: ['claim-inline']
      }
    }
  };
}

function claim() {
  return {
    claimed: true,
    execution_id: 'execution_inline_host_1',
    command_id: 'command_inline_host_1'
  };
}

function context(commandValue) {
  const anchorBlock = { kind: 'visual_anchor', anchor_id: anchor.anchor_id, marker };
  return {
    publication_plan: {
      run_id: commandValue.run_id,
      intent: {
        article_package: {
          root: commandValue.payload.package_root,
          digest: commandValue.payload.package_digest
        }
      }
    },
    materialization_plan: {
      execution_id: commandValue.execution_id,
      import_template_digest: `sha256:${'c'.repeat(64)}`,
      document_digest: `sha256:${'d'.repeat(64)}`,
      visual_anchors: [{
        ...anchor,
        asset_digest: commandValue.payload.asset.digest,
        alt_text: commandValue.payload.asset.alt_text,
        context_digest: digest({
          previous_block: previousBlock,
          anchor_block: anchorBlock,
          next_block: nextBlock
        })
      }]
    }
  };
}

function beforeObservation(commandValue, blocks = [previousBlock, nextBlock]) {
  return {
    execution_id: commandValue.execution_id,
    command_id: commandValue.command_id,
    editor: {
      blocks,
      visuals: [],
      autosave_state: 'saved',
      import_state: {
        template_digest: `sha256:${'c'.repeat(64)}`,
        source_document_digest: `sha256:${'d'.repeat(64)}`,
        unresolved_anchors: [anchor]
      }
    }
  };
}

function mediaObservation(commandValue, {
  altText = commandValue.payload.asset.alt_text,
  anchorPresent = false,
  status = 'uploaded',
  autosaveState = 'saved'
} = {}) {
  return {
    execution_id: commandValue.execution_id,
    command_id: commandValue.command_id,
    editor: {
      blocks: [previousBlock, {
        kind: 'image', asset_id: anchor.asset_id, alt_text: commandValue.payload.asset.alt_text
      }, nextBlock],
      visuals: [{
        ref: 'inline-media-2',
        asset_id: anchor.asset_id,
        kind: 'inline',
        block_ordinal: anchor.block_ordinal,
        alt_text: altText,
        status,
        owned_by_execution: true
      }],
      autosave_state: autosaveState,
      import_state: anchorPresent
        ? {
            template_digest: `sha256:${'c'.repeat(64)}`,
            source_document_digest: `sha256:${'d'.repeat(64)}`,
            unresolved_anchors: [anchor]
          }
        : null
    }
  };
}

function fakeBrowser({
  anchorCount = 1,
  anchorText = marker,
  selectionText = marker,
  bindingFiles = [{ byte_length: pngBytes.length, mime_type: 'image/png' }],
  addDescriptionCount = 1,
  plusAltCount = 0,
  mediaEditorInitiallyOpen = false,
  mediaEditorAfterSelection = false,
  unnamedInsertDialog = false,
  zeroHeightInsertDialog = false,
  insertDialogInitiallyOpen = false,
  mediaMenuRequiresWait = false,
  mediaMenuFirstClickFails = false,
  liveX = false,
  anchorPressLosesFocus = false,
  anchorClickThrows = false,
  focusMatches = true,
  altReadback = 'The shared Runtime boundary.',
  saveThrows = false,
  editThrowsOnce = false,
  editThrowsAfterOpen = false,
  altStaysOpen = false,
  emptyAnchorAtCursor = liveX
} = {}) {
  const calls = [];
  let mediaEditorVisible = mediaEditorInitiallyOpen;
  let insertDialogVisible = insertDialogInitiallyOpen;
  let mediaMenuReady = !mediaMenuRequiresWait;
  let mediaMenuClickCount = 0;
  let editCount = 0;
  let altEditorOpen = false;
  const anchorLocator = {
    async count() { return anchorCount; },
    async textContent() { calls.push(['anchor.textContent']); return anchorText; },
    async click() { calls.push(['anchor.click']); if (anchorClickThrows) throw new Error('Click timed out after focus changed'); },
    async press(key) {
      calls.push(['anchor.press', key]);
      if (anchorPressLosesFocus) throw new Error('non-editable locator stole selection');
    }
  };
  function altControl(label, count) {
    return {
      async count() { calls.push([`${label}.count`]); return count; },
      async isVisible() { return count === 1; },
      async click() { calls.push(['addDescription.click']); }
    };
  }
  const addDescription = altControl('Add description', addDescriptionCount);
  const plusAlt = altControl('+ALT', plusAltCount);
  const mediaBlock = {
    getByRole(role, options) {
      expect(role).toBe('button');
      if (options.name === 'Edit media') return {
        count: async () => liveX ? 1 : 0, isVisible: async () => liveX,
        click: async () => {
          calls.push(['editMedia.click']);
          if (editThrowsOnce && editCount++ === 0) throw new Error('CDP edit dispatch timed out');
          altEditorOpen = true;
          if (editThrowsAfterOpen) throw new Error('CDP timed out after dialog opened');
        }
      };
      if (options.name === 'Add description') return addDescription;
      if (options.name === '+ALT') return plusAlt;
      throw new Error(`unexpected media button: ${options.name}`);
    }
  };
  const blockList = {
    async count() { return 3; },
    nth(index) { calls.push(['blocks.nth', index]); return mediaBlock; }
  };
  const composer = {
    async press(key) { calls.push(['composer.press', key]); },
    locator(selector, options) {
      if (selector === '.public-DraftStyleDefault-block') {
        calls.push(['composer.locator', selector, options]);
        return anchorLocator;
      }
      if (selector === '[data-block="true"]') return blockList;
      throw new Error(`unexpected composer locator: ${selector}`);
    }
  };
  const addMedia = {
    async click() { calls.push(['addMedia.click']); }
  };
  const mediaMenu = {
    async waitFor(options) {
      calls.push(['mediaMenu.waitFor', options]);
      mediaMenuReady = true;
    },
    async click() {
      mediaMenuClickCount += 1;
      if (mediaMenuFirstClickFails && mediaMenuClickCount === 1) {
        throw new Error('media menu click raced with X rendering');
      }
      if (!mediaMenuReady) throw new Error('media menu is not ready');
      calls.push(['mediaMenu.click']);
      insertDialogVisible = true;
    },
    async count() { return 1; },
    async isVisible() { return true; },
    async isEnabled() { return true; }
  };
  const fileInput = {
    async count() { return 1; },
    async isEnabled() { return true; },
    async click() { calls.push(['fileInput.click']); },
    async evaluate() { calls.push(['input.binding']); return bindingFiles; }
  };
  const uploadButton = {
    first() { return this; },
    async count() { return 2; },
    async isVisible() { return true; },
    async isEnabled() { return true; },
    async click() { calls.push(['uploadButton.click']); }
  };
  const ambiguousPageFileInputs = {
    async count() { return 2; },
    async isEnabled() { return true; }
  };
  const insertDialog = {
    async count() { return insertDialogVisible ? 1 : 0; },
    async isVisible() { return insertDialogVisible && !zeroHeightInsertDialog; },
    getByRole(role, options) {
      expect(options.name).toBe('Add photos or video');
      return { ...uploadButton, count: async () => 1,
        click: async () => calls.push(['dialogUpload.click']) };
    },
    async waitFor(options) {
      calls.push(['insertDialog.waitFor', options]);
      if (unnamedInsertDialog) throw new Error('unnamed dialog waitFor is unreliable');
    },
    locator(selector) {
      expect(selector).toBe('input[type="file"]');
      calls.push(['insertDialog.locator', selector]);
      return fileInput;
    }
  };
  const missingInsertDialog = {
    async count() { return 0; },
    async isVisible() { return false; },
    async waitFor() { throw new Error('named Insert dialog is unavailable'); },
    locator() { return fileInput; }
  };
  const chooser = {
    async isMultiple() { return false; },
    async setFiles(files, options) {
      calls.push(['setFiles', files, options]);
      if (mediaEditorAfterSelection) mediaEditorVisible = true;
    }
  };
  const loading = {
    async count() { return mediaEditorVisible ? 1 : 0; },
    async waitFor(options) { calls.push(['loading.waitFor', options]); }
  };
  const apply = {
    async count() { return mediaEditorVisible ? 1 : 0; },
    async isVisible() { return mediaEditorVisible; },
    async isEnabled() { return mediaEditorVisible; },
    async click(options) { calls.push(['apply.click', options]); mediaEditorVisible = false; }
  };
  const mediaEditor = {
    async count() { return mediaEditorVisible ? 1 : 0; },
    async isVisible() { return mediaEditorVisible; },
    async waitFor(options) {
      if (!mediaEditorInitiallyOpen && !mediaEditorAfterSelection) {
        throw new Error('media editor not present');
      }
      calls.push(['mediaEditor.waitFor', options]);
    },
    getByRole(role, options) {
      if (role === 'progressbar' && options.name === 'Loading image') return loading;
      if (role === 'button' && options.name === 'Apply') return apply;
      throw new Error(`unexpected media editor role: ${role}/${options.name}`);
    }
  };
  const description = {
    async count() { return 1; },
    async isVisible() { return true; },
    async fill(value) { calls.push(['description.fill', value]); }
  };
  const done = {
    async count() { return 1; },
    async isVisible() { return true; },
    async click() { calls.push(['done.click']); }
  };
  return {
    calls,
    tab: {
      clipboard: { async write(items) { calls.push(['clipboard.write', items]); } },
      cua: { async keypress({ keys }) { calls.push(['cua.keypress', keys]); } },
      playwright: {
        getByTestId(testId) {
          if (testId === 'composer') return composer;
          if (testId === 'fileInput') return fileInput;
          throw new Error(`unexpected test id: ${testId}`);
        },
        getByRole(role, options) {
          if (role === 'tab' && options?.name === 'Edit image description') return {
            waitFor: async () => {}, count: async () => altEditorOpen ? 1 : 0, isVisible: async () => altEditorOpen,
            click: async () => calls.push(['altTab.click'])
          };
          if (role === 'textbox' && options?.name === 'Alt text') return { ...description,
            waitFor: async ({ state }) => {
              if (state === 'hidden' && altStaysOpen) throw new Error('Alt editor still open');
            } };
          if (role === 'button' && options?.name === 'Save') return { ...done,
            click: async () => {
              calls.push(['save.click']);
              if (saveThrows) throw new Error('Save click timed out');
            } };
          if (role === 'dialog' && options?.name === 'Edit media') return mediaEditor;
          if (role === 'dialog' && options?.name === 'Insert') {
            return unnamedInsertDialog ? missingInsertDialog : insertDialog;
          }
          if (role === 'dialog' && options?.name === undefined) return insertDialog;
          if (role === 'button' && options?.name === 'Add Media') return addMedia;
          if (role === 'button' && options?.name === 'Add photos or video') return uploadButton;
          if (role === 'menuitem' && options?.name === 'Media') return mediaMenu;
          if (role === 'textbox' && options?.name === 'Description') return description;
          if (role === 'button' && options?.name === 'Done') return done;
          throw new Error(`unexpected role: ${role}/${options?.name}`);
        },
        locator(selector) {
          if (selector === 'input[type="file"]') return ambiguousPageFileInputs;
          if (selector === 'input[type="file"]:not([multiple])') {
            return unnamedInsertDialog ? ambiguousPageFileInputs : fileInput;
          }
          throw new Error(`unexpected page locator: ${selector}`);
        },
        waitForEvent(name, options) {
          calls.push(['waitForEvent', name, options]);
          return Promise.resolve(chooser);
        },
        async waitForTimeout(timeoutMs) { calls.push(['waitForTimeout', timeoutMs]); },
        async evaluate(fn, arg) {
          if (arg?.checkEmptyAnchor === true) return emptyAnchorAtCursor;
          if (arg?.checkAnchorFocus === true) return focusMatches;
          if (arg?.readAltText === true) return altReadback;
          calls.push(['readSelection']); return selectionText;
        }
      }
    }
  };
}

async function validInput(options = {}) {
  const fixture = await inlineFixture();
  const commandValue = command(fixture.assetDigest);
  const browser = fakeBrowser(options.browser);
  const observations = options.observations ?? [
    mediaObservation(commandValue, { anchorPresent: true }),
    mediaObservation(commandValue)
  ];
  let observationIndex = 0;
  return {
    tab: browser.tab,
    command: commandValue,
    claim: claim(),
    context: context(commandValue),
    beforeObservation: beforeObservation(commandValue),
    absoluteAssetPath: fixture.absoluteAssetPath,
    observe: async () => observations[Math.min(observationIndex++, observations.length - 1)],
    timeoutMs: 10_000,
    stabilityTimeoutMs: 100,
    pollMs: 1,
    deadlineExceeded: () => false,
    browser,
    // Keep legacy chooser regression cases explicit. Production defaults to PNG paste.
    transport: 'file_chooser',
    ...options.input
  };
}

describe('one exact X Article inline image transaction', () => {
  it('defaults to one verified PNG paste without opening Insert or a file chooser', async () => {
    const input = await validInput({ browser: { liveX: true } });
    delete input.transport;
    delete input.tab.playwright.waitForEvent;
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success' });
    expect(input.browser.calls.filter(([name]) => name === 'clipboard.write')).toEqual([
      ['clipboard.write', [{ entries: [{ mimeType: 'image/png', base64: pngBytes.toString('base64') }] }]]
    ]);
    expect(input.browser.calls.filter(([name, keys]) => name === 'cua.keypress' && keys.join('+') === 'Control+V')).toHaveLength(1);
    expect(input.browser.calls.some(([name]) => ['setFiles', 'addMedia.click', 'mediaMenu.click'].includes(name))).toBe(false);
    expect(input.browser.calls.some(([name]) => name === 'composer.press')).toBe(false);
    expect(input.browser.calls).toContainEqual(['cua.keypress', ['BACKSPACE']]);
  });

  it('never retries a paste whose browser response was lost', async () => {
    const input = await validInput();
    delete input.transport;
    input.tab.cua.keypress = async ({ keys }) => {
      input.browser.calls.push(['cua.keypress', keys]);
      if (keys.join('+') === 'Control+V') throw new Error('paste response lost');
    };
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'uncertain', retry_authorized: false });
    expect(input.browser.calls.filter(([name]) => name === 'clipboard.write')).toHaveLength(1);
    expect(input.browser.calls.filter(([name, keys]) => name === 'cua.keypress' && keys.join('+') === 'Control+V')).toHaveLength(1);
    expect(input.browser.calls.some(([name]) => name === 'setFiles')).toBe(false);
  });

  it('rejects missing clipboard capabilities before page mutation instead of silently falling back', async () => {
    const input = await validInput();
    delete input.transport;
    delete input.tab.clipboard;
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'rejected', effect: 'none' });
    expect(input.browser.calls.some(([name]) => name.endsWith('.click') || name === 'setFiles')).toBe(false);
  });

  it('rejects a changed PNG before clipboard write', async () => {
    const input = await validInput();
    delete input.transport;
    input.command.payload.asset.digest = `sha256:${'0'.repeat(64)}`;
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'rejected', effect: 'none' });
    expect(input.browser.calls.some(([name]) => name === 'clipboard.write')).toBe(false);
  });

  it('preserves focus for deletion even when locator.press would redirect it', async () => {
    const input = await validInput();
    delete input.transport;
    input.tab.playwright.getByTestId('composer').press = async () => { throw new Error('locator refocused composer'); };
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success' });
    expect(input.browser.calls).toContainEqual(['cua.keypress', ['SHIFT', 'END']]);
    expect(input.browser.calls).toContainEqual(['cua.keypress', ['BACKSPACE']]);
  });

  it('waits through missing and processing image probes and recovers Edit only, never paste', async () => {
    const input = await validInput({ browser: { liveX: true, editThrowsOnce: true } });
    delete input.transport;
    let probes = 0;
    input.probeInline = async () => {
      probes += 1;
      if (probes <= 2) return null;
      return { status: probes === 3 ? 'processing' : 'uploaded', anchor_present: true,
        media_dom_index: 2, anchor_dom_index: 1, media_after_anchor: true, alt_text: '' };
    };
    input.observe = async () => mediaObservation(input.command);
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success', recovery_count: 1 });
    expect(probes).toBeGreaterThanOrEqual(5);
    expect(input.browser.calls.filter(([name, keys]) => name === 'cua.keypress' && keys.join('+') === 'BACKSPACE')).toHaveLength(2);
    expect(input.browser.calls.filter(([name]) => name === 'clipboard.write')).toHaveLength(1);
    expect(input.browser.calls.filter(([name, keys]) => name === 'cua.keypress' && keys.join('+') === 'Control+V')).toHaveLength(1);
  });

  it('does not paste over an existing marker-adjacent image after interruption', async () => {
    const input = await validInput();
    delete input.transport;
    input.probeInline = async () => ({ status: 'uploaded', anchor_present: true, media_dom_index: 2 });
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'uncertain', retry_authorized: false });
    expect(input.browser.calls.some(([name]) => name === 'clipboard.write' || name === 'setFiles')).toBe(false);
  });
  it('continues an Edit click that timed out after opening the dialog without clicking behind it', async () => {
    const input = await validInput({ browser: { liveX: true, editThrowsAfterOpen: true } });
    input.probeInline = async () => ({ status: 'uploaded', anchor_present: true,
      media_dom_index: 2, alt_text: '' });
    input.observe = async () => mediaObservation(input.command);
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success', recovery_count: 1 });
    expect(input.browser.calls.filter(([name]) => name === 'editMedia.click')).toHaveLength(1);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });
  it('accepts actual exact focus after a click timeout without another click', async () => {
    const input = await validInput({ browser: { anchorClickThrows: true } });
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success' });
    expect(input.browser.calls.filter(([name]) => name === 'anchor.click')).toHaveLength(2);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });
  it('resumes Alt after an edit failure without redelivering the file or re-observing partial document', async () => {
    const input = await validInput({ browser: { liveX: true, editThrowsOnce: true } });
    input.probeInline = async () => ({ status: 'uploaded', anchor_present: true,
      media_dom_index: 2, anchor_dom_index: 1, media_after_anchor: true, alt_text: '' });
    input.observe = vi.fn(async () => mediaObservation(input.command));
    const result = await runInlineImageUpload(input);
    expect(result.status).toBe('success');
    expect(result.recovery_count).toBe(1);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
    expect(input.browser.calls.filter(([name]) => name === 'save.click')).toHaveLength(1);
    expect(input.observe).toHaveBeenCalledOnce();
  });

  it('skips persisted Alt on cleanup recovery and never uploads again', async () => {
    const input = await validInput({ browser: { liveX: true } });
    let focusReads = 0;
    const evaluate = input.tab.playwright.evaluate;
    input.tab.playwright.evaluate = async (fn, arg) => {
      if (arg?.checkAnchorFocus) return ++focusReads !== 2 && focusReads !== 3;
      return evaluate(fn, arg);
    };
    input.probeInline = async () => ({ status: 'uploaded', anchor_present: true,
      media_dom_index: 2, anchor_dom_index: 1, media_after_anchor: true,
      alt_text: input.browser.calls.some(([name]) => name === 'save.click') ? input.command.payload.asset.alt_text : '' });
    input.observe = async () => mediaObservation(input.command);
    const result = await runInlineImageUpload(input);
    expect(result.status).toBe('success');
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
    expect(input.browser.calls.filter(([name]) => name === 'save.click')).toHaveLength(1);
  });

  it('keeps the failing stage and original error when its one recovery is exhausted', async () => {
    const input = await validInput({ browser: { liveX: true, altStaysOpen: true } });
    const result = await runInlineImageUpload(input);
    expect(result.status).toBe('uncertain');
    expect(result.diagnostics).toMatchObject({ stage: 'alt_save', error: expect.stringContaining('Alt editor still open') });
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });
  it('uses supported DOM Alt readback and composer keys, not non-editable block keys', async () => {
    const input = await validInput({ browser: { liveX: true, anchorPressLosesFocus: true } });
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success' });
    expect(input.browser.calls.some(([name]) => name === 'anchor.press')).toBe(false);
  });
  it('stops before upload when clicking the marker does not establish exact focus', async () => {
    const input = await validInput({ browser: { focusMatches: false } });
    expect(await runInlineImageUpload(input)).toMatchObject({ reason: 'anchor_context_changed' });
    expect(input.browser.calls.some(([name]) => name === 'setFiles')).toBe(false);
  });
  it('reconciles Save timeout through closed dialog and persisted Alt without another Save', async () => {
    const input = await validInput({ browser: { liveX: true, saveThrows: true } });
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success' });
    expect(input.browser.calls.filter(([name]) => name === 'save.click')).toHaveLength(1);
  });
  it('does not accept a timed-out Save while the Alt dialog remains open', async () => {
    const input = await validInput({ browser: { liveX: true, saveThrows: true, altStaysOpen: true } });
    expect(await runInlineImageUpload(input)).toMatchObject({ reason: 'inline_alt_unverified' });
    expect(input.browser.calls.some(([name, key]) => name === 'cua.keypress' && key.join('+') === 'BACKSPACE')).toBe(false);
  });
  it('does not infer successful Save from dialog closure when persisted Alt differs', async () => {
    const input = await validInput({ browser: { liveX: true, saveThrows: true } });
    input.observe = async () => mediaObservation(input.command, { altText: 'Not saved' });
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'uncertain', reason: 'inline_alt_unverified' });
    expect(input.browser.calls.filter(([name]) => name === 'save.click')).toHaveLength(1);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });
  it('rejects mismatching DOM Alt readback before Save', async () => {
    const input = await validInput({ browser: { liveX: true, altReadback: 'Wrong' } });
    expect(await runInlineImageUpload(input)).toMatchObject({ reason: 'inline_alt_unverified' });
    expect(input.browser.calls.some(([name]) => name === 'save.click')).toBe(false);
  });
  it('waits for the saved Alt readback without reuploading or resubmitting Save', async () => {
    const input = await validInput({ browser: { liveX: true, addDescriptionCount: 0 } });
    input.probeInline = async () => ({ status: 'uploaded', anchor_present: true,
      media_dom_index: 2, anchor_dom_index: 1, media_after_anchor: true });
    let reads = 0;
    input.observe = async () => mediaObservation(input.command, { altText: reads++ === 0 ? '' : input.command.payload.asset.alt_text });
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success' });
    expect(reads).toBe(2);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
    expect(input.browser.calls.filter(([name]) => name === 'save.click')).toHaveLength(1);
  });
  it('leaves a harmless spacer instead of merging an empty paragraph into adjacent media', async () => {
    const input = await validInput({ browser: { liveX: true, addDescriptionCount: 0, emptyAnchorAtCursor: false } });
    input.probeInline = async () => ({ status: 'uploaded', anchor_present: true,
      media_dom_index: 2, anchor_dom_index: 1, media_after_anchor: true });
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success' });
    expect(input.browser.calls.filter(([name, key]) => name === 'cua.keypress' && key.join('+') === 'BACKSPACE')).toHaveLength(1);
  });
  it('uses the observed Insert modal, Edit media ALT and removes the empty marker block', async () => {
    const input = await validInput({ browser: { liveX: true, addDescriptionCount: 0, unnamedInsertDialog: true } });
    input.probeInline = async () => ({ status: 'uploaded', anchor_present: true,
      media_dom_index: 2, anchor_dom_index: 1, media_after_anchor: true });
    input.observe = async () => mediaObservation(input.command);
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success' });
    expect(input.browser.calls).toEqual(expect.arrayContaining([
      ['composer.press', 'End'], ['dialogUpload.click'], ['editMedia.click'], ['altTab.click'],
      ['description.fill', input.command.payload.asset.alt_text], ['save.click'], ['cua.keypress', ['BACKSPACE']]
    ]));
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
    expect(input.browser.calls.some(([name]) => name === 'uploadButton.click')).toBe(false);
  });
  it('does not click Apply or edit Alt after the file transfer crosses a pause fence', async () => {
    const input = await validInput({ browser: { mediaEditorAfterSelection: true } });
    input.progress = {
      assertActive: () => {
        if (input.browser.calls.some(([name]) => name === 'setFiles')) throw new Error('paused');
      },
      milestone: () => {}
    };
    await runInlineImageUpload(input);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
    expect(input.browser.calls.some(([name]) => name === 'apply.click' || name === 'description.fill')).toBe(false);
  });
  it('uses a current-image probe and only one full post-upload observation', async () => {
    const input = await validInput();
    input.observe = vi.fn(async () => mediaObservation(input.command));
    input.probeInline = vi.fn(async () => ({
      status: 'uploaded', anchor_present: true, media_dom_index: 1
    }));
    await expect(runInlineImageUpload(input)).resolves.toMatchObject({ status: 'success' });
    expect(input.probeInline).toHaveBeenCalledOnce();
    expect(input.observe).toHaveBeenCalledOnce();
  });
  it('does not accept an already-uploaded image under the wrong heading', async () => {
    const input = await validInput({ browser: { anchorCount: 0 } });
    input.beforeObservation = mediaObservation(input.command);
    input.context.publication_plan.intent.visuals = [{ asset: input.command.payload.asset,
      placement: { kind: 'block', block_ordinal: 2,
        heading_anchor: { heading_id: 'boundary', heading_text: 'Boundary', block_ordinal: 1 } } }];
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'uncertain', reason: 'anchor_context_changed' });
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(0);
  });

  it('completes one upload under its verified heading', async () => {
    const input = await validInput();
    const heading = { kind: 'heading', runs: [{ text: 'Boundary', marks: [], link: null }] };
    input.beforeObservation.editor.blocks[0] = heading;
    input.context.materialization_plan.visual_anchors[0].context_digest = digest({
      previous_block: heading, anchor_block: { kind: 'visual_anchor', anchor_id: anchor.anchor_id, marker }, next_block: nextBlock
    });
    input.context.publication_plan.intent.visuals = [{ asset: input.command.payload.asset,
      placement: { kind: 'block', block_ordinal: 2,
        heading_anchor: { heading_id: 'boundary', heading_text: 'Boundary', block_ordinal: 1 } } }];
    let observations = 0;
    input.observe = async () => {
      const value = mediaObservation(input.command, { anchorPresent: observations++ === 0 });
      value.editor.blocks[0] = heading;
      return value;
    };
    expect(await runInlineImageUpload(input)).toMatchObject({ status: 'success', effect: 'complete' });
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });

  it('rejects a heading mismatch before any file delivery even when neighbor digests match', async () => {
    const input = await validInput();
    input.context.publication_plan.intent.visuals = [{ asset: input.command.payload.asset,
      placement: { kind: 'block', block_ordinal: 2,
        heading_anchor: { heading_id: 'boundary', heading_text: 'Boundary', block_ordinal: 1 } } }];
    const result = await runInlineImageUpload(input);
    expect(result.status).toBe('rejected');
    expect(result.reason).toBe('anchor_context_changed');
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(0);
  });

  it('verifies heading placement again on the final image observation', async () => {
    const input = await validInput();
    const heading = { kind: 'heading', runs: [{ text: 'Boundary', marks: [], link: null }] };
    input.beforeObservation.editor.blocks[0] = heading;
    input.context.materialization_plan.visual_anchors[0].context_digest = digest({
      previous_block: heading, anchor_block: { kind: 'visual_anchor', anchor_id: anchor.anchor_id, marker }, next_block: nextBlock
    });
    input.context.publication_plan.intent.visuals = [{ asset: input.command.payload.asset,
      placement: { kind: 'block', block_ordinal: 2,
        heading_anchor: { heading_id: 'boundary', heading_text: 'Boundary', block_ordinal: 1 } } }];
    // The existing post-upload fixture has a paragraph, not the bound heading.
    const result = await runInlineImageUpload(input);
    expect(result.status).toBe('uncertain');
    expect(result.reason).toBe('anchor_context_changed');
  });

  it('continues an already-open Insert dialog without clicking behind it', async () => {
    const input = await validInput({browser: {
      unnamedInsertDialog: true, zeroHeightInsertDialog: true,
      insertDialogInitiallyOpen: true, mediaEditorAfterSelection: true
    }});
    await expect(runInlineImageUpload(input)).resolves.toMatchObject({status: 'success'});
    expect(input.browser.calls).toContainEqual(['dialogUpload.click']);
    const delivered = input.browser.calls.findIndex(call => call[0] === 'setFiles');
    expect(input.browser.calls.slice(0, delivered)).not.toContainEqual(['anchor.click']);
    expect(input.browser.calls).not.toContainEqual(['addMedia.click']);
  });

  it('uses the visible upload button inside a zero-height unnamed Insert container', async () => {
    const input = await validInput({
      browser: { unnamedInsertDialog: true, zeroHeightInsertDialog: true, mediaEditorAfterSelection: true }
    });
    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'inline_image_uploaded'
    });
    expect(input.browser.calls).toContainEqual(['dialogUpload.click']);
    expect(input.browser.calls).not.toContainEqual(['uploadButton.click']);
  });

  it('accepts the live X Insert dialog when it has no accessible name', async () => {
    const input = await validInput({
      browser: { unnamedInsertDialog: true, mediaEditorAfterSelection: true }
    });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'inline_image_uploaded'
    });
    expect(input.browser.calls).toContainEqual(['dialogUpload.click']);
  });

  it('waits for the X Media menu item before opening the Insert dialog', async () => {
    const input = await validInput({
      browser: { mediaMenuRequiresWait: true, mediaEditorAfterSelection: true }
    });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'inline_image_uploaded'
    });
    expect(input.browser.calls).toContainEqual([
      'mediaMenu.waitFor', { state: 'visible', timeoutMs: 10_000 }
    ]);
  });

  it('retries one visible Media menu click when X is still settling', async () => {
    const input = await validInput({
      browser: { mediaMenuFirstClickFails: true, mediaEditorAfterSelection: true }
    });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'inline_image_uploaded'
    });
    expect(input.browser.calls).toContainEqual(['mediaMenu.click']);
  });

  it('applies X media editing before replacing the anchor and setting Alt', async () => {
    const input = await validInput({ browser: { mediaEditorAfterSelection: true } });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'inline_image_uploaded'
    });
    const applyIndex = input.browser.calls.findIndex(([name]) => name === 'apply.click');
    const deleteIndex = input.browser.calls.findIndex(([name, key]) =>
      name === 'cua.keypress' && key.join('+') === 'BACKSPACE'
    );
    expect(applyIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(applyIndex);
  });

  it('targets one locked anchor, one chooser, removes only the marker, and verifies Alt', async () => {
    const input = await validInput();

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'inline_image_uploaded',
      retry_authorized: false
    });
    expect(input.browser.calls).toEqual(expect.arrayContaining([
      ['composer.locator', '.public-DraftStyleDefault-block', { hasText: marker }],
      ['anchor.textContent'],
      ['anchor.click'],
      ['cua.keypress', ['HOME']],
      ['addMedia.click'],
      ['mediaMenu.click'],
      ['insertDialog.waitFor', { state: 'visible', timeoutMs: 10_000 }],
      ['insertDialog.locator', 'input[type="file"]'],
      ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
      ['fileInput.click'],
      ['setFiles', [input.absoluteAssetPath], { timeoutMs: 10_000 }],
      ['cua.keypress', ['SHIFT', 'END']],
      ['readSelection'],
      ['cua.keypress', ['BACKSPACE']],
      ['addDescription.click'],
      ['description.fill', input.command.payload.asset.alt_text],
      ['done.click']
    ]));
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });

  it('completes from visual and Alt evidence without file input binding', async () => {
    const input = await validInput({ browser: { bindingFiles: [] } });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success',
      effect: 'complete',
      reason: 'inline_image_uploaded'
    });
    expect(input.browser.calls).not.toContainEqual(['input.binding']);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });

  it('reports an already materialized claimed image without a duplicate upload', async () => {
    const input = await validInput({ browser: { anchorCount: 0 } });
    input.beforeObservation = mediaObservation(input.command);

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success',
      effect: 'complete',
      reason: 'inline_image_already_materialized'
    });
    expect(input.browser.calls).not.toContainEqual(['addMedia.click']);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(0);
  });

  it('accepts a contract-valid materialization anchor that omits the rendered marker', async () => {
    const input = await validInput();
    delete input.context.materialization_plan.visual_anchors[0].marker;

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'inline_image_uploaded'
    });
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });

  it.each([
    ['missing anchor', 0],
    ['duplicate anchor', 2]
  ])('rejects %s before opening Add Media', async (_name, anchorCount) => {
    const input = await validInput({ browser: { anchorCount } });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'rejected', effect: 'none', reason: 'anchor_control_ambiguous'
    });
    expect(input.browser.calls).not.toContainEqual(['addMedia.click']);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(0);
  });

  it('rejects changed neighbor context before upload', async () => {
    const input = await validInput();
    input.beforeObservation = beforeObservation(input.command, [
      { ...previousBlock, runs: [{ text: 'Changed.', marks: [], link: null }] },
      nextBlock
    ]);

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'rejected', effect: 'none', reason: 'anchor_context_changed'
    });
    expect(input.browser.calls).not.toContainEqual(['addMedia.click']);
  });

  it('stops before marker deletion when the selected text differs', async () => {
    const input = await validInput({ browser: { selectionText: 'different text' } });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'uncertain', reason: 'anchor_context_changed'
    });
    expect(input.browser.calls).not.toContainEqual(['cua.keypress', ['BACKSPACE']]);
    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  });

  it('fails closed when the approved Alt cannot be read back exactly', async () => {
    const input = await validInput({
      observations: [
        mediaObservation(command('ignored'), { anchorPresent: false }),
        mediaObservation(command('ignored'), { altText: 'Changed' })
      ]
    });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'uncertain', reason: 'inline_alt_unverified'
    });
  });

  it('skips keyboard deletion when X already replaced the anchor', async () => {
    const input = await validInput({
      observations: [
        mediaObservation(command('ignored'), { anchorPresent: false }),
        mediaObservation(command('ignored'))
      ]
    });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', reason: 'inline_image_uploaded'
    });
    expect(input.browser.calls).not.toContainEqual(['cua.keypress', ['BACKSPACE']]);
  });

  it('does not process a second asset or append when only one claim is provided', async () => {
    const input = await validInput({
      input: { availableAssets: [{ path: 'first.png' }, { path: 'second.png' }] }
    });

    await runInlineImageUpload(input);

    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
    expect(input.browser.calls.filter(([name, key]) => name === 'composer.press' && key === 'End')).toHaveLength(1);
    expect(input.browser.calls.some(([, files]) =>
      Array.isArray(files) && files.includes('second.png')
    )).toBe(false);
  });
});
