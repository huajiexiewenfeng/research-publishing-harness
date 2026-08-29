# X Article Fast Path V3.4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the confirmed X Article audit into a Draft-only Fast Path that needs one Human confirmation, zero normal Human browser operations, and reaches `draft_reconciled` within ten minutes for up to ten inline images.

**Architecture:** Add a small Publication Preflight and Fast Path Orchestrator above the existing V3.2/V3.3 materialization engine. The Harness locks sanitized content, checks the runtime/Skill/manifest/Browser Host release set, chooses new-Draft or existing-Draft handling internally, persists recovery and completion evidence, and continues to issue the existing atomic Browser commands. The `x-publishing-copilot` Host loop consumes those commands continuously without requesting per-command Human confirmation; Preview and Publish remain outside this version.

**Tech Stack:** TypeScript 6, Node.js 20, Commander, AJV JSON Schema, Vitest, pnpm, existing Codex Chrome Browser Host protocol.

## Global Constraints

- Keep the existing `next -> verify -> claim -> execute -> observe -> report` browser transaction unchanged.
- Do not add a bulk browser command, a second Draft-creation path, a Preview step, or a Publish step.
- Do not introduce Subagents, timer resets, or an unbounded retry loop into the product flow.
- The only automatic recovery is one read-only recovery attempt with a 120-second ceiling.
- Preserve V3.2 `materialization_v3_2`, V3.3 `media_completion_v3_3`, and `legacy_preapproved` compatibility.
- Use the repository Skill as source of truth. A stale installed global Skill must block before Chrome rather than silently falling back.
- Implement each task test-first and commit only after its focused tests and `git diff --check` pass.
- Do not edit the installed global Skill until the repository implementation and full verification are complete.

---

## Task 1: Add deterministic Publication Preflight

**Files:**

- Create: `harnesses/research-publishing/branches/x-article-harness/article-publication-preflight.ts`
- Create: `harnesses/research-publishing/contracts/x-article-publication-preflight.schema.json`
- Create: `tests/x-article/article-publication-preflight.test.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `harnesses/research-publishing/core/errors.ts`

### Contract to implement

```ts
export interface XArticleEditorialRemovalV1 {
  readonly block_ordinal: number;
  readonly block_digest: `sha256:${string}`;
  readonly text: string;
  readonly reason: 'draft_status' | 'evidence_review_date';
}

export interface XArticlePublicationPreflightV1 {
  readonly schema_version: 'x-article-publication-preflight/v1';
  readonly source_document_digest: `sha256:${string}`;
  readonly sanitized_document: XArticleDocumentV1;
  readonly sanitized_document_digest: `sha256:${string}`;
  readonly removals: readonly XArticleEditorialRemovalV1[];
  readonly cover: {
    readonly asset_id: string;
    readonly asset_digest: `sha256:${string}`;
    readonly alt_text: string;
  };
  readonly inline_assets: readonly {
    readonly asset_id: string;
    readonly block_ordinal: number;
    readonly asset_digest: `sha256:${string}`;
    readonly alt_text: string;
  }[];
  readonly preflight_digest: `sha256:${string}`;
}

export function createXArticlePublicationPreflight(input: {
  readonly document: XArticleDocumentV1;
  readonly visuals: readonly XArticleVisualBindingV1[];
}): XArticlePublicationPreflightV1;
```

### Steps

- [ ] Write failing tests proving that preflight:
  - removes a standalone paragraph matching the known combined `Status: X Article Draft` and `Evidence review date` editorial line;
  - records the exact removed block ordinal, text, digest, and reason;
  - does not remove the same words when they are part of a technical paragraph;
  - rejects an unknown standalone editorial marker such as `Internal note:` with `ARTICLE_PREFLIGHT_REVIEW_REQUIRED`;
  - rejects a missing cover, more than ten inline images, empty Alt, mismatched asset digest, duplicate asset, or non-monotonic image order;
  - produces the same digest for identical input and a different digest after any document, image, order, or Alt change.
- [ ] Run `pnpm vitest run tests/x-article/article-publication-preflight.test.ts` and verify that it fails because the module and contract do not exist.
- [ ] Add `ARTICLE_PREFLIGHT_REVIEW_REQUIRED` to `ErrorCode`.
- [ ] Add `x-article-publication-preflight` to `CONTRACT_NAMES` and create the strict JSON Schema with `additionalProperties: false` at every object level.
- [ ] Implement exact paragraph-level sanitization. Match only anchored, known editorial forms; never scan and delete arbitrary substrings from a paragraph.
- [ ] Build `sanitized_document` by removing entire known editorial blocks, preserve all remaining block order and inline runs, and calculate every digest after sanitization.
- [ ] Validate the final value through `validateContract` before returning it.
- [ ] Run the focused test again and expect all cases to pass.
- [ ] Run `pnpm typecheck` and `git diff --check`.
- [ ] Commit with `git commit -m "feat: add X Article publication preflight"`.

## Task 2: Produce one locked Fast Path Audit and one Draft-only confirmation

**Files:**

- Create: `harnesses/research-publishing/core/x-article-fast-path.ts`
- Create: `harnesses/research-publishing/contracts/x-article-fast-path-audit.schema.json`
- Create: `harnesses/research-publishing/contracts/x-article-fast-path-confirmation.schema.json`
- Create: `tests/x-article/article-fast-path.test.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `harnesses/research-publishing/branches/x-article-harness/x-article-service.ts`
- Modify: `tests/x-article/x-article-service.test.ts`

### Contracts to implement

```ts
export interface XArticleFastPathAuditV1 {
  readonly schema_version: 'x-article-fast-path-audit/v1';
  readonly protocol: 'x-article-materialization/v3.4';
  readonly target_account: string;
  readonly draft_target: { readonly kind: 'new' }
    | { readonly kind: 'existing'; readonly draft_id: string };
  readonly preflight: XArticlePublicationPreflightV1;
  readonly publication_plan: XArticlePublicationPlanV1;
  readonly time_budget_seconds: 600;
  readonly recovery_budget_seconds: 120;
  readonly audit_digest: `sha256:${string}`;
}

export interface XArticleFastPathConfirmationV1 {
  readonly schema_version: 'x-article-fast-path-confirmation/v1';
  readonly scope: 'materialize_draft_once';
  readonly audit_digest: `sha256:${string}`;
  readonly target_account: string;
  readonly confirmed_by: string;
  readonly confirmed_at: string;
  readonly expires_at: string;
  readonly confirmation_digest: `sha256:${string}`;
}
```

### Steps

- [ ] Write failing unit tests for `createXArticleFastPathAudit`, `confirmXArticleFastPath`, and `verifyXArticleFastPathConfirmation`.
- [ ] Prove that the Audit exposes the removal Diff, cover, ordered inline images, Alt summary, target account, Draft handling, protocol, and locked digest.
- [ ] Prove the confirmation fails with a changed Audit, changed account, or expired timestamp, and that its scope is not `publish_once`.
- [ ] Add both strict schemas and contract names.
- [ ] Implement Fast Path Audit and confirmation digest functions. Exclude only each artifact's own digest field from its digest body.
- [ ] Add `XArticleService.planFastPath(packageRef, targetAccount, draftTarget)`:
  1. verify the finalized Article Package;
  2. compile the source document;
  3. run Publication Preflight;
  4. create the publication plan from the sanitized document, not the source document;
  5. persist `publication-preflight-v1.json`, `publication-plan-v1.json`, and `fast-path-audit-v1.json` under the same X Article run root;
  6. return the Audit.
- [ ] Leave the current `plan()` behavior intact for compatibility; Fast Path must enter only through `planFastPath()`.
- [ ] Run `pnpm vitest run tests/x-article/article-fast-path.test.ts tests/x-article/x-article-service.test.ts`.
- [ ] Run `pnpm typecheck` and `git diff --check`.
- [ ] Commit with `git commit -m "feat: lock X Article Fast Path audit"`.

## Task 3: Add release-set gate and unified Fast Path preparation

**Files:**

- Create: `harnesses/research-publishing/core/x-article-fast-path-release.ts`
- Create: `tests/x-article/article-fast-path-release.test.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- Modify: `tests/x-article/article-browser-adapter.test.ts`
- Modify: `harnesses/research-publishing/core/errors.ts`

### Release set and adapter entry

```ts
export interface XArticleFastPathReleaseSetV1 {
  readonly harness_protocol: 'x-article-materialization/v3.4';
  readonly registry_protocol: 'x-article-materialization/v3.4';
  readonly skill_protocol: 'x-article-materialization/v3.4';
  readonly browser_host_protocol: 'x-article-materialization/v3.4';
}

async prepareFastPath(input: {
  readonly audit: XArticleFastPathAuditV1;
  readonly confirmation: XArticleFastPathConfirmationV1;
  readonly capabilities: XArticleBrowserCapabilityManifestV1;
  readonly release_set: XArticleFastPathReleaseSetV1;
  readonly source_observation?: XArticleBrowserObservation;
}): Promise<XArticleExecutionSnapshotV1>;
```

### Steps

- [ ] Write failing release-gate tests proving any one stale component produces `ARTICLE_RUNTIME_VERSION_MISMATCH` before `prepareLocked`, command issuance, Draft creation, or media mutation.
- [ ] Write failing adapter tests for the unified entry:
  - `{kind: 'new'}` rejects a source Observation and delegates once to the existing new-Draft preparation path;
  - `{kind: 'existing', draft_id}` requires a matching normalized Observation and delegates once to the existing V3.3 binding path;
  - an ambiguous/mismatched Draft stops without creating a new Draft;
  - an invalid or expired confirmation stops before Browser state exists.
- [ ] Implement `assertXArticleFastPathReleaseSet` as a pure equality gate against V3.4.
- [ ] Add `prepareFastPath` as a thin facade. Reuse `prepareLocked`; do not copy its state machine or add new browser command kinds.
- [ ] Persist a `fast_path` binding inside the execution context containing only Audit digest, Preflight digest, confirmation digest, start timestamp, 600-second budget, 120-second recovery budget, and recovery count `0`.
- [ ] Persist one atomic confirmation-consumption record keyed by confirmation digest. An identical retry must return the original execution; a request that tries to bind the same confirmation to another execution must fail before Chrome.
- [ ] Keep the internal V3.2/V3.3 `execution_mode` values unchanged so existing command generation and checkpoint validation remain authoritative.
- [ ] Verify the stored publication plan document digest equals the preflight sanitized document digest before entering `prepareLocked`.
- [ ] Run `pnpm vitest run tests/x-article/article-fast-path-release.test.ts tests/x-article/article-browser-adapter.test.ts`.
- [ ] Run `pnpm typecheck` and `git diff --check`.
- [ ] Commit with `git commit -m "feat: prepare X Article Fast Path execution"`.

## Task 4: Persist simple recovery, progress, and final Draft evidence

**Files:**

- Create: `harnesses/research-publishing/contracts/x-article-fast-path-result.schema.json`
- Create: `tests/x-article/article-fast-path-result.test.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `harnesses/research-publishing/core/x-article-materialization.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- Modify: `tests/x-article/article-browser-adapter.test.ts`

### Result contract

```ts
export interface XArticleFastPathResultV1 {
  readonly schema_version: 'x-article-fast-path-result/v1';
  readonly protocol: 'x-article-materialization/v3.4';
  readonly execution_id: string;
  readonly draft_id: string;
  readonly draft_url: string;
  readonly audit_digest: `sha256:${string}`;
  readonly materialization_digest: `sha256:${string}`;
  readonly final_revision: `sha256:${string}`;
  readonly state: 'draft_reconciled';
  readonly elapsed_seconds: number;
  readonly cover: {
    readonly expected: 1;
    readonly completed: 1;
    readonly alt: 'verified' | 'unobservable';
  };
  readonly inline_images: { readonly expected: number; readonly completed: number };
  readonly alt: { readonly expected: number; readonly verified: number };
  readonly recovery_count: 0 | 1;
  readonly preview_command_count: 0;
  readonly publish_command_count: 0;
  readonly checkpoint_path: string;
  readonly completed_at: string;
  readonly result_digest: `sha256:${string}`;
}
```

### Steps

- [ ] Write failing tests that project `Draft ready -> Cover 1/1 -> Inline images N/M -> Final check` from the existing checkpoint rather than persisting a second competing checkpoint.
- [ ] Write failing tests proving each completed inline image has `status: completed`, a media reference, context digest, and verified Alt before the completed count advances.
- [ ] Write failing recovery tests:
  - one uncertain write triggers one read-only editor observation;
  - the recovered observation advances from the actual checkpoint without re-uploading;
  - a second recovery request or elapsed recovery time above 120 seconds blocks with the exact current checkpoint;
  - recovery never creates a new execution or resets the original `started_at`.
- [ ] Write failing result tests proving completion is impossible unless title/body/sanitized metadata/anchors/cover/image order/Alt/save state all reconcile and Preview/Publish counts remain zero.
- [ ] Extend the existing materialization progress ledger with named Fast Path stages; do not add a second progress store.
- [ ] Add `recoverFastPath(executionId)` to the adapter. It must atomically increment recovery count before issuing the existing read-only observation command and reject count `> 1`.
- [ ] On the first transition to `draft_reconciled`, create one immutable `fast-path-result-v1.json`. A retry must return the byte-equivalent existing result or fail on drift.
- [ ] Calculate elapsed time from the immutable materialization start evidence, not the latest agent or command start.
- [ ] Include the result path and redacted stage projection in materialization status without exposing Browser commands, cookies, DOM, or credentials.
- [ ] Run `pnpm vitest run tests/x-article/article-fast-path-result.test.ts tests/x-article/article-browser-adapter.test.ts tests/x-article/article-materialization.test.ts tests/x-article/article-materialization-store.test.ts`.
- [ ] Run `pnpm typecheck` and `git diff --check`.
- [ ] Commit with `git commit -m "feat: reconcile X Article Fast Path Draft"`.

## Task 5: Expose the CLI without exposing V3.2/V3.3 branching

**Files:**

- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`
- Modify: `tests/tools/acceptance-output.test.ts`
- Modify: `docs/guides/quickstart.md`

### User-facing routes

```text
x-article fast-path audit --workspace <path> --input <input.json> --output json
x-article fast-path confirm --workspace <path> --input <input.json> --output json
x-article fast-path prepare --workspace <path> --audit <path> --confirmation <path> --capabilities <path> --release-set <path> [--observation <path>] --output json
x-article fast-path status --workspace <path> --execution <id> --output json
x-article fast-path recover --workspace <path> --execution <id> --output json
```

### Steps

- [ ] Add failing CLI tests for exact options, JSON-only output, Audit creation, confirmation, new-Draft preparation, existing-Draft preparation, redacted status, and single recovery.
- [ ] Prove no CLI response asks the Human to choose V3.2 versus V3.3; the Audit target and optional bound Observation determine the internal route.
- [ ] Prove `status` returns only execution ID, stage label, elapsed seconds, cover count, inline image count, Alt count, recovery count, terminal state, Draft URL, and evidence paths.
- [ ] Add the five routes using the existing argument parser and `WorkspaceStore`; do not add an interactive prompt.
- [ ] Keep the existing `x-article browser` routes as internal/compatibility primitives.
- [ ] Correct stale user-visible error text that says `materialization-status requires a V3.2 prepared execution`; it must cover both compatibility modes and Fast Path.
- [ ] Update Quickstart with one Audit/confirmation and a single continuous Host execution. State explicitly that the command does not authorize Preview or Publish.
- [ ] Run `pnpm vitest run tests/cli/cli.test.ts tests/tools/acceptance-output.test.ts`.
- [ ] Run `pnpm typecheck` and `git diff --check`.
- [ ] Commit with `git commit -m "feat: expose X Article Fast Path CLI"`.

## Task 6: Make the repository Skill the continuous Browser Host orchestrator

**Files:**

- Create: `skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md`
- Modify: `skills/x-publishing-copilot/SKILL.md`
- Modify: `skills/x-publishing-copilot/references/browser-adapter-flow.md`
- Modify: `registry/manifests/research-publishing.json`
- Modify: `tests/skills/skill-boundary.test.ts`
- Modify: `tests/tools/manifest-content.test.ts`

### Steps

- [ ] Write failing Skill/manifest tests requiring protocol `x-article-materialization/v3.4`, the new reference, Draft-only stop condition, one confirmation, one recovery, and continuous command consumption.
- [ ] Add the V3.4 reference with this exact Host loop:
  1. run Fast Path status;
  2. obtain the existing atomic `next` command;
  3. verify the visible page and scoped control;
  4. claim the command;
  5. complete exactly one Chrome transaction;
  6. normalize one observation and report it;
  7. immediately continue unless terminal, blocked, or recovery is required.
- [ ] State that no per-image `continue` is requested from the Human and no Subagent is created.
- [ ] Require the body image transaction to originate from the current editor insertion point's `Insert -> Media`; keep cover controls scoped to the cover region.
- [ ] Require the Host to display only stage progress and to stop at `draft_reconciled`. Ban Preview and Publish in this reference.
- [ ] Update the registry protocol to V3.4 while retaining both compatibility modes and add `fast_path: fast_path_v3_4` to its mode map.
- [ ] Add the new Skill reference to manifest expectations.
- [ ] Run `pnpm vitest run tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts tests/tools/acceptance-output.test.ts`.
- [ ] Run `pnpm manifest`, then rerun the manifest tests to verify generated hashes are current.
- [ ] Run `pnpm typecheck` and `git diff --check`.
- [ ] Commit with `git commit -m "feat: orchestrate X Article Fast Path host"`.

## Task 7: Prove 0/1/3/10-image timing and disconnect recovery

**Files:**

- Create: `tests/integration/x-article-fast-path-workflow.test.ts`
- Create: `tools/x-article-fast-path-acceptance.ts`
- Create: `tests/tools/x-article-fast-path-acceptance.test.ts`
- Modify: `package.json`
- Modify: `tools/acceptance.ts`

### Steps

- [ ] Build deterministic fixtures for 0, 1, 3, and 10 inline images, each with one cover and valid Alt.
- [ ] For every fixture, drive the complete real Harness loop using a fake Browser Host that executes the same claimed command/report protocol as Chrome. Measure process wall time and emit a JSON acceptance record; use injected timestamps only for timeout boundary assertions.
- [ ] Assert for every scenario:
  - confirmation count is `1`;
  - Human browser-operation count is `0`;
  - terminal state is `draft_reconciled`;
  - elapsed execution is below 600 seconds;
  - cover is `1/1`;
  - inline images and Alt are `N/N`;
  - removed editorial metadata and visual anchors are absent;
  - Preview and Publish command counts are `0`.
- [ ] Add a disconnect fixture immediately after an image transaction but before its report. Recover by observing the real fake-page state, then prove no duplicate Draft, image, upload, or write occurs.
- [ ] Add `acceptance:x-article-fast-path` to `package.json` and include it in the top-level acceptance runner.
- [ ] Run `pnpm vitest run tests/integration/x-article-fast-path-workflow.test.ts tests/tools/x-article-fast-path-acceptance.test.ts`.
- [ ] Run `pnpm acceptance:x-article-fast-path` and verify it emits passing records for `0`, `1`, `3`, `10`, and `disconnect_recovery`.
- [ ] Run `pnpm check` and expect lint, typecheck, all tests, and acceptance to pass.
- [ ] Run `git diff --check` and `git status --short`; review every changed file and confirm no unrelated modifications.
- [ ] Commit with `git commit -m "test: prove X Article Fast Path V3.4"`.

## Task 8: Deploy the compatible Skill and perform one live Draft-only smoke test

**Files:**

- Verify: `registry/manifests/research-publishing.json`
- Verify: `skills/x-publishing-copilot/SKILL.md`
- Runtime evidence only: `<workspace>/acceptance/x-article-fast-path/<execution-id>/`

### Steps

- [ ] Run `pnpm check` from a clean worktree and record the exact commit SHA used for deployment.
- [ ] Compare the repository Skill protocol with `C:\Users\admin\.codex-clean-20260710\skills\x-publishing-copilot\SKILL.md`. Before any overwrite, request explicit permission because the installed Skill is outside the repository and is current user state.
- [ ] Deploy the verified repository `skills/x-publishing-copilot` directory through the approved local Skill installation flow; do not hand-edit only the installed `SKILL.md`.
- [ ] Re-read the installed Skill and manifest and verify all four release-set values are V3.4.
- [ ] With one explicit Human Audit confirmation, run one representative three-inline-image Draft-only flow against the existing Chrome login state.
- [ ] Do not open Preview or Publish. Stop at `draft_reconciled` and save the result, checkpoint, timing, image counts, Alt verification, and zero Preview/Publish counts under the runtime evidence path.
- [ ] If the live execution exceeds ten minutes or requires a Human browser operation, mark V3.4 acceptance failed and stop; do not hide the delay by restarting the timer or creating a replacement execution.
- [ ] Report the automated 0/1/3/10 evidence separately from the one live Chrome smoke result so simulated and live evidence are never conflated.

## Final Self-Review Checklist

- [ ] Every confirmed design requirement maps to at least one implementation step or acceptance assertion.
- [ ] No unfinished placeholder marker remains in the plan or implementation.
- [ ] Contract names, schema versions, TypeScript literal types, CLI operation names, and manifest protocol values match exactly.
- [ ] The Fast Path has one Human confirmation and that confirmation cannot authorize Publish.
- [ ] The normal Host loop never asks for per-image continuation.
- [ ] New and existing Draft flows are one user entry but retain their proven internal modes.
- [ ] Recovery is one read-only attempt, bounded to 120 seconds, and preserves the original timer and checkpoint.
- [ ] Completion stops at `draft_reconciled`; Preview and Publish remain untouched.
- [ ] The active global Skill is not declared compatible until it is actually synchronized and re-read.
- [ ] Full `pnpm check` and focused Fast Path acceptance pass from a clean worktree.
