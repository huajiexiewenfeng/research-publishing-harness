import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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
  mediaEditorAfterSelection = false
} = {}) {
  const calls = [];
  let mediaEditorVisible = mediaEditorInitiallyOpen;
  let insertDialogVisible = false;
  const anchorLocator = {
    async count() { return anchorCount; },
    async textContent() { calls.push(['anchor.textContent']); return anchorText; },
    async click() { calls.push(['anchor.click']); },
    async press(key) { calls.push(['anchor.press', key]); }
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
    async click() {
      calls.push(['mediaMenu.click']);
      insertDialogVisible = true;
    }
  };
  const fileInput = {
    async count() { return 1; },
    async isEnabled() { return true; },
    async click() { calls.push(['fileInput.click']); },
    async evaluate() { calls.push(['input.binding']); return bindingFiles; }
  };
  const insertDialog = {
    async count() { return insertDialogVisible ? 1 : 0; },
    async isVisible() { return insertDialogVisible; },
    async waitFor(options) { calls.push(['insertDialog.waitFor', options]); },
    locator(selector) {
      expect(selector).toBe('input[type="file"]');
      calls.push(['insertDialog.locator', selector]);
      return fileInput;
    }
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
      playwright: {
        getByTestId(testId) {
          if (testId === 'composer') return composer;
          if (testId === 'fileInput') return fileInput;
          throw new Error(`unexpected test id: ${testId}`);
        },
        getByRole(role, options) {
          if (role === 'dialog' && options.name === 'Edit media') return mediaEditor;
          if (role === 'dialog' && options.name === 'Insert') return insertDialog;
          if (role === 'button' && options.name === 'Add Media') return addMedia;
          if (role === 'menuitem' && options.name === 'Media') return mediaMenu;
          if (role === 'textbox' && options.name === 'Description') return description;
          if (role === 'button' && options.name === 'Done') return done;
          throw new Error(`unexpected role: ${role}/${options.name}`);
        },
        waitForEvent(name, options) {
          calls.push(['waitForEvent', name, options]);
          return Promise.resolve(chooser);
        },
        async evaluate() { calls.push(['readSelection']); return selectionText; }
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
    stabilityTimeoutMs: 20,
    pollMs: 1,
    deadlineExceeded: () => false,
    browser,
    ...options.input
  };
}

describe('one exact X Article inline image transaction', () => {
  it('applies X media editing before replacing the anchor and setting Alt', async () => {
    const input = await validInput({ browser: { mediaEditorAfterSelection: true } });

    await expect(runInlineImageUpload(input)).resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'inline_image_uploaded'
    });
    const applyIndex = input.browser.calls.findIndex(([name]) => name === 'apply.click');
    const deleteIndex = input.browser.calls.findIndex(([name, key]) =>
      name === 'anchor.press' && key === 'Backspace'
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
      ['anchor.press', 'Home'],
      ['addMedia.click'],
      ['mediaMenu.click'],
      ['insertDialog.waitFor', { state: 'visible', timeoutMs: 10_000 }],
      ['insertDialog.locator', 'input[type="file"]'],
      ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
      ['fileInput.click'],
      ['setFiles', [input.absoluteAssetPath], { timeoutMs: 10_000 }],
      ['anchor.press', 'Shift+End'],
      ['readSelection'],
      ['anchor.press', 'Backspace'],
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
    expect(input.browser.calls).not.toContainEqual(['anchor.press', 'Backspace']);
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
    expect(input.browser.calls).not.toContainEqual(['anchor.press', 'Backspace']);
  });

  it('does not process a second asset or append when only one claim is provided', async () => {
    const input = await validInput({
      input: { availableAssets: [{ path: 'first.png' }, { path: 'second.png' }] }
    });

    await runInlineImageUpload(input);

    expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
    expect(input.browser.calls).not.toContainEqual(['composer.press', 'End']);
    expect(input.browser.calls.some(([, files]) =>
      Array.isArray(files) && files.includes('second.png')
    )).toBe(false);
  });
});
