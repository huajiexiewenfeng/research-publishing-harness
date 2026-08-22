# X Article Document Import V3.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add a digest-bound bulk X Article document import path that preserves exact text structure, replaces deterministic visual anchors with approved assets, and retains every V3 Publish and verification gate.

**Architecture:** A pure import-template compiler converts an approved `XArticleDocumentV1` into ordered text blocks plus reserved visual anchors. Capability negotiation selects this path only for Hosts advertising `import_article_document` and `replace_article_visual_anchor`; the existing incremental path remains unchanged. Editor observations expose a temporary import state until all anchors have been replaced, after which the existing exact Article Document and Preview verification resumes.

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV JSON Schema, Vitest, existing Research Publishing Harness WorkspaceStore and X Article Browser Adapter.

## Global Constraints

- Preserve Article Package, Plan, Approval, Browser Command, Preview, at-most-once Publish, public verification, and Receipt digest boundaries.
- Never import into a draft containing body blocks, visuals, anchors, or unknown content.
- Temporary anchors must never reach Preview or the public Article.
- Inline images remain at their approved block ordinals; do not append them to the end of the Article.
- Keep the existing incremental `insert_article_block` protocol operational for Hosts without bulk-import capabilities.
- Follow TDD: every production change begins with a focused test that fails for the expected missing behavior.
- Do not delete diagnostic X drafts automatically.

---

### Task 1: Deterministic import-template compiler

**Files:**

- Create: `harnesses/research-publishing/adapters/x/article-browser/article-import-template.ts`
- Create: `tests/x-article/article-import-template.test.ts`

**Interfaces:**

- Consumes: `XArticleDocumentV1` and its inline `image` blocks.
- Produces:

```ts
export interface XArticleVisualAnchorV1 {
  readonly anchor_id: string;
  readonly asset_id: string;
  readonly block_ordinal: number;
  readonly marker: string;
}

export interface XArticleImportTemplateV1 {
  readonly schema_version: '1.0';
  readonly source_document_digest: string;
  readonly blocks: readonly XArticleImportTemplateBlockV1[];
  readonly anchors: readonly XArticleVisualAnchorV1[];
  readonly template_digest: string;
}

export function createXArticleImportTemplate(
  document: XArticleDocumentV1
): XArticleImportTemplateV1;
```

- `XArticleImportTemplateBlockV1` is the non-image Article block union plus:

```ts
{ readonly kind: 'visual_anchor'; readonly anchor_id: string; readonly marker: string }
```

- Marker format: `RPH_VISUAL_ANCHOR:<asset_id>:<block_ordinal>`.

- [ ] **Step 1: Write the failing deterministic compiler tests**

```ts
it('replaces inline images with ordered deterministic anchors', () => {
  const template = createXArticleImportTemplate(documentWithThreeImages);
  expect(template.anchors).toEqual([
    {
      anchor_id: 'anchor_domain-runtime-boundary_19',
      asset_id: 'domain-runtime-boundary',
      block_ordinal: 19,
      marker: 'RPH_VISUAL_ANCHOR:domain-runtime-boundary:19'
    },
    {
      anchor_id: 'anchor_bottom-up-extraction_34',
      asset_id: 'bottom-up-extraction',
      block_ordinal: 34,
      marker: 'RPH_VISUAL_ANCHOR:bottom-up-extraction:34'
    },
    {
      anchor_id: 'anchor_runtime-research-boundaries_62',
      asset_id: 'runtime-research-boundaries',
      block_ordinal: 62,
      marker: 'RPH_VISUAL_ANCHOR:runtime-research-boundaries:62'
    }
  ]);
  expect(template.blocks[18]).toMatchObject({
    kind: 'visual_anchor', anchor_id: 'anchor_domain-runtime-boundary_19'
  });
});

it('changes the template digest when text, marks, links, or anchor order changes', () => {
  expect(createXArticleImportTemplate(documentA).template_digest)
    .not.toBe(createXArticleImportTemplate(documentWithChangedLink).template_digest);
});

it('rejects unsafe or duplicate anchor identities', () => {
  expect(() => createXArticleImportTemplate(documentWithDuplicateAssetIds))
    .toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```text
pnpm vitest run tests/x-article/article-import-template.test.ts
```

Expected: FAIL because `article-import-template.ts` and `createXArticleImportTemplate` do not exist.

- [ ] **Step 3: Implement the pure compiler**

Implement the interfaces above. Build the anchor list in document order, validate `/^[A-Za-z0-9_-]+$/` asset IDs, reject duplicates, compute `source_document_digest = sha256(document)`, and compute `template_digest` over every field except `template_digest` itself.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```text
pnpm vitest run tests/x-article/article-import-template.test.ts
```

Expected: the new test file passes with zero failures.

- [ ] **Step 5: Commit the compiler slice**

```text
git add harnesses/research-publishing/adapters/x/article-browser/article-import-template.ts tests/x-article/article-import-template.test.ts
git commit -m "feat: compile X Article import templates"
```

---

### Task 2: Versioned command and observation contracts

**Files:**

- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-command-broker.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.ts`
- Modify: `harnesses/research-publishing/contracts/x-article-browser-command.schema.json`
- Modify: `harnesses/research-publishing/contracts/x-article-browser-observation.schema.json`
- Modify: `tests/x-article/article-editor-protocol.test.ts`
- Modify: `tests/security/x-article-browser-security.test.ts`

**Interfaces:**

- Add command kinds `import_article_document` and `replace_article_visual_anchor`.
- Add payloads:

```ts
| {
    readonly kind: 'import_article_document';
    readonly target_ref: string;
    readonly package_root: string;
    readonly package_digest: string;
    readonly template: XArticleImportTemplateV1;
  }
| {
    readonly kind: 'replace_article_visual_anchor';
    readonly target_ref: string;
    readonly anchor: XArticleVisualAnchorV1;
    readonly package_root: string;
    readonly package_digest: string;
    readonly asset: VisualAssetRef;
  }
```

- Add editor import observation:

```ts
export interface XArticleEditorImportStateV1 {
  readonly template_digest: string;
  readonly source_document_digest: string;
  readonly unresolved_anchors: readonly XArticleVisualAnchorV1[];
}

readonly import_state: XArticleEditorImportStateV1 | null;
```

- [ ] **Step 1: Write failing command-schema and observation-schema tests**

Add assertions that valid import and anchor-replacement commands pass `validateContract`, while commands with mismatched template digest shape, unsafe anchor IDs, absolute asset paths, or missing Package digest fail with `CONTRACT_INVALID`. Add an observation test requiring ordered, unique anchors and a digest-shaped `template_digest`.

- [ ] **Step 2: Run the security and protocol tests and verify RED**

Run:

```text
pnpm vitest run tests/x-article/article-editor-protocol.test.ts tests/security/x-article-browser-security.test.ts
```

Expected: FAIL because the new command kinds and `editor.import_state` are not accepted by TypeScript or AJV.

- [ ] **Step 3: Extend TypeScript unions and JSON Schemas minimally**

Add only the two command kinds, their exact payload schemas, and nullable import state. Keep `additionalProperties: false` on every new object. Reuse existing digest, relative-path, and `VisualAssetRef` schema patterns.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```text
pnpm vitest run tests/x-article/article-editor-protocol.test.ts tests/security/x-article-browser-security.test.ts
```

Expected: both test files pass.

- [ ] **Step 5: Commit the contract slice**

```text
git add harnesses/research-publishing/adapters/x/article-browser/article-command-broker.ts harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.ts harnesses/research-publishing/contracts/x-article-browser-command.schema.json harnesses/research-publishing/contracts/x-article-browser-observation.schema.json tests/x-article/article-editor-protocol.test.ts tests/security/x-article-browser-security.test.ts
git commit -m "feat: add X Article import command contracts"
```

---

### Task 3: Capability-negotiated editor state machine

**Files:**

- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-page-contract.ts`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.ts`
- Modify: `tests/x-article/article-editor-protocol.test.ts`
- Modify: `tests/x-article/article-browser-adapter.test.ts`

**Interfaces:**

- Extend editor context:

```ts
export interface XArticleEditorContext {
  readonly plan: XArticlePublicationPlanV1;
  readonly draft_id: string;
  readonly import_strategy: 'bulk_document' | 'incremental_blocks';
}
```

- Select `bulk_document` only when the manifest includes both new capabilities.
- State order for bulk mode:

```text
set title
→ import_article_document on an empty editor
→ verify exact template digest and ordered anchors
→ replace_article_visual_anchor in block order
→ verify exact final document and zero anchors
→ wait for autosave
→ open Preview
```

- [ ] **Step 1: Write failing state-machine tests**

```ts
it('imports once when a compatible titled draft is empty', () => {
  expect(nextArticleEditorDecision(
    { plan, draft_id: draftId, import_strategy: 'bulk_document' },
    titleOnly,
    contract
  )).toMatchObject({
    kind: 'command',
    input: { kind: 'import_article_document', payload: { kind: 'import_article_document' } }
  });
});

it('resumes by replacing the first unresolved anchor without re-importing', () => {
  expect(nextArticleEditorDecision(
    { plan, draft_id: draftId, import_strategy: 'bulk_document' },
    importedWithThreeAnchors,
    contract
  )).toMatchObject({
    kind: 'command',
    input: {
      kind: 'replace_article_visual_anchor',
      payload: { anchor: { block_ordinal: 19 }, asset: { asset_id: 'domain-runtime-boundary' } }
    }
  });
});

it('blocks an altered or reordered import template', () => {
  expect(nextArticleEditorDecision(
    { plan, draft_id: draftId, import_strategy: 'bulk_document' },
    importedWithWrongAnchorOrder,
    contract
  )).toMatchObject({ kind: 'blocked', code: 'ARTICLE_CONTENT_MISMATCH' });
});
```

Also prove that `incremental_blocks` still emits `insert_article_block_1` and that a manifest advertising only one of the two bulk capabilities is rejected as incompatible rather than partially enabling import.

- [ ] **Step 2: Run focused state-machine tests and verify RED**

Run:

```text
pnpm vitest run tests/x-article/article-editor-protocol.test.ts tests/x-article/article-browser-adapter.test.ts
```

Expected: FAIL because import strategy and bulk decisions are absent.

- [ ] **Step 3: Implement capability selection and fail-closed transitions**

Pass the strategy from persisted Adapter context into every `nextArticleEditorDecision` call. In bulk mode, require an empty editor before import, compare import and source digests, compare anchors in order, bind every replacement to the matching Plan visual, and require `import_state === null` before Preview. Do not change the incremental branch other than moving it behind the strategy switch.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```text
pnpm vitest run tests/x-article/article-editor-protocol.test.ts tests/x-article/article-browser-adapter.test.ts
```

Expected: both test files pass, including pre-existing incremental cases.

- [ ] **Step 5: Commit the state-machine slice**

```text
git add harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts harnesses/research-publishing/adapters/x/article-browser/article-page-contract.ts harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.ts tests/x-article/article-editor-protocol.test.ts tests/x-article/article-browser-adapter.test.ts
git commit -m "feat: orchestrate bulk X Article imports"
```

---

### Task 4: End-to-end workflow, CLI, and acceptance evidence

**Files:**

- Modify: `tests/fixtures/x-article-browser-observations.ts`
- Modify: `tests/integration/x-article-browser-workflow.test.ts`
- Modify: `tests/cli/cli.test.ts`
- Modify: `tools/acceptance.ts`
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `registry/manifests/research-publishing.json`

**Interfaces:**

- A full import execution must produce exactly one import command, three anchor replacement commands for the current Article fixture, one Preview command, one publish command, and one immutable Receipt.
- CLI input/output remains JSON; no raw Markdown path is accepted at publication time because the finalized Article Package and Plan remain the authority.

- [ ] **Step 1: Write the failing integration and CLI tests**

Extend the synthetic Article fixture to include three inline images. Drive the adapter with import-capable manifest observations and assert:

```ts
expect(commandKinds.filter((kind) => kind === 'import_article_document')).toHaveLength(1);
expect(commandKinds.filter((kind) => kind === 'replace_article_visual_anchor')).toHaveLength(3);
expect(commandKinds.filter((kind) => kind === 'insert_article_block')).toHaveLength(0);
expect(finalSnapshot.publish_command_count).toBe(1);
expect(receipt.status).toBe('published');
```

Add a CLI test proving `x-article browser start` accepts the two new advertised capabilities and persists them unchanged.

- [ ] **Step 2: Run integration and CLI tests and verify RED**

Run:

```text
pnpm vitest run tests/integration/x-article-browser-workflow.test.ts tests/cli/cli.test.ts
```

Expected: FAIL because the acceptance Host does not yet simulate import state and anchor replacement.

- [ ] **Step 3: Update fixtures, CLI exposure, manifest, and synthetic Host**

Model the temporary import observation explicitly, remove one anchor per replacement command, project the final `XArticleDocumentV1` only when no anchors remain, and retain existing uncertain-submit/read-only-verification behavior. Add the new contract/capability descriptions to the registry manifest without changing unrelated operations.

- [ ] **Step 4: Run integration, CLI, and acceptance checks and verify GREEN**

Run:

```text
pnpm vitest run tests/integration/x-article-browser-workflow.test.ts tests/cli/cli.test.ts
pnpm acceptance
```

Expected: focused tests pass and acceptance prints `"x_article":"simulated_complete"` with one X Article publish command.

- [ ] **Step 5: Commit the workflow slice**

```text
git add tests/fixtures/x-article-browser-observations.ts tests/integration/x-article-browser-workflow.test.ts tests/cli/cli.test.ts tools/acceptance.ts harnesses/research-publishing/cli/index.ts registry/manifests/research-publishing.json
git commit -m "test: verify bulk X Article document import"
```

---

### Task 5: Documentation, generated runtime, and full verification

**Files:**

- Modify: `README.md`
- Modify: `docs/quickstart.md`
- Modify: `skills/x-publishing-copilot/SKILL.md`
- Modify: `skills/x-publishing-copilot/references/browser-adapter-flow.md`
- Modify: `.llm-wiki/requirements/x-article-document-import-v3-1.md`
- Modify: `.llm-wiki/working-context/x-article-document-import-v3-1-execution-plan.md`
- Generated: `dist/**`

**Interfaces:**

- Document that X itself has no `.md` file upload in the observed editor; the Host imports a digest-bound structured document through one controlled editor action.
- Document temporary visual anchors, separate final image replacement, crash recovery, and the unchanged action-time `publish_once` confirmation.

- [x] **Step 1: Add documentation assertions before editing docs**

Extend the CLI/manifest test to assert the doctor contract list and packaged Skill reference include `import_article_document` and `replace_article_visual_anchor`. Run it and verify failure before updating docs/manifest output.

- [x] **Step 2: Update user and Host documentation**

Add the bulk flow:

```text
Harness import command
→ Host pastes the digest-bound structured document once
→ Harness verifies template digest and ordered anchors
→ Host replaces each approved visual anchor
→ Harness verifies the final Article Document
→ Preview → action-time confirmation → publish_once
```

Explicitly prohibit direct unplanned Markdown paste, publishing with unresolved anchors, and switching to incremental mode after a bulk import begins.

- [x] **Step 3: Build generated runtime and run the full verification gate**

Run:

```text
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm acceptance
```

Expected: exit code 0; all test files pass; acceptance reports all branches complete; no warnings from TypeScript or ESLint.

- [x] **Step 4: Run Harness doctor against the article publishing workspace**

Run the built CLI with:

```text
node dist/harnesses/research-publishing/cli/index.js doctor --workspace "C:\Users\admin\Documents\New project 2\publishing-workspace\llm-wiki-runtime-first-article" --output json
```

Expected: `state: "ready"` and both new X Article contracts/capabilities are present.

- [x] **Step 5: Perform a pre-publish Chrome smoke test**

Use the existing finalized Article Package and unchanged Plan content to create a new Approval and execution. Verify one bulk import, three technical diagram replacements at block ordinals 19, 34, and 62, exact Preview match, and stop before claiming the final public Publish command for action-time confirmation.

- [x] **Step 6: Update lifecycle evidence and commit**

Record test counts, acceptance result, doctor output, execution ID, Preview revision, and the fact that `publish_command_count` remains `0` before final user confirmation.

```text
git add README.md docs/quickstart.md skills/x-publishing-copilot/SKILL.md skills/x-publishing-copilot/references/browser-adapter-flow.md .llm-wiki/requirements/x-article-document-import-v3-1.md .llm-wiki/working-context/x-article-document-import-v3-1-execution-plan.md dist
git commit -m "docs: document X Article document import"
```

#### Task 5 offline evidence (2026-08-22)

- Documentation RED: focused CLI suite ran 8 tests; 2 failed and 6 passed. Failures were the stale built doctor returning exit `10` before `dist` regeneration and the packaged Host reference missing `import_article_document`.
- Documentation GREEN: focused CLI suite passed 1 file and all 8 tests after the docs/Skill update and build.
- Corrected the brief's nonexistent `docs/quickstart.md` path to the canonical `docs/guides/quickstart.md`; `README.md` already links to the canonical guide.
- Manifest generation reported 87 files on both runs. Post-generation whole-diff hashes matched at `bded28d45c564534425a6f8c031c2f54c635ff9b`.
- Full gate: `pnpm build`, `pnpm lint`, and `pnpm typecheck` exited `0`; `pnpm test` passed 53 files and 277 tests; `pnpm acceptance` returned `ok: true`, all branches complete/simulated-complete, `network: unused`, one import command, three anchor replacement commands, and one simulated at-most-once X Article Publish command.
- Doctor: exact built CLI command against `publishing-workspace/llm-wiki-runtime-first-article` returned `state: "ready"`, `network_required: false`, and both `x-article-browser-command` and `x-article-browser-observation` in the contract list.
- Registry/Skill: generated interface metadata contains `import_article_document` and `replace_article_visual_anchor`; Skill validator returned `Skill is valid!`.
- Generated runtime: `pnpm build` refreshed 153 ignored `dist/**` files for explicit staging in the Task 5 commit.
- Live Chrome verification: corrected execution `x_art_smoke_7cf7c956` created draft `2090980298595213313`, imported the approved 76-block structured document exactly once, and replaced `domain-runtime-boundary` at ordinal 19, `bottom-up-extraction` at ordinal 34, and `runtime-research-boundaries` at ordinal 62 with the approved assets and Alt Text.
- The first Preview was rejected because X grouped the three images at the opening. The controller closed review, removed the group, reinserted each image after its approved adjacent paragraph, restored Alt Text, and reran real Preview before accepting the result.
- Final Preview `https://x.com/compose/articles/edit/2090980298595213313/preview` contained the exact 76 blocks and no temporary-anchor marker. DOM-order checks placed the three Alt Text values at indexes `8242`, `11621`, and `17440`, each between the expected surrounding section headings. Preview revision: `sha256:c2f8736dbbfeda891e12432f2d19d006067244cd8758308c6b1c3a7223159642`.
- Final review was reopened and showed audience `Everyone` plus exactly one final Publish button. The button was not clicked. Final state was `preview_verified`; latest observation was `obs_2279c5dc-d00c-49c8-957a-133283849d82`; `publish_command_count` remained `0`. The controller stopped before issuing or claiming `publish_article_once`, so no public Article was published.
- The first attempt, execution `x_art_smoke_31eba683` and diagnostic draft `2090979425416511489`, was abandoned because the Body control observation lacked `test_id=composer`. The draft remains preserved and unpublished; the Harness did not automatically delete it.

## Plan Self-Review

- Spec coverage: compiler, contracts, negotiation, anchors, recovery, compatibility, Preview, Publish, verification, docs, and live smoke test are each assigned to a task.
- Completeness scan: every task contains concrete files, interfaces, test commands, expected failures, minimal implementation behavior, and verification results.
- Type consistency: `XArticleImportTemplateV1`, `XArticleVisualAnchorV1`, `import_article_document`, `replace_article_visual_anchor`, and `import_state` use the same names across all tasks.
- Scope: one protocol capability; no changes to unrelated X Post/Thread/Reply or Article generation semantics.
