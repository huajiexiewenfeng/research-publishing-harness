# Research Publishing Harness V1 Handoff

- flow_id: `research-publishing-harness-v1`
- branch: `codex/v1`
- delivery_state: local commits ready; not pushed
- scope: M0–M2 Shared Kernel, Article, X, Manual Adapter, CLI, two thin Skills, Registry, Manifest, Synthetic examples, docs, CI

## Implementation

- Eight public JSON contracts and deterministic Shared Kernel Gates.
- Immutable Candidate/Package artifacts with explicit `draft → evidence_ready → reviewed → frozen` lifecycle.
- Canonical Article Package and explicit-only Article → X handoff.
- X Single/Thread/Reply review, `twitter-text` weighted limits, digest-bound Approval, offline Manual Adapter and manual receipt recording.
- Full JSON CLI, Skill discovery wrappers, public synthetic fixtures, deterministic file Manifest, README/Quickstart, and CI matrix.

## Verification

- command: `pnpm manifest && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm acceptance && git diff --check`
- exit_code: `0`
- tests: 20 files / 81 tests / 0 failures
- acceptance: Article complete; Manual X complete; network unused
- manifest: 33 files; file SHA-256 registry generated deterministically
- executor: Codex agent
- authority: agent-local
- trust_level: passed-agent-local; CI and independent reviewer pending
- test_integrity: real temporary filesystems and built CLI child processes; no production behavior mocks

## Public safety

- Non-test public-file scan found no workstation paths, real Bearer/Cookie values, API keys, or access tokens.
- Browser/API publication, OAuth, scheduling, automatic topic selection, and real external publishing remain excluded.
- No credentials or real publication receipts were used.

## Residual risk

- Pre-alpha interfaces may change before a stable release.
- CI has been defined but has not run on GitHub because the branch has not been pushed.
- X weighted behavior is pinned to `twitter-text@3.1.0`; future rule updates require a contract/version change.
- Manual publication evidence is user-supplied and intentionally not Browser/API verified.

## Next action

Choose one branch action: merge locally, push and create a PR, keep `codex/v1`, or discard it. Any push or PR requires explicit user authorization.
