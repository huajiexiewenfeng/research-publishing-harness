# X Article Complete Host Bridge V3.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one packaged, deterministic Browser Host Bridge that observes an existing X Article Draft, uploads one approved cover plus any approved inline images, verifies Alt and autosave, and stops at `draft_reconciled` within 15 minutes without opening Preview or Publish.

**Architecture:** A read-only Chrome extractor emits a bounded raw editor snapshot. A TypeScript Observation Builder binds that snapshot to the approved publication and materialization plans, while small Host transactions perform exactly one claimed browser mutation and return a reasoned, report-ready outcome. A dispatcher owns the complete Draft-only path, and a pre-build parity gate prevents stale committed `dist` output from masquerading as the current CLI.

**Tech Stack:** Node.js 20.19+, TypeScript 6, ESM `.mjs`, Vitest 4, Ajv contracts, Codex Chrome `browser-client` Playwright API, pnpm 11.

## Global Constraints

- Execution mode is locked to **Inline Execution**. Do not create or dispatch a Subagent.
- Preserve `x-article-materialization/v3.4`; identify this implementation boundary separately as `x-article-host-bridge/v3.5`.
- The complete flow is Draft-only. It must never issue, open, click, or report `open_article_preview`, `open_publish_review`, or `publish_article_once`.
- One claimed command permits one semantic browser transaction and at most one `filechooser`/`setFiles` pair. Host code never retries a chooser.
- The existing Fast Path deadline remains 900 seconds. No new command may be claimed or executed at or after the deadline.
- `tab.playwright.evaluate` is read-only. All mutations use supported locator methods, `waitForEvent('filechooser')`, and `PlaywrightFileChooser.setFiles`.
- Register the file chooser before the causal click. Use one verified absolute file path and call `chooser.isMultiple()` before selection.
- Prefer the actual scoped `input[type=file]`. Current live evidence identifies the cover input as the unique visible, enabled `data-testid="fileInput"` inside the region containing the exact 5:2 recommendation.
- Never read cookies, localStorage, session storage, passwords, direct messages, timelines, complete page HTML, or browser profile files.
- The extractor may read only canonical URL, authenticated handle, title, Article editor blocks, approved anchor markers, Article media, autosave state, and required control metadata.
- Every browser result is fail-closed and includes one stable reason. `uncertain` never authorizes a second file selection.
- All code changes follow RED → GREEN → focused regression → commit. Full verification happens only after focused suites pass.
- Treat each numbered Task as a separate monitored implementation stage. Stop after its commit and wait for an explicit `continue Task N`; never auto-chain into the next Task.
- At 15 minutes without a new failing/passing test, diff, or commit, report the blocker and narrow the current Task. At 45 minutes, stop with the smallest reviewable result; do not continue the same Task past 60 minutes without new user approval.
- Real X upload is outside offline implementation. It requires a new digest-bound Audit/Confirmation and an action-time browser confirmation after all offline checks pass.

---

## File Map

### New focused modules

- `skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs` — read-only Chrome-to-snapshot extraction.
- `harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.ts` — deterministic snapshot-to-Observation binding.
- `skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs` — Harness CLI/runtime discovery and official observer composition.
- `skills/x-publishing-copilot/scripts/x-article-host-common.mjs` — immutable command/asset checks, one-file chooser transaction, binding evidence, and bounded stability polling.
- `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs` — one exact anchor replacement and Alt readback.
- `skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs` — Draft-only dispatcher.
- `harnesses/research-publishing/cli/x-article-control-surface.ts` — shared route and Host protocol constants.
- `tools/check-packaged-x-article-cli.ts` — source/committed-`dist` parity gate.

### New tests and fixtures

- `tests/fixtures/x-article/editor-dom-probe-v1.json`
- `tests/skills/x-article-editor-extractor.test.mjs`
- `tests/x-article/article-browser-host-observation.test.ts`
- `tests/skills/x-article-host-runtime.test.mjs`
- `tests/skills/x-article-host-common.test.mjs`
- `tests/skills/x-article-inline-image-host.test.mjs`
- `tests/skills/x-article-host-bridge.test.mjs`
- `tests/tools/check-packaged-x-article-cli.test.ts`

### Existing files changed in place

- `skills/x-publishing-copilot/scripts/invoke.mjs:1-50`
- `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs:1-105`
- `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts:97-101,2362-2390`
- `harnesses/research-publishing/cli/index.ts:150-175`
- `skills/x-publishing-copilot/SKILL.md:14`
- `skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md:1-48`
- `tests/skills/x-article-cover-host.test.mjs`
- `tests/skills/skill-boundary.test.ts:106-147`
- `tests/x-article/article-browser-adapter.test.ts`
- `tests/cli/cli.test.ts:205-230`
- `tests/tools/manifest-content.test.ts`
- `tools/x-article-fast-path-acceptance.ts`
- `tests/tools/x-article-fast-path-acceptance.test.ts`
- `package.json:22-36`
- `registry/manifests/research-publishing.json` — regenerated, never hand-edited.
- `.llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md`

---

### Task 1: Package the bounded Chrome editor extractor

**Files:**

- Create: `tests/fixtures/x-article/editor-dom-probe-v1.json`
- Create: `tests/skills/x-article-editor-extractor.test.mjs`
- Create: `skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs`

**Interfaces:**

- Produces: `normalizeXArticleEditorProbe(probe): XArticleHostPageSnapshotV1Like`.
- Produces: `extractXArticleEditorSnapshot({ tab }): Promise<XArticleHostPageSnapshotV1Like>`.
- The result is consumed by `buildXArticleHostObservation()` in Task 2 and `observeXArticleEditor()` in Task 3.

- [ ] **Step 1: Add the sanitized live-structure fixture**

Create a compact fixture using the observed X DraftJS structure, not invented HTML:

```json
{
  "canonical_url": "https://x.com/compose/articles/edit/2093554993261654016",
  "account_handle": "@Glen56121",
  "title_controls": [
    { "tag": "TEXTAREA", "placeholder": "Add a title", "value": "From Skill Memory to Shared Agent Knowledge" }
  ],
  "composers": [
    {
      "test_id": "composer",
      "role": "textbox",
      "contenteditable": "true",
      "blocks": [
        { "parent_tag": "DIV", "parent_class": "longform-unstyled", "runs": [{ "text": "Opening.", "bold": false, "italic": true, "link": null }] },
        { "parent_tag": "H2", "parent_class": "longform-header-two", "runs": [{ "text": "Boundary", "bold": false, "italic": false, "link": null }] },
        { "parent_tag": "LI", "parent_class": "longform-unordered-list-item public-DraftStyleDefault-unorderedListItem public-DraftStyleDefault-reset public-DraftStyleDefault-depth0 public-DraftStyleDefault-listLTR", "runs": [{ "text": "First item", "bold": false, "italic": false, "link": null }] },
        { "parent_tag": "LI", "parent_class": "longform-unordered-list-item public-DraftStyleDefault-unorderedListItem public-DraftStyleDefault-depth0 public-DraftStyleDefault-listLTR", "runs": [{ "text": "Second item", "bold": true, "italic": false, "link": null }] },
        { "parent_tag": "BLOCKQUOTE", "parent_class": "longform-blockquote", "runs": [{ "text": "Runtime boundary.", "bold": false, "italic": false, "link": null }] },
        { "parent_tag": "DIV", "parent_class": "longform-unstyled", "runs": [{ "text": "RPH_VISUAL_ANCHOR:asset-architecture-runtime-boundary:5", "bold": false, "italic": false, "link": null }] },
        { "parent_tag": "DIV", "parent_class": "longform-unstyled", "runs": [{ "text": "Repository", "bold": false, "italic": false, "link": "https://github.com/example/runtime" }] },
        { "parent_tag": "DIV", "parent_class": "longform-unstyled", "runs": [{ "text": "RPH_VISUAL_ANCHOR:asset-process-consumer-agent-connection:7", "bold": false, "italic": false, "link": null }] },
        { "parent_tag": "DIV", "parent_class": "longform-unstyled", "runs": [{ "text": "Closing.", "bold": false, "italic": false, "link": null }] },
        { "parent_tag": "DIV", "parent_class": "longform-unstyled", "runs": [{ "text": "RPH_VISUAL_ANCHOR:asset-comparison-knowledge-vs-context:9", "bold": false, "italic": false, "link": null }] }
      ]
    }
  ],
  "file_inputs": [
    { "test_id": "fileInput", "accept": "image/jpeg,image/png,image/webp", "multiple": false, "visible": true, "enabled": true, "region_text": "We recommend an image with a 5:2 aspect ratio for best results." }
  ],
  "controls": [
    { "role": "button", "name": "Add Media", "test_id": null, "disabled": false },
    { "role": "button", "name": "Publish", "test_id": null, "disabled": false }
  ],
  "media": [],
  "autosave_text": "Last saved 1 minute ago"
}
```

The fixture intentionally contains no user cookie, complete Article body, browser storage, sidebar, or timeline content.

- [ ] **Step 2: Write extractor RED tests**

```js
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  extractXArticleEditorSnapshot,
  normalizeXArticleEditorProbe
} from '../../skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs';

const probe = JSON.parse(await readFile(
  resolve('tests/fixtures/x-article/editor-dom-probe-v1.json'), 'utf8'
));

it('groups DraftJS list rows and preserves marks, links, and exact anchors', () => {
  const snapshot = normalizeXArticleEditorProbe(probe);
  expect(snapshot.schema_version).toBe('x-article-host-page-snapshot/v1');
  expect(snapshot.editor.blocks).toEqual([
    { kind: 'paragraph', runs: [{ text: 'Opening.', marks: ['italic'], link: null }] },
    { kind: 'heading', runs: [{ text: 'Boundary', marks: [], link: null }] },
    { kind: 'bullet_list', items: [
      [{ text: 'First item', marks: [], link: null }],
      [{ text: 'Second item', marks: ['bold'], link: null }]
    ] },
    { kind: 'quote', runs: [{ text: 'Runtime boundary.', marks: [], link: null }] },
    { kind: 'visual_anchor', marker: 'RPH_VISUAL_ANCHOR:asset-architecture-runtime-boundary:5' },
    { kind: 'paragraph', runs: [{ text: 'Repository', marks: [], link: 'https://github.com/example/runtime' }] },
    { kind: 'visual_anchor', marker: 'RPH_VISUAL_ANCHOR:asset-process-consumer-agent-connection:7' },
    { kind: 'paragraph', runs: [{ text: 'Closing.', marks: [], link: null }] },
    { kind: 'visual_anchor', marker: 'RPH_VISUAL_ANCHOR:asset-comparison-knowledge-vs-context:9' }
  ]);
});

it('rejects ambiguous title, composer, unsupported block classes, and foreign snapshot keys', () => {
  expect(() => normalizeXArticleEditorProbe({ ...probe, title_controls: [] }))
    .toThrow(/title/i);
  expect(() => normalizeXArticleEditorProbe({ ...probe, composers: [...probe.composers, probe.composers[0]] }))
    .toThrow(/composer/i);
  const changed = structuredClone(probe);
  changed.composers[0].blocks[0].parent_class = 'unknown-editor-block';
  expect(() => normalizeXArticleEditorProbe(changed)).toThrow(/block class/i);
  expect(() => normalizeXArticleEditorProbe({ ...probe, cookies: ['forbidden'] }))
    .toThrow(/unexpected snapshot key/i);
});

it('evaluates one read-only page function and never depends on Node process in page scope', async () => {
  let pageFunctionText = '';
  const tab = { playwright: { evaluate: async (pageFunction) => {
    pageFunctionText = String(pageFunction);
    return probe;
  } } };
  await expect(extractXArticleEditorSnapshot({ tab })).resolves.toMatchObject({
    canonical_url: probe.canonical_url,
    editor: { title: 'From Skill Memory to Shared Agent Knowledge' }
  });
  expect(pageFunctionText).not.toMatch(/\bprocess\b|localStorage|sessionStorage|cookie/i);
});
```

- [ ] **Step 3: Run the extractor test and capture RED**

Run:

```powershell
pnpm vitest run tests/skills/x-article-editor-extractor.test.mjs
```

Expected: FAIL with module-not-found for `x-article-editor-extractor.mjs`.

- [ ] **Step 4: Implement the minimal extractor**

Use these exact selectors and transformations:

```js
const ALLOWED_PROBE_KEYS = new Set([
  'canonical_url', 'account_handle', 'title_controls', 'composers',
  'file_inputs', 'controls', 'media', 'autosave_text'
]);
const ANCHOR = /^RPH_VISUAL_ANCHOR:[A-Za-z0-9_-]+:[1-9][0-9]*$/;

export async function extractXArticleEditorSnapshot({ tab }) {
  if (typeof tab?.playwright?.evaluate !== 'function') {
    throw new Error('X Article extractor requires a Playwright tab');
  }
  const probe = await tab.playwright.evaluate(() => {
    const titleControls = Array.from(document.querySelectorAll('textarea[placeholder="Add a title"]'));
    const composers = Array.from(document.querySelectorAll('[data-testid="composer"][contenteditable="true"]'));
    const runs = (block) => Array.from(block.querySelectorAll(':scope > span[data-offset-key]')).map((span) => ({
      text: span.textContent || '',
      bold: /font-weight:\s*bold/i.test(span.getAttribute('style') || ''),
      italic: /font-style:\s*italic/i.test(span.getAttribute('style') || ''),
      link: span.querySelector('a')?.getAttribute('href') || null
    }));
    const blocks = (composer) => Array.from(
      composer.querySelectorAll('[data-block="true"]')
    ).map((container, index) => {
      const block = container.querySelector('.public-DraftStyleDefault-block');
      const image = container.querySelector('figure img,img');
      if (image !== null) {
        return {
          parent_tag: 'FIGURE', parent_class: container.className || 'longform-atomic', runs: [],
          media: {
            ref: `inline-media-${index + 1}`, block_ordinal: index + 1,
            alt_text: image.getAttribute('alt'),
            status: /processing/i.test(container.textContent || '') ? 'processing' : 'uploaded'
          }
        };
      }
      return {
        parent_tag: container.tagName,
        parent_class: container.className || '',
        runs: block === null ? [] : runs(block)
      };
    });
    const controls = Array.from(document.querySelectorAll('button,[role="button"]'))
      .filter((element) => /^(Add Media|Publish|Preview)$/i.test(
        (element.getAttribute('aria-label') || element.textContent || '').trim()
      ))
      .map((element) => ({
        role: element.getAttribute('role') || element.tagName.toLowerCase(),
        name: (element.getAttribute('aria-label') || element.textContent || '').trim(),
        test_id: element.getAttribute('data-testid'),
        disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true'
      }));
    return {
      canonical_url: location.href,
      account_handle: document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')
        ?.getAttribute('href')?.replace(/^\//, '@') || null,
      title_controls: titleControls.map((element) => ({
        tag: element.tagName, placeholder: element.getAttribute('placeholder'), value: element.value
      })),
      composers: composers.map((element) => ({
        test_id: element.getAttribute('data-testid'), role: element.getAttribute('role'),
        contenteditable: element.getAttribute('contenteditable'), blocks: blocks(element)
      })),
      file_inputs: Array.from(document.querySelectorAll('input[type="file"]')).map((element) => ({
        test_id: element.getAttribute('data-testid'), accept: element.getAttribute('accept'),
        multiple: element.hasAttribute('multiple'), visible: element.getClientRects().length > 0,
        enabled: !element.disabled,
        region_text: (element.parentElement?.parentElement?.textContent || '').trim()
      })),
      controls,
      media: composers.flatMap((composer) => blocks(composer)
        .flatMap((block) => block.media === undefined ? [] : [block.media])),
      autosave_text: Array.from(document.querySelectorAll('span,div'))
        .map((element) => (element.textContent || '').trim())
        .find((text) => /^(Last saved|Saving|Save failed)/i.test(text)) || ''
    };
  });
  return normalizeXArticleEditorProbe(probe);
}
```

`normalizeXArticleEditorProbe` must reject unknown top-level keys, require exactly one title and composer, convert `longform-header-two`, `longform-blockquote`, ordered/unordered list classes, and `longform-unstyled`, group only consecutive same-kind list rows before evaluating canonical ordinals, parse exact anchor-only paragraphs, retain scoped media at its normalized canonical ordinal, and set `has_unknown_content: true` for any unsupported nested structure rather than silently dropping it. It must also generate stable control refs from exact `test_id` or `role + name`; it may not expose selectors or DOM nodes in the Observation.

- [ ] **Step 5: Verify GREEN and lint the script**

Run:

```powershell
pnpm vitest run tests/skills/x-article-editor-extractor.test.mjs
pnpm eslint skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs tests/skills/x-article-editor-extractor.test.mjs
```

Expected: both commands exit `0`.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- tests/fixtures/x-article/editor-dom-probe-v1.json tests/skills/x-article-editor-extractor.test.mjs skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs
git commit -m "feat: extract bounded X Article editor state"
```

---

### Task 2: Build deterministic Harness Observations

**Files:**

- Create: `harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.ts`
- Create: `tests/x-article/article-browser-host-observation.test.ts`

**Interfaces:**

- Consumes: `XArticleBrowserCommandV1`, `XArticlePublicationPlanV1`, `XArticleMaterializationPlanV1`, `XArticleHostPageSnapshotV1`, optional previous Observation, observation ID, and timestamp.
- Produces: `buildXArticleHostObservation(input): XArticleBrowserObservation`.
- Produces: exported TypeScript types `XArticleHostPageSnapshotV1` and `XArticleHostObservationContextV1` for tests and generated declarations.

- [ ] **Step 1: Write builder RED tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildXArticleHostObservation } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.js';

it('binds three exact anchors without guessing media ownership', () => {
  const result = buildXArticleHostObservation({
    command, context: { publication_plan: plan, materialization_plan: materializationPlan },
    page_snapshot: pageSnapshot, previous_observation: null,
    observation_id: 'observation_host_1', observed_at: '2026-08-29T08:00:00.000Z'
  });
  expect(result).toMatchObject({
    schema_version: '1.0', execution_id: command.execution_id,
    command_id: command.command_id, origin: 'https://x.com',
    account_handle: '@Glen56121', page_kind: 'article_editor',
    editor: { draft_id: command.draft_id, title: plan.intent.document.title,
      import_state: { unresolved_anchors: materializationPlan.visual_anchors.map(({ anchor_id, asset_id, block_ordinal }) => ({
        anchor_id, asset_id, block_ordinal,
        marker: `RPH_VISUAL_ANCHOR:${asset_id}:${block_ordinal}`
      })) }
    }
  });
  expect(result.page_revision).toMatch(/^sha256:[a-f0-9]{64}$/);
});

it.each([
  ['account', { account_handle: '@Foreign' }],
  ['draft', { canonical_url: 'https://x.com/compose/articles/edit/1' }],
  ['title', { editor: { ...pageSnapshot.editor, title: 'Changed' } }]
])('rejects changed %s identity', (_name, patch) => {
  expect(() => buildXArticleHostObservation(inputWithPagePatch(patch)))
    .toThrowError(expect.objectContaining({ code: 'ARTICLE_DRAFT_CONFLICT' }));
});

it('rejects duplicate, foreign, and wrong-ordinal media', () => {
  expect(() => buildXArticleHostObservation(inputWithMedia([
    mediaAt(5, 'media-a'), mediaAt(5, 'media-b')
  ]))).toThrow(/duplicate/i);
  expect(() => buildXArticleHostObservation(inputWithMedia([
    mediaAt(7, 'foreign-media')
  ]))).toThrow(/ordinal/i);
});

it('maps one post-command media only from the locked command and plan', () => {
  const result = buildXArticleHostObservation(inputWithMedia([mediaAt(5, 'media-a')]));
  expect(result.editor?.visuals).toContainEqual(expect.objectContaining({
    ref: 'media-a', asset_id: command.payload.asset.asset_id,
    kind: 'inline', block_ordinal: 6, owned_by_execution: true
  }));
});
```

- [ ] **Step 2: Run the builder test and capture RED**

```powershell
pnpm vitest run tests/x-article/article-browser-host-observation.test.ts
```

Expected: FAIL because `article-browser-host-observation.ts` does not exist.

- [ ] **Step 3: Implement the builder contract and identity gates**

Define these exact public interfaces:

```ts
export interface XArticleHostObservationContextV1 {
  readonly publication_plan: XArticlePublicationPlanV1;
  readonly materialization_plan: XArticleMaterializationPlanV1;
}

export type XArticleHostPageBlockV1 =
  | Exclude<XArticleBlockV1, { readonly kind: 'image' }>
  | { readonly kind: 'visual_anchor'; readonly marker: string }
  | {
      readonly kind: 'media';
      readonly ref: string;
      readonly block_ordinal: number;
      readonly alt_text: string | null;
      readonly status: 'processing' | 'uploaded' | 'failed';
    };

export interface XArticleHostPageSnapshotV1 {
  readonly schema_version: 'x-article-host-page-snapshot/v1';
  readonly canonical_url: string;
  readonly account_handle: string | null;
  readonly page_kind: 'article_editor';
  readonly controls: readonly XArticleControlObservation[];
  readonly editor: {
    readonly draft_id: string;
    readonly title: string;
    readonly blocks: readonly XArticleHostPageBlockV1[];
    readonly cover: XArticleHostMediaV1 | null;
    readonly autosave_state: 'saving' | 'saved' | 'failed';
    readonly has_unknown_content: boolean;
  };
}

export function buildXArticleHostObservation(input: {
  readonly command: XArticleBrowserCommandV1;
  readonly context: XArticleHostObservationContextV1;
  readonly page_snapshot: XArticleHostPageSnapshotV1;
  readonly previous_observation: XArticleBrowserObservation | null;
  readonly observation_id: string;
  readonly observed_at: string;
}): XArticleBrowserObservation;
```

Implementation order is fixed:

1. `assertXArticlePublicationPlan(publication_plan)` and validate `materialization_plan` with `x-article-materialization-plan`.
2. Require command execution/run/draft identity, `https://x.com` origin, exact account, exact title, and exact materialization/publication digests.
3. Build the canonical import template with `createXArticleImportTemplate`.
4. Convert raw anchors only when their full marker equals the template marker at that ordinal.
5. Convert raw media to image blocks only when ordinal and approved plan binding are unique. Asset identity comes from the approved binding/command, never from DOM text.
6. Set `owned_by_execution` only for the media targeted by the current claimed command and absent from `previous_observation`.
7. Call `normalizeXArticleHostEditor` for canonical body/import state.
8. Construct `XArticleBrowserObservationInput`, compute `page_revision` with `computeXArticlePageRevision`, then validate with `x-article-browser-observation`.

- [ ] **Step 4: Add deterministic revision and data-minimization assertions**

```ts
it('produces the same revision for equal semantic snapshots', () => {
  const first = buildXArticleHostObservation(validInput());
  const second = buildXArticleHostObservation({
    ...validInput(), observation_id: 'observation_host_2',
    observed_at: '2026-08-29T08:00:01.000Z'
  });
  expect(second.page_revision).toBe(first.page_revision);
});

it('does not expose raw DOM, storage, or local file data', () => {
  const serialized = JSON.stringify(buildXArticleHostObservation(validInput()));
  expect(serialized).not.toMatch(/innerHTML|cookie|localStorage|absoluteAssetPath|file:\/\//i);
});
```

Compute the revision from semantic page fields while excluding `observation_id`, `command_id`, `observed_at`, and `page_revision`; otherwise identical pages would produce different revisions.

- [ ] **Step 5: Verify GREEN and adjacent normalizer tests**

```powershell
pnpm vitest run tests/x-article/article-browser-host-observation.test.ts tests/x-article/article-browser-host-normalizer.test.ts tests/x-article/article-import-template.test.ts
pnpm typecheck
```

Expected: all selected tests pass and typecheck exits `0`.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.ts tests/x-article/article-browser-host-observation.test.ts
git commit -m "feat: build deterministic X Article host observations"
```

---

### Task 3: Package runtime discovery and the official observer

**Files:**

- Create: `skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs`
- Create: `tests/skills/x-article-host-runtime.test.mjs`
- Modify: `skills/x-publishing-copilot/scripts/invoke.mjs:1-50`

**Interfaces:**

- Produces: `discoverHarnessCli({ env, repositoryRoot }): string`.
- Produces: `loadXArticleObservationBuilder({ cliPath }): Promise<{ buildXArticleHostObservation: Function }>`.
- Produces: `observeXArticleEditor(input): Promise<XArticleBrowserObservation>`.

- [ ] **Step 1: Write runtime RED tests**

```js
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  discoverHarnessCli,
  loadXArticleObservationBuilder,
  observeXArticleEditor
} from '../../skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs';

it('discovers an explicit CLI and imports its sibling observation builder', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rph-host-runtime-'));
  const cli = join(root, 'dist/harnesses/research-publishing/cli/index.js');
  const builder = join(root, 'dist/harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.js');
  await mkdir(dirname(cli), { recursive: true });
  await mkdir(dirname(builder), { recursive: true });
  await writeFile(cli, '');
  await writeFile(builder, 'export const buildXArticleHostObservation = (input) => ({ built: input.observation_id });');
  expect(discoverHarnessCli({ env: { RESEARCH_PUBLISHING_HARNESS_CLI: cli }, repositoryRoot: root })).toBe(resolve(cli));
  await expect(loadXArticleObservationBuilder({ cliPath: cli })).resolves.toHaveProperty('buildXArticleHostObservation');
});

it('uses only the packaged extractor and builder, not a caller-supplied observe callback', async () => {
  const extract = vi.fn(async () => pageSnapshot);
  const build = vi.fn((input) => ({ observation_id: input.observation_id }));
  await expect(observeXArticleEditor({
    tab, command, context, previousObservation: null,
    observationId: 'observation_1', observedAt: '2026-08-29T08:00:00.000Z',
    dependencies: { extractXArticleEditorSnapshot: extract, buildXArticleHostObservation: build }
  })).resolves.toEqual({ observation_id: 'observation_1' });
  expect(extract).toHaveBeenCalledOnce();
  expect(build).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the runtime test and capture RED**

```powershell
pnpm vitest run tests/skills/x-article-host-runtime.test.mjs
```

Expected: FAIL because `x-article-host-runtime.mjs` does not exist.

- [ ] **Step 3: Implement runtime discovery and observer composition**

Move the existing discovery behavior from `invoke.mjs` into the new module without weakening it:

```js
export function discoverHarnessCli({ env = process.env, repositoryRoot }) {
  const explicit = env.RESEARCH_PUBLISHING_HARNESS_CLI;
  if (explicit && existsSync(explicit)) return resolve(explicit);
  const bundled = resolve(repositoryRoot, 'dist', 'harnesses', 'research-publishing', 'cli', 'index.js');
  if (existsSync(bundled)) return bundled;
  const registryPath = env.RESEARCH_PUBLISHING_HARNESS_REGISTRY
    ? resolve(env.RESEARCH_PUBLISHING_HARNESS_REGISTRY)
    : resolve(repositoryRoot, 'registry', 'harnesses.json');
  return discoverRegisteredCli(registryPath);
}

export async function loadXArticleObservationBuilder({ cliPath }) {
  const modulePath = resolve(
    dirname(cliPath), '..', 'adapters', 'x', 'article-browser',
    'article-browser-host-observation.js'
  );
  if (!existsSync(modulePath)) throw new Error('Compatible X Article Host Observation Builder was not found');
  const loaded = await import(pathToFileURL(modulePath).href);
  if (typeof loaded.buildXArticleHostObservation !== 'function') {
    throw new Error('X Article Host Observation Builder export is incompatible');
  }
  return loaded;
}
```

`observeXArticleEditor` imports `extractXArticleEditorSnapshot`, obtains exactly one fresh snapshot, and calls the builder with exact camelCase-to-snake_case mapping. It must not accept a public `observe` callback. Tests may inject the two dependencies only through the named `dependencies` test seam.

- [ ] **Step 4: Refactor `invoke.mjs` to consume shared discovery**

Replace its local `discoverCli` function with:

```js
import { discoverHarnessCli } from './x-article-host-runtime.mjs';

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(skillDir, '..', '..');

const result = spawnSync(
  process.execPath,
  [discoverHarnessCli({ repositoryRoot }), ...forwardedArgs()],
  { stdio: 'inherit', windowsHide: true }
);
```

Keep all current LLM Wiki argument forwarding and exit-code behavior unchanged.

- [ ] **Step 5: Verify GREEN and invoke discovery regressions**

```powershell
pnpm vitest run tests/skills/x-article-host-runtime.test.mjs tests/skills/skill-boundary.test.ts
pnpm eslint skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs skills/x-publishing-copilot/scripts/invoke.mjs tests/skills/x-article-host-runtime.test.mjs
```

Expected: all selected tests pass; lint exits `0`.

- [ ] **Step 6: Commit Task 3**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs skills/x-publishing-copilot/scripts/invoke.mjs tests/skills/x-article-host-runtime.test.mjs
git commit -m "feat: package X Article host runtime observer"
```

---

### Task 4: Make cover upload causal, reasoned, and non-retrying

**Files:**

- Create: `skills/x-publishing-copilot/scripts/x-article-host-common.mjs`
- Create: `tests/skills/x-article-host-common.test.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs:1-105`
- Modify: `tests/skills/x-article-cover-host.test.mjs`

**Interfaces:**

- Produces: `verifyHostMediaInput(input)` with verified byte length, digest, and MIME.
- Produces: `selectOneVerifiedFile({ tab, causalTrigger, resolveInput, absoluteAssetPath, expected, timeoutMs })` returning `{ kind:'bound', byte_length, mime_type }` or `{ kind:'missing' }`. `causalTrigger` may be the Cover input itself or the Inline `Media` menu item; `resolveInput()` runs only after that click.
- Produces: `waitForStableHostObservation(input)` with a hard bounded polling window.
- Changes: `runCoverUpload()` returns `{ status, effect, reason, observation, retry_authorized:false }`.

- [ ] **Step 1: Write shared primitive RED tests**

```js
it('arms the chooser before clicking one visible enabled input and binds one file', async () => {
  const result = await selectOneVerifiedFile({
    tab, causalTrigger: fileInput, resolveInput: async () => fileInput,
    absoluteAssetPath, expected: { byte_length: pngBytes.length, mime_type: 'image/png' },
    timeoutMs: 10_000
  });
  expect(calls).toEqual([
    ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
    ['input.click'],
    ['chooser.isMultiple'],
    ['setFiles', [absoluteAssetPath], { timeoutMs: 10_000 }],
    ['input.binding']
  ]);
  expect(result).toEqual({ kind: 'bound', byte_length: pngBytes.length, mime_type: 'image/png' });
});

it('returns missing when the browser input has zero files after setFiles', async () => {
  await expect(selectOneVerifiedFile(inputWithBinding([])))
    .resolves.toEqual({ kind: 'missing' });
});

it('never calls setFiles twice when observation fails', async () => {
  const input = commonInput({ observe: async () => { throw new Error('unavailable'); } });
  await runOneMediaTransaction(input);
  expect(input.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
});
```

The input binding read is exact and path-free:

```js
await input.evaluate((element) => Array.from(element.files || []).map((file) => ({
  byte_length: file.size,
  mime_type: file.type
})));
```

- [ ] **Step 2: Write cover classification RED tests**

```js
it.each([
  ['file binding missing', missingBinding(), 'transient_failure', 'file_transfer_missing'],
  ['bound but no X effect', boundWith(emptySavedObservation()), 'transient_failure', 'x_media_effect_absent'],
  ['X still processing', boundWith(processingObservation()), 'transient_failure', 'x_media_still_processing'],
  ['observer unavailable', boundWithThrow(), 'uncertain', 'observation_unavailable_after_selection']
])('%s has one stable status/reason', async (_name, input, status, reason) => {
  await expect(runCoverUpload(input)).resolves.toMatchObject({
    status, reason, retry_authorized: false
  });
  expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
});

it('reports the exact verified cover only after saved autosave', async () => {
  await expect(runCoverUpload(boundWith(uploadedSavedObservation())))
    .resolves.toMatchObject({
      status: 'success', effect: 'complete', reason: 'cover_uploaded',
      retry_authorized: false
    });
});
```

- [ ] **Step 3: Run focused tests and capture RED**

```powershell
pnpm vitest run tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs
```

Expected: Host common module is missing and cover outcomes lack `reason`.

- [ ] **Step 4: Implement shared primitives and refactor Cover Host**

Use the official causal order and current live control identity:

```js
const input = tab.playwright.getByTestId('fileInput');
if (
  await input.count() !== 1
  || !await input.isVisible()
  || !await input.isEnabled()
  || !await input.evaluate((element) =>
    (element.parentElement?.parentElement?.textContent || '').includes('5:2 aspect ratio')
  )
) return outcome('rejected', 'none', 'cover_control_ambiguous', null);

const binding = await selectOneVerifiedFile({
  tab, causalTrigger: input, resolveInput: async () => input,
  absoluteAssetPath, expected: verifiedAsset, timeoutMs
});
const observed = await waitForStableHostObservation({
  observe, timeoutMs: stabilityTimeoutMs, pollMs: 500,
  isStable: (observation) => observation?.editor?.autosave_state !== 'saving'
});
return classifyCover({ binding, observation: observed, command });
```

`waitForStableHostObservation` may poll observations for at most 20 seconds, but it must not click or select a file during polling. A deadline callback supplied by the dispatcher stops polling early.

- [ ] **Step 5: Verify GREEN and one-selection guards**

```powershell
pnpm vitest run tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs
pnpm eslint skills/x-publishing-copilot/scripts/x-article-host-common.mjs skills/x-publishing-copilot/scripts/x-article-cover-host.mjs tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs
```

Expected: all selected tests pass; lint exits `0`; every result records at most one `setFiles` call.

- [ ] **Step 6: Commit Task 4**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-host-common.mjs skills/x-publishing-copilot/scripts/x-article-cover-host.mjs tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs
git commit -m "fix: make X Article cover upload observable"
```

---

### Task 5: Persist Host reason semantics in the Harness

**Files:**

- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts:97-101,2362-2390`
- Modify: `tests/x-article/article-browser-adapter.test.ts`

**Interfaces:**

- Changes: `XArticleBrowserReportInput.host_reason?` stores the stable Host reason without breaking historical reports.
- Changes: `progressFromReportEvidence()` projects processing as `partial`, unavailable Observation as `unknown`, and proven zero effects as `none`.

- [ ] **Step 1: Write adapter RED tests for every retry-relevant reason**

```ts
it.each([
  ['x_media_still_processing', 'partial'],
  ['observation_unavailable_after_selection', 'unknown'],
  ['file_transfer_missing', 'none'],
  ['x_media_effect_absent', 'none']
] as const)('projects %s as %s', async (hostReason, expectedEffect) => {
  await adapter.report(reportWith({
    status: hostReason === 'observation_unavailable_after_selection'
      ? 'uncertain'
      : 'transient_failure',
    host_reason: hostReason,
    observation: observationFor(hostReason)
  }));
  const progress = await materializationStore.readProgress(executionId);
  expect(progress.at(-1)?.observed_effect).toBe(expectedEffect);
});

it('keeps historical reports without host_reason backward compatible', async () => {
  await adapter.report(reportWith({ status: 'transient_failure', observation: emptyObservation }));
  expect((await materializationStore.readProgress(executionId)).at(-1)?.observed_effect)
    .toBe('none');
});
```

- [ ] **Step 2: Run adapter tests and capture RED**

```powershell
pnpm vitest run tests/x-article/article-browser-adapter.test.ts
```

Expected: new reports cannot supply `host_reason`, and processing is projected as `none`.

- [ ] **Step 3: Add the exact reason union and optional report field**

```ts
export type XArticleBrowserHostReason =
  | 'observation_captured'
  | 'cover_uploaded'
  | 'inline_image_uploaded'
  | 'file_transfer_missing'
  | 'x_media_effect_absent'
  | 'x_media_still_processing'
  | 'observation_unavailable_after_selection'
  | 'command_or_asset_invalid'
  | 'cover_control_ambiguous'
  | 'anchor_control_ambiguous'
  | 'anchor_context_changed'
  | 'inline_alt_unverified';

export interface XArticleBrowserReportInput {
  readonly command: XArticleBrowserCommandV1;
  readonly status: 'success' | 'transient_failure' | 'uncertain' | 'rejected';
  readonly observation: XArticleBrowserObservation | null;
  readonly host_reason?: XArticleBrowserHostReason;
}
```

In `progressFromReportEvidence()`, prefer the exact Host reason when present. Keep the current status-only branch for persisted V3.4 reports that lack the optional field.

- [ ] **Step 4: Verify GREEN and attempt-policy behavior**

```powershell
pnpm vitest run tests/x-article/article-browser-adapter.test.ts tests/x-article/article-media-attempt-policy.test.ts
pnpm typecheck
```

Expected: selected tests pass; `partial` and `unknown` block another media attempt, while one proven `none` remains eligible only for the existing single recovery budget.

- [ ] **Step 5: Commit Task 5**

```powershell
git add -- harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts tests/x-article/article-browser-adapter.test.ts
git commit -m "feat: persist X Article host outcome reasons"
```

---

### Task 6: Replace one inline anchor and verify Alt

**Files:**

- Create: `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`
- Create: `tests/skills/x-article-inline-image-host.test.mjs`

**Interfaces:**

- Produces: `runInlineImageUpload(input)` with the same outcome envelope as Cover Host.
- Consumes one claimed `replace_article_visual_anchor`, one verified asset, the official observer, and the Task 4 common primitives.

- [ ] **Step 1: Write ordinal, chooser, and anchor RED tests**

```js
it('targets one exact DraftJS anchor block and one chooser', async () => {
  const result = await runInlineImageUpload(validInlineInput());
  expect(calls).toEqual(expect.arrayContaining([
    ['composer.locator', '.public-DraftStyleDefault-block', { hasText: command.payload.anchor.marker }],
    ['anchor.textContent'],
    ['anchor.click'],
    ['anchor.press', 'Home'],
    ['addMedia.click'],
    ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
    ['mediaMenu.click'],
    ['setFiles', [absoluteAssetPath], { timeoutMs: 10_000 }]
  ]));
  expect(calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  expect(result).toMatchObject({ status: 'success', reason: 'inline_image_uploaded' });
});

it.each([
  ['missing anchor', 0],
  ['duplicate anchor', 2]
])('rejects %s before opening Insert', async (_name, count) => {
  const input = validInlineInput({ anchorCount: count });
  await expect(runInlineImageUpload(input)).resolves.toMatchObject({
    status: 'rejected', reason: 'anchor_control_ambiguous'
  });
  expect(input.calls).not.toContainEqual(['addMedia.click']);
});

it('rejects a changed neighbor context before upload', async () => {
  await expect(runInlineImageUpload(validInlineInput({ contextMatches: false })))
    .resolves.toMatchObject({ status: 'rejected', reason: 'anchor_context_changed' });
});
```

- [ ] **Step 2: Write Alt and marker-removal RED tests**

```js
it('removes only the selected marker after verifying the selected text', async () => {
  const input = validInlineInput({ selectionText: command.payload.anchor.marker });
  await runInlineImageUpload(input);
  expect(input.calls).toEqual(expect.arrayContaining([
    ['anchor.press', 'Home'], ['anchor.press', 'Shift+End'],
    ['readSelection'], ['anchor.press', 'Backspace']
  ]));
});

it('stops before deletion when browser selection is not the exact marker', async () => {
  const input = validInlineInput({ selectionText: 'different text' });
  await expect(runInlineImageUpload(input)).resolves.toMatchObject({
    status: 'uncertain', reason: 'anchor_context_changed'
  });
  expect(input.calls).not.toContainEqual(['anchor.press', 'Backspace']);
});

it('writes and reads back the approved description', async () => {
  const input = validInlineInput();
  await runInlineImageUpload(input);
  expect(input.calls).toEqual(expect.arrayContaining([
    ['addDescription.click'],
    ['description.fill', command.payload.asset.alt_text],
    ['done.click'],
    ['readAlt']
  ]));
  expect(input.observedAlt).toBe(command.payload.asset.alt_text);
});

it('fails closed when Alt readback differs', async () => {
  await expect(runInlineImageUpload(validInlineInput({ observedAlt: 'Changed' })))
    .resolves.toMatchObject({ status: 'uncertain', reason: 'inline_alt_unverified' });
});
```

- [ ] **Step 3: Run the inline test and capture RED**

```powershell
pnpm vitest run tests/skills/x-article-inline-image-host.test.mjs
```

Expected: FAIL because `x-article-inline-image-host.mjs` does not exist.

- [ ] **Step 4: Implement the one-anchor transaction**

Use these exact fail-closed controls:

```js
const composer = tab.playwright.getByTestId('composer');
const anchor = composer.locator('.public-DraftStyleDefault-block', {
  hasText: command.payload.anchor.marker
});
if (await anchor.count() !== 1 || await anchor.textContent({ timeoutMs }) !== command.payload.anchor.marker) {
  return outcome('rejected', 'none', 'anchor_control_ambiguous', null);
}
if (!contextMatchesLockedAnchor(beforeObservation, command, context)) {
  return outcome('rejected', 'none', 'anchor_context_changed', beforeObservation);
}
await anchor.click({ timeoutMs });
await anchor.press('Home', { timeoutMs });
await tab.playwright.getByRole('button', { name: 'Add Media', exact: true }).click({ timeoutMs });
const media = tab.playwright.getByRole('menuitem', { name: 'Media', exact: true });
const binding = await selectOneVerifiedFile({
  tab, causalTrigger: media,
  resolveInput: async () => {
    const input = tab.playwright.getByTestId('fileInput');
    if (await input.count() !== 1 || !await input.isEnabled()) {
      throw new Error('Inline media file input is ambiguous');
    }
    return input;
  },
  absoluteAssetPath, expected: verifiedAsset, timeoutMs
});
```

After the media is observed at the locked ordinal, first inspect the fresh Observation. If X already replaced the anchor, skip keyboard deletion. Otherwise select only the still-present marker text with `Home` then `Shift+End`, read the current selection using read-only `evaluate`, and press `Backspace` only when the selection equals the marker. Use the unique visible `Add description` or `+ALT` control scoped to the newly inserted media, fill no more than 1,000 characters, click the unique `Done` control, and verify exact Alt through the next fresh Observation. If either supported label is absent or both are present outside the scoped media, return `inline_alt_unverified`.

- [ ] **Step 5: Add no-append and no-combination regressions**

```js
it('never appends media when the anchor cannot be proven', async () => {
  const input = validInlineInput({ anchorCount: 0 });
  await runInlineImageUpload(input);
  expect(input.calls).not.toContainEqual(['composer.press', 'End']);
  expect(input.calls.filter(([name]) => name === 'setFiles')).toHaveLength(0);
});

it('does not process a second asset in the same claim', async () => {
  const input = validInlineInput({ availableAssets: [assetA, assetB] });
  await runInlineImageUpload(input);
  expect(input.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
  expect(input.calls.find(([name, files]) => name === 'setFiles' && files.includes(assetB.path)))
    .toBeUndefined();
});
```

- [ ] **Step 6: Verify GREEN and shared primitive regressions**

```powershell
pnpm vitest run tests/skills/x-article-inline-image-host.test.mjs tests/skills/x-article-host-common.test.mjs tests/x-article/article-browser-host-observation.test.ts
pnpm eslint skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs tests/skills/x-article-inline-image-host.test.mjs
```

Expected: all selected tests pass; lint exits `0`.

- [ ] **Step 7: Commit Task 6**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs tests/skills/x-article-inline-image-host.test.mjs
git commit -m "feat: replace X Article visual anchors"
```

---

### Task 7: Dispatch the complete Draft-only Host loop

**Files:**

- Create: `skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs`
- Create: `tests/skills/x-article-host-bridge.test.mjs`
- Modify: `skills/x-publishing-copilot/SKILL.md:14`
- Modify: `skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md:1-48`
- Modify: `tests/skills/skill-boundary.test.ts:106-147`
- Modify: `tools/x-article-fast-path-acceptance.ts`
- Modify: `tests/tools/x-article-fast-path-acceptance.test.ts`

**Interfaces:**

- Produces: `runXArticleHostBridge(input): Promise<XArticleHostBridgeOutcomeV1>`.
- Supports exactly `navigate`, `observe_article_page`, `upload_article_cover`, and `replace_article_visual_anchor`.
- Produces one `report` object but never calls Harness `claim` or `report` itself.

- [ ] **Step 1: Write dispatcher RED tests**

```js
it.each([
  ['navigate', 'runNavigate'],
  ['observe_article_page', 'runObserve'],
  ['upload_article_cover', 'runCoverUpload'],
  ['replace_article_visual_anchor', 'runInlineImageUpload']
])('dispatches %s to one transaction', async (kind, expectedCall) => {
  const input = bridgeInput(kind);
  const outcome = await runXArticleHostBridge(input);
  expect(input.calls).toEqual([expectedCall]);
  expect(outcome.report).toMatchObject({
    command: input.command,
    status: outcome.status,
    host_reason: outcome.reason,
    observation: outcome.observation
  });
});

it.each(['open_article_preview', 'open_publish_review', 'publish_article_once'])
  ('rejects %s with zero browser calls', async (kind) => {
    const input = bridgeInput(kind);
    await expect(runXArticleHostBridge(input)).rejects.toThrow(/Draft-only/i);
    expect(input.calls).toEqual([]);
  });

it('stops before dispatch when the shared deadline has expired', async () => {
  const input = bridgeInput('upload_article_cover', { deadlineExceeded: true });
  await expect(runXArticleHostBridge(input)).rejects.toThrow(/deadline/i);
  expect(input.calls).toEqual([]);
});
```

- [ ] **Step 2: Run dispatcher and boundary tests and capture RED**

```powershell
pnpm vitest run tests/skills/x-article-host-bridge.test.mjs tests/skills/skill-boundary.test.ts tests/tools/x-article-fast-path-acceptance.test.ts
```

Expected: dispatcher module is missing; Skill still routes cover directly to `runCoverUpload`; acceptance does not assert the V3.5 Bridge.

- [ ] **Step 3: Implement the exact dispatcher**

```js
const ALLOWED = new Set([
  'navigate', 'observe_article_page',
  'upload_article_cover', 'replace_article_visual_anchor'
]);
const FORBIDDEN = new Set([
  'open_article_preview', 'open_publish_review', 'publish_article_once'
]);

export async function runXArticleHostBridge(input) {
  if (FORBIDDEN.has(input.command?.kind)) {
    throw new Error('X Article Host Bridge is Draft-only');
  }
  if (!ALLOWED.has(input.command?.kind)) {
    throw new Error(`Unsupported X Article Host command: ${input.command?.kind}`);
  }
  if (input.deadline.exceeded()) throw new Error('X Article Fast Path deadline exceeded');
  const outcome = await dispatchOne(input);
  return {
    ...outcome,
    report: {
      command: input.command,
      status: outcome.status,
      host_reason: outcome.reason,
      observation: outcome.observation
    }
  };
}
```

The dispatcher obtains before/after Observations only through `observeXArticleEditor`, injects the same deadline callback into all bounded waits, and never loops over multiple commands or assets.

- [ ] **Step 4: Replace direct Skill routing with the Bridge**

The Fast Path reference must say:

```text
For navigate, observe_article_page, upload_article_cover, and replace_article_visual_anchor, import scripts/x-article-host-bridge.mjs and call runXArticleHostBridge with the selected Chrome tab, exact claimed command and claim, verified Host context, and at most one verified absolute asset path. Do not call Cover or Inline Host modules directly. Do not handwrite evaluate/filechooser/setFiles logic. Report outcome.report exactly once, then discard all page locators.
```

It must also replace the old ban on direct `input[type=file]` with the official rule: prefer the exact scoped file input, register the chooser before its causal click, and never use `locator.setInputFiles`.

- [ ] **Step 5: Extend acceptance for 0/1/3/10 visuals and zero submit surface**

For each image count, assert:

```ts
expect(result.cover).toEqual({ expected: 1, completed: 1, alt: 'unobservable' });
expect(result.inline_images).toEqual({ expected: imageCount, completed: imageCount });
expect(result.preview_command_count).toBe(0);
expect(result.publish_command_count).toBe(0);
expect(issuedKinds).not.toContain('open_article_preview');
expect(issuedKinds).not.toContain('publish_article_once');
```

Add a disconnect case that creates one read-only recovery Observation and proves the already claimed media command is not selected again.

- [ ] **Step 6: Verify GREEN**

```powershell
pnpm vitest run tests/skills/x-article-host-bridge.test.mjs tests/skills/x-article-editor-extractor.test.mjs tests/skills/x-article-host-runtime.test.mjs tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs tests/skills/x-article-inline-image-host.test.mjs tests/skills/skill-boundary.test.ts tests/tools/x-article-fast-path-acceptance.test.ts
pnpm acceptance:x-article-fast-path
```

Expected: every selected test passes; acceptance exits `0` for 0/1/3/10 images, disconnect, deadline, and zero Preview/Publish.

- [ ] **Step 7: Commit Task 7**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs tests/skills/x-article-host-bridge.test.mjs skills/x-publishing-copilot/SKILL.md skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md tests/skills/skill-boundary.test.ts tools/x-article-fast-path-acceptance.ts tests/tools/x-article-fast-path-acceptance.test.ts
git commit -m "feat: dispatch complete X Article Host Bridge"
```

---

### Task 8: Fail before build when committed CLI output is stale

**Files:**

- Create: `harnesses/research-publishing/cli/x-article-control-surface.ts`
- Create: `tools/check-packaged-x-article-cli.ts`
- Create: `tests/tools/check-packaged-x-article-cli.test.ts`
- Modify: `harnesses/research-publishing/cli/index.ts:150-175`
- Modify: `tests/cli/cli.test.ts:205-230`
- Modify: `package.json:22-36`
- Modify generated files under `dist/harnesses/research-publishing/cli/`, `dist/harnesses/research-publishing/adapters/x/article-browser/`, and `dist/tools/` that correspond exactly to changed TypeScript sources.

**Interfaces:**

- Produces: `X_ARTICLE_HOST_PROTOCOL = 'x-article-host-bridge/v3.5'`.
- Produces: `X_ARTICLE_CONTROL_ROUTES` as the single source list used by the CLI and parity tool.
- Produces: `assertPackagedXArticleCliHelp({ help, protocol, routes }): void` for the pure comparison.
- Produces: `checkPackagedXArticleCli({ cliPath, protocol, routes }): void` for spawning the committed CLI and delegating to the pure comparison.

- [ ] **Step 1: Write parity RED tests**

```ts
import { expect, it } from 'vitest';
import { assertPackagedXArticleCliHelp } from '../../tools/check-packaged-x-article-cli.js';

it('rejects a packaged CLI missing the Host protocol marker', () => {
  expect(() => assertPackagedXArticleCliHelp({
    help: 'x-article fast-path status --workspace <path>',
    protocol: 'x-article-host-bridge/v3.5',
    routes: ['x-article fast-path status --workspace <path>']
  })).toThrow(/protocol/i);
});

it('rejects any missing source route and accepts the exact complete surface', () => {
  expect(() => assertPackagedXArticleCliHelp({
    help: 'Host protocol: x-article-host-bridge/v3.5',
    protocol: 'x-article-host-bridge/v3.5',
    routes: ['x-article fast-path audit --workspace <path>']
  })).toThrow(/route/i);
  expect(() => assertPackagedXArticleCliHelp({
    help: 'Host protocol: x-article-host-bridge/v3.5\nx-article fast-path audit --workspace <path>',
    protocol: 'x-article-host-bridge/v3.5',
    routes: ['x-article fast-path audit --workspace <path>']
  })).not.toThrow();
});
```

- [ ] **Step 2: Run parity tests and capture RED**

```powershell
pnpm vitest run tests/tools/check-packaged-x-article-cli.test.ts
```

Expected: FAIL because the parity tool and shared control surface do not exist.

- [ ] **Step 3: Extract the shared control surface and expose it in help**

Move the current private route list from `cli/index.ts` into:

```ts
export const X_ARTICLE_HOST_PROTOCOL = 'x-article-host-bridge/v3.5' as const;
export const X_ARTICLE_CONTROL_ROUTES = [
  'x-article fast-path audit --workspace <path> --input <input.json> --output json',
  'x-article fast-path confirm --workspace <path> --input <input.json> --output json',
  'x-article fast-path prepare --workspace <path> --audit <path> --confirmation <path> --capabilities <path> --release-set <path> [--observation <path>] --output json',
  'x-article fast-path status --workspace <path> --execution <id> --output json',
  'x-article fast-path recover --workspace <path> --execution <id> --output json',
  'x-article browser prepare --workspace <path> --plan <path> --capabilities <path> --output json',
  'x-article browser prepare-existing-media --workspace <path> --plan <path> --observation <path> --capabilities <path> --output json',
  'x-article browser resume-editor --workspace <path> --execution <id> --output json',
  'x-article browser confirm-publish --workspace <path> --execution <id> --confirmation <path> --output json',
  'x-article browser materialization-status --workspace <path> --execution <id> --output json'
] as const;
```

The CLI `--help` output must print `Host protocol: x-article-host-bridge/v3.5` followed by this exact list.

- [ ] **Step 4: Implement the pre-build parity command**

`tools/check-packaged-x-article-cli.ts` must spawn:

```ts
spawnSync(process.execPath, [
  resolve('dist/harnesses/research-publishing/cli/index.js'), '--help'
], { encoding: 'utf8' });
```

It exits nonzero when the committed CLI is missing the protocol or any route. Add:

```json
{
  "scripts": {
    "check:packaged-cli": "tsx tools/check-packaged-x-article-cli.ts",
    "check": "pnpm check:packaged-cli && pnpm lint && pnpm typecheck && pnpm test && pnpm acceptance"
  }
}
```

The parity command must be the first `check` step because `pnpm test` runs `pretest` and rebuilds `dist`.

- [ ] **Step 5: Prove the gate RED before rebuilding**

Run before `pnpm build`:

```powershell
pnpm check:packaged-cli
```

Expected: nonzero with `x-article-host-bridge/v3.5` missing from committed `dist`.

- [ ] **Step 6: Build once and prove GREEN without broad generated drift**

```powershell
pnpm build
pnpm check:packaged-cli
git status --short
```

Expected: parity exits `0`. Status may contain only source files from Tasks 1–8 and their corresponding `.js`, `.d.ts`, and `.js.map` outputs. If unrelated `dist` files change, stop and record the toolchain drift before staging anything.

- [ ] **Step 7: Verify CLI and parity tests**

```powershell
pnpm vitest run tests/tools/check-packaged-x-article-cli.test.ts tests/cli/cli.test.ts
git diff --check
```

Expected: tests pass and diff check is silent.

- [ ] **Step 8: Commit Task 8**

```powershell
git add -- harnesses/research-publishing/cli/x-article-control-surface.ts harnesses/research-publishing/cli/index.ts tools/check-packaged-x-article-cli.ts tests/tools/check-packaged-x-article-cli.test.ts tests/cli/cli.test.ts package.json dist/harnesses/research-publishing/cli dist/harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.js dist/harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.d.ts dist/harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.js.map dist/harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js dist/harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.d.ts dist/harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.js.map dist/tools/check-packaged-x-article-cli.js dist/tools/check-packaged-x-article-cli.d.ts dist/tools/check-packaged-x-article-cli.js.map dist/tools/x-article-fast-path-acceptance.js dist/tools/x-article-fast-path-acceptance.d.ts dist/tools/x-article-fast-path-acceptance.js.map
git commit -m "build: guard packaged X Article CLI parity"
```

---

### Task 9: Package, verify, document, and run the separately approved smoke

**Files:**

- Modify: `tests/skills/skill-boundary.test.ts`
- Modify: `tests/tools/manifest-content.test.ts`
- Modify: `registry/manifests/research-publishing.json`
- Modify: `.llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md`

**Interfaces:**

- Consumes all Task 1–8 modules.
- Produces one reproducible manifest and one evidence-backed final Bug Brief.
- Live smoke produces a new Fast Path Result only after separate user confirmation.

- [ ] **Step 1: Strengthen Skill and manifest RED assertions**

```ts
expect(reference).toContain('scripts/x-article-host-bridge.mjs');
expect(reference).toContain('runXArticleHostBridge');
expect(reference).toMatch(/prefer.*input\[type=file\][\s\S]*filechooser[\s\S]*setFiles/is);
expect(reference).toMatch(/never.*directly.*runCoverUpload/is);
expect(reference).toMatch(/ban.*Preview.*Publish/is);

for (const path of [
  'skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs',
  'skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs',
  'skills/x-publishing-copilot/scripts/x-article-host-common.mjs',
  'skills/x-publishing-copilot/scripts/x-article-cover-host.mjs',
  'skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs',
  'skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs'
]) expect(manifestPaths).toContain(path);
```

- [ ] **Step 2: Run boundary tests and regenerate the manifest**

```powershell
pnpm vitest run tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts
pnpm manifest
pnpm vitest run tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts
```

Expected: first run fails only when generated evidence is stale; after `pnpm manifest`, both tests pass.

- [ ] **Step 3: Run the complete offline verification in the masking-safe order**

```powershell
pnpm check:packaged-cli
pnpm lint
pnpm typecheck
pnpm vitest run tests/skills/x-article-editor-extractor.test.mjs tests/x-article/article-browser-host-observation.test.ts tests/skills/x-article-host-runtime.test.mjs tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs tests/skills/x-article-inline-image-host.test.mjs tests/skills/x-article-host-bridge.test.mjs tests/x-article/article-browser-host-normalizer.test.ts tests/x-article/article-media-attempt-policy.test.ts tests/x-article/article-fast-path-deadline.test.ts tests/x-article/article-browser-adapter.test.ts tests/tools/check-packaged-x-article-cli.test.ts tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts tests/tools/x-article-fast-path-acceptance.test.ts
pnpm acceptance:x-article-fast-path
pnpm check
git diff --check
```

Expected: every command exits `0`. Record exact test counts and elapsed time in the Bug Brief. A failure stops deployment and browser use.

- [ ] **Step 4: Update the Bug Brief with offline evidence**

Record:

- each RED failure and the commit that turned it GREEN;
- exact focused and aggregate test counts;
- source/committed-`dist` parity result;
- verified Draft-only command set;
- the known external Chrome permission dependency;
- `development: done`, `testing: offline_done`, `archive: pending`.

- [ ] **Step 5: Regenerate the manifest after the Bug Brief update and commit offline completion**

```powershell
pnpm manifest
pnpm vitest run tests/tools/manifest-content.test.ts
git add -- registry/manifests/research-publishing.json tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts .llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md
git commit -m "chore: package complete X Article Host Bridge"
```

- [ ] **Step 6: Prepare a new digest-bound Draft-only Audit**

Use the existing Draft `2093554993261654016` and exact account `@Glen56121`. The Audit must bind:

- title `From Skill Memory to Shared Agent Knowledge`;
- one approved cover;
- three approved inline images and their Alt strings;
- the final source/Skill/manifest/browser-host release set;
- 900-second budget;
- zero Preview and Publish authority.

Present the Audit digest and request one action-time confirmation. Do not claim or execute a browser write before the confirmation.

- [ ] **Step 7: Execute the 15-minute live Draft-only smoke**

After confirmation, run one continuous Inline Host loop:

1. Fresh read-only Observation and identity check.
2. Cover: one chooser and one file.
3. Inline anchors in locked ordinal order: one chooser and one file per claim.
4. Exact Alt write/readback per inline asset.
5. Fresh autosave and reconciliation Observation after every command.
6. Stop immediately on `draft_reconciled`, stable blocked state, uncertain effect, disconnect requiring the one allowed recovery, or deadline.

Success requires all of:

```text
cover 1/1
inline 3/3
unresolved anchors 0
inline Alt 3/3 verified
autosave saved
terminal state draft_reconciled
Preview commands 0
Publish commands 0
elapsed < 900 seconds
```

- [ ] **Step 8: Record live evidence or the exact external blocker**

If successful, set `testing: done` and record the Fast Path Result path/digest. If Chrome reports missing file binding, record exactly:

```text
To enable file upload, open chrome://extensions, click Details under the ChatGPT browser extension, and enable "Allow access to file URLs."
```

Do not modify the extension setting from code and do not retry the upload in the same claim.

---

## Plan Self-Review

- Spec coverage: Extractor → Task 1; deterministic Observation Builder → Task 2; packaged observer → Task 3; reasoned Cover → Task 4; persisted reason semantics → Task 5; anchor/Alt Inline → Task 6; Draft-only Dispatcher → Task 7; source/`dist` parity → Task 8; 0/1/3/10 acceptance and real smoke → Tasks 7 and 9.
- Data minimization: no planned module reads browser storage, complete DOM, timeline, messages, cookies, or profiles.
- Type consistency: `XArticleHostPageSnapshotV1`, `XArticleHostObservationContextV1`, `buildXArticleHostObservation`, `observeXArticleEditor`, `runCoverUpload`, `runInlineImageUpload`, and `runXArticleHostBridge` each have one definition and one direction of dependency.
- Retry safety: one chooser belongs to one claim; processing and uncertain effects cannot authorize another Host selection.
- Authority safety: `runXArticleHostBridge` rejects all Preview/Publish kinds before browser dispatch.
- Time safety: the existing 900-second deadline is shared by dispatch and stability waits; no task introduces a second timer origin.
- Packaging safety: parity runs before any build-capable test; manifest evidence is regenerated only after source and docs settle.
- Unresolved-marker scan: the plan contains no unfinished implementation markers or unspecified file paths.

## Execution Handoff

The confirmed design already locks execution to **Inline Execution**. Implement this plan in the current branch with `superpowers:executing-plans`, one Task at a time, and stop for review after each independently testable commit. Do not switch to Subagent-Driven execution without a new explicit user decision.
