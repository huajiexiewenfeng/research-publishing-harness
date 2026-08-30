# X Article Thin Host Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `input.files` as an X Article upload success gate while preserving approved-media verification, Draft-only authority, page-result verification, bounded attempts, and Windows long-path compatibility.

**Architecture:** Keep one thin Host Bridge. The Browser delivery primitive opens one single-file chooser and calls `setFiles`; Cover and Inline transactions decide success only from stable Editor Observations. A verified, transaction-scoped short-path copy is used only when the approved source path exceeds 240 characters.

**Tech Stack:** Node.js ESM, Vitest, Codex Chrome Host port, TypeScript Harness CLI, pnpm.

## Global Constraints

- Execution mode is Inline Execution; do not dispatch Subagents.
- Allowed browser commands remain `navigate`, `observe_article_page`, `upload_article_cover`, and `replace_article_visual_anchor`.
- Preview and Publish commands must be rejected before dispatch.
- Host code performs one file delivery per claimed Command and never retries locally.
- Success requires stable page evidence; `setFiles` completion alone is not success.
- `input.files` must not participate in the state machine or delay the flow.
- Approved source digest and MIME are verified before browser use.
- A long-path transport copy must preserve exact bytes and be removed after the transaction.
- The shared live deadline remains 900 seconds.

---

## File Map

- `skills/x-publishing-copilot/scripts/x-article-host-common.mjs`: media verification, one-file delivery, stable Observation wait, short-path staging.
- `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`: cover controls and page-result classification.
- `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`: anchor placement, page-result classification, Alt write/readback.
- `skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs`: Draft-only routing and staging lifetime.
- `tests/skills/x-article-host-common.test.mjs`: delivery and staging unit coverage.
- `tests/skills/x-article-cover-host.test.mjs`: cover page-result regression coverage.
- `tests/skills/x-article-inline-image-host.test.mjs`: inline page-result regression coverage.
- `tests/skills/x-article-host-bridge.test.mjs`: routing, cleanup, and authority coverage.
- `.llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md`: evidence ledger and remaining live gate.
- `registry/manifests/research-publishing.json`: generated package evidence.

---

### Task 1: Replace binding verification with one-file delivery

**Files:**
- Modify: `tests/skills/x-article-host-common.test.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-host-common.mjs`

**Interfaces:**
- Consumes: `tab.playwright.waitForEvent('filechooser')`, one causal trigger, an absolute asset path, and timeout.
- Produces: `deliverOneFile({ tab, causalTrigger, absoluteAssetPath, timeoutMs })` resolving to `{ kind: 'submitted' }` after `setFiles` returns.
- Preserves: thrown errors with `selection_may_have_occurred` for pre-selection versus post-selection uncertainty.

- [ ] **Step 1: Write the failing delivery test**

Replace the existing binding-success test with a test whose fake input contains zero files but is never read:

```js
it('submits one file without reading the transient file input binding', async () => {
  const browser = selectionFixture({ files: [] });

  await expect(deliverOneFile({
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
```

Keep the existing multiple-chooser rejection test, updated to call `deliverOneFile` without `resolveInput` or `expected`.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/skills/x-article-host-common.test.mjs
```

Expected: FAIL because `deliverOneFile` is not exported and the old helper still reads `input.files`.

- [ ] **Step 3: Implement the minimal delivery primitive**

Rename `selectOneVerifiedFile` to `deliverOneFile`, remove `resolveInput` and `expected`, and finish immediately after one successful `setFiles`:

```js
export async function deliverOneFile({
  tab,
  causalTrigger,
  absoluteAssetPath,
  timeoutMs
}) {
  if (
    typeof tab?.playwright?.waitForEvent !== 'function'
    || typeof causalTrigger?.click !== 'function'
    || !isAbsolute(absoluteAssetPath)
    || !Number.isFinite(timeoutMs)
    || timeoutMs <= 0
  ) throw selectionFailure('X Article file delivery input is invalid', false);

  let chooser;
  try {
    const chooserPromise = tab.playwright.waitForEvent('filechooser', { timeoutMs });
    void chooserPromise.catch(() => undefined);
    await causalTrigger.click();
    chooser = await chooserPromise;
  } catch (error) {
    throw selectionFailure('X Article file chooser was not opened', false, error);
  }

  if (await chooser.isMultiple()) {
    throw selectionFailure('X Article multiple file chooser is not allowed', false);
  }
  try {
    await chooser.setFiles([absoluteAssetPath], { timeoutMs });
  } catch (error) {
    throw selectionFailure('X Article file delivery is uncertain', true, error);
  }
  return { kind: 'submitted' };
}
```

Delete the post-`setFiles` input resolution and binding comparison block.

- [ ] **Step 4: Run GREEN**

```powershell
pnpm exec vitest run tests/skills/x-article-host-common.test.mjs
```

Expected: all Host Common tests pass; call traces contain no `input.binding`.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-host-common.mjs tests/skills/x-article-host-common.test.mjs
git commit -m "refactor: thin X Article file delivery"
```

---

### Task 2: Make cover success depend only on page evidence

**Files:**
- Modify: `tests/skills/x-article-cover-host.test.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`

**Interfaces:**
- Consumes: `deliverOneFile`, verified media, unique visible cover trigger, stable Observation.
- Produces: existing Outcome reasons `cover_uploaded`, `x_media_still_processing`, `x_media_effect_absent`, `observation_unavailable_after_selection`, and pre-selection `file_transfer_missing`.

- [ ] **Step 1: Write the failing cover regression**

Change the former `file binding missing` case so empty binding plus uploaded/saved page evidence succeeds:

```js
it('accepts uploaded page evidence even when X clears the file input', async () => {
  const browser = fakeTab({ bindingFiles: [] });
  const input = await validInput({ tab: browser.tab, browser });

  await expect(runCoverUpload(input)).resolves.toMatchObject({
    status: 'success',
    effect: 'complete',
    reason: 'cover_uploaded'
  });
  expect(browser.calls).not.toContainEqual(['input.binding']);
  expect(browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
});
```

Keep a separate case where the stable page Observation has zero visuals and assert `x_media_effect_absent`.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/skills/x-article-cover-host.test.mjs
```

Expected: FAIL because Cover still calls `selectOneVerifiedFile` and treats missing binding as terminal.

- [ ] **Step 3: Implement Observation-only cover classification**

Import `deliverOneFile`. Remove `binding` from `classifyCover`:

```js
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
  ) return outcome('success', 'complete', 'cover_uploaded', observation);
  if (
    matches.some((visual) => visual.status === 'processing')
    || observation?.editor?.autosave_state === 'saving'
  ) return outcome('transient_failure', 'partial', 'x_media_still_processing', observation ?? null);
  if (matches.length === 0 && observation?.editor?.autosave_state === 'saved') {
    return outcome('transient_failure', 'none', 'x_media_effect_absent', observation);
  }
  return outcome('uncertain', 'unknown', 'observation_unavailable_after_selection', observation ?? null);
}
```

Call `deliverOneFile` with the visible trigger. If it throws before selection, return `file_transfer_missing`. If `hostSelectionMayHaveOccurred(error)` is true, continue to the same stable Observation path instead of returning early. Classify only the resulting Observation.

- [ ] **Step 4: Run GREEN**

```powershell
pnpm exec vitest run tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs
```

Expected: both files pass; successful Cover traces contain `setFiles` and no `input.binding`.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-cover-host.mjs tests/skills/x-article-cover-host.test.mjs
git commit -m "fix: classify X Article cover from page evidence"
```

---

### Task 3: Make inline image success depend only on page evidence

**Files:**
- Modify: `tests/skills/x-article-inline-image-host.test.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`

**Interfaces:**
- Consumes: `deliverOneFile`, locked anchor context, stable Observation, final Alt readback.
- Produces: existing `inline_image_uploaded` success only after uploaded visual, exact Alt, removed anchor, and saved autosave.

- [ ] **Step 1: Write the failing inline regression**

Update the fixture so its file input reports zero files, then assert the page-driven flow still completes:

```js
it('completes inline upload from visual and Alt evidence without file binding', async () => {
  const input = await validInput({ bindingFiles: [] });

  await expect(runInlineImageUpload(input)).resolves.toMatchObject({
    status: 'success',
    effect: 'complete',
    reason: 'inline_image_uploaded'
  });
  expect(input.browser.calls).not.toContainEqual(['input.binding']);
  expect(input.browser.calls.filter(([name]) => name === 'setFiles')).toHaveLength(1);
});
```

Retain tests for changed anchor context, missing visual after saved autosave, incorrect Alt, and an unresolved anchor.

- [ ] **Step 2: Run RED**

```powershell
pnpm exec vitest run tests/skills/x-article-inline-image-host.test.mjs
```

Expected: FAIL because Inline still treats missing input binding as `file_transfer_missing`.

- [ ] **Step 3: Implement page-driven inline delivery**

Import `deliverOneFile` and remove `resolveInput`, `expected`, `binding`, and the `binding.kind === 'missing'` branch:

```js
try {
  await anchorLocator.click({ timeoutMs });
  await anchorLocator.press('Home', { timeoutMs });
  const addMedia = tab.playwright.getByRole('button', { name: 'Add Media', exact: true });
  await addMedia.click({ timeoutMs });
  const mediaMenu = tab.playwright.getByRole('menuitem', { name: 'Media', exact: true });
  await deliverOneFile({
    tab,
    causalTrigger: mediaMenu,
    absoluteAssetPath,
    timeoutMs
  });
} catch (error) {
  if (!hostSelectionMayHaveOccurred(error)) {
    return outcome('transient_failure', 'none', 'file_transfer_missing', null);
  }
}
```

After this block, always run the existing stable Observation, target-visual, anchor-removal, Alt write/readback, and final autosave checks.

- [ ] **Step 4: Run GREEN**

```powershell
pnpm exec vitest run tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs tests/skills/x-article-inline-image-host.test.mjs
```

Expected: all three files pass; no successful trace reads `input.files`.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs tests/skills/x-article-inline-image-host.test.mjs
git commit -m "fix: classify X Article inline media from page evidence"
```

---

### Task 4: Finalize verified long-path transport in the Bridge

**Files:**
- Modify: `tests/skills/x-article-host-bridge.test.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-host-common.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs`

**Interfaces:**
- Consumes: a claimed media Command and its approved absolute source path.
- Produces: `prepareBrowserUploadPath(...)` returning `{ absoluteAssetPath, staged, cleanup }`.
- Guarantees: source and staged bytes match the Command digest; cleanup runs after success or thrown transaction.

- [ ] **Step 1: Preserve the existing RED/GREEN staging test and add failure cleanup RED**

Keep the current test that forces staging with `maxBrowserUploadPathLength: 1`. Add:

```js
it('removes the staged transport copy when the media transaction throws', async () => {
  const input = await verifiedLongPathBridgeInput();
  let transportPath = null;
  input.dependencies.runCoverUpload = vi.fn(async (transactionInput) => {
    transportPath = transactionInput.absoluteAssetPath;
    throw new Error('host transaction failed');
  });

  await expect(runXArticleHostBridge(input)).rejects.toThrow('host transaction failed');
  await expect(readFile(transportPath)).rejects.toMatchObject({ code: 'ENOENT' });
});
```

- [ ] **Step 2: Run RED or confirm the provisional code is incomplete**

```powershell
pnpm exec vitest run tests/skills/x-article-host-bridge.test.mjs
```

Expected: the new cleanup case fails if transaction-lifetime cleanup is missing; the test must not touch Chrome.

- [ ] **Step 3: Complete the minimal staging implementation**

Keep the provisional `prepareBrowserUploadPath` implementation only if it satisfies all of:

```js
const source = await verifyHostMediaInput({ command, claim, absoluteAssetPath });
if (!source) throw new Error('X Article browser upload source verification failed');
await copyFile(absoluteAssetPath, stagedPath);
const staged = await verifyHostMediaInput({ command, claim, absoluteAssetPath: stagedPath });
if (!staged || staged.digest !== source.digest || staged.byte_length !== source.byte_length) {
  throw new Error('X Article browser upload staging verification failed');
}
```

`dispatchWithBrowserTransport` must wrap the complete Cover/Inline transaction in `try/finally` and call `cleanup()` exactly once. Short paths pass through unchanged.

- [ ] **Step 4: Run GREEN and the real-asset local check**

```powershell
pnpm exec vitest run tests/skills/x-article-host-common.test.mjs tests/skills/x-article-host-bridge.test.mjs
```

Expected: tests pass. The approved 304-character cover stages to a path below 240 characters, preserves digest `sha256:0e68a95438ece1a67a0285d24dd3ae870ddfa5e66fbec0c59f4e16a9416f5306`, and is removed after cleanup.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-host-common.mjs skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs tests/skills/x-article-host-bridge.test.mjs
git commit -m "fix: stage long X Article media paths"
```

---

### Task 5: Package, verify, deploy, and prepare a fresh Audit

**Files:**
- Modify: `.llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md`
- Regenerate: `registry/manifests/research-publishing.json`
- Deploy exact changed Skill files to `C:/Users/admin/.codex-clean-20260710/skills/x-publishing-copilot/scripts/`

**Interfaces:**
- Consumes: Tasks 1–4 and the existing V3.5 Fast Path package.
- Produces: verified repository state, matching installed Skill files, and a new digest-bound Draft-only Audit. Live browser mutation remains separately confirmation-gated.

- [ ] **Step 1: Run focused Host verification**

```powershell
pnpm exec vitest run tests/skills/x-article-host-common.test.mjs tests/skills/x-article-cover-host.test.mjs tests/skills/x-article-inline-image-host.test.mjs tests/skills/x-article-host-bridge.test.mjs tests/skills/x-article-host-runtime.test.mjs
```

Expected: all focused tests pass with no `input.binding` in successful call traces.

- [ ] **Step 2: Regenerate package evidence**

```powershell
pnpm manifest
pnpm exec vitest run tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts
```

Expected: generated manifest tests pass and contain the changed Host scripts.

- [ ] **Step 3: Run complete verification in masking-safe order**

```powershell
pnpm check:packaged-cli
pnpm lint
pnpm typecheck
pnpm exec vitest run
pnpm acceptance:x-article-fast-path
git diff --check
```

Expected: every command exits `0`; record exact suite/test counts. Browser and X remain untouched.

- [ ] **Step 4: Update the Bug Brief and regenerate the manifest once more**

Record:

- strict `input.files` binding was removed from the state machine;
- page-level Observation is the success authority;
- long-path staging evidence and exact digest;
- RED/GREEN and aggregate test counts;
- one fresh live Draft-only confirmation remains required.

Then run:

```powershell
pnpm manifest
pnpm exec vitest run tests/tools/manifest-content.test.ts
```

- [ ] **Step 5: Commit the verified package state**

```powershell
git add -- .llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md registry/manifests/research-publishing.json
git commit -m "chore: package thin X Article Host adapter"
```

- [ ] **Step 6: Deploy exact changed Skill files and verify hashes**

Copy only these repository files to the installed Skill path:

```text
x-article-host-common.mjs
x-article-cover-host.mjs
x-article-inline-image-host.mjs
x-article-host-bridge.mjs
```

Compute SHA-256 for each repository/installed pair. Every pair must match before browser use.

- [ ] **Step 7: Generate a new Draft-only Audit**

Bind the existing Draft `2093554993261654016`, account `@Glen56121`, title `From Skill Memory to Shared Agent Knowledge`, one cover, three inline images with exact Alt strings, the final source/manifest/installed-Skill hashes, and a 900-second deadline. Authority remains zero for Preview and Publish.

Present the new Audit digest and stop. Do not reuse execution `x_article_execution_ac58f8ca-8350-4fed-a427-dcb545cdd7c6` or its consumed confirmation.

---

## Plan Self-Review

- Spec coverage: delivery simplification → Task 1; cover page authority → Task 2; inline page/Alt authority → Task 3; long-path copy and cleanup → Task 4; packaging, deployment, and fresh confirmation gate → Task 5.
- Scope: no title/body/asset edits, no Preview/Publish, no new retry loop, no Subagent.
- Type consistency: `deliverOneFile` has one signature; Cover and Inline both consume it; `prepareBrowserUploadPath` remains owned by Host Common and its lifetime by Host Bridge.
- State consistency: `setFiles` is delivery only; only stable Editor Observation can produce media success.
- Placeholder scan: every implementation step names exact files, commands, expected results, and concrete behavior.
- Dirty-worktree safety: only Task-specific paths are staged; existing provisional staging edits are reviewed against Task 4 rather than blindly committed.

## Execution Handoff

The user has already selected **Inline Execution** and explicitly prohibited Subagent dispatch for this work. Execute with `superpowers:executing-plans`, one Task at a time, with a verification checkpoint after each independently testable commit.
