import {
  deliverOneFile,
  hostSelectionMayHaveOccurred,
  verifyHostMediaInput,
  waitForStableHostObservation
} from './x-article-host-common.mjs';

function outcome(status, effect, reason, observation) {
  return { status, effect, reason, observation, retry_authorized: false };
}

function classifyCover({ observation, command }) {
  const visuals = observation?.editor?.visuals ?? [];
  const matches = visuals.filter((visual) =>
    visual.kind === 'cover'
    && visual.asset_id === command.payload.asset.asset_id
    && visual.block_ordinal === null
  );
  if (
    matches.length === 1
    && matches[0].status === 'uploaded'
    && observation?.editor?.autosave_state === 'saved'
  ) {
    return outcome('success', 'complete', 'cover_uploaded', observation);
  }
  if (
    matches.some((visual) => visual.status === 'processing')
    || observation?.editor?.autosave_state === 'saving'
  ) {
    return outcome(
      'transient_failure',
      'partial',
      'x_media_still_processing',
      observation ?? null
    );
  }
  if (matches.length === 0 && observation?.editor?.autosave_state === 'saved') {
    return outcome('transient_failure', 'none', 'x_media_effect_absent', observation);
  }
  return outcome(
    'uncertain',
    'unknown',
    'observation_unavailable_after_selection',
    observation ?? null
  );
}

async function resolveCoverControls(tab) {
  const input = tab.playwright.getByTestId('fileInput');
  if (
    await input.count() !== 1
    || !await input.isEnabled()
    || !await input.evaluate((element) =>
      (element.parentElement?.parentElement?.textContent || '').includes('5:2 aspect ratio')
    )
  ) return null;

  const trigger = input.locator('..').getByRole('button', {
    name: 'Add photos or video',
    exact: true
  });
  if (
    await trigger.count() !== 1
    || !await trigger.isVisible()
    || !await trigger.isEnabled()
  ) return null;

  return { input, trigger };
}

export async function runCoverUpload({
  tab,
  command,
  claim,
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
    || typeof tab?.playwright?.waitForEvent !== 'function'
  ) {
    return outcome('rejected', 'none', 'command_or_asset_invalid', null);
  }

  let controls;
  try {
    controls = await resolveCoverControls(tab);
  } catch {
    controls = null;
  }
  if (controls === null) {
    return outcome('rejected', 'none', 'cover_control_ambiguous', null);
  }

  try {
    await deliverOneFile({
      tab,
      causalTrigger: controls.trigger,
      absoluteAssetPath,
      timeoutMs
    });
  } catch (error) {
    if (!hostSelectionMayHaveOccurred(error)) {
      return outcome('transient_failure', 'none', 'file_transfer_missing', null);
    }
  }

  let observation;
  try {
    observation = await waitForStableHostObservation({
      observe,
      timeoutMs: stabilityTimeoutMs,
      pollMs,
      deadlineExceeded,
      isStable: (candidate) => candidate?.editor?.autosave_state !== 'saving'
    });
  } catch {
    return outcome(
      'uncertain',
      'unknown',
      'observation_unavailable_after_selection',
      null
    );
  }
  return classifyCover({ observation, command });
}
