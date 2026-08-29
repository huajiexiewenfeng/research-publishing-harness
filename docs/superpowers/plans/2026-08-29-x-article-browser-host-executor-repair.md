# X Article Browser Host Executable Cover Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad-hoc X Article cover upload calls with one packaged Codex-Chrome Host helper, and make media retry and Fast Path deadline limits enforceable.

**Architecture:** A JavaScript helper shipped inside `x-publishing-copilot` owns one causal cover file-chooser transaction while accepting an already selected Chrome tab and a fresh normalized observation callback. The existing TypeScript Adapter keeps authority over Command, Claim, Report, checkpoint, attempt count, and deadline. This slice stops at cover-only offline verification and does not add a standalone browser runtime.

**Tech Stack:** Node.js 20 ESM, JavaScript Host module, TypeScript 6, Vitest 4, existing Codex Chrome `tab.playwright` port, existing WorkspaceStore and X Article materialization progress ledger.

## Global Constraints

- Execute inline in the current task; do not dispatch Subagents.
- Do not add Playwright, Puppeteer, CDP, browser-profile, Cookie, or credential dependencies.
- Reuse the already selected Codex Chrome tab; the helper must not discover browsers or accounts.
- Keep X Article Plan, Approval, Command, Observation, and Report schemas unchanged.
- Allow no Preview, Publish, Draft deletion, Article content change, or new live X mutation during implementation verification.
- A media asset receives at most one initial command plus one adapter-authorized retry.
- Any `unknown` or `partial` media effect closes write authorization for that asset.
- The Fast Path deadline is `started_at + time_budget_seconds`; reaching or exceeding it closes write authorization.
- Reports for effects that were already claimed before the deadline remain recordable after the deadline.
- Inline-image execution is excluded from this plan.

---

## File Structure

- Create `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`: executable cover transaction for the Codex Chrome host.
- Create `tests/skills/x-article-cover-host.test.mjs`: fake-tab RED/GREEN tests for identity, call order, failure classification, and observation verification.
- Create `tests/fixtures/x-article/file-upload-probe.html`: non-X local fixture for the final transport smoke.
- Create `harnesses/research-publishing/adapters/x/article-browser/article-media-attempt-policy.ts`: pure media attempt decision.
- Create `tests/x-article/article-media-attempt-policy.test.ts`: pure policy tests.
- Create `harnesses/research-publishing/core/x-article-fast-path-deadline.ts`: pure deadline calculation.
- Create `tests/x-article/article-fast-path-deadline.test.ts`: boundary tests.
- Modify `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`: apply attempt and deadline guards; expose timed-out status.
- Modify `harnesses/research-publishing/cli/index.ts`: include `timed_out` in Fast Path status output.
- Modify `tests/x-article/article-browser-adapter.test.ts`: adapter-level retry, deadline, claim, and report regressions.
- Modify `tests/cli/cli.test.ts`: CLI timeout projection regression.
- Modify `skills/x-publishing-copilot/SKILL.md` and `skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md`: require the packaged helper instead of handwritten chooser calls.
- Modify `tests/skills/skill-boundary.test.ts`: enforce helper routing and forbid ad-hoc cover upload.
- Modify `registry/manifests/research-publishing.json`: regenerate packaged hashes after verified changes.
- Modify `.llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md`: record RED/GREEN and verification evidence.

---

### Task 1: Package one executable cover-upload transaction

**Files:**

- Create: `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`
- Create: `tests/skills/x-article-cover-host.test.mjs`
- Create: `tests/fixtures/x-article/file-upload-probe.html`

**Interfaces:**

- Consumes: a selected `tab`, immutable `upload_article_cover` command, matching claim, absolute asset path, and `observe()` callback returning a current normalized Article editor observation.
- Produces: `runCoverUpload(input): Promise<{status,effect,observation,retry_authorized}>` and no Harness or X Publish side effects.

- [ ] **Step 1: Write the failing Host tests**

Add tests that import the wished-for module and assert the exact action order:

```js
import { runCoverUpload } from '../../skills/x-publishing-copilot/scripts/x-article-cover-host.mjs';

it('arms the chooser before the exact cover click and selects one absolute file', async () => {
  const calls = [];
  const chooser = { setFiles: async (files) => calls.push(['setFiles', files]) };
  const trigger = {
    count: async () => 1,
    isVisible: async () => true,
    click: async () => calls.push(['click'])
  };
  const tab = { playwright: {
    getByRole: () => trigger,
    waitForEvent: async (name, options) => {
      calls.push(['waitForEvent', name, options]);
      return chooser;
    }
  } };
  const result = await runCoverUpload(validInput({ tab, observe: async () => uploadedObservation() }));
  expect(calls).toEqual([
    ['waitForEvent', 'filechooser', { timeoutMs: 10_000 }],
    ['click'],
    ['setFiles', [absoluteCoverPath]]
  ]);
  expect(result).toMatchObject({ status: 'success', effect: 'complete', retry_authorized: false });
});
```

Add independent tests for: mismatched claim, relative path, digest mismatch, duplicate/hidden cover control, chooser timeout, no observed cover, and unknown observation.

- [ ] **Step 2: Run the Host test and verify RED**

Run:

```powershell
pnpm vitest run tests/skills/x-article-cover-host.test.mjs
```

Expected: FAIL because `x-article-cover-host.mjs` does not exist.

- [ ] **Step 3: Implement the minimal Host helper**

Implement these fixed rules:

```js
export async function runCoverUpload({
  tab, command, claim, absoluteAssetPath, observe, timeoutMs = 10_000
}) {
  await verifyCoverInput({ command, claim, absoluteAssetPath });
  const trigger = tab.playwright.getByRole('button', { name: 'Choose File', exact: true });
  if (await trigger.count() !== 1 || !await trigger.isVisible()) {
    return outcome('rejected', 'none', null);
  }

  let chooser;
  try {
    const chooserPromise = tab.playwright.waitForEvent('filechooser', { timeoutMs });
    await trigger.click();
    chooser = await chooserPromise;
  } catch {
    return outcome('transient_failure', 'none', null);
  }

  try {
    await chooser.setFiles([absoluteAssetPath]);
  } catch {
    return outcome('uncertain', 'unknown', null);
  }

  const observation = await observe();
  const visuals = observation?.editor?.visuals ?? [];
  const matches = visuals.filter((visual) =>
    visual.kind === 'cover'
    && visual.asset_id === command.payload.asset.asset_id
    && visual.status === 'uploaded'
  );
  if (matches.length === 1 && observation.editor.autosave_state === 'saved') {
    return outcome('success', 'complete', observation);
  }
  if (matches.length === 0 && observation?.editor?.autosave_state === 'saved') {
    return outcome('transient_failure', 'none', observation);
  }
  return outcome('uncertain', 'unknown', observation ?? null);
}
```

`verifyCoverInput` must use only Node built-ins to require an absolute regular file, compare SHA-256 bytes with `command.payload.asset.digest`, validate PNG/JPEG/WebP/GIF signatures against `mime_type`, and require exact command/claim identity. Every returned outcome must set `retry_authorized: false`.

- [ ] **Step 4: Add the non-X upload fixture**

Create a local HTML page with one visible `Choose File` button, one file input, and a `selected-file` output updated from the input change event. It must contain no network script and no X-specific content.

- [ ] **Step 5: Verify GREEN and adjacent Skill tests**

Run:

```powershell
pnpm vitest run tests/skills/x-article-cover-host.test.mjs tests/skills/skill-boundary.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit Task 1**

```powershell
git add -- skills/x-publishing-copilot/scripts/x-article-cover-host.mjs tests/skills/x-article-cover-host.test.mjs tests/fixtures/x-article/file-upload-probe.html
git commit -m "feat: add executable X Article cover host"
```

---

### Task 2: Enforce one bounded media retry

**Files:**

- Create: `harnesses/research-publishing/adapters/x/article-browser/article-media-attempt-policy.ts`
- Create: `tests/x-article/article-media-attempt-policy.test.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- Modify: `tests/x-article/article-browser-adapter.test.ts`

**Interfaces:**

- Consumes: persisted `XArticleStageProgressV1[]`, exact `asset_id`, and command purpose.
- Produces: `decideXArticleMediaAttempt(input)` returning `{kind:'allow', attempt:1|2}` or `{kind:'block', reason}`.

- [ ] **Step 1: Write the failing pure policy tests**

Cover the complete truth table:

```ts
expect(decideXArticleMediaAttempt({ progress: [], asset_id, purpose }))
  .toEqual({ kind: 'allow', attempt: 1 });
expect(decideXArticleMediaAttempt({ progress: [noneEvent], asset_id, purpose }))
  .toEqual({ kind: 'allow', attempt: 2 });
expect(decideXArticleMediaAttempt({ progress: [unknownEvent], asset_id, purpose }))
  .toEqual({ kind: 'block', reason: 'effect_unknown' });
expect(decideXArticleMediaAttempt({ progress: [noneEvent, noneEvent2], asset_id, purpose }))
  .toEqual({ kind: 'block', reason: 'attempt_limit' });
expect(decideXArticleMediaAttempt({ progress: [completeEvent], asset_id, purpose }))
  .toEqual({ kind: 'block', reason: 'already_complete' });
```

- [ ] **Step 2: Run the policy test and verify RED**

Run:

```powershell
pnpm vitest run tests/x-article/article-media-attempt-policy.test.ts
```

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the pure decision**

Filter only events whose `asset_id` matches and whose stage prefix before `#` equals the exact purpose. Apply this order:

```ts
if (events.some((event) => event.observed_effect === 'unknown' || event.observed_effect === 'partial')) {
  return { kind: 'block', reason: 'effect_unknown' };
}
if (events.some((event) => event.observed_effect === 'complete')) {
  return { kind: 'block', reason: 'already_complete' };
}
if (events.length >= 2) return { kind: 'block', reason: 'attempt_limit' };
return { kind: 'allow', attempt: events.length === 0 ? 1 : 2 };
```

- [ ] **Step 4: Write adapter-level RED regressions**

Add two Fast Path tests using existing helpers:

1. One `uncertain` cover report with a fresh zero-cover observation causes the next call to return `materialization_blocked`, `command: null`, and leaves cover command count at `1`.
2. One `transient_failure` plus fresh zero-cover observation permits exactly one second cover command; a second `transient_failure` then blocks and leaves count at `2`.

- [ ] **Step 5: Run adapter tests and verify RED**

Run:

```powershell
pnpm vitest run tests/x-article/article-browser-adapter.test.ts
```

Expected: the new regressions FAIL because `nextMaterializationCommand()` reissues a missing cover without consulting progress history.

- [ ] **Step 6: Apply the policy before issuing the cover command**

In the `isOnlyMissingCover` branch, read progress and call the pure policy before `this.issue(...)`. For a block decision, call `blockMaterialization()` with one deterministic reason such as `cover media write blocked: effect_unknown`, and return `{snapshot, command:null}`. Do not change report or command schemas.

- [ ] **Step 7: Verify GREEN**

Run:

```powershell
pnpm vitest run tests/x-article/article-media-attempt-policy.test.ts tests/x-article/article-browser-adapter.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- harnesses/research-publishing/adapters/x/article-browser/article-media-attempt-policy.ts harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts tests/x-article/article-media-attempt-policy.test.ts tests/x-article/article-browser-adapter.test.ts
git commit -m "fix: bound X Article media attempts"
```

---

### Task 3: Turn the Fast Path budget into a hard deadline

**Files:**

- Create: `harnesses/research-publishing/core/x-article-fast-path-deadline.ts`
- Create: `tests/x-article/article-fast-path-deadline.test.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/x-article/article-browser-adapter.test.ts`
- Modify: `tests/cli/cli.test.ts`

**Interfaces:**

- Consumes: `{started_at, time_budget_seconds, now}`.
- Produces: `evaluateXArticleFastPathDeadline(input): {elapsed_seconds:number, exceeded:boolean}`.

- [ ] **Step 1: Write deadline RED tests**

```ts
expect(evaluateXArticleFastPathDeadline({ started_at, time_budget_seconds: 900, now: at899 }))
  .toMatchObject({ exceeded: false, elapsed_seconds: 899 });
expect(evaluateXArticleFastPathDeadline({ started_at, time_budget_seconds: 900, now: at900 }))
  .toMatchObject({ exceeded: true, elapsed_seconds: 900 });
expect(() => evaluateXArticleFastPathDeadline({ started_at: 'invalid', time_budget_seconds: 900, now: at900 }))
  .toThrowError(/timestamp/i);
```

- [ ] **Step 2: Run the deadline test and verify RED**

Run:

```powershell
pnpm vitest run tests/x-article/article-fast-path-deadline.test.ts
```

Expected: FAIL because the deadline module does not exist.

- [ ] **Step 3: Implement the pure deadline calculation**

Parse both timestamps, reject invalid or pre-start clocks, compute seconds once, and set `exceeded` when `elapsed_seconds >= time_budget_seconds`. Do not read wall time inside the pure function.

- [ ] **Step 4: Write adapter and CLI RED regressions**

Add tests proving:

- status at the exact deadline returns `fast_path_status.timed_out: true` and stage `Timed out`;
- `next()` at the deadline returns `materialization_blocked` with no command;
- an unclaimed write command issued before the deadline cannot be claimed at or after the deadline;
- `recoverFastPath()` rejects with `ARTICLE_MATERIALIZATION_TIMEOUT` after the main deadline even if recovery count is zero;
- a report for a command claimed before the deadline is still persisted after the deadline;
- CLI Fast Path status includes `timed_out: true`.

- [ ] **Step 5: Run adapter and CLI tests and verify RED**

Run:

```powershell
pnpm vitest run tests/x-article/article-browser-adapter.test.ts tests/cli/cli.test.ts
```

Expected: the new timeout assertions FAIL because status only displays elapsed time and claim/next do not close authorization.

- [ ] **Step 6: Enforce the deadline at all authority boundaries**

Make these minimal changes:

```ts
export interface XArticleFastPathStatusProjectionV1 {
  readonly stage: 'Draft ready' | 'Cover' | 'Inline images' | 'Final check' | 'Timed out';
  readonly timed_out: boolean;
  // existing fields unchanged
}
```

- At the start of `nextLocked()`, block an expired non-complete Fast Path before returning or issuing a pending write command.
- In `claimLocked()`, reject an expired Fast Path write command with `ARTICLE_MATERIALIZATION_TIMEOUT`.
- Treat `materialization_blocked` as terminal in `assertClaimLifecycleActive()`.
- In `recoverFastPath()`, check the main deadline before the existing 120-second recovery rule.
- In `status()`, project `Timed out` and `timed_out:true` when no result exists and the deadline is exceeded.
- In CLI status output, copy `timed_out` from the adapter projection.
- Keep `report()` unchanged so a previously claimed effect can still be recorded truthfully.

- [ ] **Step 7: Verify GREEN**

Run:

```powershell
pnpm vitest run tests/x-article/article-fast-path-deadline.test.ts tests/x-article/article-browser-adapter.test.ts tests/cli/cli.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 8: Commit Task 3**

```powershell
git add -- harnesses/research-publishing/core/x-article-fast-path-deadline.ts harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts harnesses/research-publishing/cli/index.ts tests/x-article/article-fast-path-deadline.test.ts tests/x-article/article-browser-adapter.test.ts tests/cli/cli.test.ts
git commit -m "fix: enforce X Article Fast Path deadline"
```

---

### Task 4: Wire, package, and verify the repaired Host boundary

**Files:**

- Modify: `skills/x-publishing-copilot/SKILL.md`
- Modify: `skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md`
- Modify: `tests/skills/skill-boundary.test.ts`
- Modify: `registry/manifests/research-publishing.json`
- Modify: `.llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md`

**Interfaces:**

- Consumes: `runCoverUpload()` from Task 1 and the guards from Tasks 2–3.
- Produces: one packaged Skill route that forbids handwritten cover chooser calls and records verified release evidence.

- [ ] **Step 1: Write the failing Skill boundary test**

Require the Fast Path reference to name `scripts/x-article-cover-host.mjs`, `runCoverUpload`, and the rule “do not handwrite or locally retry cover filechooser/setFiles calls.” Require the script file to exist in the manifest.

- [ ] **Step 2: Run the Skill test and verify RED**

Run:

```powershell
pnpm vitest run tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts
```

Expected: FAIL because the Skill does not yet route cover commands through the helper and the generated manifest lacks its digest.

- [ ] **Step 3: Wire the Skill and reference**

Add one exact Host rule:

```text
For upload_article_cover, import scripts/x-article-cover-host.mjs and call runCoverUpload with the selected Chrome tab, exact claimed command, exact claim, verified absolute asset path, and one fresh normalized observe callback. Do not handwrite waitForEvent/setFiles, do not use direct input[type=file], and do not locally retry.
```

Do not alter the inline-image path in this task.

- [ ] **Step 4: Regenerate and verify the manifest**

Run:

```powershell
pnpm manifest
pnpm vitest run tests/skills/x-article-cover-host.test.mjs tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts
```

Expected: manifest generation exits `0`; all selected tests PASS.

- [ ] **Step 5: Run the complete offline verification**

Run in this order:

```powershell
pnpm lint
pnpm typecheck
pnpm vitest run tests/skills/x-article-cover-host.test.mjs tests/x-article/article-media-attempt-policy.test.ts tests/x-article/article-fast-path-deadline.test.ts tests/x-article/article-browser-adapter.test.ts tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts
pnpm acceptance:x-article-fast-path
pnpm check
git diff --check
```

Expected: every command exits `0`. If any command fails, record the exact failure and stop before deployment or Chrome use.

- [ ] **Step 6: Run the non-X Chrome transport probe**

Open only `tests/fixtures/x-article/file-upload-probe.html` in the existing Chrome session, import the packaged helper in the Codex browser host, select a generated non-sensitive PNG fixture, and verify the local page displays its filename. Do not navigate to X during this step. If the probe fails, record the browser-runtime error and stop.

- [ ] **Step 7: Update the Bug Brief with evidence**

Record the RED failures, GREEN commands, exact test counts, transport-probe result, remaining live-smoke limitation, and changed files. Set `development` and `testing` to `done` only if their evidence exists; leave `archive` pending until project-finish.

- [ ] **Step 8: Commit Task 4**

```powershell
git add -- skills/x-publishing-copilot/SKILL.md skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md tests/skills/skill-boundary.test.ts registry/manifests/research-publishing.json .llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md
git commit -m "chore: package repaired X Article cover host"
```

No repository-to-global Skill deployment and no live X Draft mutation belong to this plan. Both require a separate post-verification approval.

---

## Plan Self-Review

- Spec coverage: executable Helper, local transport probe, attempt guard, hard deadline, Skill wiring, and offline verification each map to one task.
- Scope: cover-only; inline images, Preview, Publish, Draft cleanup, browser profiles, and new schemas remain excluded.
- Type consistency: `runCoverUpload`, `decideXArticleMediaAttempt`, `evaluateXArticleFastPathDeadline`, and `fast_path_status.timed_out` have one name and one definition throughout.
- Safety: reports remain recordable; expired or uncertain writes cannot gain new claim authority.
- Placeholder scan: the plan contains no unfinished implementation marker or unspecified test step.
