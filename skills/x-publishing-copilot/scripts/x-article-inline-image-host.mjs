import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  completeMediaEditor,
  deliverOneFile,
  hostSelectionMayHaveOccurred,
  verifyHostMediaInput,
  waitForStableHostObservation
} from './x-article-host-common.mjs';

function outcome(status, effect, reason, observation) {
  return { status, effect, reason, observation, retry_authorized: false };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

function digest(value) {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')}`;
}

function sameAnchorIdentity(left, right) {
  return left?.anchor_id === right?.anchor_id
    && left?.asset_id === right?.asset_id
    && left?.block_ordinal === right?.block_ordinal;
}

function sameAnchor(left, right) {
  return sameAnchorIdentity(left, right)
    && left?.marker === right?.marker;
}

function reconstructEditorBlocks(editor) {
  const unresolved = editor?.import_state?.unresolved_anchors;
  const blocks = editor?.blocks;
  if (editor?.import_state === null && Array.isArray(blocks)) return blocks;
  if (!Array.isArray(unresolved) || !Array.isArray(blocks)) return null;

  const anchorsByOrdinal = new Map();
  for (const candidate of unresolved) {
    if (
      !Number.isSafeInteger(candidate?.block_ordinal)
      || candidate.block_ordinal < 1
      || anchorsByOrdinal.has(candidate.block_ordinal)
    ) return null;
    anchorsByOrdinal.set(candidate.block_ordinal, candidate);
  }

  const fullLength = blocks.length + unresolved.length;
  const reconstructed = [];
  let blockIndex = 0;
  for (let ordinal = 1; ordinal <= fullLength; ordinal += 1) {
    const unresolvedAnchor = anchorsByOrdinal.get(ordinal);
    if (unresolvedAnchor !== undefined) {
      reconstructed.push({
        kind: 'visual_anchor',
        anchor_id: unresolvedAnchor.anchor_id,
        marker: unresolvedAnchor.marker
      });
      continue;
    }
    if (blockIndex >= blocks.length) return null;
    reconstructed.push(blocks[blockIndex]);
    blockIndex += 1;
  }
  return blockIndex === blocks.length ? reconstructed : null;
}

function headingMatches(observation, command, context) {
  const binding = context?.publication_plan?.intent?.visuals?.find((candidate) =>
    candidate.asset?.asset_id === command.payload.asset.asset_id);
  const placement = binding?.placement;
  const headingAnchor = placement?.kind === 'block' ? placement.heading_anchor : undefined;
  if (headingAnchor === undefined) return true;
  const blocks = reconstructEditorBlocks(observation?.editor);
  const imageOrdinal = command.payload.anchor.block_ordinal;
  if (blocks === null || placement.block_ordinal !== imageOrdinal
    || !Number.isSafeInteger(headingAnchor.block_ordinal) || headingAnchor.block_ordinal < 1
    || headingAnchor.block_ordinal >= imageOrdinal) return false;
  const heading = blocks[headingAnchor.block_ordinal - 1];
  if (heading?.kind !== 'heading'
    || heading.runs.map((run) => run.text).join('').normalize('NFC') !== headingAnchor.heading_text.normalize('NFC')) return false;
  for (let index = headingAnchor.block_ordinal; index < imageOrdinal - 1; index += 1) {
    if (blocks[index]?.kind !== 'image' && blocks[index]?.kind !== 'visual_anchor') return false;
  }
  return true;
}

function contextMatchesLockedAnchor(beforeObservation, command, context) {
  const commandAnchor = command?.payload?.anchor;
  const materialization = context?.materialization_plan;
  const publication = context?.publication_plan;
  const editor = beforeObservation?.editor;
  if (
    command?.kind !== 'replace_article_visual_anchor'
    || command?.payload?.kind !== command.kind
    || beforeObservation?.execution_id !== command.execution_id
    || materialization?.execution_id !== command.execution_id
    || publication?.run_id !== command.run_id
    || publication?.intent?.article_package?.root !== command.payload.package_root
    || publication?.intent?.article_package?.digest !== command.payload.package_digest
    || editor?.import_state?.template_digest !== materialization.import_template_digest
    || editor?.import_state?.source_document_digest !== materialization.document_digest
  ) return false;

  const planned = materialization.visual_anchors?.filter((candidate) =>
    sameAnchorIdentity(candidate, commandAnchor)
  ) ?? [];
  const observed = editor.import_state.unresolved_anchors.filter((candidate) =>
    sameAnchor(candidate, commandAnchor)
  );
  if (
    planned.length !== 1
    || observed.length !== 1
    || planned[0].asset_digest !== command.payload.asset?.digest
    || planned[0].alt_text !== command.payload.asset?.alt_text
  ) return false;

  const reconstructed = reconstructEditorBlocks(editor);
  if (reconstructed === null) return false;
  const index = commandAnchor.block_ordinal - 1;
  const anchorBlock = reconstructed[index];
  if (
    anchorBlock?.kind !== 'visual_anchor'
    || anchorBlock.anchor_id !== commandAnchor.anchor_id
    || anchorBlock.marker !== commandAnchor.marker
  ) return false;

  return headingMatches(beforeObservation, command, context) && planned[0].context_digest === digest({
    previous_block: reconstructed[index - 1] ?? null,
    anchor_block: anchorBlock,
    next_block: reconstructed[index + 1] ?? null
  });
}

function matchingInlineVisual(observation, command) {
  const matches = observation?.editor?.visuals?.filter((visual) =>
    visual.kind === 'inline'
    && visual.asset_id === command.payload.asset.asset_id
    && visual.block_ordinal === command.payload.anchor.block_ordinal
    && visual.owned_by_execution === true
  ) ?? [];
  return matches.length === 1 ? matches[0] : null;
}

function anchorStillPresent(observation, command) {
  return observation?.editor?.import_state?.unresolved_anchors?.some((candidate) =>
    sameAnchor(candidate, command.payload.anchor)
  ) === true;
}

async function uniqueVisible(locator) {
  return await locator.count() === 1 && await locator.isVisible();
}

async function focusExactAnchor(tab, anchorLocator, marker, timeoutMs, beforeWrite) {
  // Closing Edit media can consume the first focus click. Retry focus only,
  // never a file delivery or destructive key, and verify the live selection.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    beforeWrite();
    try { await anchorLocator.click({ timeoutMs }); } catch {
      // CDP can time out after focus already moved. Inspect the actual selection
      // before deciding whether a second non-destructive focus click is needed.
    }
    const matches = await tab.playwright.evaluate(({ marker }) => {
      const root = document.querySelector('[data-testid="composer"][contenteditable="true"]');
      const rows = Array.from(root?.querySelectorAll('.public-DraftStyleDefault-block') ?? [])
        .filter((row) => row.textContent === marker);
      const selection = window.getSelection();
      return rows.length === 1 && selection?.isCollapsed === true
        && !!selection.anchorNode && rows[0].contains(selection.anchorNode)
        && !!selection.focusNode && rows[0].contains(selection.focusNode);
    }, { checkAnchorFocus: true, marker });
    if (matches === true) return true;
  }
  return false;
}

async function resolveInsertFileInput(tab, timeoutMs) {
  const namedDialog = tab.playwright.getByRole('dialog', {
    name: 'Insert',
    exact: true
  });
  try {
    await namedDialog.waitFor({ state: 'visible', timeoutMs });
    if (await namedDialog.count() === 1 && await namedDialog.isVisible()) {
      const input = namedDialog.locator('input[type="file"]');
      if (await input.count() === 1 && await input.isEnabled()) return input;
    }
  } catch {
    // X currently renders the Insert modal without an accessible dialog name.
  }

  const unnamedDialog = tab.playwright.getByRole('dialog');
  try {
    // X can render a zero-height dialog container around visible positioned children.
    // Check the unique dialog's upload control instead of the container box.
    if (await unnamedDialog.count() === 1) {
      const upload = unnamedDialog.getByRole('button', { name: 'Add photos or video', exact: true });
      if (await uniqueVisible(upload) && await upload.isEnabled()) return upload;
      const input = unnamedDialog.locator('input[type="file"]');
      if (await uniqueVisible(input) && await input.isEnabled()) return input;
    }
  } catch {
    // The Chrome bridge may expose the modal but not its descendant locator.
  }

  // Never guess a page-wide upload button: the cover has the same label.
  return null;
}

async function resolveAltControl(mediaBlock) {
  const addDescription = mediaBlock.getByRole('button', {
    name: 'Add description',
    exact: true
  });
  const plusAlt = mediaBlock.getByRole('button', { name: '+ALT', exact: true });
  const candidates = [];
  if (await uniqueVisible(addDescription)) candidates.push(addDescription);
  if (await uniqueVisible(plusAlt)) candidates.push(plusAlt);
  return candidates.length === 1 ? candidates[0] : null;
}

async function observeStable(input) {
  return waitForStableHostObservation({
    observe: input.observe,
    timeoutMs: input.stabilityTimeoutMs,
    pollMs: input.pollMs,
    deadlineExceeded: input.deadlineExceeded,
    isStable: (observation) => observation?.editor?.autosave_state !== 'saving'
  });
}

// One command owns both attempts. A delivered file is never submitted again.
// Recovery is deliberately local to this invocation, not permission to replay a claim.
export async function runInlineImageUpload(input) {
  const transaction = { fileDelivered: false, stage: 'preflight', recoverable: false, errors: [] };
  let result = await runInlineImageAttempt({ ...input, transaction });
  let recoveryCount = 0;
  if (result.status !== 'success' && transaction.fileDelivered && transaction.recoverable
    && typeof input.probeInline === 'function') {
    input.progress?.assertActive();
    transaction.recoverable = false;
    transaction.resuming = true;
    recoveryCount = 1;
    result = await runInlineImageAttempt({ ...input, transaction });
  }
  return { ...result, recovery_count: recoveryCount,
    ...(transaction.errors.length ? { diagnostics: transaction.errors.at(-1), stage_errors: transaction.errors } : {}) };
}

async function runInlineImageAttempt({
  tab,
  command,
  claim,
  context,
  beforeObservation,
  absoluteAssetPath,
  observe,
  timeoutMs = 10_000,
  stabilityTimeoutMs = 20_000,
  pollMs = 500,
  deadlineExceeded = () => false,
  progress,
  probeInline,
  transaction,
  transport = command?.payload?.asset?.mime_type === 'image/png' ? 'clipboard' : 'file_chooser'
}) {
  const beforeWrite = () => progress?.assertActive();
  const milestone = (stage, evidence) => progress?.milestone(command.payload.asset.asset_id, stage, evidence);
  beforeWrite();
  const verifiedAsset = await verifyHostMediaInput({
    command,
    claim,
    absoluteAssetPath
  });
  if (
    verifiedAsset === null
    || typeof observe !== 'function'
    || typeof tab?.playwright?.getByTestId !== 'function'
    || typeof tab?.playwright?.getByRole !== 'function'
    || !['clipboard', 'file_chooser'].includes(transport)
    || typeof tab?.cua?.keypress !== 'function'
    || (transport === 'clipboard' && (verifiedAsset?.mime_type !== 'image/png'
      || typeof tab?.clipboard?.write !== 'function'))
    || (transport === 'file_chooser' && typeof tab?.playwright?.waitForEvent !== 'function')
    || typeof tab?.playwright?.evaluate !== 'function'
    || typeof command?.payload?.asset?.alt_text !== 'string'
    || command.payload.asset.alt_text.length > 1_000
  ) {
    return outcome('rejected', 'none', 'command_or_asset_invalid', null);
  }

  const alreadyMaterialized = matchingInlineVisual(beforeObservation, command);
  if (
    beforeObservation?.command_id === command.command_id
    && alreadyMaterialized?.status === 'uploaded'
    && alreadyMaterialized.alt_text === command.payload.asset.alt_text
    && beforeObservation.editor?.autosave_state === 'saved'
    && !anchorStillPresent(beforeObservation, command)
  ) {
    if (!headingMatches(beforeObservation, command, context)) {
      return outcome('uncertain', 'unknown', 'anchor_context_changed', beforeObservation);
    }
    return outcome(
      'success',
      'complete',
      'inline_image_already_materialized',
      beforeObservation
    );
  }

  let composer;
  let anchorLocator;
  try {
    composer = tab.playwright.getByTestId('composer');
    anchorLocator = composer.locator('.public-DraftStyleDefault-block', {
      hasText: command.payload.anchor.marker
    });
    if (
      await anchorLocator.count() !== 1
      || await anchorLocator.textContent({ timeoutMs }) !== command.payload.anchor.marker
    ) {
      return outcome('rejected', 'none', 'anchor_control_ambiguous', beforeObservation ?? null);
    }
  } catch {
    return outcome('rejected', 'none', 'anchor_control_ambiguous', beforeObservation ?? null);
  }

  if (!contextMatchesLockedAnchor(beforeObservation, command, context)) {
    return outcome('rejected', 'none', 'anchor_context_changed', beforeObservation ?? null);
  }

  milestone('anchor_verified', { anchor_id: command.payload.anchor.anchor_id });
  if (transport === 'clipboard' && !transaction.fileDelivered) {
    try {
      // A partial image already beside this marker must be reconciled, not pasted again.
      const existing = typeof probeInline === 'function' ? await probeInline() : null;
      if (existing !== null) return outcome('uncertain', 'unknown', 'observation_unavailable_after_selection', beforeObservation);
      if (await tab.playwright.getByRole('dialog').count() !== 0) {
        return outcome('rejected', 'none', 'anchor_context_changed', beforeObservation);
      }
      if (!await focusExactAnchor(tab, anchorLocator, command.payload.anchor.marker, timeoutMs, beforeWrite)) {
        return outcome('rejected', 'none', 'anchor_context_changed', beforeObservation);
      }
      // Hash the SAME buffer sent to the clipboard; do not trust an earlier path read.
      transaction.stage = 'clipboard_read';
      const bytes = await readFile(absoluteAssetPath);
      if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== verifiedAsset.digest) {
        return outcome('rejected', 'none', 'command_or_asset_invalid', null);
      }
      beforeWrite();
      await tab.cua.keypress({ keys: ['END'] });
      transaction.stage = 'clipboard_write';
      beforeWrite();
      await tab.clipboard.write([{ entries: [{ mimeType: 'image/png', base64: bytes.toString('base64') }] }]);
      transaction.stage = 'clipboard_paste';
      beforeWrite();
      // Set before dispatch: a lost response is not evidence of no side effect.
      transaction.fileDelivered = true;
      await tab.cua.keypress({ keys: ['Control', 'V'] });
      milestone('file_delivered', { digest: verifiedAsset.digest, transport: 'clipboard' });
    } catch (error) {
      transaction.errors.push({ stage: transaction.stage, error: String(error) });
      return transaction.fileDelivered
        ? outcome('uncertain', 'unknown', 'observation_unavailable_after_selection', null)
        : outcome('transient_failure', 'none', 'file_transfer_missing', null);
    }
  }
  let mediaEditor;
  try {
    mediaEditor = transaction.fileDelivered ? { kind: 'not_present' } : await completeMediaEditor({
      tab,
      timeoutMs,
      beforeWrite,
      appearanceTimeoutMs: 0
    });
  } catch {
    return outcome(
      'uncertain',
      'unknown',
      'observation_unavailable_after_selection',
      null
    );
  }

  if (mediaEditor.kind === 'not_present' && !transaction.fileDelivered) {
    try {
      // A reconciled failure can leave Insert open with no file selected.
      const openDialog = tab.playwright.getByRole('dialog');
      let fileInput = null;
      if (await openDialog.count() === 1) {
        const upload = openDialog.getByRole('button', { name: 'Add photos or video', exact: true });
        if (await uniqueVisible(upload) && await upload.isEnabled()) fileInput = upload;
      }
      if (fileInput === null) {
        if (!await focusExactAnchor(tab, anchorLocator, command.payload.anchor.marker, timeoutMs, beforeWrite)) {
          return outcome('rejected', 'none', 'anchor_context_changed', beforeObservation);
        }
        beforeWrite();
        await composer.press('End', { timeoutMs });
        const addMedia = tab.playwright.getByRole('button', { name: 'Add Media', exact: true });
        beforeWrite();
        await addMedia.click({ timeoutMs });
        const mediaMenu = tab.playwright.getByRole('menuitem', { name: 'Media', exact: true });
        await mediaMenu.waitFor({ state: 'visible', timeoutMs });
        if (typeof tab.playwright.waitForTimeout === 'function') {
          await tab.playwright.waitForTimeout(300);
        }
        try {
          beforeWrite();
          await mediaMenu.click({ timeoutMs });
        } catch (error) {
          if (
            await mediaMenu.count() !== 1
            || !await mediaMenu.isVisible()
            || !await mediaMenu.isEnabled()
          ) throw error;
          beforeWrite();
          await mediaMenu.click({ timeoutMs });
        }
        fileInput = await resolveInsertFileInput(tab, timeoutMs);
      }
      if (fileInput === null) throw new Error('X Article Insert file input is unavailable');
      await deliverOneFile({
        tab,
        causalTrigger: fileInput,
        absoluteAssetPath,
        beforeWrite,
        timeoutMs
      });
      transaction.fileDelivered = true;
      milestone('file_delivered', { digest: verifiedAsset.digest });
    } catch (error) {
      transaction.errors.push({ stage: 'file_chooser', error: String(error) });
      if (!hostSelectionMayHaveOccurred(error)) {
        return outcome('transient_failure', 'none', 'file_transfer_missing', null);
      }
    }

    try {
      const applied = await completeMediaEditor({ tab, timeoutMs, appearanceTimeoutMs: timeoutMs, beforeWrite });
      if (applied.kind === 'applied') milestone('media_applied', { dialog_closed: true });
    } catch {
      return outcome(
        'uncertain',
        'unknown',
        'observation_unavailable_after_selection',
        null
      );
    }
  }

  let afterUpload = null;
  let localMedia = null;
  try {
    if (typeof probeInline === 'function') {
      localMedia = await waitForStableHostObservation({
        observe: probeInline, timeoutMs: stabilityTimeoutMs, pollMs,
        isStable: (candidate) => candidate?.status === 'uploaded'
      });
    }
    if (localMedia === null) afterUpload = await observeStable({
      observe,
      stabilityTimeoutMs,
      pollMs,
      deadlineExceeded
    });
  } catch {
    return outcome(
      'uncertain',
      'unknown',
      'observation_unavailable_after_selection',
      null
    );
  }
  const uploadedVisual = localMedia ?? matchingInlineVisual(afterUpload, command);
  if (
    uploadedVisual?.status === 'processing'
    || afterUpload?.editor?.autosave_state === 'saving'
  ) {
    return outcome(
      'transient_failure',
      'partial',
      'x_media_still_processing',
      afterUpload ?? null
    );
  }
  if (uploadedVisual === null && afterUpload?.editor?.autosave_state === 'saved') {
    return outcome('transient_failure', 'none', 'x_media_effect_absent', afterUpload);
  }
  if (uploadedVisual?.status !== 'uploaded') {
    return outcome(
      'uncertain',
      'unknown',
      'observation_unavailable_after_selection',
      afterUpload ?? null
    );
  }

  try {
    const blocks = composer.locator('[data-block="true"]');
    if (await blocks.count() < command.payload.anchor.block_ordinal) {
      return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
    }
    const mediaBlock = blocks.nth(localMedia?.media_dom_index ?? command.payload.anchor.block_ordinal - 1);
    milestone('image_visible', { status: uploadedVisual.status });
    // A fresh local DOM probe, not a previous attempted Save, proves persisted Alt.
    if (localMedia?.alt_text !== command.payload.asset.alt_text) {
    transaction.stage = 'alt_open';
    const editMedia = Number.isSafeInteger(localMedia?.media_edit_index)
      ? composer.getByRole('button', { name: 'Edit media', exact: true }).nth(localMedia.media_edit_index)
      : mediaBlock.getByRole('button', { name: 'Edit media', exact: true });
    if (await uniqueVisible(editMedia)) {
      const altTab = tab.playwright.getByRole('tab', { name: 'Edit image description', exact: true });
      // A timed-out Edit click may already have opened the modal. Never click
      // the image behind that modal during completion recovery.
      if (!transaction.resuming || !await uniqueVisible(altTab)) {
        beforeWrite();
        await editMedia.click({ timeoutMs });
      }
      transaction.stage = 'alt_tab';
      await altTab.waitFor({ state: 'visible', timeoutMs });
      beforeWrite();
      await altTab.click({ timeoutMs });
      transaction.stage = 'alt_fill';
      const description = tab.playwright.getByRole('textbox', { name: 'Alt text', exact: true });
      await description.waitFor({ state: 'visible', timeoutMs });
      beforeWrite();
      await description.fill(command.payload.asset.alt_text, { timeoutMs });
      // Chrome's locator API has no inputValue(). Read only the visible dialog
      // textarea; the exact accessible textbox was resolved above.
      const altValue = await tab.playwright.evaluate(() => {
        const fields = Array.from(document.querySelectorAll('[role="dialog"] textarea'))
          .filter((field) => field.getClientRects().length > 0);
        return fields.length === 1 ? fields[0].value : null;
      }, { readAltText: true });
      if (altValue !== command.payload.asset.alt_text) {
        return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
      }
      beforeWrite();
      transaction.stage = 'alt_save';
      try {
        await tab.playwright.getByRole('button', { name: 'Save', exact: true }).click({ timeoutMs });
      } catch (error) {
        transaction.errors.push({ stage: transaction.stage, error: String(error) });
        // A click timeout does not prove failure. Do not click again: require
        // closure here and exact persisted Alt in the final observation below.
      }
      await description.waitFor({ state: 'hidden', timeoutMs });
    } else {
      const altControl = await resolveAltControl(mediaBlock);
      if (altControl === null) {
        return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
      }
      beforeWrite();
      await altControl.click({ timeoutMs });

      const description = tab.playwright.getByRole('textbox', {
        name: 'Description',
        exact: true
      });
      const done = tab.playwright.getByRole('button', { name: 'Done', exact: true });
      if (!await uniqueVisible(description) || !await uniqueVisible(done)) {
        return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
      }
      beforeWrite();
      await description.fill(command.payload.asset.alt_text, { timeoutMs });
      beforeWrite();
      await done.click({ timeoutMs });
    }
    }
  } catch (error) {
    transaction.errors.push({ stage: transaction.stage, error: String(error) });
    transaction.recoverable = ['alt_open', 'alt_tab', 'alt_fill'].includes(transaction.stage);
    return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
  }

  if (localMedia?.anchor_present === true || anchorStillPresent(afterUpload, command)) {
    try {
      transaction.stage = 'anchor_focus';
      if (!await focusExactAnchor(tab, anchorLocator, command.payload.anchor.marker, timeoutMs, beforeWrite)) {
        transaction.recoverable = true;
        return outcome('uncertain', 'unknown', 'anchor_context_changed', afterUpload);
      }
      beforeWrite();
      await tab.cua.keypress({ keys: ['HOME'] });
      beforeWrite();
      await tab.cua.keypress({ keys: ['SHIFT', 'END'] });
      const selection = await tab.playwright.evaluate(() => window.getSelection()?.toString() ?? '');
      if (selection !== command.payload.anchor.marker) {
        return outcome('uncertain', 'unknown', 'anchor_context_changed', afterUpload);
      }
      transaction.stage = 'anchor_delete';
      beforeWrite();
      await tab.cua.keypress({ keys: ['BACKSPACE'] });
      if (localMedia?.media_after_anchor === true) {
        const emptyAtCursor = await tab.playwright.evaluate(({ anchorIndex, mediaIndex }) => {
          const root = document.querySelector('[data-testid="composer"][contenteditable="true"]');
          const rows = Array.from(root?.querySelectorAll('[data-block="true"]') ?? []);
          const empty = rows[anchorIndex];
          const selection = window.getSelection();
          return !!empty && empty.textContent === '' && selection?.isCollapsed === true
            && !!selection.anchorNode && empty.contains(selection.anchorNode)
            && mediaIndex === anchorIndex + 1 && !!rows[mediaIndex]?.querySelector('img');
        }, { checkEmptyAnchor: true, anchorIndex: localMedia.anchor_dom_index, mediaIndex: localMedia.media_dom_index });
        if (emptyAtCursor === true) {
          beforeWrite();
          await tab.cua.keypress({ keys: ['BACKSPACE'] });
        }
        // If focus moved, leave the harmless spacer; never delete other content.
      }
    } catch (error) {
      transaction.errors.push({ stage: transaction.stage, error: String(error) });
      transaction.recoverable = transaction.stage === 'anchor_focus';
      return outcome('uncertain', 'unknown', 'anchor_context_changed', afterUpload);
    }
  }

  let finalObservation;
  try {
    finalObservation = await waitForStableHostObservation({
      observe,
      timeoutMs: stabilityTimeoutMs,
      pollMs,
      deadlineExceeded,
      isStable: (value) => {
        const visual = matchingInlineVisual(value, command);
        return value?.editor?.autosave_state === 'saved'
          && visual?.status === 'uploaded'
          && visual.alt_text === command.payload.asset.alt_text
          && !anchorStillPresent(value, command);
      }
    });
  } catch {
    return outcome(
      'uncertain',
      'unknown',
      'observation_unavailable_after_selection',
      null
    );
  }
  const finalVisual = matchingInlineVisual(finalObservation, command);
  if (
    finalVisual?.status !== 'uploaded'
    || finalVisual.alt_text !== command.payload.asset.alt_text
    || finalObservation?.editor?.autosave_state !== 'saved'
  ) {
    return outcome('uncertain', 'unknown', 'inline_alt_unverified', finalObservation ?? null);
  }
  if (anchorStillPresent(finalObservation, command)) {
    return outcome('uncertain', 'unknown', 'anchor_context_changed', finalObservation);
  }
  if (!headingMatches(finalObservation, command, context)) {
    return outcome('uncertain', 'unknown', 'anchor_context_changed', finalObservation);
  }
  milestone('alt_saved', { alt_text: finalVisual.alt_text, observation_id: finalObservation.observation_id });
  return outcome('success', 'complete', 'inline_image_uploaded', finalObservation);
}
