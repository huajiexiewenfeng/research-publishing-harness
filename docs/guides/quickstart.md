# V1 Quickstart

This guide validates the offline system first, then shows how the two thin Skills map to the CLI.

## 1. Install and run acceptance

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm manifest
pnpm check
```

Expected Acceptance output:

```json
{"ok":true,"article":"complete","manual_x":"complete","network":"unused"}
```

Acceptance creates a uniquely named temporary workspace, verifies both workflows and their digests, and removes only that verified temporary directory.

## 2. Inspect the synthetic research unit

The public fixtures are under `harnesses/research-publishing/examples/synthetic/`:

- `candidate.json`: one fictional research increment
- `package.json`: one verified Claim, one hypothesis, and one planned Claim
- `article-draft.json`: a Claim-mapped technical article candidate
- `x-draft.json`: a three-item research Thread candidate

They contain no personal, employer, private-repository, or credential data.

## 3. Start a local workspace

```bash
pnpm build
node dist/harnesses/research-publishing/cli/index.js doctor \
  --workspace ./publishing-workspace \
  --output json
```

Every command returns one JSON envelope:

```json
{"ok":true,"operation":"...","artifact":{},"state":"..."}
```

Failures use stable exit codes: `2` input/contract, `3` Gate, `4` state/Approval, `5` filesystem, and `10` unexpected.

## 4. Candidate and Package lifecycle

Capture accepts a Candidate contract directly:

```bash
node dist/harnesses/research-publishing/cli/index.js candidate capture \
  --workspace ./publishing-workspace \
  --input ./harnesses/research-publishing/examples/synthetic/candidate.json \
  --output json
```

Subsequent commands use explicit JSON inputs and never discover a topic. `candidate qualify` receives `candidate_id` and `novelty_hint`; Package commands receive the prior immutable artifact in a `package` field. Review creates a new version, and freeze creates another immutable version.

## 5. Article branch

The Article Skill calls these operations:

```text
article prepare → accept-draft → review → finalize
                                      └→ handoff-x (explicit request only)
```

`prepare` receives `{ "package": <frozen-package>, "brief": <article-brief> }`. The generated task is the allowed Claim/Boundary/Source envelope. `finalize` writes `article.md`, metadata, Claim map, sources, Review, Generation Task, and Draft Candidate.

Invoke the thin Skill adapter after build:

```bash
node skills/article-publishing-copilot/scripts/invoke.mjs doctor \
  --workspace ./publishing-workspace --output json
```

## 6. Manual X branch

The X Skill calls:

```text
x prepare → accept-draft → review → plan → exact Preview
                                               → approve → handoff → record-manual
```

`single`, `thread`, and `reply` are validated independently. A Reply requires target id, URL, author, and snapshot digest. Approval is valid only for the exact ordered content, account, adapter, and Reply target shown in the Preview.

`handoff` creates a manual copy package and a `handed_off` receipt. It does not access X. After a human publishes, `record-manual` records only the URL, post ids, and publication time supplied by that human.

## 7. Use as Skills

- `$article-publishing-copilot`: use for a technical article from a Frozen Package.
- `$x-publishing-copilot`: use for a Single, Thread, or Reply from a Frozen Package or explicit Article handoff.

Both Skills stop if runtime discovery fails, and both delegate enforcement to the same Harness CLI.
