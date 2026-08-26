# Change Brief: X Article Document Import V3.1

## Metadata

- flow_id: `x-article-document-import-v3-1`
- parent_flow_id: `x-article-browser-publishing-v3`
- status: `verified`
- title: Add digest-bound bulk document import with deterministic visual anchors
- owner: Research Publishing Harness
- created: 2026-08-21

## Why

The V3 X Article Browser Adapter inserts one structured block per Browser Command. Real X Article editor behavior can retain the active block style across separate paste operations, which can merge paragraphs into headings or lists even when the approved Article Document is correct. The browser workflow must support one evidence-bound document import while preserving the existing content, visual, Approval, Preview, at-most-once Publish, public verification, and Receipt gates.

## Change

Add an optional `import_article_document` Chrome capability and Browser Command. The command imports a deterministic editor template derived from the approved X Article Document. Inline image blocks are represented during import by unique visual anchors. After the imported template is observed and verified, the Harness issues one command per planned image to replace the corresponding anchor, set the approved alt text, and restore the final Article block order. Preview remains the first place where the final public document must match the approved Article Document digest exactly.

The existing incremental `insert_article_block` path remains available when the Host does not advertise document import.

The observed X editor has no `.md` file-upload path. The Host performs one controlled, claimed structured-document paste using the digest-bound import template; raw or unplanned Markdown paste is not a supported publication input.

## Protocol Design

### Import template

- The template is derived only from `plan.intent.document` and `plan.intent.visuals`.
- Non-image blocks retain their exact structured runs, marks, links, list items, and order.
- Each inline image block becomes one reserved anchor with the exact form `RPH_VISUAL_ANCHOR:<asset_id>:<block_ordinal>`.
- The template carries a version and digest. The digest covers the ordered template blocks, anchor identities, target block ordinals, and source Article Document digest.
- The command payload includes the target editor reference, template, template digest, Article Package root, and Article Package digest.

### Editor observation

- The Article editor observation may report an import state containing the template version, template digest, and ordered unresolved visual anchors.
- Anchor paragraphs are excluded from the final Article `blocks` projection and are reported separately.
- The Host must set `has_unknown_content` when it cannot map the editor DOM to the template or final Article Document.
- Import is permitted only when the new draft has the approved title, zero body blocks, zero visuals, and no unknown content.

### Visual replacement

- After a verified import, the Harness issues `replace_article_visual_anchor` in planned block order.
- The command is bound to one anchor identity, one package-relative asset, the Package digest, the asset digest, and approved alt text.
- A successful observation must show that the named anchor disappeared and the owned inline visual appeared at the same final block ordinal.
- Missing, duplicate, reordered, or additional anchors fail closed with `ARTICLE_ASSET_MISMATCH` or `ARTICLE_CONTENT_MISMATCH`.

### Completion and recovery

- A crash may resume from an exact imported-template observation or an exact prefix of completed anchor replacements.
- Re-import is never issued when verified imported content or any human/unknown content already exists; recovery never changes the persisted bulk strategy to incremental insertion.
- Preview opens only when the editor projects the exact approved Article Document, all anchors are gone, all visuals are execution-owned, and autosave is `saved`.
- The existing Publish Gate, Approval verification, at-most-once `publish_once`, public verification, and immutable Receipt behavior do not change.

### Host operation

```text
Harness import command
→ Host pastes the digest-bound structured document once
→ Harness verifies template digest and ordered anchors
→ Host replaces each approved visual anchor
→ Harness verifies the final Article Document
→ Preview → action-time confirmation → publish_once
```

Every visual replacement preserves its approved block ordinal. Temporary anchors must be resolved before Preview and can never appear in the public Article. The action-time confirmation immediately before the final `publish_once` claim is unchanged.

## Acceptance Criteria

1. A compatible Chrome Host receives one `import_article_document` command instead of per-block commands for an empty titled draft.
2. The import command is digest-bound to the approved Article Document and Article Package.
3. Three planned inline visuals can be replaced at their original block ordinals after the text import.
4. Exact imported state and partial visual replacement state are resumable without a second import.
5. Extra content, altered marks or links, wrong anchors, unexpected visuals, asset digest mismatch, and Package digest mismatch fail closed.
6. Hosts without the new capability continue to use the V3 incremental block protocol unchanged.
7. Preview and public verification still compare the final Article Document, not the temporary import template.
8. Existing X Article tests remain green and new unit, contract, integration, security, CLI, and acceptance tests cover the import path.

## Active Scope

- X Article Browser Command types and JSON Schema
- deterministic import-template compiler and digest
- Article editor decision protocol
- Article editor observation and Page Contract projection
- Browser Adapter capability negotiation and recovery state
- CLI/doctor capability surface, acceptance fixtures, documentation, and Skill reference
- focused and full regression tests

## Non-Goals

- No generic Markdown importer for arbitrary websites.
- No direct `.md` file upload to X; current X accepts media files only.
- No weakening of Article Package, Plan, Approval, Browser Command, Preview, Publish, verification, or Receipt digests.
- No automatic deletion of failed or diagnostic X drafts.
- No change to X single-post, Thread, Reply, or Manual publication protocols.
- No decorative cover generation or change to approved visual assets.

## Active Sources

- `harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts`
- `harnesses/research-publishing/adapters/x/article-browser/article-command-broker.ts`
- `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- `harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.ts`
- `harnesses/research-publishing/adapters/x/article-browser/article-page-contract.ts`
- `harnesses/research-publishing/contracts/x-article-browser-command.schema.json`
- `tests/x-article/`
- `tests/integration/x-article-browser-workflow.test.ts`
- `tests/security/x-article-browser-security.test.ts`

## Verification Plan

- Run each new test first and record the expected failure before production changes.
- Run focused X Article unit, contract, security, integration, CLI, and acceptance tests after each protocol slice.
- Run `pnpm test` from a clean worktree before completion.
- Build `dist`, run Harness doctor against the publishing workspace, and confirm the new contracts and capability are exposed.
- Execute a pre-publish Chrome smoke test that imports the approved document and three visuals, then stops at the final action-time Publish confirmation.

## Offline Verification Evidence (2026-08-22)

- Required documentation RED: `tests/cli/cli.test.ts` ran 8 tests; 2 failed and 6 passed. The failures were the expected stale generated doctor exit `10` and the missing packaged Host-reference `import_article_document` name.
- Focused GREEN after documentation and build: 1 file passed, 8 tests passed.
- Manifest generation: both runs reported 87 files. Whole-diff hashes after the first and second run were identical (`bded28d45c564534425a6f8c031c2f54c635ff9b`), proving idempotence.
- `pnpm build`, `pnpm lint`, and `pnpm typecheck`: exit `0` with no TypeScript or ESLint warnings.
- `pnpm test`: 53 files passed, 277 tests passed.
- `pnpm acceptance`: all five branches completed or simulated-completed; network was unused; one X Article import, three ordered anchor replacements, and one at-most-once simulated Publish were observed.
- Built doctor against the article publishing workspace: `state: "ready"`; contract list includes `x-article-browser-command` and `x-article-browser-observation`; `network_required: false`.
- Generated manifest: declares both `import_article_document` and `replace_article_visual_anchor`; packaged Skill validation passed.
- Generated runtime: `pnpm build` refreshed the ignored `dist/**` tree with 153 files for explicit inclusion in the Task 5 commit.

## Live Chrome Verification Evidence (2026-08-22)

- Corrected execution `x_art_smoke_7cf7c956` created draft `2090980298595213313` and preserved the approved 76-block structured document.
- The Host issued exactly one bulk import and three anchor replacements, with the approved architecture assets and Alt Text at block ordinals 19, 34, and 62.
  - Ordinal 19: `assets/domain-runtime-boundary.png` (`domain-runtime-boundary`). Alt Text: “Two responsibility columns show the Domain Skill owning business meaning and judgment, while the Knowledge Runtime owns configuration, contracts, bounded context, provenance, path and write safety, and explicit fallback.”
  - Ordinal 34: `assets/bottom-up-extraction.png` (`bottom-up-extraction`). Alt Text: “PDC embedded Wiki and obsidian-llm-wiki controlled workflows converge on recurring infrastructure concerns, which lead to the bottom-up extraction of llm-wiki-runtime; a warning blocks any runtime-to-runtime interpretation.”
  - Ordinal 62: `assets/runtime-research-boundaries.png` (`runtime-research-boundaries`). Alt Text: “Four separate modules show Knowledge as current, while Trace, Eval, and Controlled Loop are each labeled planned research; dashed research arrows do not place them in one store.”
- The first Preview was rejected because X grouped all three images at the opening instead of preserving their approved inline positions. Before acceptance, the controller closed review, removed the group, reinserted each image after its approved adjacent paragraph, restored the exact Alt Text, and reran real Preview.
- Final Preview `https://x.com/compose/articles/edit/2090980298595213313/preview` matched the 76-block document and contained no `RPH_VISUAL_ANCHOR:` residue. Preview revision: `sha256:c2f8736dbbfeda891e12432f2d19d006067244cd8758308c6b1c3a7223159642`.
- Final DOM order proved inline placement: Alt Text index `8242` lay between headings at `6704` and `9072`; index `11621` lay between headings at `10307` and `12460`; index `17440` lay between headings at `16154` and `18141`.
- Final state: `preview_verified`; latest observation: `obs_2279c5dc-d00c-49c8-957a-133283849d82`; `publish_command_count: 0`.
- Final review was reopened, audience `Everyone` and exactly one final Publish button were verified, and the button was not clicked. The controller stopped before issuing or claiming `publish_article_once`; no public Article was published.
- The first attempt, `x_art_smoke_31eba683`, was abandoned after the Body control observation for draft `2090979425416511489` lacked `test_id=composer`. The diagnostic draft remains preserved and unpublished; no automatic cleanup occurred.

## Risks

- X editor DOM semantics can change; the Page Contract must fail closed when anchors cannot be uniquely observed.
- Temporary anchors must never reach Preview or the public Article.
- Optional capability negotiation must not silently select bulk import on an incompatible Host.
- A bulk paste can contain more content than one incremental command, so its payload and observed template require their own digest boundary.

## Flow Record

| Stage | Status | Evidence | Next |
|---|---|---|---|
| Source / problem reproduction | complete | Live X editor retained block style across separate paste operations on 2026-08-21 | Lock design |
| Design | approved | User approved formal Harness capability and continued with the recommended anchor design | Review written Change Brief |
| Implementation plan | complete | `.llm-wiki/working-context/x-article-document-import-v3-1-execution-plan.md` | Select execution mode |
| Development | complete | Tasks 1-5 implemented the compiler, contracts, orchestration, acceptance, docs, packaged Skill, manifest, and generated runtime | Verify pre-publish behavior |
| Verification | complete | Offline: 53 test files / 277 tests, acceptance complete, doctor ready. Live: `x_art_smoke_7cf7c956`, 76 blocks, one import, three replacements; first grouped-image Preview rejected, placements corrected and DOM-order verified; final marker-free Preview, state `preview_verified`, Publish count `0` | Preserve final action-time Publish boundary |
| Archive / finish | pending | Corrected draft `2090980298595213313` stopped before Publish; diagnostic draft `2090979425416511489` preserved unpublished | Project Finish |
