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
{"ok":true,"article":"complete","manual_x":"complete","browser_x":"simulated_complete","visual_v2_1":"simulated_complete","x_article":"simulated_complete","network":"unused","submit_commands":1,"submit_claims":1,"x_article_publish_commands":1}
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

## 9. V3 X Article publishing

Keep long-form content as an X Article; do not split it into a Thread merely because the Post branch has older automation.

```text
x-article plan
→ exact Article Audit block
→ one publish_once confirmation
→ x-article approve
→ x-article browser start
→ x-article browser next → claim → one Chrome action → report
```

Use action-time Human approval before a real file upload and before claiming the final public Publish command. `cancel-before-publish` is valid only before that barrier. After Publish is issued, use `resume-verification`; never issue a second Publish.

## 10. V2.1 visual handoff

```text
article handoff-x  # input includes {"asset_id":"asset_cover"}
→ x plan --adapter browser  # input carries that exact article_handoff
→ show text + image + Alt + ordinal + digests
→ one publish_once confirmation
→ x approve
```

The Host manifest must include `file_upload`, `attachment_alt_text`, `upload_attachment`, and `set_attachment_alt_text`. Upload only the claimed Package-relative path. Automated acceptance uses generated synthetic images and a Fake Browser only.
