# LLM Wiki Memory Adapter V2.2 Verification

## Provenance

- executor: Codex agent in the target local repository
- authority: agent-local, not CI and not an independent reviewer
- trust_level: `passed-agent-local`
- complete command: `pnpm check`
- result: exit 0; ESLint, TypeScript, build, 69 Vitest files / 296 tests and offline acceptance passed; one opt-in real Runtime test skipped in the default suite
- real dependency command: explicit `LLM_WIKI_RUNTIME_PYTHON` and `LLM_WIKI_RUNTIME_SOURCE`, then `vitest run tests/integration/llm-wiki-runtime.integration.test.ts`
- real dependency result: 1 file / 1 test passed against local `llm-wiki-runtime` 0.2.0 in a temporary Workspace
- acceptance output: Memory Query, Publication Checkpoint, Feedback Insight and Resume all `simulated_complete`; `network:"unused"`
- additional checks: deterministic manifest 112 files; `git diff --check` exit 0
- user Wiki/X side effects: none

## Test Integrity

- Production contracts, Runtime Adapter, Query/Feedback/Insight/Ingest services and tests changed together; assertions were reviewed after fresh full-suite execution.
- Fake Runtime replaces only the external process boundary. Digests, immutable WorkspaceStore writes, Plan/Approval checks, state transitions, recovery and Receipts execute through production code.
- The full-loop integration uses real Harness services from seed Context through Package 1.1, synthetic terminal Receipt, both Ingest kinds, Human selection/review, partial failure/resume and the next Query.
- The real integration uses the actual Node process runner and pinned Python JSON CLI for init, doctor, query and write commands. It exposed and drove fixes for controlled source metadata and Runtime-derived `source_id` binding.
- No assertion was removed or weakened to hide a failure. Default CI skips only the explicit-path real Runtime test; the same test was run separately and passed.

## Acceptance Audit

| # | Result | Exact evidence |
|---|---|---|
| 1 | pass | Primary Domain/track paths in `memory/llm-wiki-profile.yml`; `tests/memory/domain-contracts.test.ts`, `memory-query-service.test.ts` |
| 2 | pass | `WorkspaceStore` allows publishing `memory` but rejects `.llm-wiki`; `package-memory-binding.test.ts`, `memory-runtime-security.test.ts` |
| 3 | pass | fixed executable/argv, `shell:false`, JSON envelope, timeout/output cap; `runtime-process.test.ts`, `runtime-adapter.test.ts` |
| 4 | pass | no direct Wiki APIs in Skills/Core; `.llm-wiki` path rejection in `memory-runtime-security.test.ts` |
| 5 | pass | canonical Query Plan binds Domain, track, purpose, paths, budgets and Profile/SCP digests; `memory-contracts.test.ts`, `memory-query-service.test.ts` |
| 6 | pass | ordered refs/path/checksum/classification/risk/truncation frozen in Snapshot; `memory-query-service.test.ts`, `memory-query-workflow.test.ts` |
| 7 | pass | version dispatch for Package 1.0/1.1 and draft-only binding; `memory-contracts.test.ts`, `package-memory-binding.test.ts`, `memory-query-workflow.test.ts` |
| 8 | pass | unavailable Runtime produces honest unavailable Snapshot/Package state while Ingest fails closed; `runtime-adapter.test.ts`, `memory-query-service.test.ts`, CLI tests |
| 9 | pass | terminal Receipt digest/account/URL plus explicit selection provenance required; `memory-feedback-service.test.ts`, `memory-feedback-security.test.ts` |
| 10 | pass | feedback entries are immutable `data_only`; prompt/secret/path adversarial coverage in `memory-feedback-security.test.ts` |
| 11 | pass | Skill-origin Candidate Insight remains a proposal and requires separate Evidence Review; `memory-insight-service.test.ts` |
| 12 | pass | explicit insight types, evidence strength, boundary and alternatives; contracts and `memory-insight-service.test.ts` |
| 13 | pass | both `publication_checkpoint` and `feedback_insight` produce preview, exact Plan and Approval; `memory-ingest-plan.test.ts`, both ingest integration tests |
| 14 | pass | Workspace/Profile/SCP/Mapping/source/staging/digest changes stale Approval; `memory-ingest-security.test.ts`, `memory-ingest-service.test.ts` |
| 15 | pass | fixed validate/copy/write/register/log orchestration; `memory-ingest-service.test.ts` and real Runtime integration |
| 16 | pass | exact `already_exists` accepted; partial remains partial; `runtime-adapter.test.ts`, `memory-ingest-service.test.ts`, real Runtime duplicate calls |
| 17 | pass | completed steps skipped on resume; persisted interruption recovery tested; uncertain `register_artifact` returns `MEMORY_INGEST_RECONCILIATION_REQUIRED` without replay |
| 18 | pass | adapter allow-list fixes Domain and validates track paths; cross-Domain/path/argv injection tests in `memory-runtime-security.test.ts` |
| 19 | pass | fresh full `pnpm check` covers legacy Article, Post Browser, Visual V2.1 and X Article V3 suites: 69 files / 296 tests passed |
| 20 | pass | unit, contract, fake process, security, full-loop and explicit real Runtime integration all executed; command evidence above |
| 21 | pass | offline acceptance uses temporary Workspace/Fake Browser/Fake Runtime and reports `network:"unused"`; real test uses only a temporary Workspace |
| 22 | pass | README, Quickstart, Chinese architecture, both Skill memory references/SCPs, registry capabilities and 112-file manifest synchronized |

## Residual Risks

- Runtime 0.2.0 `register-artifact` appends without an idempotency key. If a process dies after the Runtime write but before Harness state persistence, automatic replay cannot be proven safe. Harness therefore stops for explicit reconciliation instead of pretending exactly-once.
- No persistent real Publishing Workspace was selected or initialized. The real integration proof is isolated and disposable.
- Memory quality still depends on Human context selection and Evidence Review; V2.2 governs provenance and lifecycle, not semantic truth.

## Final Command Record

- `pnpm check`: exit 0; 69 test files / 296 tests passed; 1 opt-in real Runtime test skipped; offline acceptance exit 0.
- explicit local Runtime integration: exit 0; 1 file / 1 test passed.
- acceptance: `memory_query`, `publication_checkpoint`, `feedback_insight`, `memory_resume` all `simulated_complete`; `network:"unused"`.
- `tools/build-manifest.ts`: 112 files.
- `git diff --check`: exit 0 with Windows LF/CRLF advisory warnings only.
- Wiki doctor: unavailable because `.llm-wiki/tools/llm_wiki_doctor.py` is absent; no doctor result claimed.
