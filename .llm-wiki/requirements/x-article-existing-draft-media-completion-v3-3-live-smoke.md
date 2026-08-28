# X Article Existing Draft Media Completion V3.3 Live Smoke

## Metadata

- flow_id: `x-article-existing-draft-media-completion-v3-3-live-smoke`
- parent_flow_id: `x-article-existing-draft-media-completion-v3-3`
- status: `verification-in-progress`
- active_stage: `task-6-live-input-parity`

## Why

Verify that the packaged V3.3 existing-Draft media-completion protocol works end to end against one real, already complete, zero-media X Article Draft without granting Preview or Publish authority.

## Active scope

- Run the full local quality gate and repair only verified failures in Task 1-5 files.
- Verify deployed/source manifest and locked live-input parity before browser mutation.
- Prepare exactly one `media_completion_v3_3` execution.
- Drive only claimed Draft-media commands through the explicit Chrome binding.
- Persist one immutable verification record.

## Non-goals

- No new Draft, title write, body import, Preview, Publish, or Draft deletion.
- No Thread conversion or public receipt.
- No unrelated refactor, protocol redesign, or Subagent dispatch.
- No use of remembered browser state as current evidence.

## Acceptance criteria

1. `pnpm check` and `git diff --check` pass before Chrome interaction.
2. Live account, Draft, title/body, anchors, zero-media state, assets, digests, and budgets match the locked plan.
3. Exactly one adopted-Draft execution reaches `draft_reconciled`, or fails closed before ambiguous mutation.
4. New-Draft count, title writes, body imports, Preview commands, and Publish commands remain zero.
5. Cover and three ordered inline images reconcile with exact Alt evidence and no remaining anchors or duplicates.
6. The verification record contains immutable local and Browser Host evidence without credentials or workstation-specific absolute paths.

## Verification plan

- Run the Task 6 quality gate from the confirmed implementation commit.
- Treat any failing quality command as RED evidence and make only the smallest scoped repair.
- Resolve the live inputs transiently from the confirmed Task 6 plan; persist only digests and project-relative evidence labels.
- Stop before Chrome mutation on any parity mismatch.
- Stop at `draft_reconciled`; record zero Preview/Publish command evidence.

## Flow Record

| Stage | Status | Evidence |
|---|---|---|
| Design | confirmed | V3.3 design and Task 6 plan |
| Local quality gate | complete | `pnpm check`: 1152 passed, 1 skipped; acceptance passed; `git diff --check` passed |
| Live-input parity | active | locked Plan, Observation, assets, capabilities |
| Browser Host smoke | pending | one adopted Draft execution |
| Immutable record | pending | verification document and commit |
