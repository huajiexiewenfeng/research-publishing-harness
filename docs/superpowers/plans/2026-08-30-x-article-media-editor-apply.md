# X Article Media Editor Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete X's `Edit media` confirmation inside each claimed cover or inline-image transaction.

**Architecture:** Add one shared bounded media-editor helper and call it from both media Hosts after file delivery or when a retry finds the prior dialog still open. Existing page evidence remains the only success criterion.

**Tech Stack:** JavaScript ESM, Chrome Browser Host API, Vitest.

## Global Constraints

- No Preview or Publish actions.
- One unique `Edit media` dialog and one exact `Apply` button only.
- No additional file selection when the retry is completing an already-open media editor.
- Keep direct-upload compatibility when no media editor appears.

---

### Task 1: Complete the X media editor transaction

**Files:**
- Modify: `skills/x-publishing-copilot/scripts/x-article-host-common.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`
- Test: `tests/skills/x-article-host-common.test.mjs`
- Test: `tests/skills/x-article-cover-host.test.mjs`
- Test: `tests/skills/x-article-inline-image-host.test.mjs`

**Interfaces:**
- Produces: `completeMediaEditor({ tab, timeoutMs, appearanceTimeoutMs })` returning `applied` or `not_present`.
- Consumes: unique scoped dialog, progressbar, and Apply locators from the Browser Host API.

- [ ] Add failing tests for first-attempt Apply and retry takeover.
- [ ] Run the five focused Host tests and verify RED.
- [ ] Implement the minimal shared helper and integrate both Hosts.
- [ ] Run focused tests and full `pnpm check`.
- [ ] Deploy the four Host modules and verify exact hashes before a fresh Audit.

