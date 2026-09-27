# Windows Atomic Directory Install Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Windows transient rename failures from being falsely reported as an existing Audit directory while preserving atomic directory installation.

**Architecture:** Keep the current staging-directory transaction. Add a small injectable filesystem boundary to `WorkspaceStore`, re-check destination existence after rename errors, and retry only transient Windows errors with bounded delays.

**Tech Stack:** TypeScript, Node.js filesystem promises, Vitest, pnpm.

## Global Constraints

- Preserve atomic directory installation; no per-file or copy fallback.
- Never map `EPERM`, `EACCES`, or `EBUSY` to `ARTIFACT_EXISTS` unless the destination exists.
- Use 4 total attempts with delays of 25, 100, and 250 milliseconds.
- Do not change X Article contracts or interact with the live draft during this task.

---

### Task 1: Make directory installation Windows-safe

**Files:**
- Modify: `harnesses/research-publishing/core/workspace-store.ts`
- Test: `tests/core/workspace-store.test.ts`

**Interfaces:**
- Consumes: `WorkspaceStore.open(root)` and `WorkspaceStore.writeNewDirectory(relativeDirectory, entries)`.
- Produces: backward-compatible `WorkspaceStore.open(root, dependencies?)`; production callers remain unchanged.

- [ ] **Step 1: Write failing regression tests**

Add tests that inject a directory rename operation which fails once with `EPERM` and then succeeds, and one which always fails with `EPERM`. Assert that the first call succeeds after two attempts and the second rejects with the original `EPERM`, not `ARTIFACT_EXISTS`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/core/workspace-store.test.ts`

Expected: FAIL because `WorkspaceStore.open` does not accept the injectable directory-install dependencies and `EPERM` is still classified as `ARTIFACT_EXISTS`.

- [ ] **Step 3: Implement the minimal retry and reclassification logic**

Add optional `renameDirectory` and `wait` dependencies with production defaults. Retry only `EPERM`, `EACCES`, and `EBUSY`; after every relevant rename error, check the destination with `lstat`. Map to `ARTIFACT_EXISTS` only when it exists. After the fourth failed attempt with an absent destination, rethrow the original filesystem error.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `pnpm vitest run tests/core/workspace-store.test.ts`

Expected: all workspace-store tests pass.

Run: `pnpm check`

Expected: packaged CLI check, lint, typecheck, build, full tests, and acceptance all exit 0.

- [ ] **Step 5: Validate the original symptom**

Run the fresh X Article Fast Path Audit against a new workspace containing the verified article package.

Expected: the Audit directory persists successfully and emits a new, unconsumed confirmation digest. Stop before confirmation and before any live draft interaction.

