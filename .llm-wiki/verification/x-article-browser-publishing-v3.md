# X Article Browser Publishing V3 Verification

## Provenance

- executor: Codex agent in the target local repository
- authority: agent-local, not CI and not an independent reviewer
- trust_level: `passed-agent-local`
- complete command: `pnpm check`
- result: exit 0; ESLint, TypeScript, build, 52 Vitest files / 230 tests, and offline acceptance passed
- acceptance output: Article, Manual X, Browser X, Visual V2.1 and X Article all complete; `network:"unused"`; Post submit command/claim `1/1`; X Article Publish commands `1`
- additional checks: Skill quick validation, generated manifest with 86 files, `git diff --check`, read-only Chrome smoke
- limitation acceptor: none; no unverified production-impact claim is promoted

## Test Integrity

- Production runtime, tests and Fake Host observations changed together, so assertion strength was reviewed.
- The end-to-end test executes the real finalized-package verifier, compiler, Plan/Approval digests, WorkspaceStore, Page Contract, command broker, state machine, public verifier and Receipt builder.
- Fake observations replace only the mutable external X UI/Chrome Host. They do not mock approval expiry, path containment, digest comparison, command claims, at-most-once Publish, public content comparison or immutable Receipt writes.
- The uncertain-Publish test claims the real final command, reports `uncertain`, proves `outcome_unknown`, resumes through a read-only public observation, and counts exactly one persisted `publish_article_once` command.
- No assertion was weakened to hide a functional failure. One test timeout was raised from 5s to 20s because the full acceptance child process takes longer under parallel full-suite load; its output and exit code remain asserted.

## Acceptance Audit

| # | Result | Evidence |
|---|---|---|
| 1 | pass | `XArticleService.plan` verifies the stored finalized Package ref and digest; `tests/x-article/x-article-service.test.ts` |
| 2 | pass | constrained versioned AST/compiler rejects unsupported Markdown; `tests/x-article/article-compiler.test.ts` |
| 3 | pass | immutable intent and `plan_digest` bind account, Package, document, visuals, audience, adapter and action; publication-plan tests |
| 4 | pass | exact approval digest and stale/mutated Plan rejection; publication-plan and CLI tests |
| 5 | pass | sibling `x-article-harness`; existing `XPublicationMode` remains `single | thread | reply`; full regression |
| 6 | pass | capability manifest requires `codex-chrome`; Page Contract accepts only `https://x.com`; no cookie/storage API exists; security tests |
| 7 | pass | draft creation captures numeric `draft_id`; uncertain identity enters `draft_identity_unknown`; adapter tests |
| 8 | pass | editor protocol accepts only exact planned prefix and rejects unknown/extra/mismatched content; editor protocol tests |
| 9 | pass | compiler represents heading/subheading/paragraph/quote/lists and inline marks/links; semantic insert commands round-trip blocks |
| 10 | pass | service rehashes locked visual bytes; broker payload carries Package root/digest/asset; path/security tests |
| 11 | pass | cover/inline visual identity, placement, upload status and Alt are checked before Preview; editor/browser/security tests |
| 12 | pass | Preview document digest must equal the approved document before Publish Review; adapter test |
| 13 | pass | deterministic final command id, immutable claim and write-ahead transition; integration and acceptance both count one Publish |
| 14 | pass | uncertain Publish reaches `outcome_unknown`; only `observe_article_page(public_article)` is issued on recovery; integration test |
| 15 | pass | public verifier checks author/URL/Article ID/title/block order/links/media; verifier tests |
| 16 | pass | Receipt separates source, editor/preview and public evidence and is written with `writeNew`; receipt/integration tests |
| 17 | pass | compiler, schema, Page Contract, protocol, state, recovery, security, CLI, Skill and integration suites present |
| 18 | pass | fresh `pnpm check`: 52 files / 230 tests, including legacy Article/Manual/Post Browser/Visual V2.1 acceptance |
| 19 | pass | automated acceptance reports `network:"unused"`; Chrome smoke only observed index/existing blank editor, with no type/upload/Publish |
| 20 | pass | README, Quickstart, Chinese architecture, registry capabilities, Skill reference and 86-file manifest synchronized |

## Chrome Smoke (read-only)

- existing Chrome session and logged-in account: `@Glen56121`
- Articles navigation and Premium entry visible
- Articles index recognized with Drafts/Published tabs and one existing untitled draft
- existing draft identity: `2090731994279755776`
- editor controls observed: Add a title, Body, Preview, disabled Publish, Focus mode, inline media, header file picker, and 5:2 recommendation
- side effects: no text input, no file upload, no Publish, no second draft creation
- external state note: the existing blank draft is retained; deletion requires separate Human authorization

## Residual Risk

- X is an external mutable UI; selectors/control semantics may drift beyond Page Contract `2026-08`.
- Real image upload, Alt round-trip, Publish Review and public Article verification were not executed on the live account in this smoke.
- The first real publication must use the finalized Package, exact Audit block and explicit action-time Human confirmation; after final Publish is issued, recovery is read-only.

## Final Command Record

- `pnpm check`: exit 0; 52 test files / 230 tests; offline acceptance exit 0.
- `pnpm manifest`: 86 files in `registry/manifests/research-publishing.json`.
- Skill validator: `Skill is valid!` for `skills/x-publishing-copilot`.
- `git diff --check`: no whitespace errors; Git emitted only Windows LF/CRLF advisory warnings.
