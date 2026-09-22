import { afterEach, describe, expect, it, vi } from 'vitest';
import * as extractor from '../../skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs';

afterEach(() => vi.unstubAllGlobals());
describe('local visible inline-media probe', () => {
  it('selects the following image in a two-image group and reads its persisted Alt', async () => {
    const oldImage = { complete: true, naturalWidth: 900 };
    const newImage = { complete: true, naturalWidth: 900,
      closest: () => ({ getAttribute: () => 'Exact saved Alt' }) };
    const previous = { querySelector: () => oldImage, textContent: '' };
    const following = { querySelector: () => newImage, textContent: '' };
    const anchorBlock = { previousElementSibling: previous, nextElementSibling: following, querySelector: () => null };
    const marker = { textContent: 'MARKER', closest: () => anchorBlock };
    const composer = { querySelectorAll: (selector) => selector === '[data-block="true"]'
      ? [previous, anchorBlock, following] : [marker] };
    vi.stubGlobal('document', { querySelectorAll: () => [composer] });
    const tab = { playwright: { evaluate: async (fn, arg) => fn(arg) } };
    expect(await extractor.probeXArticleInlineMedia({ tab, marker: 'MARKER', blockOrdinal: 2 }))
      .toMatchObject({ media_dom_index: 2, media_edit_index: 1, alt_text: 'Exact saved Alt' });
    expect(await extractor.probeXArticleInlineMedia({ tab, marker: 'MARKER', blockOrdinal: 3 })).toBeNull();
  });
  it('finds the image after a marker inside DraftJS draggable wrappers', async () => {
    const image = { complete: true, naturalWidth: 900 };
    const media = { querySelector: () => image, textContent: '' };
    const heading = { className: 'longform-header-two' };
    const marker = { textContent: 'MARKER', closest: () => markerBlock };
    const mediaWrapper = { querySelector: () => media };
    const markerBlock = { parentElement: { nextElementSibling: mediaWrapper }, querySelector: () => null };
    const composer = { querySelectorAll: (selector) => selector === '[data-block="true"]' ? [heading, markerBlock, media] : [marker] };
    vi.stubGlobal('document', { querySelectorAll: () => [composer] });
    const tab = { playwright: { evaluate: async (fn, arg) => fn(arg) } };
    expect(await extractor.probeXArticleInlineMedia({ tab, marker: 'MARKER', blockOrdinal: 2 })).toMatchObject({
      status: 'uploaded', anchor_present: true, media_dom_index: 2,
      anchor_dom_index: 1, media_after_anchor: true
    });
    expect(await extractor.probeXArticleInlineMedia({ tab, marker: 'MARKER', blockOrdinal: 3 })).toBeNull();
  });
  it('inspects only the image directly adjacent to the exact marker', async () => {
    const image = { complete: true, naturalWidth: 900 };
    const media = { querySelector: () => image, textContent: '' };
    const marker = { textContent: 'MARKER', closest: () => markerBlock };
    const markerBlock = { previousElementSibling: media };
    const composer = { querySelectorAll: (selector) => selector === '[data-block="true"]' ? [media, markerBlock] : [marker] };
    vi.stubGlobal('document', { querySelectorAll: () => [composer] });
    expect(extractor.probeXArticleInlineMedia).toBeTypeOf('function');
    const tab = { playwright: { evaluate: async (fn, arg) => fn(arg) } };
    await expect(extractor.probeXArticleInlineMedia({ tab, marker: 'MARKER', blockOrdinal: 1 })).resolves.toMatchObject({
      status: 'uploaded', anchor_present: true, media_dom_index: 0
    });
    // The same image is not evidence for the next missing upload.
    expect(await extractor.probeXArticleInlineMedia({ tab, marker: 'MARKER', blockOrdinal: 2 })).toBeNull();
  });
  it('returns no shortcut evidence when the marker is missing', async () => {
    vi.stubGlobal('document', { querySelectorAll: () => [{ querySelectorAll: () => [] }] });
    expect(extractor.probeXArticleInlineMedia).toBeTypeOf('function');
    const tab = { playwright: { evaluate: async (fn, arg) => fn(arg) } };
    expect(await extractor.probeXArticleInlineMedia({ tab, marker: 'MISSING' })).toBeNull();
  });
});
