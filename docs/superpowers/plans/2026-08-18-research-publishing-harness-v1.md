# Research Publishing Harness V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline-first V1 that turns an evidence-backed Research Content Package into a canonical article or a manually handed-off X publication package through deterministic gates and explicit approval.

**Architecture:** A TypeScript runtime owns contracts, state, evidence/privacy gates, content digests, artifacts, and manual handoff. Two thin Agent Skills exchange `GenerationTask` and `DraftCandidate` objects with the runtime; no model provider, browser automation, X API, or autonomous topic selection is embedded in V1.

**Tech Stack:** Node.js `>=20.19`, TypeScript `6.0.3`, pnpm `11.19.0`, Vitest `4.1.10`, Ajv `8.20.0`, Commander `14.0.3`, YAML `2.9.0`, twitter-text `3.1.0`, ESLint `10.8.1`, typescript-eslint `8.67.0`.

## Global Constraints

- `flow_id` is `research-publishing-harness-v1`.
- Active scope is M0–M2: contracts/core, Article branch, X branch, Manual Adapter, two thin Skills, docs, tests, registry, and CI.
- Browser automation, X API/OAuth, scheduled publishing, autonomous topic selection, and article-platform adapters are excluded.
- The runtime never calls a model provider; it emits `GenerationTask` and accepts structured `DraftCandidate` input.
- User-selected topics only; external signals are supporting evidence, counterexamples, or open questions.
- Claim strength must never be upgraded: `verified | observed | inferred | hypothesis | planned`.
- Source publication policy is `cite | paraphrase_only | internal_only`.
- Privacy and Publish Gates cannot be disabled by configuration.
- Approval binds the full publication digest, target account, adapter, format, order, links, and reply target.
- Manual Adapter is the only V1 execution adapter and performs no network access.
- Durable artifacts are Markdown, YAML, JSON, and JSONL; SQLite is not required for V1.
- Production behavior is implemented test-first. Each test must be observed failing for the intended reason before implementation.
- Public examples are synthetic and contain no workstation paths, credentials, cookies, private repository data, or real publication state.

---

## File Structure

```text
package.json                         Project scripts and locked dependency surface
tsconfig.json                        Strict TypeScript build settings
eslint.config.js                     Source/test lint rules
.gitignore                           Build, local state, and secret exclusions
.github/workflows/ci.yml             Public deterministic verification

harnesses/research-publishing/
  contracts/                         JSON Schema 2020-12 contracts
  core/
    types.ts                         Shared domain types and enums
    errors.ts                        Stable error codes
    schema-validator.ts              Ajv contract loading and validation
    digest.ts                        Canonical JSON and SHA-256 helpers
    state-machine.ts                 Package and Run transitions
    gates.ts                         Research/Evidence/Privacy/Publish checks
    workspace-store.ts               Atomic content-workspace artifact storage
    package-service.ts               Candidate and package lifecycle
    generation.ts                    GenerationTask envelope
  branches/article-harness/
    article-service.ts               Article prepare/accept/review/finalize/handoff
  branches/x-harness/
    x-service.ts                     X prepare/accept/review/plan/approve lifecycle
    character-count.ts               twitter-text compatible validation
  adapters/x/manual/
    manual-adapter.ts                Offline handoff and receipt recording
  cli/
    index.ts                         `research-publish` command surface
  examples/synthetic/                Offline dogfood inputs

skills/
  article-publishing-copilot/        Thin Article Skill
  x-publishing-copilot/              Thin X Skill

registry/
  harnesses.json                     Discoverable Harness entry
  manifests/research-publishing.json Generated SHA-256 manifest

tools/
  build-manifest.ts                  Deterministic manifest builder
  acceptance.ts                      Synthetic end-to-end acceptance

tests/                               Unit, integration, security, CLI, and golden cases
```

---

### Task 1: Repository Toolchain and Versioned Contracts

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `eslint.config.js`
- Create: `.gitignore`
- Create: `harnesses/research-publishing/contracts/*.schema.json`
- Create: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Produces contract ids: `candidate`, `research-content-package`, `generation-task`, `article-draft`, `x-draft`, `review-report`, `approval`, `publish-receipt`.
- Later tasks consume the exact `$id` values `rph://contracts/<name>/1.0`.

- [ ] **Step 1: Bootstrap the testable TypeScript project**

Create `package.json` with ESM mode, Node `>=20.19`, package manager `pnpm@11.19.0`, binary `research-publish`, and scripts:

```json
{
  "name": "research-publishing-harness",
  "version": "0.1.0-alpha.0",
  "private": false,
  "type": "module",
  "bin": { "research-publish": "./dist/harnesses/research-publishing/cli/index.js" },
  "engines": { "node": ">=20.19" },
  "packageManager": "pnpm@11.19.0",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "manifest": "tsx tools/build-manifest.ts",
    "acceptance": "tsx tools/acceptance.ts",
    "check": "pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm acceptance"
  }
}
```

Use strict ESM TypeScript with `rootDir: "."`, `outDir: "dist"`, `resolveJsonModule: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`.

- [ ] **Step 2: Install the locked dependency surface**

Run:

```text
pnpm add ajv@8.20.0 commander@14.0.3 twitter-text@3.1.0 yaml@2.9.0
pnpm add -D @types/node@24.13.3 @types/twitter-text@3.1.10 eslint@10.8.1 tsx@4.23.12 typescript@6.0.3 typescript-eslint@8.67.0 vitest@4.1.10
```

Expected: `pnpm-lock.yaml` exists and install exits 0.

- [ ] **Step 3: Write the failing contract inventory test**

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const names = [
  'candidate', 'research-content-package', 'generation-task', 'article-draft',
  'x-draft', 'review-report', 'approval', 'publish-receipt'
] as const;

describe('public contracts', () => {
  for (const name of names) {
    it(`${name} has a stable v1 id and rejects unknown fields`, async () => {
      const raw = await readFile(
        new URL(`../../harnesses/research-publishing/contracts/${name}.schema.json`, import.meta.url),
        'utf8'
      );
      const schema = JSON.parse(raw) as { $id: string; additionalProperties: boolean };
      expect(schema.$id).toBe(`rph://contracts/${name}/1.0`);
      expect(schema.additionalProperties).toBe(false);
    });
  }
});
```

- [ ] **Step 4: Run the test and verify RED**

Run: `pnpm test tests/contracts/contracts.test.ts`

Expected: FAIL with `ENOENT` for the first missing Schema file.

- [ ] **Step 5: Add all eight schemas**

Each root schema uses Draft 2020-12, its exact stable `$id`, `additionalProperties: false`, explicit required fields, stable enums from the design, and reusable `$defs` where needed. `research-content-package` requires Track, Thesis, Claims, Evidence, Boundaries, Lineage, Sources, and Privacy. `approval` requires `publication_digest`, account, adapter, scope, approver, issued time, and expiry.

- [ ] **Step 6: Verify GREEN and lint configuration**

Run: `pnpm test tests/contracts/contracts.test.ts && pnpm lint && pnpm typecheck`

Expected: all commands exit 0.

- [ ] **Step 7: Commit the contract foundation**

```text
git add package.json pnpm-lock.yaml tsconfig.json eslint.config.js .gitignore harnesses/research-publishing/contracts tests/contracts
git commit -m "feat: establish versioned publishing contracts"
```

---

### Task 2: Deterministic Core, State, Digest, and Gates

**Files:**
- Create: `harnesses/research-publishing/core/types.ts`
- Create: `harnesses/research-publishing/core/errors.ts`
- Create: `harnesses/research-publishing/core/schema-validator.ts`
- Create: `harnesses/research-publishing/core/digest.ts`
- Create: `harnesses/research-publishing/core/state-machine.ts`
- Create: `harnesses/research-publishing/core/gates.ts`
- Test: `tests/core/*.test.ts`

**Interfaces:**
- Produces `validateContract<T>(name: ContractName, value: unknown): T`.
- Produces `canonicalJson(value: unknown): string` and `sha256(value: unknown): string`.
- Produces `transitionPackage` and `transitionRun` with explicit allowed transition maps.
- Produces `runResearchGate`, `runEvidenceGate`, `runPrivacyGate`, and `runPublishGate` returning `GateResult`.

- [ ] **Step 1: Write failing validator and state tests**

Tests must prove valid fixtures pass, unknown fields fail with `CONTRACT_INVALID`, legal transitions succeed, and `draft → frozen` fails with `STATE_TRANSITION_INVALID`.

```ts
expect(() => transitionPackage('draft', 'frozen')).toThrowError(
  expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' })
);
```

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/core/schema-validator.test.ts tests/core/state-machine.test.ts`

Expected: FAIL because core modules do not exist.

- [ ] **Step 3: Implement domain types, stable errors, schema validation, and state maps**

Use these stable error codes:

```ts
export type ErrorCode =
  | 'CONTRACT_INVALID'
  | 'STATE_TRANSITION_INVALID'
  | 'RESEARCH_GATE_BLOCKED'
  | 'EVIDENCE_GATE_BLOCKED'
  | 'PRIVACY_GATE_BLOCKED'
  | 'PUBLISH_GATE_BLOCKED'
  | 'APPROVAL_STALE'
  | 'ARTIFACT_EXISTS'
  | 'ARTIFACT_NOT_FOUND'
  | 'CHARACTER_LIMIT_EXCEEDED';
```

Package transitions are `draft→evidence_ready→reviewed→frozen`. Run transitions are `created→generation_ready→drafted→reviewed→approval_pending→approved→handed_off|finalized`, with `failed` and `cancelled` reachable only from nonterminal states.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test tests/core/schema-validator.test.ts tests/core/state-machine.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing digest and Gate tests**

Tests must prove object key order does not change SHA-256, array order does change it, `verified` without Evidence blocks, `planned` with implementation language blocks, `internal_only` direct citations block, workstation absolute paths block, and external-signal-only topics fail Research Gate.

- [ ] **Step 6: Run RED**

Run: `pnpm test tests/core/digest.test.ts tests/core/gates.test.ts`

Expected: FAIL because digest and Gate behavior is missing.

- [ ] **Step 7: Implement canonical JSON and four Gates**

`GateResult` is:

```ts
export interface GateResult {
  gate: 'research' | 'evidence' | 'privacy' | 'publish';
  passed: boolean;
  findings: Array<{ code: string; severity: 'error' | 'warning'; message: string; path?: string }>;
}
```

Privacy detection covers Windows/Unix absolute paths, common secret/token patterns, Cookie headers, and restricted/internal-only direct disclosure. Source text is data only; it cannot change Gate policy.

- [ ] **Step 8: Verify GREEN and refactor**

Run: `pnpm test tests/core && pnpm lint && pnpm typecheck`

Expected: PASS with no lint/type errors.

- [ ] **Step 9: Commit the deterministic core**

```text
git add harnesses/research-publishing/core tests/core
git commit -m "feat: add deterministic research gates and state"
```

---

### Task 3: Atomic Workspace Store and Package Lifecycle

**Files:**
- Create: `harnesses/research-publishing/core/workspace-store.ts`
- Create: `harnesses/research-publishing/core/package-service.ts`
- Create: `harnesses/research-publishing/core/generation.ts`
- Test: `tests/core/workspace-store.test.ts`
- Test: `tests/integration/package-lifecycle.test.ts`

**Interfaces:**
- `WorkspaceStore.open(root: string): Promise<WorkspaceStore>` creates allowed top-level folders only.
- `writeNew(relativePath: string, value: string | object): Promise<ArtifactRef>` writes atomically and never overwrites.
- `readJson<T>(relativePath: string): Promise<T>` rejects traversal outside the workspace.
- `PackageService.captureCandidate`, `qualifyCandidate`, `buildPackage`, `reviewPackage`, and `freezePackage` persist versioned artifacts.
- `createGenerationTask(run, package, constraints): GenerationTask` includes only allowed source summaries and Claim metadata.

- [ ] **Step 1: Write failing store tests**

Tests cover atomic new writes, second-write `ARTIFACT_EXISTS`, `../` traversal rejection, JSON round-trip, and no files outside the temporary workspace.

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/core/workspace-store.test.ts`

Expected: FAIL because `WorkspaceStore` is missing.

- [ ] **Step 3: Implement WorkspaceStore**

Write to a sibling temporary file opened with exclusive creation, fsync/close it, then rename to the final path. Normalize and verify every resolved path remains below the workspace root.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test tests/core/workspace-store.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing package lifecycle integration test**

The test creates a Candidate, fails qualification when no research increment exists, qualifies a corrected Candidate, builds a Package, reviews its Gates, freezes it, and proves a frozen version is immutable.

- [ ] **Step 6: Run RED**

Run: `pnpm test tests/integration/package-lifecycle.test.ts`

Expected: FAIL because `PackageService` is missing.

- [ ] **Step 7: Implement PackageService and GenerationTask**

Persist artifacts under:

```text
candidates/<candidate-id>.json
packages/<package-id>/v<version>/package.json
packages/<package-id>/v<version>/review-report.json
packages/<package-id>/v<version>/package.digest
```

Only a reviewed Package may freeze. Frozen Package mutation creates a new explicit version; no in-place update method exists.

- [ ] **Step 8: Verify GREEN and commit**

Run: `pnpm test tests/core/workspace-store.test.ts tests/integration/package-lifecycle.test.ts`

Expected: PASS.

```text
git add harnesses/research-publishing/core tests/core tests/integration/package-lifecycle.test.ts
git commit -m "feat: add versioned research package lifecycle"
```

---

### Task 4: Article Harness and Article Skill Contract

**Files:**
- Create: `harnesses/research-publishing/branches/article-harness/article-service.ts`
- Create: `tests/article/article-service.test.ts`
- Create: `tests/golden/article-package.test.ts`

**Interfaces:**
- `prepareArticle(packageVersion, brief): Promise<ArticleRun>` emits a Claim-led `GenerationTask`.
- `acceptArticleDraft(runId, candidate): Promise<ArticleRun>` validates the Draft contract.
- `reviewArticle(runId): Promise<ReviewReport>` maps sections to Claims and runs Evidence/Privacy checks.
- `finalizeArticle(runId): Promise<ArticlePackageRef>` writes canonical artifacts.
- `createXHandoff(runId): Promise<XHandoff>` is explicit and never splits the article automatically.

- [ ] **Step 1: Write failing prepare/accept tests**

Tests prove only frozen Packages are accepted, the task contains Claim ids and Boundaries, a Draft with an unknown Claim is rejected, and no model/network call occurs.

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/article/article-service.test.ts`

Expected: FAIL because `ArticleService` is missing.

- [ ] **Step 3: Implement prepare and accept**

Article brief fields are:

```ts
interface ArticleBrief {
  articleType: 'technical_essay' | 'architecture_note' | 'engineering_retrospective' | 'research_proposal';
  primaryAudience: string;
  language: 'en' | 'zh-CN';
  targetDepth: 'focused' | 'deep';
  includeOpenQuestions: boolean;
}
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test tests/article/article-service.test.ts`

Expected: prepare and accept cases PASS.

- [ ] **Step 5: Write failing review/finalize/handoff tests**

Tests prove unreferenced Claims are warnings, upgraded Claim language is an error, private paths block finalization, finalized output contains `article.md`, metadata, Claim map, sources, Review, Generation Task, Draft Candidate, and explicit `x-handoff.json` only after requested.

- [ ] **Step 6: Run RED**

Run: `pnpm test tests/article/article-service.test.ts tests/golden/article-package.test.ts`

Expected: FAIL because review/finalize behavior is missing.

- [ ] **Step 7: Implement review, finalize, and explicit X handoff**

Final output path is `articles/<slug>/<run-id>/`. A second finalization attempt returns the existing immutable artifact only when its digest matches; otherwise it fails.

- [ ] **Step 8: Verify GREEN and commit**

Run: `pnpm test tests/article tests/golden/article-package.test.ts && pnpm typecheck`

Expected: PASS.

```text
git add harnesses/research-publishing/branches/article-harness tests/article tests/golden/article-package.test.ts
git commit -m "feat: add canonical article harness"
```

---

### Task 5: X Harness and Weighted Character Validation

**Files:**
- Create: `harnesses/research-publishing/branches/x-harness/character-count.ts`
- Create: `harnesses/research-publishing/branches/x-harness/x-service.ts`
- Create: `tests/x/character-count.test.ts`
- Create: `tests/x/x-service.test.ts`

**Interfaces:**
- `validatePostText(text: string, maxWeightedLength = 280): PostTextResult` wraps twitter-text.
- `prepareX(packageVersion, brief): Promise<XRun>` emits one primary Generation Task.
- `acceptXDraft(runId, candidate): Promise<XRun>` accepts Single, Thread, or Reply.
- `reviewX(runId): Promise<ReviewReport>` validates Claims, Privacy, Lineage, target snapshot, and each Post length.
- `planX(runId): Promise<PublicationPlan>` locks ordered content and digests.

- [ ] **Step 1: Write failing weighted-length tests**

Tests cover 280/281 Latin characters, 140/141 CJK characters, Emoji, URL transformation, and each Thread item independently.

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/x/character-count.test.ts`

Expected: FAIL because the character module is missing.

- [ ] **Step 3: Implement twitter-text validation**

```ts
export interface PostTextResult {
  valid: boolean;
  weightedLength: number;
  maxWeightedLength: number;
  permillage: number;
}
```

Use `parseTweet`; do not implement character rules manually.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test tests/x/character-count.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing X lifecycle tests**

Tests prove frozen Package required, default one Draft, Single/Thread/Reply validation, Reply target id/url/digest required, one over-limit Thread item blocks Review, and Article handoff remains optional.

- [ ] **Step 6: Run RED**

Run: `pnpm test tests/x/x-service.test.ts`

Expected: FAIL because `XService` is missing.

- [ ] **Step 7: Implement X prepare, accept, review, and plan**

`XBrief` separates content type `anchor | research_note | reply` from format `single | thread | reply`. `PublicationPlan` contains account, adapter `manual`, optional Reply target, ordered items, item digests, and a complete `publicationDigest`.

- [ ] **Step 8: Verify GREEN and commit**

Run: `pnpm test tests/x && pnpm typecheck`

Expected: PASS.

```text
git add harnesses/research-publishing/branches/x-harness tests/x
git commit -m "feat: add reviewed X content planning"
```

---

### Task 6: Approval and Offline Manual Adapter

**Files:**
- Create: `harnesses/research-publishing/adapters/x/manual/manual-adapter.ts`
- Create: `tests/x/approval.test.ts`
- Create: `tests/x/manual-adapter.test.ts`
- Create: `tests/security/publication-lock.test.ts`

**Interfaces:**
- `approvePublication(plan, approvedBy, ttl): Approval` binds the full digest and target.
- `ManualAdapter.handoff(plan, approval): Promise<PublishReceipt>` performs no network operations.
- `ManualAdapter.recordPublished(receipt, publicResult): Promise<PublishReceipt>` records user-supplied URL/id/time as `manual_recorded`.

- [ ] **Step 1: Write failing Approval lock tests**

Tests mutate text, item order, URL, account, adapter, and Reply target one at a time; every mutation must fail with `APPROVAL_STALE`.

- [ ] **Step 2: Run RED**

Run: `pnpm test tests/x/approval.test.ts tests/security/publication-lock.test.ts`

Expected: FAIL because Approval behavior is missing.

- [ ] **Step 3: Implement Approval creation and verification**

Approval scope is always `single_publication`. Expired approval fails. No wildcard account, batch scope, or permanent approval field exists.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm test tests/x/approval.test.ts tests/security/publication-lock.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing Manual Adapter tests**

Tests prove the adapter writes a Preview/Copy Package and `handed_off` Receipt without opening sockets, that stale Approval blocks handoff, and manual result recording never claims Browser/API verification.

- [ ] **Step 6: Run RED**

Run: `pnpm test tests/x/manual-adapter.test.ts`

Expected: FAIL because `ManualAdapter` is missing.

- [ ] **Step 7: Implement Manual Adapter**

Receipt statuses are `handed_off | manual_recorded | failed`. Verification source is always `manual`, and the optional public result requires `url`, `postIds`, and `publishedAt`.

- [ ] **Step 8: Verify GREEN and commit**

Run: `pnpm test tests/x tests/security/publication-lock.test.ts`

Expected: PASS.

```text
git add harnesses/research-publishing/adapters tests/x tests/security
git commit -m "feat: add digest-bound manual publication handoff"
```

---

### Task 7: CLI and Synthetic End-to-End Workflows

**Files:**
- Create: `harnesses/research-publishing/cli/index.ts`
- Create: `tests/cli/cli.test.ts`
- Create: `tests/integration/article-workflow.test.ts`
- Create: `tests/integration/x-manual-workflow.test.ts`
- Create: `harnesses/research-publishing/examples/synthetic/*.json`

**Interfaces:**
- CLI consumes `--workspace`, `--input <json>`, optional `--run-id`, and `--output json`.
- CLI emits `{ ok, operation, artifact?, state?, findings?, error? }` JSON to stdout.
- Exit codes: `0` success, `2` contract/input, `3` Gate blocked, `4` state/approval, `5` filesystem, `10` unexpected.

- [ ] **Step 1: Write failing CLI doctor and package tests**

Use Node `spawnSync` against the built CLI. Assert JSON-only stdout, stable exit codes, `doctor` checks Node/workspace/contracts, and package commands operate only below `--workspace`.

- [ ] **Step 2: Run RED**

Run: `pnpm build && pnpm test tests/cli/cli.test.ts`

Expected: FAIL because CLI entry does not exist.

- [ ] **Step 3: Implement the full V1 command surface**

Commands:

```text
candidate capture|qualify
package build|review|freeze
article prepare|accept-draft|review|finalize|handoff-x
x prepare|accept-draft|review|plan|approve|handoff|record-manual
doctor
```

All mutation commands require explicit input JSON. No command discovers a topic or publishes externally.

- [ ] **Step 4: Verify CLI GREEN**

Run: `pnpm build && pnpm test tests/cli/cli.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing offline integration tests**

Article workflow: Candidate → Package → Freeze → Prepare → Accept Draft → Review → Finalize → optional X handoff.

X workflow: Package → Prepare → Accept Thread → Review → Plan → Approve → Manual Handoff → Record Manual Result.

- [ ] **Step 6: Run RED**

Run: `pnpm test tests/integration/article-workflow.test.ts tests/integration/x-manual-workflow.test.ts`

Expected: FAIL at the first unimplemented orchestration gap.

- [ ] **Step 7: Complete orchestration and synthetic fixtures**

The synthetic Package uses a fictional deterministic context runtime, public synthetic sources, one `verified`, one `hypothesis`, and one `planned` Claim. It contains no personal or enterprise data.

- [ ] **Step 8: Verify GREEN and commit**

Run: `pnpm test tests/cli tests/integration && pnpm build`

Expected: PASS.

```text
git add harnesses/research-publishing/cli harnesses/research-publishing/examples tests/cli tests/integration
git commit -m "feat: add offline article and X CLI workflows"
```

---

### Task 8: Thin Skills, Registry, CI, Security, and Public V1 Acceptance

**Files:**
- Create: `skills/article-publishing-copilot/SKILL.md`
- Create: `skills/article-publishing-copilot/agents/openai.yaml`
- Create: `skills/article-publishing-copilot/scripts/invoke.mjs`
- Create: `skills/x-publishing-copilot/SKILL.md`
- Create: `skills/x-publishing-copilot/agents/openai.yaml`
- Create: `skills/x-publishing-copilot/scripts/invoke.mjs`
- Create: `registry/harnesses.json`
- Create: `tools/build-manifest.ts`
- Create: `registry/manifests/research-publishing.json`
- Create: `tools/acceptance.ts`
- Create: `tests/security/adversarial.test.ts`
- Create: `tests/skills/skill-boundary.test.ts`
- Create: `.github/workflows/ci.yml`
- Create: `README.md`
- Create: `docs/guides/quickstart.md`
- Modify: `.llm-wiki/requirements/research-publishing-harness-v1.md`
- Modify: `.llm-wiki/artifacts/index.md`
- Modify: `.llm-wiki/log.md`

**Interfaces:**
- Skills locate the runtime through explicit path or Registry and invoke CLI only.
- Manifest records contract/runtime/Skill compatibility and SHA-256 for tracked Harness/Skill files.
- Acceptance runs both synthetic workflows in a temporary workspace with no network or credentials.

- [ ] **Step 1: Load and follow the repository Skill-authoring instructions**

Before creating `SKILL.md`, read the active `writing-skills`/`skill-creator` instructions. Keep both Skills thin; all security and state behavior remains in Harness code.

- [ ] **Step 2: Write failing Skill boundary and adversarial tests**

Skill tests require valid frontmatter, explicit triggers, CLI invocation, Publish Gate wording, and absence of copied Gate implementation. Security tests cover Prompt Injection in Source text, private Windows/Unix paths, token/Cookie patterns, `internal_only` citation, Planned-as-shipped language, and disabled-Gate configuration attempts.

- [ ] **Step 3: Run RED**

Run: `pnpm test tests/skills/skill-boundary.test.ts tests/security/adversarial.test.ts`

Expected: FAIL because Skills and remaining security fixtures do not exist.

- [ ] **Step 4: Implement both thin Skills and close security cases**

Article Skill never triggers X publication. X Skill must show exact Preview and obtain content-specific approval before `x handoff`. Both refuse to continue when compatible Harness discovery fails.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm test tests/skills tests/security`

Expected: PASS.

- [ ] **Step 6: Write failing Manifest and Acceptance tests through commands**

Run `pnpm manifest` before the builder exists and `pnpm acceptance` before orchestration is registered.

Expected: both commands FAIL for missing implementation.

- [ ] **Step 7: Implement Registry, deterministic Manifest, and Acceptance runner**

Manifest output is sorted by path and excludes `.git`, `node_modules`, `dist`, local workspaces, receipts, secrets, and itself while calculating. Acceptance creates a temporary workspace, runs Article and Manual X workflows, verifies all expected artifacts and digests, then deletes only that verified temporary directory.

- [ ] **Step 8: Add English README, Quickstart, and CI**

README must state `Pre-alpha / V1`, implemented capabilities, explicit non-capabilities, architecture, install, Quickstart, security boundary, and links to the Chinese design. CI runs `pnpm install --frozen-lockfile` and `pnpm check` on supported Node versions.

- [ ] **Step 9: Generate Manifest and run the complete verification suite**

Run:

```text
pnpm manifest
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm acceptance
git diff --check
```

Expected: every command exits 0; test report has zero failures; Acceptance reports both Article and Manual X workflows complete; Git diff check is empty.

- [ ] **Step 10: Audit V1 acceptance criteria and public-data safety**

For each design acceptance item, record the exact test, command, or artifact evidence in `.llm-wiki/verification/v1.md`. Scan tracked files for workstation paths, token/cookie values, private repository names, and unsupported Browser/API completion claims.

- [ ] **Step 11: Update lifecycle evidence and commit V1**

Mark development/testing `done` only from fresh verification. Keep archive `pending` until branch handoff is recorded.

```text
git add .
git commit -m "feat: deliver research publishing harness v1"
```

---

## Context Handoff

- lifecycle_session: `.llm-wiki/requirements/research-publishing-harness-v1.md`
- user_intent: clone repository, persist design, create the executable V1 plan, and implement V1
- active_sources: `docs/architecture/research-publishing-harness-design.zh-CN.md`
- active_scope: M0–M2 contracts/core, Article, X, Manual Adapter, two Skills, docs/tests/registry/CI
- read_only_scope: `LICENSE`, external research repositories
- candidate_scope: Browser and X API interface notes
- excluded_scope: real external publishing, credentials, scheduling, autonomous topic selection, article platform adapters
- current_gate: Scope Lock Gate passed
- requested_stage_or_bridge: inline `executing-plans` with TDD
- constraints: no subagent delegation; no direct development on `main`; no Git push without separate user authorization
