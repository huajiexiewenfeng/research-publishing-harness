import { createHash } from 'node:crypto';

import {
  hostSelectionMayHaveOccurred,
  selectOneVerifiedFile,
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

function sameAnchor(left, right) {
  return left?.anchor_id === right?.anchor_id
    && left?.asset_id === right?.asset_id
    && left?.block_ordinal === right?.block_ordinal
    && left?.marker === right?.marker;
}

function reconstructEditorBlocks(editor) {
  const unresolved = editor?.import_state?.unresolved_anchors;
  const blocks = editor?.blocks;
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
    sameAnchor(candidate, commandAnchor)
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

  return planned[0].context_digest === digest({
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

export async function runInlineImageUpload({
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
  deadlineExceeded = () => false
}) {
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
    || typeof tab?.playwright?.waitForEvent !== 'function'
    || typeof tab?.playwright?.evaluate !== 'function'
    || typeof command?.payload?.asset?.alt_text !== 'string'
    || command.payload.asset.alt_text.length > 1_000
  ) {
    return outcome('rejected', 'none', 'command_or_asset_invalid', null);
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

  let binding;
  try {
    await anchorLocator.click({ timeoutMs });
    await anchorLocator.press('Home', { timeoutMs });
    const addMedia = tab.playwright.getByRole('button', { name: 'Add Media', exact: true });
    await addMedia.click({ timeoutMs });
    const mediaMenu = tab.playwright.getByRole('menuitem', { name: 'Media', exact: true });
    binding = await selectOneVerifiedFile({
      tab,
      causalTrigger: mediaMenu,
      resolveInput: async () => {
        const input = tab.playwright.getByTestId('fileInput');
        if (await input.count() !== 1 || !await input.isEnabled()) {
          throw new Error('Inline media file input is ambiguous');
        }
        return input;
      },
      absoluteAssetPath,
      expected: verifiedAsset,
      timeoutMs
    });
  } catch (error) {
    if (hostSelectionMayHaveOccurred(error)) {
      return outcome(
        'uncertain',
        'unknown',
        'observation_unavailable_after_selection',
        null
      );
    }
    return outcome('transient_failure', 'none', 'file_transfer_missing', null);
  }
  if (binding.kind === 'missing') {
    return outcome('transient_failure', 'none', 'file_transfer_missing', null);
  }

  let afterUpload;
  try {
    afterUpload = await observeStable({
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
  const uploadedVisual = matchingInlineVisual(afterUpload, command);
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

  if (anchorStillPresent(afterUpload, command)) {
    try {
      await anchorLocator.click({ timeoutMs });
      await anchorLocator.press('Home', { timeoutMs });
      await anchorLocator.press('Shift+End', { timeoutMs });
      const selection = await tab.playwright.evaluate(() =>
        window.getSelection()?.toString() ?? ''
      );
      if (selection !== command.payload.anchor.marker) {
        return outcome('uncertain', 'unknown', 'anchor_context_changed', afterUpload);
      }
      await anchorLocator.press('Backspace', { timeoutMs });
    } catch {
      return outcome('uncertain', 'unknown', 'anchor_context_changed', afterUpload);
    }
  }

  try {
    const blocks = composer.locator('[data-block="true"]');
    if (await blocks.count() < command.payload.anchor.block_ordinal) {
      return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
    }
    const mediaBlock = blocks.nth(command.payload.anchor.block_ordinal - 1);
    const altControl = await resolveAltControl(mediaBlock);
    if (altControl === null) {
      return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
    }
    await altControl.click({ timeoutMs });

    const description = tab.playwright.getByRole('textbox', {
      name: 'Description',
      exact: true
    });
    const done = tab.playwright.getByRole('button', { name: 'Done', exact: true });
    if (!await uniqueVisible(description) || !await uniqueVisible(done)) {
      return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
    }
    await description.fill(command.payload.asset.alt_text, { timeoutMs });
    await done.click({ timeoutMs });
  } catch {
    return outcome('uncertain', 'unknown', 'inline_alt_unverified', afterUpload);
  }

  let finalObservation;
  try {
    finalObservation = await observeStable({
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
  return outcome('success', 'complete', 'inline_image_uploaded', finalObservation);
}
