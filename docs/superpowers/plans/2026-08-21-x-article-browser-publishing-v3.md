# X Article Browser Publishing V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a finalized evidence-backed Article Package as a new public X Article through the existing Chrome host with deterministic editing, one exact approval, at-most-once Publish, public verification, and an immutable receipt.

**Architecture:** Keep Post publishing (`single | thread | reply`) unchanged and add a sibling `x-article-harness` plus `adapters/x/article-browser`. A deterministic compiler converts canonical Markdown and the visual manifest into a versioned article AST before approval; the adapter executes only AST-derived commands and reuses Core storage, digest, command-ledger, and write-ahead primitives.

**Tech Stack:** TypeScript 6, Node.js 20.19+, AJV 2020 JSON Schema, Vitest 4, Commander 14, existing WorkspaceStore and Browser Host bridge.

## Global Constraints

- Work directly on the current `main` branch; do not create a branch or worktree.
- Use TDD for every behavior: focused RED, minimal GREEN, focused regression, then commit.
- Do not add `article` to `XPublicationMode`; existing Post contracts remain source-compatible.
- Only finalized Article Packages may enter the X Article branch.
- Plan and Approval bind account, audience `everyone`, document, visuals, adapter, and `publish_once`.
- Never read credentials, cookies, localStorage, or accept arbitrary DOM/JavaScript/file paths.
- A final public Publish command is issued at most once; after issuance recovery is read-only.
- Tests and Chrome smoke must not publish test content.
- Editing, unpublishing, deleting, subscriber-only, video/GIF, embedded posts, scheduling, and API/OAuth are out of scope.

---

### Task 1: Versioned X Article Document and deterministic compiler

**Files:**
- Create: `harnesses/research-publishing/branches/x-article-harness/article-document.ts`
- Create: `harnesses/research-publishing/branches/x-article-harness/article-compiler.ts`
- Create: `harnesses/research-publishing/contracts/x-article-document.schema.json`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `harnesses/research-publishing/core/errors.ts`
- Test: `tests/x-article/article-compiler.test.ts`
- Test: `tests/core/schema-validator.test.ts`

**Interfaces:**
- Consumes: finalized `article.md`, `ArticleVisualManifest`, and `VisualAssetRef` values.
- Produces: `compileXArticleDocument(input): XArticleDocumentV1` and `assertXArticleDocument(document): void`.

- [ ] **Step 1: Write failing compiler and schema tests**

```ts
expect(compileXArticleDocument({
  markdown: '# Boundary\n\n## Runtime\n\nA **deterministic** [contract](https://example.com).',
  visuals: []
})).toEqual({
  schema_version: '1.0',
  title: 'Boundary',
  blocks: [
    { kind: 'heading', runs: [{ text: 'Runtime', marks: [], link: null }] },
    { kind: 'paragraph', runs: [
      { text: 'A ', marks: [], link: null },
      { text: 'deterministic', marks: ['bold'], link: null },
      { text: ' ', marks: [], link: null },
      { text: 'contract', marks: [], link: 'https://example.com' },
      { text: '.', marks: [], link: null }
    ] }
  ]
});
expect(() => compileXArticleDocument({ markdown: '# T\n\n|a|b|\n|-|-|', visuals: [] }))
  .toThrowError(expect.objectContaining({ code: 'ARTICLE_FORMAT_UNSUPPORTED' }));
```

- [ ] **Step 2: Run focused RED**

Run: `pnpm vitest run tests/x-article/article-compiler.test.ts tests/core/schema-validator.test.ts`
Expected: FAIL because compiler, contract name, schema, and error code do not exist.

- [ ] **Step 3: Implement the constrained AST and parser**

```ts
export type XArticleBlockV1 =
  | { readonly kind: 'heading' | 'subheading' | 'paragraph' | 'quote'; readonly runs: readonly InlineRunV1[] }
  | { readonly kind: 'bullet_list' | 'ordered_list'; readonly items: readonly (readonly InlineRunV1[])[] }
  | { readonly kind: 'image'; readonly asset_id: string; readonly alt_text: string };

export interface XArticleDocumentV1 {
  readonly schema_version: '1.0';
  readonly title: string;
  readonly blocks: readonly XArticleBlockV1[];
}
```

Implement a line-oriented parser for the exact supported subset, inline tokens for `**bold**`, `*italic*`, and `[text](https://...)`, NFC/LF normalization, and explicit rejection of HTML, tables, code fences, nested lists, missing H1, duplicate H1, unknown or unbound image references.

- [ ] **Step 4: Run focused GREEN**

Run: `pnpm vitest run tests/x-article/article-compiler.test.ts tests/core/schema-validator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harnesses/research-publishing/branches/x-article-harness/article-document.ts harnesses/research-publishing/branches/x-article-harness/article-compiler.ts harnesses/research-publishing/contracts/x-article-document.schema.json harnesses/research-publishing/core/types.ts harnesses/research-publishing/core/errors.ts tests/x-article/article-compiler.test.ts tests/core/schema-validator.test.ts
git commit -m "feat: compile canonical articles for X Articles"
```

### Task 2: Publication Plan, Approval, and finalized-package service boundary

**Files:**
- Create: `harnesses/research-publishing/core/x-article-publication-plan.ts`
- Create: `harnesses/research-publishing/core/x-article-approval.ts`
- Create: `harnesses/research-publishing/contracts/x-article-publication-plan.schema.json`
- Create: `harnesses/research-publishing/contracts/x-article-approval.schema.json`
- Create: `harnesses/research-publishing/branches/x-article-harness/x-article-service.ts`
- Test: `tests/x-article/publication-plan.test.ts`
- Test: `tests/x-article/x-article-service.test.ts`

**Interfaces:**
- Consumes: `ArticlePackageRef`, its `finalized-package.json`, `article.md`, `visual-manifest.json`, target account, and compiler output.
- Produces: `createXArticlePublicationPlan`, `approveXArticlePublication`, `verifyXArticleApproval`, and `XArticleService.plan(...)`.

- [ ] **Step 1: Write failing plan, digest, and stale-approval tests**

```ts
const first = createXArticlePublicationPlan(input({ plannedAt: '2026-08-21T00:00:00Z' }));
const second = createXArticlePublicationPlan(input({ plannedAt: '2026-08-22T00:00:00Z' }));
expect(first.plan_digest).toBe(second.plan_digest);
expect(createXArticlePublicationPlan(input({ document: changedDocument })).not.toMatchObject({
  plan_digest: first.plan_digest
});
expect(() => verifyXArticleApproval(first, { ...approval, target_account: '@other' }))
  .toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
```

- [ ] **Step 2: Run focused RED**

Run: `pnpm vitest run tests/x-article/publication-plan.test.ts tests/x-article/x-article-service.test.ts`
Expected: FAIL because X Article Plan, Approval, and service do not exist.

- [ ] **Step 3: Implement immutable Intent and approval binding**

```ts
export interface XArticlePublicationIntentV1 {
  readonly schema_version: '1.0';
  readonly platform: 'x';
  readonly target_account: string;
  readonly adapter: 'browser';
  readonly audience: 'everyone';
  readonly action: 'publish_once';
  readonly article_package: { readonly root: string; readonly digest: string };
  readonly document: XArticleDocumentV1;
  readonly visuals: readonly XArticleVisualBindingV1[];
}
```

Compute `plan_digest = sha256(intent)` and approval digest from plan digest, account, adapter, audience, and action. `XArticleService.plan` must prove the package is finalized, root-contained, digest-valid, and all visual bytes match before writing `runs/<run>/x-article/publication-plan-v1.json`.

- [ ] **Step 4: Run focused GREEN**

Run: `pnpm vitest run tests/x-article/publication-plan.test.ts tests/x-article/x-article-service.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harnesses/research-publishing/core/x-article-publication-plan.ts harnesses/research-publishing/core/x-article-approval.ts harnesses/research-publishing/contracts/x-article-publication-plan.schema.json harnesses/research-publishing/contracts/x-article-approval.schema.json harnesses/research-publishing/branches/x-article-harness/x-article-service.ts tests/x-article/publication-plan.test.ts tests/x-article/x-article-service.test.ts
git commit -m "feat: lock X Article publication plans"
```

### Task 3: Article browser observations and versioned Page Contract

**Files:**
- Create: `harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.ts`
- Create: `harnesses/research-publishing/adapters/x/article-browser/article-page-contract.ts`
- Create: `harnesses/research-publishing/adapters/x/article-browser/contracts/x-article-web-2026-08.ts`
- Create: `harnesses/research-publishing/contracts/x-article-browser-observation.schema.json`
- Create: `tests/fixtures/x-article-browser-observations.ts`
- Create: `tests/x-article/article-page-contract.test.ts`

**Interfaces:**
- Consumes: minimal Host observations of account, editor URL, title, normalized blocks, visuals, controls, Preview, and public Article.
- Produces: `XArticlePageContract`, `XArticleWeb2026_08Contract`, and versioned observation types.

- [ ] **Step 1: Write failing Page Contract fixture tests**

```ts
expect(contract.detectPage(emptyEditor)).toEqual({ kind: 'article_editor', draft_id: '2090731994279755776' });
expect(contract.detectAccount(emptyEditor)).toEqual({ handle: '@Glen56121' });
expect(contract.detectEditor(populatedEditor).document).toEqual(plan.intent.document);
expect(() => contract.detectEditor(unknownDraft)).toThrowError(
  expect.objectContaining({ code: 'ARTICLE_DRAFT_CONFLICT' })
);
```

- [ ] **Step 2: Run focused RED**

Run: `pnpm vitest run tests/x-article/article-page-contract.test.ts`
Expected: FAIL because protocol and contract are missing.

- [ ] **Step 3: Implement minimal semantic observation and contract**

```ts
export type XArticlePageState =
  | { readonly kind: 'articles_index' }
  | { readonly kind: 'article_editor'; readonly draft_id: string }
  | { readonly kind: 'article_preview'; readonly draft_id: string }
  | { readonly kind: 'publish_review'; readonly draft_id: string }
  | { readonly kind: 'public_article'; readonly article_id: string }
  | { readonly kind: 'login_required' | 'security_challenge' };
```

Use role/name first, then fixture-backed `data-testid`; require unique controls; reject unknown editable content and origin other than `https://x.com`. The contract must represent blank auto-saved drafts and the observed 2026-08 editor controls without storing a full DOM.

- [ ] **Step 4: Run focused GREEN**

Run: `pnpm vitest run tests/x-article/article-page-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harnesses/research-publishing/adapters/x/article-browser harnesses/research-publishing/contracts/x-article-browser-observation.schema.json tests/fixtures/x-article-browser-observations.ts tests/x-article/article-page-contract.test.ts
git commit -m "feat: define the X Article page contract"
```

### Task 4: Article execution state and deterministic editor protocol

**Files:**
- Create: `harnesses/research-publishing/core/x-article-execution.ts`
- Create: `harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts`
- Create: `harnesses/research-publishing/adapters/x/article-browser/article-command-broker.ts`
- Create: `harnesses/research-publishing/contracts/x-article-browser-command.schema.json`
- Create: `harnesses/research-publishing/contracts/x-article-execution-event.schema.json`
- Create: `tests/x-article/article-execution.test.ts`
- Create: `tests/x-article/article-editor-protocol.test.ts`

**Interfaces:**
- Consumes: Plan, Approval, Page Contract observations, and exact editor revision.
- Produces: state transitions and one next semantic command at a time.

- [ ] **Step 1: Write failing state, prefix-resume, and replay tests**

```ts
expect(transitionXArticleExecution('draft_created', 'content_filling')).toBe('content_filling');
expect(() => transitionXArticleExecution('publish_attempted', 'publish_armed')).toThrow();
expect(nextArticleEditorDecision(context, exactPrefix, contract)).toMatchObject({
  kind: 'command', input: { purpose: 'insert_block_3' }
});
expect(await broker.claim(consumedPublishCommand)).toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
```

- [ ] **Step 2: Run focused RED**

Run: `pnpm vitest run tests/x-article/article-execution.test.ts tests/x-article/article-editor-protocol.test.ts`
Expected: FAIL because Article execution and protocol are missing.

- [ ] **Step 3: Implement state graph and semantic commands**

Commands are limited to `observe_article_page`, `navigate`, `create_article_draft`, `set_article_title`, `upload_article_cover`, `insert_article_block`, `apply_article_block_style`, `apply_article_inline_mark`, `insert_article_image`, `set_article_image_alt`, `open_article_preview`, `open_publish_review`, and `publish_article_once`.

Every command carries plan/execution/draft identity, expected revision, origin, side effect, payload digest, and package-bound asset data. Compare observed content to the planned exact prefix; never overwrite extras. Treat uncertain create/upload through observation, not blind retry.

- [ ] **Step 4: Run focused GREEN**

Run: `pnpm vitest run tests/x-article/article-execution.test.ts tests/x-article/article-editor-protocol.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harnesses/research-publishing/core/x-article-execution.ts harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts harnesses/research-publishing/adapters/x/article-browser/article-command-broker.ts harnesses/research-publishing/contracts/x-article-browser-command.schema.json harnesses/research-publishing/contracts/x-article-execution-event.schema.json tests/x-article/article-execution.test.ts tests/x-article/article-editor-protocol.test.ts
git commit -m "feat: orchestrate deterministic X Article editing"
```

### Task 5: Browser Adapter and at-most-once Publish barrier

**Files:**
- Create: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- Create: `tests/x-article/article-browser-adapter.test.ts`
- Create: `tests/security/x-article-browser-security.test.ts`

**Interfaces:**
- Consumes: immutable Plan, valid Approval, browser capability manifest, claimed commands, and reported observations.
- Produces: resumable execution snapshots and exactly one final `publish_article_once` command.

- [ ] **Step 1: Write failing adapter and security tests**

```ts
await adapter.start(plan, approval, chromeCapabilities);
await driveToPreviewVerified(adapter, executionId);
const publish = await adapter.next(executionId);
expect(publish.command?.payload.kind).toBe('publish_article_once');
await expect(adapter.next(executionId)).rejects.toMatchObject({ code: 'COMMAND_REPLAY_REJECTED' });
await expect(adapter.start(planWithEscapingAsset, approval, chromeCapabilities))
  .rejects.toMatchObject({ code: 'WORKSPACE_PATH_INVALID' });
```

- [ ] **Step 2: Run focused RED**

Run: `pnpm vitest run tests/x-article/article-browser-adapter.test.ts tests/security/x-article-browser-security.test.ts`
Expected: FAIL because the adapter is missing.

- [ ] **Step 3: Implement adapter lifecycle and barriers**

Reuse WorkspaceStore atomic writes and the existing append-only execution conventions. Verify Approval at start and again immediately before persisting `publish_armed`; persist attempt and consumed-command evidence before returning the final command. After `publish_attempted`, expose only status and `resumeVerification` paths.

- [ ] **Step 4: Run focused GREEN**

Run: `pnpm vitest run tests/x-article/article-browser-adapter.test.ts tests/security/x-article-browser-security.test.ts`
Expected: PASS, including one final publish command across retry/restart simulations.

- [ ] **Step 5: Commit**

```bash
git add harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts tests/x-article/article-browser-adapter.test.ts tests/security/x-article-browser-security.test.ts
git commit -m "feat: add at-most-once X Article browser publishing"
```

### Task 6: Public Article verification and immutable Receipt

**Files:**
- Create: `harnesses/research-publishing/adapters/x/article-browser/article-public-verifier.ts`
- Create: `harnesses/research-publishing/adapters/x/article-browser/article-receipt.ts`
- Create: `harnesses/research-publishing/contracts/x-article-publish-receipt.schema.json`
- Create: `tests/x-article/article-public-verifier.test.ts`
- Create: `tests/x-article/article-receipt.test.ts`

**Interfaces:**
- Consumes: Plan, execution snapshot, public Article observation, source/editor/preview evidence.
- Produces: full match, media-unverified, conflict, or unknown verification and immutable `XArticlePublishReceiptV1`.

- [ ] **Step 1: Write failing verification and receipt tests**

```ts
expect(verifyPublicXArticle(plan, publicArticle)).toMatchObject({ kind: 'full_match' });
expect(verifyPublicXArticle(plan, { ...publicArticle, title: 'Changed' })).toMatchObject({ kind: 'conflict' });
expect(createXArticleReceipt(inputWithoutPublicAlt)).toMatchObject({
  status: 'published_media_unverified',
  evidence: { public_article: { alt_text_match: null } }
});
```

- [ ] **Step 2: Run focused RED**

Run: `pnpm vitest run tests/x-article/article-public-verifier.test.ts tests/x-article/article-receipt.test.ts`
Expected: FAIL because verifier, receipt, and schema do not exist.

- [ ] **Step 3: Implement strict normalized verification**

Compare author, title, block kinds/text/order, expanded links, image count/order and observable Alt. Never compare public transcoded bytes to source digest. Persist a new immutable receipt for each evidence upgrade; never mutate an older receipt.

- [ ] **Step 4: Run focused GREEN**

Run: `pnpm vitest run tests/x-article/article-public-verifier.test.ts tests/x-article/article-receipt.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add harnesses/research-publishing/adapters/x/article-browser/article-public-verifier.ts harnesses/research-publishing/adapters/x/article-browser/article-receipt.ts harnesses/research-publishing/contracts/x-article-publish-receipt.schema.json tests/x-article/article-public-verifier.test.ts tests/x-article/article-receipt.test.ts
git commit -m "feat: verify public X Articles and issue receipts"
```

### Task 7: CLI, Skill routing, manifest, and user documentation

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `skills/x-publishing-copilot/SKILL.md`
- Create: `skills/x-publishing-copilot/references/x-article-browser-flow.md`
- Modify: `README.md`
- Modify: `docs/guides/quickstart.md`
- Modify: `docs/architecture/research-publishing-harness-design.zh-CN.md`
- Modify: `registry/harnesses.json`
- Modify: `registry/manifests/research-publishing.json` via manifest generator
- Test: `tests/cli/cli.test.ts`
- Test: `tests/skills/skill-boundary.test.ts`
- Test: `tests/tools/manifest-content.test.ts`

**Interfaces:**
- Consumes: the service, approval, adapter, and verifier APIs from Tasks 2–6.
- Produces: `x-article plan|approve|browser ...` commands and Skill routing instructions.

- [ ] **Step 1: Write failing CLI and Skill boundary tests**

```ts
expect(await invoke('x-article plan', planInput)).toMatchObject({ ok: true, operation: 'x-article plan' });
expect(await invoke('x-article browser status', statusInput)).toMatchObject({ ok: true });
expect(xSkill).toContain('Never convert an X Article to a Thread');
expect(xSkill).toContain('x-article browser next');
```

- [ ] **Step 2: Run focused RED**

Run: `pnpm vitest run tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts`
Expected: FAIL because commands, routing, and manifest capabilities are absent.

- [ ] **Step 3: Implement CLI and documentation surface**

Add `x-article plan`, `approve`, `browser start|next|claim|report|status|resume-verification|cancel-before-publish`. Extend the existing X Skill rather than adding a third top-level Skill. Document explicit action-time approval for real file upload and final public Publish. Update architecture scope to mark X Articles supported only through the new branch.

- [ ] **Step 4: Rebuild manifest and run focused GREEN**

Run: `pnpm manifest`

Run: `pnpm vitest run tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts`
Expected: PASS and manifest includes all new production/contracts/reference files.

- [ ] **Step 5: Commit**

```bash
git add harnesses/research-publishing/cli/index.ts skills/x-publishing-copilot README.md docs/guides/quickstart.md docs/architecture/research-publishing-harness-design.zh-CN.md registry tests/cli/cli.test.ts tests/skills/skill-boundary.test.ts tests/tools/manifest-content.test.ts
git commit -m "docs: expose the X Article publishing workflow"
```

### Task 8: End-to-end, recovery, acceptance audit, and delivery records

**Files:**
- Create: `tests/integration/x-article-browser-workflow.test.ts`
- Modify: `tools/acceptance.ts`
- Modify: `.llm-wiki/requirements/x-article-browser-publishing-v3.md`
- Create: `.llm-wiki/verification/x-article-browser-publishing-v3.md`
- Create: `.llm-wiki/handoff/x-article-browser-publishing-v3-handoff.md`

**Interfaces:**
- Consumes: the complete feature.
- Produces: requirement-by-requirement proof and a reproducible handoff.

- [ ] **Step 1: Write failing end-to-end and crash-recovery tests**

```ts
const run = await finalizeSyntheticArticleWithVisuals(store);
const plan = await xArticle.plan(run, '@Glen56121');
const approval = approveXArticlePublication(plan, 'human', 300_000, now);
const execution = await adapter.start(plan, approval, capabilities);
await driveFakeChromeThroughEditorPreviewAndPublish(execution);
expect(await adapter.status(execution.execution_id)).toMatchObject({ state: 'finalized' });
expect(await countFinalPublishCommands(store, execution.execution_id)).toBe(1);
```

- [ ] **Step 2: Run focused RED, then implement integration glue**

Run: `pnpm vitest run tests/integration/x-article-browser-workflow.test.ts`
Expected before glue: FAIL at the first missing integration boundary.

Implement only the missing orchestration needed to drive the production CLI/service/adapter path; do not create a test-only publishing path.

- [ ] **Step 3: Run focused and complete project verification**

Run: `pnpm vitest run tests/integration/x-article-browser-workflow.test.ts`
Expected: PASS.

Run: `pnpm check`
Expected: lint, typecheck, all Vitest suites, and acceptance exit 0.

Run: `git diff --check`
Expected: no output.

- [ ] **Step 4: Perform a non-publishing Chrome smoke**

Use the existing Chrome session only to verify account, Premium Articles entry, editor page type, and current Contract control set. Do not type content, upload files, or click final Publish without separate action-time Human confirmation. Record the observed contract version and limitations, not secrets or full DOM.

- [ ] **Step 5: Audit all 20 acceptance criteria and write lifecycle evidence**

For each numbered item in `.llm-wiki/requirements/x-article-browser-publishing-v3.md`, cite a source file/test/command result. Mark Flow Record design/plan/development/testing/archive from actual evidence; do not mark external CI or real publication as passed.

- [ ] **Step 6: Commit final verification and handoff**

```bash
git add tests/integration/x-article-browser-workflow.test.ts tools/acceptance.ts .llm-wiki/requirements/x-article-browser-publishing-v3.md .llm-wiki/verification/x-article-browser-publishing-v3.md .llm-wiki/handoff/x-article-browser-publishing-v3-handoff.md
git commit -m "test: verify X Article browser publishing v3"
```
