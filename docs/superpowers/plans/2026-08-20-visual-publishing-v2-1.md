# Visual Publishing V2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved static-image Article-to-X Visual Publishing V2.1 flow with deterministic package, approval, browser-upload, public-evidence, compatibility, and security guarantees.

**Architecture:** Add one shared `VisualAssetRef` and versioned V2.1 contracts, while keeping visual semantics in the Article/Visual workflow. Normalize image bytes into the Article run staging area, atomically finalize a self-contained Canonical Package, and let X reuse only an explicitly selected asset. Extend the existing Browser V2 state machine and receipt model rather than creating a second publisher.

**Tech Stack:** Node.js 20.19+, TypeScript 6, pnpm 11.19, Vitest 4, AJV JSON Schema, Sharp (exact version) for safe decode/metadata-stripping normalization.

## Execution Status

- Tasks 1–8: implemented with focused contract, normalization, Article, X, Browser, security, CLI and offline acceptance tests.
- Task 9: local verification and 20-criterion evidence audit completed in `.llm-wiki/verification/visual-publishing-v2-1.md`; delivery commit is created only after the final fresh check.
- The detailed checkboxes below are the prospective red-green procedure retained as the implementation record; the authoritative completion state is the Change Brief Flow Record and verification report.

## Global Constraints

- Canonical Markdown Article Package is the long-form and image fact source; it is self-contained and uses package-relative paths.
- Harness owns validation, normalization, digest, locking and packaging; Visual Skill owns semantic choice and creation only.
- Only PNG, JPEG and static WebP are supported; reject GIF, SVG, animation, video and multiple X images.
- A V2.1 X Plan contains zero or one item attachment; a Thread attachment is allowed only at `ordinal: 1`.
- `article handoff-x` must receive an explicit `asset_id`; never infer one.
- One final Approval binds account, adapter, mode, ordered text, asset identity/digest/MIME/Alt/claims, item ordinal and `publish_once`.
- Browser Host may upload only the locked Package-relative file after containment, regular-file, non-symlink, MIME and digest revalidation.
- Preserve V2 write-ahead Submit Barrier, consumed-command replay protection, at-most-once recovery, V2.0 text-only Browser, existing Article, and V1 Manual behavior.
- CI and acceptance use synthetic images and fake browser observations only; no real X submission is permitted.
- V2.2 LLM Wiki access, X Articles, dynamic media, hosting, automatic selection and generic media-platform abstractions are out of scope.

---

### Task 1: Versioned visual and X V2.1 contracts

**Files:**
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `harnesses/research-publishing/core/errors.ts`
- Create: `harnesses/research-publishing/contracts/visual-asset-ref.schema.json`
- Create: `harnesses/research-publishing/contracts/visual-manifest.schema.json`
- Create: `harnesses/research-publishing/contracts/visual-review-report.schema.json`
- Create: `harnesses/research-publishing/contracts/publication-plan-v2-1.schema.json`
- Create: `harnesses/research-publishing/contracts/approval-v2-1.schema.json`
- Create: `harnesses/research-publishing/contracts/publish-receipt-v2-1.schema.json`
- Modify: `harnesses/research-publishing/contracts/article-draft.schema.json`
- Test: `tests/contracts/contracts.test.ts`
- Test: `tests/core/schema-validator.test.ts`

**Interfaces:**
- Produces: `VisualAssetRef`, `VisualSlot`, `ArticleVisualManifest`, `VisualReviewReport`, new visual error codes, and schema names accepted by `validateContract`.
- Compatibility: existing schema versions remain byte-compatible and readable; V2.1 is additive.

- [ ] **Step 1: Write failing schema tests** that validate a Visual Slot draft, minimal asset/manifest/review, V2.1 item attachment and media receipt, while asserting animation/multiple attachments/missing Alt/invalid Claim refs are rejected.
- [ ] **Step 2: Run `pnpm vitest run tests/contracts/contracts.test.ts tests/core/schema-validator.test.ts`** and confirm failure because new contract names and schemas are absent.
- [ ] **Step 3: Add the exact interfaces and strict JSON Schemas.** `VisualAssetRef` has `asset_id`, `relative_path`, `sha256:` digest, static MIME, non-empty `alt_text`, and non-empty unique `claim_refs`; schemas use `additionalProperties: false`.
- [ ] **Step 4: Add all V2.1 error codes** from design §18 to the `ErrorCode` union without changing existing codes.
- [ ] **Step 5: Run the focused contract tests** and confirm all pass.

### Task 2: Secure binary workspace and deterministic image normalization

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `harnesses/research-publishing/core/workspace-store.ts`
- Create: `harnesses/research-publishing/core/visual-assets.ts`
- Create: `tests/fixtures/visual-assets.ts`
- Create: `tests/core/visual-assets.test.ts`
- Modify: `tests/core/workspace-store.test.ts`
- Test: `tests/security/adversarial.test.ts`

**Interfaces:**
- Produces: `WorkspaceStore.writeNewBytes`, `readBytes`, `resolveRegularFile`; `VisualAssetImporter.attach(input): Promise<VisualCandidate>`; `verifyPackageVisualAsset(root, asset)`.
- Normalization: `sharp(..., { animated: true, failOn: 'error', limitInputPixels })`, reject `pages !== 1`, output PNG/JPEG/WebP with metadata stripped, fixed normalization version and deterministic encoder options.

- [ ] **Step 1: Add synthetic PNG/JPEG/static-WebP plus EXIF-bearing, GIF, animated-WebP, SVG, corrupt and disguised fixtures** entirely in test setup.
- [ ] **Step 2: Write failing tests** for stable normalized digest, decode/signature agreement, configured byte/dimension/pixel limits, metadata stripping, symlink/directory/path escape rejection, atomic binary writes and package revalidation.
- [ ] **Step 3: Run `pnpm vitest run tests/core/visual-assets.test.ts tests/core/workspace-store.test.ts tests/security/adversarial.test.ts`** and confirm the importer/binary APIs are missing.
- [ ] **Step 4: Add exact-version Sharp and implement binary workspace primitives** using exclusive temporary files, fsync, atomic hard-link/rename, `lstat` and realpath containment.
- [ ] **Step 5: Implement `visual-assets.ts`** so extension is never trusted, supported format and animation are determined after complete decode, metadata is removed, the normalized copy is stored under `runs/<run>/article/visual-candidates/<candidate>/`, and all public refs use normalized bytes.
- [ ] **Step 6: Run focused tests** and confirm pass with no metadata or path escape.

### Task 3: Article Visual lifecycle and Canonical Package digest

**Files:**
- Modify: `harnesses/research-publishing/branches/article-harness/article-service.ts`
- Modify: `harnesses/research-publishing/contracts/article-draft.schema.json`
- Create: `tests/article/article-visual-service.test.ts`
- Modify: `tests/article/article-service.test.ts`
- Modify: `tests/integration/article-workflow.test.ts`
- Modify: `tests/golden/article-package.test.ts`

**Interfaces:**
- Produces: `visualStatus(runId)`, `attachVisual(runId,input)`, `removeVisual(runId,slotId,candidateId)`, `reviewVisual(runId,input)`, `finalizeArticle(runId)`, `createXHandoff(runId, assetId?)`.
- Package facts: `article.md`, metadata, claim map, lineage/sources, boundary, content review, `visual-review-report.json`, `visual-manifest.json`, selected normalized assets and optional editable source; stable sorted file-digest list excludes `package-ref.json` and post-finalize `x-handoff.json`.

- [ ] **Step 1: Write failing lifecycle tests** for required/optional slots, Content Review prerequisite, valid Claim refs, candidate replacement/selection, immutable finalized assets, Markdown placement, undeclared local-image blocking, optional warnings and explicit handoff asset selection.
- [ ] **Step 2: Run `pnpm vitest run tests/article/article-visual-service.test.ts tests/article/article-service.test.ts tests/integration/article-workflow.test.ts tests/golden/article-package.test.ts`** and confirm the visual methods and artifacts are absent.
- [ ] **Step 3: Extend Article Draft additively** with optional `visual_slots` and stable section identifiers, treating absence as the V1 text-only path.
- [ ] **Step 4: Implement staged candidate state and Visual Review** requiring all five semantic flags (`claim_alignment`, `boundary_alignment`, `mobile_legibility`, `single_message`, `privacy_review`) before a candidate is selectable.
- [ ] **Step 5: Implement final rendering and manifest/digest creation** with package-relative Markdown, exact placement ordinals and atomic new-only artifacts; verify retries return an identical existing ref only.
- [ ] **Step 6: Implement X Handoff V2.1** that carries zero or one exact `VisualAssetRef` and package identity, rejects unknown `asset_id`, and never modifies the frozen digest.
- [ ] **Step 7: Run focused Article tests** and confirm both visual and legacy text-only flows pass.

### Task 4: X Publication Plan V2.1 and single Approval binding

**Files:**
- Create: `harnesses/research-publishing/core/publication-plan-v2-1.ts`
- Create: `harnesses/research-publishing/core/approval-v2-1.ts`
- Modify: `harnesses/research-publishing/branches/x-harness/x-service.ts`
- Create: `tests/fixtures/publication-plan-v2-1.ts`
- Create: `tests/x/publication-plan-v2-1.test.ts`
- Create: `tests/x/approval-v2-1.test.ts`
- Modify: `tests/x/publication-plan-v2.test.ts`
- Modify: `tests/x/approval-v2.test.ts`
- Modify: `tests/x/x-service.test.ts`

**Interfaces:**
- Produces: `PublicationPlanV2_1`, `createPublicationPlanV2_1`, `assertPublicationPlanV2_1`, `ApprovalV2_1`, `approvePublicationV2_1`, `verifyApprovalV2_1` and X service planning from an explicit handoff.
- Compatibility: shared browser consumers accept `PublicationPlanV2 | PublicationPlanV2_1`; only matching approval version may approve a plan.

- [ ] **Step 1: Write failing tests** for plan digest changes on pixels/digest, Alt, Claim refs, ordinal, account, adapter, mode, text and action; reject >1 image, non-first Thread image and an attachment outside the handoff.
- [ ] **Step 2: Run the focused V2/V2.1 plan and approval suites** and confirm new creators are absent while V2 tests still pass.
- [ ] **Step 3: Implement normalized V2.1 intent and validation** with item-level ordered `attachments`; do not carry V2.0 top-level `media` into V2.1.
- [ ] **Step 4: Implement Approval V2.1** whose digest includes the full plan digest, identity, mode, adapter and `publish_once`, and which rejects V2.0/V2.1 cross-version use.
- [ ] **Step 5: Extend X Service** to consume only an explicitly supplied Article handoff asset; leave V1 Manual and V2.0 text-only planning unchanged.
- [ ] **Step 6: Run focused tests** and confirm compatibility plus stale-approval behavior.

### Task 5: Restricted upload commands and Composer attachment verification

**Files:**
- Modify: `harnesses/research-publishing/adapters/x/browser/browser-protocol.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/command-broker.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/page-contract.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/composer-protocol.ts`
- Modify: `harnesses/research-publishing/contracts/browser-command.schema.json`
- Modify: `harnesses/research-publishing/contracts/browser-observation.schema.json`
- Modify: `tests/fixtures/x-browser-observations.ts`
- Modify: `tests/x/browser-command-broker.test.ts`
- Modify: `tests/x/composer-protocol.test.ts`
- Modify: `tests/x/x-page-contract.test.ts`
- Modify: `tests/security/browser-adapter-security.test.ts`

**Interfaces:**
- Produces: capability flags `file_upload` and `attachment_alt_text`; commands `upload_attachment` and `set_attachment_alt_text`; per-item `attachments` observation including state/type/Alt/unknown ownership.
- Command envelope binds execution, command, revision, ordinal, package root identity, relative path, expected digest/MIME, x.com origin and write side effect.

- [ ] **Step 1: Write failing protocol/security tests** for missing capabilities, plan-external file, wildcard/directory/symlink/path escape, forged Skill command, unknown existing attachment, wrong ordinal/count/type/Alt and upload-altered text.
- [ ] **Step 2: Run the focused broker/composer/page/security suites** and confirm command kinds and observations are rejected or absent.
- [ ] **Step 3: Extend strict schemas and page contract** to observe attachment count/type/ordinal/Alt/accessibility/status/ownership without capturing DOM or file-picker history.
- [ ] **Step 4: Implement constrained command issuance and host-side source verification** using locked package identity and `verifyPackageVisualAsset` immediately before upload.
- [ ] **Step 5: Extend composer decision flow** after text population: upload once, re-observe on uncertainty, retry only after explicit absence, set exact Alt, re-read text/attachment/account/revision, and only then produce existing Submit Barrier input.
- [ ] **Step 6: Run focused tests** and confirm all fail-closed paths plus V2 text-only behavior.

### Task 6: Browser execution, recovery, public media verification and Receipt V2.1

**Files:**
- Modify: `harnesses/research-publishing/core/browser-execution.ts`
- Modify: `harnesses/research-publishing/core/execution-store.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/browser-adapter.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/outcome-resolver.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/public-verifier.ts`
- Create: `harnesses/research-publishing/adapters/x/browser/receipt-v2-1.ts`
- Modify: `tests/core/browser-execution.test.ts`
- Modify: `tests/x/browser-adapter.test.ts`
- Modify: `tests/x/outcome-resolver.test.ts`
- Modify: `tests/x/public-verifier.test.ts`
- Create: `tests/x/receipt-v2-1.test.ts`
- Modify: `tests/integration/x-browser-workflow.test.ts`

**Interfaces:**
- Produces: the existing execution state machine with attachment events between composer preparation and verification; public post media observations; immutable V2.1 receipts with `MediaEvidenceV2_1` and optional `supersedes_receipt_id`.
- Statuses: `finalized`, `published_media_unverified`, `verification_conflict`; no post-submit upload or submit retry.

- [ ] **Step 1: Write failing Fake Browser tests** for happy upload/Alt/submit/public verify; upload failure; uncertain upload resolved present/absent/unknown; submit timeout with public recovery; media fields unavailable; public count/Alt/type conflict; restart and duplicate Submit rejection.
- [ ] **Step 2: Run focused browser/recovery/receipt suites** and confirm missing V2.1 evidence behavior.
- [ ] **Step 3: Extend state/events additively** without changing the write-ahead claim and consumed-command rules; store only relative path/digest/observation evidence, never image copies or arbitrary page data.
- [ ] **Step 4: Extend public verification** to match account/Post ID/count/type/Alt when observable, explicitly treating public bytes as incomparable with source SHA-256.
- [ ] **Step 5: Implement immutable Receipt V2.1** with independent Source/Composer/Public booleans, limitations and honest downgrade; later stronger evidence creates a new superseding receipt.
- [ ] **Step 6: Run focused suites** and confirm no post-submit mutation path exists.

### Task 7: CLI, Skills, fixtures, registry and documentation

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `skills/article-publishing-copilot/SKILL.md`
- Modify: `skills/x-publishing-copilot/SKILL.md`
- Modify: `skills/x-publishing-copilot/references/browser-adapter-flow.md`
- Modify: `harnesses/research-publishing/examples/synthetic/article-draft.json`
- Create: `harnesses/research-publishing/examples/synthetic/assets/visual-v2-1.png`
- Modify: `README.md`
- Modify: `docs/guides/quickstart.md`
- Modify: `docs/architecture/research-publishing-harness-design.zh-CN.md`
- Modify: `registry/manifests/research-publishing.json`
- Modify: `tests/cli/cli.test.ts`
- Modify: `tests/skills/skill-boundary.test.ts`
- Modify: `tests/tools/manifest-content.test.ts`

**Interfaces:**
- CLI adds `article visual status|attach|remove|review`, `article handoff-x --asset-id` through input, V2.1 `x plan|approve|browser` dispatch, while preserving current JSON output and exit-code groups.

- [ ] **Step 1: Write failing CLI/Skill/manifest tests** covering every visual operation, explicit asset selection, V2.1 approval dispatch, capability preflight and thin-Skill prohibition on direct filesystem/browser publication.
- [ ] **Step 2: Run focused CLI/Skill/manifest tests** and confirm commands/docs are absent.
- [ ] **Step 3: Wire CLI service methods and stable errors** without embedding importer, digest or Browser logic in the command layer.
- [ ] **Step 4: Update Skills and docs** with Article-first visual workflow, exact X selection/approval, Source-Composer-Public evidence, text-only compatibility and real-smoke `submit_armed` default.
- [ ] **Step 5: Add synthetic static image fixture and registry entries** without real identities, secrets or external URLs as image facts.
- [ ] **Step 6: Run focused tests** and confirm thin boundaries plus generated manifest content.

### Task 8: Full acceptance, security matrix and compatibility proof

**Files:**
- Modify: `tools/acceptance.ts`
- Create: `tests/acceptance/visual-publishing-v2-1.test.ts`
- Modify: `tests/security/publication-lock.test.ts`
- Modify: `tests/security/browser-adapter-security.test.ts`
- Modify: `tests/integration/package-lifecycle.test.ts`
- Modify: `tests/integration/x-manual-workflow.test.ts`

**Interfaces:**
- Produces: a network-free Article → explicit handoff → V2.1 Browser fake-page acceptance artifact, plus explicit compatibility/security regression coverage.

- [ ] **Step 1: Write failing end-to-end acceptance** using generated synthetic images and a Fake Browser, ending in a V2.1 receipt with all three evidence classes.
- [ ] **Step 2: Add failure/recovery acceptance cases** for each design §21 Fake Browser and Security bullet, including no-real-X side-effect assertions.
- [ ] **Step 3: Run `pnpm vitest run tests/acceptance/visual-publishing-v2-1.test.ts tests/security tests/integration`** and confirm failures identify any remaining implementation gaps.
- [ ] **Step 4: Fix each gap with a focused red-green cycle** in the owning module; do not weaken assertions or error contracts.
- [ ] **Step 5: Run `pnpm acceptance`** and confirm Article, Manual, Browser V2 text-only and Visual V2.1 scenarios all exit 0 offline.

### Task 9: Verification, 20-criterion evidence audit and delivery

**Files:**
- Create: `.llm-wiki/verification/visual-publishing-v2-1.md`
- Modify: `.llm-wiki/requirements/visual-publishing-v2-1.md`
- Modify: `.llm-wiki/working-context/visual-publishing-v2-1.md`
- Create: `.llm-wiki/handoff/visual-publishing-v2-1-handoff.md`

**Interfaces:**
- Produces: fresh command evidence, exact test counts, a 1–20 acceptance table pointing to direct tests/artifacts, final Flow Record and commit identity.

- [ ] **Step 1: Run `pnpm check`** and read the complete lint, typecheck, test/build and acceptance output; any failure returns to the owning TDD task.
- [ ] **Step 2: Run `git diff --check`** and inspect `git diff --stat`, `git status --short`, generated manifests and public artifacts for paths/secrets/real-publication claims.
- [ ] **Step 3: Audit design §25 criteria 1–20 individually** and record direct implementation/test/acceptance evidence; indirect suite success is not sufficient evidence.
- [ ] **Step 4: Perform a material-change self-review** for boundary weakening, unsafe path/file handling, version migration, at-most-once regression and untested recovery paths; fix findings with red-green tests.
- [ ] **Step 5: Re-run full `pnpm check` and `git diff --check` after all fixes**, then update lifecycle/verification/handoff documents with the fresh outputs.
- [ ] **Step 6: Commit all V2.1 implementation and documentation on current `main`** with a descriptive commit message, then run `git status --short` and require a clean worktree.

## Plan Self-Review

- Spec coverage: tasks 1–8 cover design §§7–22; task 9 directly audits all 20 criteria in §25.
- Placeholder scan: no deferred implementation placeholders are present; every task names exact files, interfaces, failing-test evidence and verification commands.
- Type consistency: `VisualAssetRef` flows unchanged from Article Manifest → X Handoff → V2.1 item attachment → Approval digest → upload command → Receipt evidence; V2.0 types remain separate compatibility contracts.
- Scope: no V2.2, dynamic media, multi-image, automatic asset selection, hosting, X Articles or real account publication is introduced.
