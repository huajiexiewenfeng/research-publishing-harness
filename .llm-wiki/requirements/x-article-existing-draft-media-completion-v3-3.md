# X Article Existing Draft Media Completion V3.3

## Metadata

- flow_id: `x-article-existing-draft-media-completion-v3-3`
- parent_flow_id: `x-article-fast-materialization-v3-2-browser-host`
- status: `implemented`
- active_stage: `task-5-complete`
- protocol: `x-article-materialization/v3.3`

## Why

Expose the already implemented existing-Draft media-completion Adapter through one strict CLI route and the packaged X Publishing Skill, without creating a Draft, rewriting title/body, opening Preview, or publishing.

## Active scope

- Add `x-article browser prepare-existing-media` with exact input options.
- Validate the locked publication Plan, normalized source Observation, and capability manifest.
- Keep `materialization-status` redacted for both V3.2 and V3.3 modes.
- Package the V3.3 Skill protocol and deterministic registry manifests.
- Complete only the focused CLI, Skill, manifest, acceptance, and contract verification from Task 5.

## Non-goals

- No Chrome interaction or live Draft mutation.
- No Task 6 smoke execution.
- No Preview, Publish, Draft deletion, title write, or body import.
- No redesign or re-review of the approved Task 1-4 Adapter/runtime contracts.
- No Subagent dispatch.

## Acceptance criteria

1. The exact `prepare-existing-media` CLI route prepares a `media_completion_v3_3` execution from valid locked inputs.
2. Malformed, foreign, stale, unsafe, extra-option, or non-zero-media inputs fail closed.
3. Status output exposes no title, body, Draft ID, account, command ID, or local asset path.
4. Packaged Skill references state that the branch is media-only and terminates at `draft_reconciled` with zero Preview/Publish authority.
5. The generated research-publishing registry manifest is deterministic and advertises `x-article-materialization/v3.3` with V3.2 and V3.3 modes.
6. Task 5 focused tests, acceptance, typecheck/build, manifest reproducibility, and diff checks pass before commit.

## Verification plan

- Run the existing Task 5 RED tests before production edits.
- Implement only the missing CLI/docs/manifest behavior.
- Run CLI, manifest-content, acceptance-output, contracts, acceptance, typecheck, build, manifest reproducibility, and diff checks.

## Flow Record

| Stage | Status | Evidence |
|---|---|---|
| Design | confirmed | `docs/superpowers/specs/2026-08-27-x-article-existing-draft-media-completion-v3-3-design.zh-CN.md` |
| Plan | confirmed | `docs/superpowers/plans/2026-08-27-x-article-existing-draft-media-completion-v3-3.md` Task 5 |
| RED tests | complete | 5 expected failures: missing route, Skill reference, and V3.3 manifest mode |
| Implementation | complete | strict CLI route, dual-mode redacted status, Skill references, generated manifest and dist |
| Focused verification | complete | 29 CLI/Skill/manifest tests; 82 contract tests; offline acceptance; build |
| Live verification | excluded | Task 6, separately authorized |

Full-repository lint remains red because of 28 pre-existing findings in Task 1/4 files outside this Change Brief. Task 5 file-scoped ESLint and repository typecheck both pass; those unrelated findings were not modified under the explicit Task-5-only boundary.
