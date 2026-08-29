# Research Publishing Harness Quickstart

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
{"ok":true,"article":"complete","manual_x":"complete","browser_x":"simulated_complete","visual_v2_1":"simulated_complete","x_article":"simulated_complete","memory_query":"simulated_complete","publication_checkpoint":"simulated_complete","feedback_insight":"simulated_complete","memory_resume":"simulated_complete","network":"unused","submit_commands":1,"submit_claims":1,"x_article_publish_commands":1}
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
article prepare → accept-draft → review → visual status
                                      → visual attach → visual review
                                      → finalize
                                      └→ handoff-x (explicit request and optional exact asset_id)
```

`prepare` receives `{ "package": <frozen-package>, "brief": <article-brief> }`. Visual candidates are accepted only after Content Review. `finalize` writes relative image references, normalized assets, Visual Manifest/Review, Claim map, lineage, Boundary note, content Review, Generation Task, and Draft Candidate.

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
- `$x-publishing-copilot`: use for a Single, Thread, Reply, or finalized long-form X Article.

Both Skills stop if runtime discovery fails, and both delegate enforcement to the same Harness CLI.

## 8. V2 Browser Host Bridge

The available Browser Adapter V2 reuses an explicitly selected Chrome session through a command bridge. The Harness never launches a browser from the CLI, and automated acceptance uses a fake Host without network access.

Create the Browser Plan and Approval only after reviewing the exact Audit block:

```text
x plan --adapter browser
→ exact Audit block
→ one publish_once confirmation
→ x approve
→ x browser start
```

The Host then repeats:

```text
x browser next → x browser claim → one Chrome action → x browser report
```

For a safe synthetic preview, run `x browser start`, inspect the returned read-only `observe_page` command, and stop before claiming any command whose `side_effect` is `submit`. No real X side effect is part of automated acceptance.

If Browser execution fails before Submit, Manual remains available only through a new Manual Plan, Preview, and explicit Approval. After Submit is attempted, recovery is read-only through `x browser resume-verification`.

## 9. V3.4 X Article Fast Path

Fast Path prepares a complete saved Draft after one Audit confirmation. It does not ask the Human to choose V3.2 or V3.3: `{ "kind": "new" }` or `{ "kind": "existing", "draft_id": "..." }` in the Audit selects the internal compatibility path.

```text
x-article fast-path audit --input <package-target-and-draft-target.json>
→ inspect one Audit
→ x-article fast-path confirm --input <audit-confirmation.json>
→ x-article fast-path prepare --audit <audit.json> --confirmation <confirmation.json>
  --capabilities <capabilities.json> --release-set <release-set.json>
  [--observation <existing-draft-observation.json>]
→ one continuous Host loop
→ x-article fast-path status --execution <id>
→ draft_reconciled
```

All commands also require `--workspace <path> --output json`. The Host continues through the existing atomic `next → claim → one Chrome transaction → report` loop without per-image Human confirmation. If one write has an uncertain outcome, `x-article fast-path recover --execution <id>` permits one read-only reconciliation from the same checkpoint.

The Fast Path confirmation authorizes Draft materialization once. It does not authorize Preview or Publish. The terminal output is a saved Draft URL plus redacted stage and evidence paths; publishing remains a separate future decision.

### 9.1 V3.2/V3.3 compatibility publishing

Keep long-form content as an X Article; do not split it into a Thread merely because the Post branch has older automation.

The default path separates reversible Draft preparation from the irreversible Publish command:

```text
x-article plan
→ x-article browser prepare --plan <path> --capabilities <path>
→ next → claim → fake/offline or explicitly selected Chrome Host action → report
→ verified Preview and immutable materialization receipt
→ one exact Preview-bound confirmation
→ x-article browser confirm-publish --execution <id> --confirmation <path>
→ next → claim the one publish_article_once command → report
```

All commands also require `--workspace <path> --output json`. Inspect progress without mutation with `x-article browser materialization-status --execution <id>`. After a recoverable Editor interruption, use `x-article browser resume-editor --execution <id>`; recovery observes the actual saved Draft and checkpoint before deciding what remains.

For a Host advertising `import_article_document`, `replace_article_visual_anchor`, structured rich-text paste, inline Alt read/write, Preview observation, and the matching release set, the V3.2 bulk path is:

```text
Harness import command
→ Host pastes the digest-bound structured document once
→ Harness verifies template digest and ordered anchors
→ Host replaces each approved visual anchor
→ Harness verifies the final Article Document
→ Preview receipt → action-time confirmation → publish_once
```

The observed X editor has no `.md` file-upload path. The Host performs the import as one controlled, claimed structured-document action; it does not paste raw or unplanned Markdown. Temporary anchors reserve approved inline-image positions and are replaced separately at their approved block ordinals, never appended to the end. Unresolved anchors cannot reach Preview. After materialization begins, the Host must not switch strategy. Crash recovery re-observes the exact persisted import state, preserves unknown Human content, and resumes the next safe anchor transaction; it never reimports observed content.

V3.2 `prepare` fails with `ARTICLE_BULK_IMPORT_REQUIRED` when the complete bulk capability set is absent. The legacy `block_materialization/v1` path is explicit compatibility only: it must be selected before execution, has a different locked Plan digest, and cannot be chosen as a runtime fallback.

Automated acceptance never opens a public browser session or publishes. It models Draft, checkpoint, confirmation, and at-most-once Publish boundaries in a temporary workspace; live Chrome performance is validated only by the companion Browser Host plan.

## 10. V2.1 visual handoff

```text
article handoff-x  # input includes {"asset_id":"asset_cover"}
→ x plan --adapter browser  # input carries that exact article_handoff
→ show text + image + Alt + ordinal + digests
→ one publish_once confirmation
→ x approve
```

The Host manifest must include `file_upload`, `attachment_alt_text`, `upload_attachment`, and `set_attachment_alt_text`. Upload only the claimed Package-relative path. Automated acceptance uses generated synthetic images and a Fake Browser only.

## 11. V2.2 governed research memory

Use `llm-wiki-core` / `llm-wiki-init` once to initialize the `research-publishing` Domain in a dedicated Publishing Workspace. Do not initialize it in this source repository. The Workspace contains publication runs and research memory; this repository's `.llm-wiki` remains project-development context and is never used as publishing memory.

The Harness does not discover an arbitrary executable from `PATH`. Supply both explicit options on every real Runtime command:

```text
--runtime-executable <absolute-python-or-llm-wiki-path>
--runtime-launcher python-module|console-script
```

For Python module mode, make the pinned `llm-wiki-runtime` 0.2.0 source/package available to that Python environment. Verify the boundary first:

```bash
node dist/harnesses/research-publishing/cli/index.js memory doctor \
  --workspace ./publishing-workspace \
  --runtime-executable /absolute/path/to/python \
  --runtime-launcher python-module \
  --output json
```

Query happens only before constructing a new Package `1.1`:

```text
memory query plan → memory query execute → Human reviews ordered context_refs
→ memory query bind-package → normal package build → review → freeze
```

Each operation receives an explicit JSON `--input` file. If Runtime Query is absent or unavailable, the flow may continue only with `memory_unavailable` or `memory_not_applied`; it must not imply that prior research was used. A frozen Package, Publication Plan, or Approval is never patched with later memory.

There are two write paths:

- `publication_checkpoint`: preserve a finalized publication Receipt without requiring public replies.
- `feedback_insight`: preserve a Human-selected Feedback Snapshot plus accepted Candidate Insight proposals. Public text remains `data_only` and anecdotal evidence cannot become a verified conclusion automatically.

Both use the same controlled sequence:

```text
memory ingest plan → inspect preview.md and exact plan_digest
→ memory ingest approve → memory ingest execute
```

Any change to Workspace identity, Profile, SCP, Mapping, source bytes, staged content or Plan digest invalidates Approval. A `partial` Receipt records the last failed step; after correcting the external Runtime condition, use `memory ingest status` and `memory ingest resume` with the same still-valid Approval. Completed steps are not replayed. Never work around a failure by writing `.llm-wiki` directly.

## 12. V2.3 research data flywheel

V2.3 adds evidence-backed Research Increments, semantic Review/Promotion, Catalog-first progressive Query, publication expressions and a bounded historical Import. Follow the complete [Memory Loop guide](memory-loop.md). The only semantic write path is Delta → Human Review → exact Promotion Plan → one confirmation → Runtime, with the Catalog committed last.
