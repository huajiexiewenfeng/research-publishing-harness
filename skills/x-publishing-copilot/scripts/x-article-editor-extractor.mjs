const ALLOWED_PROBE_KEYS = new Set([
  'canonical_url',
  'account_handle',
  'title_controls',
  'composers',
  'file_inputs',
  'controls',
  'media',
  'autosave_text'
]);
const ALLOWED_INDEX_PROBE_KEYS = new Set([
  'canonical_url',
  'account_handle',
  'controls'
]);

const TITLE_KEYS = new Set(['tag', 'placeholder', 'value', 'disabled']);
const COMPOSER_KEYS = new Set([
  'test_id',
  'role',
  'contenteditable',
  'blocks'
]);
const BLOCK_KEYS = new Set([
  'parent_tag',
  'parent_class',
  'runs',
  'media',
  'has_unknown_content'
]);
const RUN_KEYS = new Set(['text', 'bold', 'italic', 'link']);
const MEDIA_KEYS = new Set([
  'kind',
  'ref',
  'block_ordinal',
  'alt_text',
  'status'
]);
const CONTROL_KEYS = new Set(['role', 'name', 'test_id', 'disabled']);
const FILE_INPUT_KEYS = new Set([
  'test_id',
  'accept',
  'multiple',
  'visible',
  'enabled',
  'region_text'
]);

const ANCHOR = /^RPH_VISUAL_ANCHOR:([A-Za-z0-9_-]+):([1-9][0-9]*)$/;
const DRAFT_URL = /^https:\/\/x\.com\/compose\/articles\/edit\/([0-9]+)(?:[?#].*)?$/;
const INDEX_URL = /^https:\/\/x\.com\/compose\/articles(?:[?#].*)?$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function hasUnknownKeys(value, allowed) {
  return Object.keys(value).some((key) => !allowed.has(key));
}

function requireString(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be a string`);
  }
  return value;
}

function normalizeRuns(value, label) {
  let hasUnknownContent = false;
  const runs = requireArray(value, `${label} runs`).map((candidate, index) => {
    const run = requireRecord(candidate, `${label} run ${index + 1}`);
    hasUnknownContent ||= hasUnknownKeys(run, RUN_KEYS);
    const text = requireString(run.text, `${label} run text`, { allowEmpty: true });
    if (typeof run.bold !== 'boolean' || typeof run.italic !== 'boolean') {
      throw new Error(`${label} run marks must be boolean`);
    }
    if (run.link !== null && typeof run.link !== 'string') {
      throw new Error(`${label} run link must be a string or null`);
    }
    const marks = [];
    if (run.bold) marks.push('bold');
    if (run.italic) marks.push('italic');
    return { text, marks, link: run.link };
  });
  return { runs, hasUnknownContent };
}

function classTokens(value, label) {
  const className = requireString(value, label, { allowEmpty: true });
  return new Set(className.split(/\s+/u).filter(Boolean));
}

function normalizeMedia(value, canonicalOrdinal, label) {
  const media = requireRecord(value, label);
  let hasUnknownContent = hasUnknownKeys(media, MEDIA_KEYS);
  const ref = requireString(media.ref, `${label} ref`);
  if (!Number.isInteger(media.block_ordinal) || media.block_ordinal < 1) {
    throw new Error(`${label} block ordinal must be a positive integer`);
  }
  if (media.alt_text !== null && typeof media.alt_text !== 'string') {
    throw new Error(`${label} alt text must be a string or null`);
  }
  if (!['processing', 'uploaded', 'failed'].includes(media.status)) {
    throw new Error(`${label} status is unsupported`);
  }
  if (media.kind !== undefined && media.kind !== 'inline' && media.kind !== 'cover') {
    hasUnknownContent = true;
  }
  return {
    normalized: {
      kind: 'media',
      ref,
      block_ordinal: canonicalOrdinal,
      alt_text: media.alt_text,
      status: media.status
    },
    hasUnknownContent
  };
}

function normalizeBlock(blockCandidate, index) {
  const block = requireRecord(blockCandidate, `composer block ${index + 1}`);
  let hasUnknownContent = hasUnknownKeys(block, BLOCK_KEYS)
    || block.has_unknown_content === true;
  if (block.has_unknown_content !== undefined
    && typeof block.has_unknown_content !== 'boolean') {
    hasUnknownContent = true;
  }
  const tag = requireString(block.parent_tag, `composer block ${index + 1} tag`).toUpperCase();
  const tokens = classTokens(block.parent_class, `composer block ${index + 1} class`);

  if (block.media !== undefined) {
    const media = normalizeMedia(block.media, -1, `composer block ${index + 1} media`);
    hasUnknownContent ||= media.hasUnknownContent;
    if (tag !== 'FIGURE' && !tokens.has('longform-atomic')) hasUnknownContent = true;
    return { type: 'media', media: media.normalized, hasUnknownContent };
  }

  const normalizedRuns = normalizeRuns(block.runs, `composer block ${index + 1}`);
  hasUnknownContent ||= normalizedRuns.hasUnknownContent;

  if (tokens.has('longform-unordered-list-item')) {
    if (tag !== 'LI') hasUnknownContent = true;
    return {
      type: 'list_row',
      kind: 'bullet_list',
      runs: normalizedRuns.runs,
      hasUnknownContent
    };
  }
  if (tokens.has('longform-ordered-list-item')) {
    if (tag !== 'LI') hasUnknownContent = true;
    return {
      type: 'list_row',
      kind: 'ordered_list',
      runs: normalizedRuns.runs,
      hasUnknownContent
    };
  }
  if (tokens.has('longform-header-two')) {
    if (tag !== 'H2') hasUnknownContent = true;
    return { type: 'text', kind: 'heading', runs: normalizedRuns.runs, hasUnknownContent };
  }
  if (tokens.has('longform-header-three')) {
    if (tag !== 'H3') hasUnknownContent = true;
    return { type: 'text', kind: 'subheading', runs: normalizedRuns.runs, hasUnknownContent };
  }
  if (tokens.has('longform-blockquote')) {
    if (tag !== 'BLOCKQUOTE') hasUnknownContent = true;
    return { type: 'text', kind: 'quote', runs: normalizedRuns.runs, hasUnknownContent };
  }
  if (tokens.has('longform-unstyled')) {
    if (tag !== 'DIV') hasUnknownContent = true;
    return { type: 'text', kind: 'paragraph', runs: normalizedRuns.runs, hasUnknownContent };
  }
  throw new Error(`Unsupported X Article block class at block ${index + 1}`);
}

function normalizeControls(value) {
  const refs = new Set();
  return requireArray(value, 'controls').map((candidate, index) => {
    const control = requireRecord(candidate, `control ${index + 1}`);
    if (hasUnknownKeys(control, CONTROL_KEYS)) {
      throw new Error(`Control ${index + 1} contains unexpected metadata`);
    }
    const role = requireString(control.role, `control ${index + 1} role`);
    const name = requireString(control.name, `control ${index + 1} name`, {
      allowEmpty: control.test_id === 'composer'
    });
    if (control.test_id !== null && typeof control.test_id !== 'string') {
      throw new Error(`Control ${index + 1} test id must be a string or null`);
    }
    if (typeof control.disabled !== 'boolean') {
      throw new Error(`Control ${index + 1} disabled state must be boolean`);
    }
    const ref = control.test_id === null
      ? `role:${role}|name:${name}`
      : `testid:${requireString(control.test_id, `control ${index + 1} test id`)}`;
    if (refs.has(ref)) throw new Error(`Duplicate X Article control ref: ${ref}`);
    refs.add(ref);
    return {
      ref,
      role,
      name,
      test_id: control.test_id,
      disabled: control.disabled
    };
  });
}

function normalizeIndexControls(value) {
  const controls = normalizeControls(value).filter((control) =>
    control.role === 'button' && /^(?:Create|New Article)$/iu.test(control.name)
  );
  if (controls.length !== 1) {
    throw new Error('X Articles index must expose exactly one create control');
  }
  return [{ ...controls[0], name: 'create' }];
}

function validateFileInputs(value) {
  for (const [index, candidate] of requireArray(value, 'file inputs').entries()) {
    const input = requireRecord(candidate, `file input ${index + 1}`);
    if (hasUnknownKeys(input, FILE_INPUT_KEYS)) {
      throw new Error(`File input ${index + 1} contains unexpected metadata`);
    }
    if (input.test_id !== null && typeof input.test_id !== 'string') {
      throw new Error(`File input ${index + 1} test id must be a string or null`);
    }
    if (input.accept !== null && typeof input.accept !== 'string') {
      throw new Error(`File input ${index + 1} accept must be a string or null`);
    }
    if (typeof input.multiple !== 'boolean'
      || typeof input.visible !== 'boolean'
      || typeof input.enabled !== 'boolean') {
      throw new Error(`File input ${index + 1} state must be boolean`);
    }
    requireString(input.region_text, `file input ${index + 1} region text`, {
      allowEmpty: true
    });
  }
}

function normalizeCover(value) {
  let cover = null;
  let hasUnknownContent = false;
  const inlineRefs = new Set();
  const mediaRefs = new Set();
  for (const [index, candidate] of requireArray(value, 'media').entries()) {
    const media = requireRecord(candidate, `media ${index + 1}`);
    hasUnknownContent ||= hasUnknownKeys(media, MEDIA_KEYS);
    const normalized = normalizeMedia(
      media,
      media.block_ordinal,
      `media ${index + 1}`
    );
    hasUnknownContent ||= normalized.hasUnknownContent;
    if (mediaRefs.has(normalized.normalized.ref)) {
      throw new Error(`Duplicate X Article media ref: ${normalized.normalized.ref}`);
    }
    mediaRefs.add(normalized.normalized.ref);
    if (media.kind !== 'cover') {
      inlineRefs.add(normalized.normalized.ref);
      continue;
    }
    if (cover !== null) throw new Error('X Article probe contains duplicate cover media');
    cover = {
      ref: normalized.normalized.ref,
      alt_text: null,
      status: normalized.normalized.status
    };
  }
  return { cover, inlineRefs, hasUnknownContent };
}

function autosaveState(value) {
  const text = requireString(value, 'autosave text', { allowEmpty: true });
  if (/^Last saved(?:\s|$)/iu.test(text)) return 'saved';
  if (/^Saving(?:\s|$)/iu.test(text)) return 'saving';
  if (/^Save failed(?:\s|$)/iu.test(text)) return 'failed';
  return 'failed';
}

export function normalizeXArticleIndexProbe(probeCandidate) {
  const probe = requireRecord(probeCandidate, 'X Articles index probe');
  for (const key of Object.keys(probe)) {
    if (!ALLOWED_INDEX_PROBE_KEYS.has(key)) {
      throw new Error(`Unexpected index snapshot key: ${key}`);
    }
  }

  const url = requireString(probe.canonical_url, 'canonical URL');
  if (INDEX_URL.exec(url) === null) {
    throw new Error('Canonical URL is not the X Articles index');
  }
  if (probe.account_handle !== null && typeof probe.account_handle !== 'string') {
    throw new Error('Account handle must be a string or null');
  }

  return {
    schema_version: 'x-article-host-page-snapshot/v1',
    canonical_url: 'https://x.com/compose/articles',
    account_handle: probe.account_handle,
    page_kind: 'articles_index',
    controls: normalizeIndexControls(probe.controls)
  };
}

export async function extractXArticleIndexSnapshot({ tab }) {
  if (typeof tab?.playwright?.evaluate !== 'function') {
    throw new Error('X Article extractor requires a Playwright tab');
  }

  const probe = await tab.playwright.evaluate(() => {
    if (location.origin !== 'https://x.com' || location.pathname !== '/compose/articles') {
      throw new Error('Current page is not https://x.com/compose/articles');
    }
    const profile = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]');
    const profileHref = profile?.getAttribute('href') || '';
    const accountMatch = /^\/([A-Za-z0-9_]{1,15})$/u.exec(profileHref);
    const controls = Array.from(
      document.querySelectorAll('button,[role="button"]')
    ).map((element) => ({
      element,
      name: (element.getAttribute('aria-label') || element.textContent || '').trim()
    })).filter(({ name }) => /^(?:Create|New Article)$/iu.test(name))
      .map(({ element, name }) => ({
        role: 'button',
        name,
        test_id: element.getAttribute('data-testid'),
        disabled: element.hasAttribute('disabled')
          || element.getAttribute('aria-disabled') === 'true'
      }));

    return {
      canonical_url: 'https://x.com/compose/articles',
      account_handle: accountMatch === null ? null : `@${accountMatch[1]}`,
      controls
    };
  });

  return normalizeXArticleIndexProbe(probe);
}

export function normalizeXArticleEditorProbe(probeCandidate) {
  const probe = requireRecord(probeCandidate, 'X Article editor probe');
  for (const key of Object.keys(probe)) {
    if (!ALLOWED_PROBE_KEYS.has(key)) {
      throw new Error(`Unexpected snapshot key: ${key}`);
    }
  }

  const url = requireString(probe.canonical_url, 'canonical URL');
  const draftMatch = DRAFT_URL.exec(url);
  if (draftMatch === null) throw new Error('Canonical URL is not an X Article editor draft');
  if (probe.account_handle !== null && typeof probe.account_handle !== 'string') {
    throw new Error('Account handle must be a string or null');
  }

  const titleControls = requireArray(probe.title_controls, 'title controls');
  if (titleControls.length !== 1) {
    throw new Error('X Article editor must expose exactly one title control');
  }
  const titleControl = requireRecord(titleControls[0], 'title control');
  if (hasUnknownKeys(titleControl, TITLE_KEYS)
    || titleControl.tag !== 'TEXTAREA'
    || titleControl.placeholder !== 'Add a title') {
    throw new Error('X Article title control does not match the bounded contract');
  }
  const title = requireString(titleControl.value, 'X Article title', { allowEmpty: true });

  const composers = requireArray(probe.composers, 'composers');
  if (composers.length !== 1) {
    throw new Error('X Article editor must expose exactly one composer');
  }
  const composer = requireRecord(composers[0], 'composer');
  let hasUnknownContent = hasUnknownKeys(composer, COMPOSER_KEYS);
  if (composer.test_id !== 'composer' || composer.contenteditable !== 'true') {
    throw new Error('X Article composer does not match the bounded contract');
  }

  validateFileInputs(probe.file_inputs);
  const controls = normalizeControls(probe.controls);
  if (!controls.some((control) => control.role === 'textbox' && control.name === 'Add a title')) {
    controls.push({
      ref: 'role:textbox|name:Add a title', role: 'textbox', name: 'Add a title',
      test_id: null, disabled: titleControl.disabled === true
    });
  }
  const coverResult = normalizeCover(probe.media);
  hasUnknownContent ||= coverResult.hasUnknownContent;

  const blocks = [];
  let openListKind = null;
  const sourceBlocks = requireArray(composer.blocks, 'composer blocks');
  for (const [index, candidate] of sourceBlocks.entries()) {
    const block = normalizeBlock(candidate, index);
    hasUnknownContent ||= block.hasUnknownContent;
    // DraftJS leaves an empty spacer when a marker between two atomic images is
    // removed. It is layout, not article text; keep all nonempty/unknown blocks.
    if (block.kind === 'paragraph' && !block.hasUnknownContent
      && block.runs.every((run) => run.text === '')
      && (sourceBlocks[index - 1]?.media || sourceBlocks[index + 1]?.media)) continue;

    if (block.type === 'list_row') {
      if (openListKind === block.kind) {
        blocks.at(-1).items.push(block.runs);
      } else {
        blocks.push({ kind: block.kind, items: [block.runs] });
        openListKind = block.kind;
      }
      continue;
    }

    openListKind = null;
    const canonicalOrdinal = blocks.length + 1;
    if (block.type === 'media') {
      blocks.push({ ...block.media, block_ordinal: canonicalOrdinal });
      continue;
    }

    const anchorRun = block.kind === 'paragraph' && block.runs.length === 1
      && block.runs[0].marks.length === 0 && block.runs[0].link === null
      ? block.runs[0]
      : null;
    const markerMatch = anchorRun === null ? null : ANCHOR.exec(anchorRun.text);
    if (markerMatch !== null) {
      if (Number(markerMatch[2]) !== canonicalOrdinal) {
        throw new Error(
          `X Article visual anchor ordinal ${markerMatch[2]} does not match ${canonicalOrdinal}`
        );
      }
      blocks.push({ kind: 'visual_anchor', marker: anchorRun.text });
      continue;
    }
    if (anchorRun?.text.startsWith('RPH_VISUAL_ANCHOR:') === true) {
      hasUnknownContent = true;
    }
    blocks.push({ kind: block.kind, runs: block.runs });
  }
  const scopedInlineRefs = new Set(
    blocks.filter((block) => block.kind === 'media').map((block) => block.ref)
  );
  if (scopedInlineRefs.size !== coverResult.inlineRefs.size
    || [...scopedInlineRefs].some((ref) => !coverResult.inlineRefs.has(ref))) {
    hasUnknownContent = true;
  }

  return {
    schema_version: 'x-article-host-page-snapshot/v1',
    canonical_url: url,
    account_handle: probe.account_handle,
    page_kind: 'article_editor',
    controls,
    editor: {
      draft_id: draftMatch[1],
      title,
      blocks,
      cover: coverResult.cover,
      autosave_state: autosaveState(probe.autosave_text),
      has_unknown_content: hasUnknownContent
    }
  };
}

// A shortcut only when the exact marker still borders its new image. Ambiguity falls back to full observation.
export async function probeXArticleInlineMedia({ tab, marker, blockOrdinal }) {
  return tab.playwright.evaluate(({ expectedMarker, expectedOrdinal }) => {
    if (!Number.isSafeInteger(expectedOrdinal) || expectedOrdinal < 1) return null;
    const composers = document.querySelectorAll('[data-testid="composer"][contenteditable="true"]');
    if (composers.length !== 1) return null;
    const composer = composers[0];
    const anchors = Array.from(composer.querySelectorAll('.public-DraftStyleDefault-block'))
      .filter((element) => element.textContent === expectedMarker);
    if (anchors.length !== 1) return null;
    const anchorBlock = anchors[0].closest('[data-block="true"]');
    // DraftJS puts each data-block inside a draggable wrapper. End-of-marker
    // insertion leaves the marker before the new media until cleanup.
    const following = anchorBlock?.nextElementSibling
      ?? anchorBlock?.parentElement?.nextElementSibling?.querySelector('[data-block="true"]');
    const preceding = anchorBlock?.previousElementSibling
      ?? anchorBlock?.parentElement?.previousElementSibling?.querySelector('[data-block="true"]');
    const followingImage = following?.querySelector('figure img,img');
    // In a diagram group the preceding image belongs to the previous marker.
    // Prefer the following image, then still require this marker's ordinal.
    const mediaAfterAnchor = !!followingImage;
    const mediaBlock = mediaAfterAnchor ? following : preceding;
    const image = mediaBlock?.querySelector('figure img,img');
    if (!image) return null;
    const blocks = Array.from(composer.querySelectorAll('[data-block="true"]'));
    const mediaIndex = blocks.indexOf(mediaBlock);
    if (mediaIndex < 0) return null;
    // Match the full extractor's list-row grouping without extracting article text.
    let ordinal = 0;
    let previousList = null;
    for (const block of blocks.slice(0, mediaIndex + 1)) {
      if (block === anchorBlock) continue;
      const classes = new Set(String(block.className || '').split(/\s+/));
      const at = blocks.indexOf(block);
      if (classes.has('longform-unstyled') && block.textContent === ''
        && (blocks[at - 1]?.querySelector?.('img') || blocks[at + 1]?.querySelector?.('img'))) continue;
      const list = classes.has('longform-unordered-list-item') ? 'bullet'
        : classes.has('longform-ordered-list-item') ? 'ordered' : null;
      if (list === null || list !== previousList) ordinal += 1;
      previousList = list;
    }
    if (ordinal !== expectedOrdinal) return null;
    return {
      status: image.complete && image.naturalWidth > 0 && !/processing/i.test(mediaBlock.textContent || '')
        ? 'uploaded' : 'processing',
      anchor_present: true, media_dom_index: mediaIndex,
      media_edit_index: blocks.slice(0, mediaIndex).filter((block) => block.querySelector?.('figure img,img')).length,
      alt_text: image.closest?.('[role="group"][aria-label]')?.getAttribute('aria-label')
        || image.getAttribute?.('alt') || '',
      ...(mediaAfterAnchor ? { anchor_dom_index: blocks.indexOf(anchorBlock), media_after_anchor: true } : {})
    };
  }, { expectedMarker: marker, expectedOrdinal: blockOrdinal });
}

export async function extractXArticleEditorSnapshot({ tab }) {
  if (typeof tab?.playwright?.evaluate !== 'function') {
    throw new Error('X Article extractor requires a Playwright tab');
  }

  const probe = await tab.playwright.evaluate(() => {
    const titleControls = Array.from(
      document.querySelectorAll('textarea[placeholder="Add a title"]')
    );
    const composers = Array.from(
      document.querySelectorAll('[data-testid="composer"][contenteditable="true"]')
    );

    const extractRuns = (block) => Array.from(
      block.querySelectorAll('span[data-offset-key]')
    ).map((span) => {
      const style = span.getAttribute('style') || '';
      return {
        text: span.textContent || '',
        bold: /font-weight:\s*(?:bold|[6-9]00)/i.test(style),
        italic: /font-style:\s*italic/i.test(style),
        link: span.closest('a[href]')?.getAttribute('href') || null
      };
    });

    const extractBlocks = (composer) => Array.from(
      composer.querySelectorAll('[data-block="true"]')
    ).map((container, index) => {
      const block = container.querySelector('.public-DraftStyleDefault-block');
      const image = container.querySelector('figure img,img');
      if (image !== null) {
        const mediaGroup = image.closest('[role="group"][aria-label]');
        return {
          parent_tag: 'FIGURE',
          parent_class: container.className || 'longform-atomic',
          runs: [],
          media: {
            kind: 'inline',
            ref: `inline-media-${index + 1}`,
            block_ordinal: index + 1,
            alt_text: mediaGroup?.getAttribute('aria-label') || image.getAttribute('alt'),
            status: /processing/i.test(container.textContent || '') ? 'processing' : 'uploaded'
          }
        };
      }
      const runs = block === null ? [] : extractRuns(block);
      return {
        parent_tag: container.tagName,
        parent_class: container.className || '',
        runs,
        has_unknown_content: block === null
          || (runs.length === 0 && (block.textContent || '').length > 0)
      };
    });

    const composerProbes = composers.map((element) => ({
      test_id: element.getAttribute('data-testid'),
      role: element.getAttribute('role'),
      contenteditable: element.getAttribute('contenteditable'),
      blocks: extractBlocks(element)
    }));

    const controls = [
      ...Array.from(document.querySelectorAll('button,[role="button"]'))
        .map((element) => ({
          element,
          name: (element.getAttribute('aria-label') || element.textContent || '').trim()
        }))
        .filter(({ name }) => /^(Add Media|Publish|Preview)$/i.test(name))
        .map(({ element, name }) => ({
          role: element.getAttribute('role') || element.tagName.toLowerCase(),
          name,
          test_id: element.getAttribute('data-testid'),
          disabled: element.hasAttribute('disabled')
            || element.getAttribute('aria-disabled') === 'true'
        })),
      ...composers.map((element) => ({
        role: element.getAttribute('role') || 'textbox',
        name: '',
        test_id: element.getAttribute('data-testid'),
        disabled: element.getAttribute('aria-disabled') === 'true'
      }))
    ];

    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    const findCoverRegion = (input) => {
      let candidate = input.parentElement;
      let structuralMatch = null;
      for (let depth = 0; depth < 7 && candidate !== null; depth += 1) {
        if ((candidate.textContent || '').includes(
          'We recommend an image with a 5:2 aspect ratio for best results.'
        )) return candidate;
        if (
          structuralMatch === null
          && candidate.querySelector('img') !== null
          && candidate.querySelector('[aria-label="Add photos or video"]') !== null
        ) structuralMatch = candidate;
        candidate = candidate.parentElement;
      }
      return structuralMatch;
    };
    const coverMedia = fileInputs.flatMap((input) => {
      const region = findCoverRegion(input);
      const image = region?.querySelector('img') || null;
      if (image === null) return [];
      return [{
        kind: 'cover',
        ref: 'cover-media',
        block_ordinal: 1,
        alt_text: image.getAttribute('alt'),
        status: /processing/i.test(region.textContent || '') ? 'processing' : 'uploaded'
      }];
    });
    const inlineMedia = composerProbes.flatMap((composer) => composer.blocks
      .flatMap((block) => block.media === undefined ? [] : [{ ...block.media }]));
    const autosaveText = Array.from(document.querySelectorAll('span,div'))
      .map((element) => (element.textContent || '').trim())
      .map((text) => /^(Last saved(?: just now| \d+ (?:second|minute|hour|day)s? ago)?|Saving(?:\.\.\.)?|Save failed(?:\.\.\.)?)/i.exec(text)?.[1] || null)
      .find((text) => text !== null) || '';

    return {
      canonical_url: location.href,
      account_handle: document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')
        ?.getAttribute('href')?.replace(/^\//, '@') || null,
      title_controls: titleControls.map((element) => ({
        tag: element.tagName,
        placeholder: element.getAttribute('placeholder'),
        value: element.value,
        disabled: element.disabled === true || element.readOnly === true
          || element.getAttribute('aria-disabled') === 'true'
      })),
      composers: composerProbes,
      file_inputs: fileInputs.map((element) => {
        const region = findCoverRegion(element);
        return {
          test_id: element.getAttribute('data-testid'),
          accept: element.getAttribute('accept'),
          multiple: element.hasAttribute('multiple'),
          visible: element.getClientRects().length > 0,
          enabled: !element.disabled,
          region_text: region === null
            ? ''
            : 'We recommend an image with a 5:2 aspect ratio for best results.'
        };
      }),
      controls,
      media: [...coverMedia, ...inlineMedia],
      autosave_text: autosaveText
    };
  });

  return normalizeXArticleEditorProbe(probe);
}
