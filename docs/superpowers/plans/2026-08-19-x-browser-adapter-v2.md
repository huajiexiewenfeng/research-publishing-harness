# X Browser Adapter V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Harness-managed X Browser Adapter that reuses an existing Chrome login, publishes an approved text Single/Thread/Reply at most once, verifies the public result, and emits an immutable V2 receipt.

**Architecture:** Keep content intent, approval, browser execution, and public verification as separate deterministic units. The Harness issues versioned Browser Commands through a durable Host Bridge; the Codex X Skill only claims, executes, and reports those commands. A write-ahead execution ledger and a second write-ahead Host claim prevent Submit replay, while all post-submit recovery is read-only.

**Tech Stack:** Node.js `>=20.19`, TypeScript `6.0.3` in strict NodeNext mode, AJV 2020 JSON Schema, Vitest `4.1.10`, `twitter-text` `3.1.0`, pnpm `11.19.0`, Codex Chrome browser-client Host.

## Global Constraints

- V1 Manual Plan, Approval, Receipt, CLI, Skill handoff, and offline acceptance remain readable and passing.
- Browser publication accepts only V2 Plan and V2 Approval.
- First release supports text-only X `single`, `thread`, and `reply`, plus ordinary external links.
- Human approval is one `publish_once` approval bound to account, adapter, mode, ordered text, links, and Reply target.
- Explicit Chrome selection never silently falls back to the in-app browser, Edge, Computer Use, or standalone Playwright.
- Browser observations never persist Cookie, Token, password, local storage, full DOM, Home Timeline, notification, DM, or unrelated-tab content.
- A Submit Command is write-ahead issued once and write-ahead claimed once; after either record exists, automatic resubmission is forbidden.
- Pre-submit retries are limited to two and only occur after a fresh observation proves the action is safe to repeat.
- Post-submit retries are read-only at `0s`, `3s`, `10s`, `30s`, and `90s`.
- Partial publication is never automatically deleted, completed, or attached to a guessed reply target.
- X page uncertainty fails closed with a stable error code.
- CI and acceptance tests never publish to a real X account and never require network access.
- Use TDD for every task and commit after every independently passing task.

---

## File Structure

### New deterministic core files

- `harnesses/research-publishing/core/publication-plan-v2.ts` — canonical text, V2 intent/plan types, stable Plan Digest, and Plan validation.
- `harnesses/research-publishing/core/approval-v2.ts` — V2 Approval Digest, creation, expiry, and exact-scope verification.
- `harnesses/research-publishing/core/browser-execution.ts` — Browser execution states, transitions, event and snapshot types.
- `harnesses/research-publishing/core/execution-store.ts` — execution lock, append-only event ledger, state projection, and rebuild.
- `harnesses/research-publishing/core/artifact-retention.ts` — safe terminal-execution retention and explicit prune report.

### New public contracts

- `harnesses/research-publishing/contracts/publication-plan-v2.schema.json`
- `harnesses/research-publishing/contracts/approval-v2.schema.json`
- `harnesses/research-publishing/contracts/browser-command.schema.json`
- `harnesses/research-publishing/contracts/browser-observation.schema.json`
- `harnesses/research-publishing/contracts/browser-execution-event.schema.json`
- `harnesses/research-publishing/contracts/publish-receipt-v2.schema.json`

### New X Browser Adapter files

- `harnesses/research-publishing/adapters/x/browser/browser-protocol.ts` — command, result, observation, capability, and claim types.
- `harnesses/research-publishing/adapters/x/browser/command-broker.ts` — issue, claim, report, replay rejection, and revision/origin checks.
- `harnesses/research-publishing/adapters/x/browser/page-contract.ts` — platform-neutral X page semantic interface and fail-closed helpers.
- `harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.ts` — first versioned X semantic contract.
- `harnesses/research-publishing/adapters/x/browser/composer-protocol.ts` — deterministic Single/Thread/Reply composer reducer.
- `harnesses/research-publishing/adapters/x/browser/public-verifier.ts` — root discovery, ordered chain reconstruction, text/link/account verification.
- `harnesses/research-publishing/adapters/x/browser/receipt-v2.ts` — immutable stage/final Receipt construction and invariants.
- `harnesses/research-publishing/adapters/x/browser/outcome-resolver.ts` — post-submit classification and bounded read-only retry schedule.
- `harnesses/research-publishing/adapters/x/browser/browser-adapter.ts` — orchestration facade used by CLI.

### New tests and fixtures

- `tests/fixtures/publication-plan-v2.ts`
- `tests/fixtures/x-browser-observations.ts`
- `tests/x/publication-plan-v2.test.ts`
- `tests/x/approval-v2.test.ts`
- `tests/core/browser-execution.test.ts`
- `tests/core/execution-store.test.ts`
- `tests/core/artifact-retention.test.ts`
- `tests/x/browser-command-broker.test.ts`
- `tests/x/x-page-contract.test.ts`
- `tests/x/composer-protocol.test.ts`
- `tests/x/public-verifier.test.ts`
- `tests/x/receipt-v2.test.ts`
- `tests/x/browser-adapter.test.ts`
- `tests/x/outcome-resolver.test.ts`
- `tests/integration/x-browser-workflow.test.ts`
- `tests/security/browser-adapter-security.test.ts`

### Existing files to modify

- `harnesses/research-publishing/core/types.ts` — register six V2 contract names.
- `harnesses/research-publishing/core/errors.ts` — add stable Browser error codes.
- `harnesses/research-publishing/core/workspace-store.ts` — locked JSONL append, atomic replace, text existence helper.
- `harnesses/research-publishing/branches/x-harness/x-service.ts` — add `planXBrowser` without changing V1 `planX`.
- `harnesses/research-publishing/cli/index.ts` — add Browser plan and Host Bridge commands.
- `skills/x-publishing-copilot/SKILL.md` — Browser-first, one-confirmation orchestration and explicit Manual fallback.
- `skills/x-publishing-copilot/references/browser-adapter-flow.md` — exact claim/execute/report Host protocol.
- `tests/contracts/contracts.test.ts`, `tests/cli/cli.test.ts`, `tests/skills/skill-boundary.test.ts` — new contract and boundary coverage.
- `tools/acceptance.ts` — deterministic fake-browser acceptance without network.
- `docs/guides/quickstart.md`, `README.md` — V1 Manual versus V2 Browser workflow.
- `registry/manifests/research-publishing.json` — regenerated hashes after all code and docs are final.

---

### Task 1: Stable Publication Plan V2

**Files:**
- Create: `harnesses/research-publishing/core/publication-plan-v2.ts`
- Create: `harnesses/research-publishing/contracts/publication-plan-v2.schema.json`
- Create: `tests/fixtures/publication-plan-v2.ts`
- Create: `tests/x/publication-plan-v2.test.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `harnesses/research-publishing/branches/x-harness/x-service.ts`
- Modify: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `sha256(value: unknown): string`, existing `XDraft`, stored X run metadata, and reviewed draft artifacts.
- Produces: `PublicationPlanV2`, `PublicationIntentV2`, `normalizePublicationText`, `createPublicationPlanV2`, `assertPublicationPlanV2`, and `XService.planXBrowser(runId)`.

- [ ] **Step 1: Write failing stable-digest and text-normalization tests**

Create `tests/x/publication-plan-v2.test.ts` with these cases:

```ts
import { describe, expect, it } from 'vitest';

import {
  createPublicationPlanV2,
  normalizePublicationText
} from '../../harnesses/research-publishing/core/publication-plan-v2.js';

describe('PublicationPlanV2', () => {
  it('keeps the plan digest stable when only planning metadata changes', () => {
    const base = {
      planId: 'plan_1',
      runId: 'run_1',
      targetAccount: '@runtime_ai',
      adapter: 'browser' as const,
      mode: 'thread' as const,
      targetPost: null,
      media: [],
      items: [
        { ordinal: 1, text: 'Runtime boundaries matter.\r\nEvidence must survive.' },
        { ordinal: 2, text: 'What would you extract next?', reply_to: 'previous' as const }
      ],
      provenance: { draft_digest: `sha256:${'a'.repeat(64)}` }
    };
    const first = createPublicationPlanV2({
      ...base,
      plannedAt: '2026-08-19T01:00:00.000Z'
    });
    const second = createPublicationPlanV2({
      ...base,
      planId: 'plan_2',
      plannedAt: '2026-08-19T02:00:00.000Z'
    });

    expect(first.plan_digest).toBe(second.plan_digest);
    expect(first.items[0]?.text).toBe('Runtime boundaries matter.\nEvidence must survive.');
    expect(first.items[0]?.digest).toBe(second.items[0]?.digest);
  });

  it('normalizes only Unicode NFC and line endings', () => {
    expect(normalizePublicationText('Cafe\u0301\r\n two  spaces ')).toBe(
      'Café\n two  spaces '
    );
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing-module failure**

Run:

```bash
pnpm exec vitest run tests/x/publication-plan-v2.test.ts
```

Expected: FAIL because `core/publication-plan-v2.ts` does not exist.

- [ ] **Step 3: Implement V2 intent, items, normalization, digest, and validation**

Create `harnesses/research-publishing/core/publication-plan-v2.ts` with these public types and functions:

```ts
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';

export type PublicationAdapterV2 = 'manual' | 'browser';
export type XPublicationMode = 'single' | 'thread' | 'reply';

export interface PublicationItemV2 {
  readonly ordinal: number;
  readonly text: string;
  readonly digest: string;
  readonly reply_to?: 'previous' | 'target';
}

export interface PublicationTargetPostV2 {
  readonly id: string;
  readonly url: string;
  readonly author: string;
  readonly snapshot_digest: string;
}

export interface PublicationMediaV2 {
  readonly kind: 'image' | 'video' | 'gif';
  readonly digest: string;
}

export interface PublicationIntentV2 {
  readonly schema_version: '2.0';
  readonly platform: 'x';
  readonly target_account: string;
  readonly adapter: PublicationAdapterV2;
  readonly mode: XPublicationMode;
  readonly target_post: PublicationTargetPostV2 | null;
  readonly media: readonly PublicationMediaV2[];
  readonly items: readonly PublicationItemV2[];
  readonly action: 'publish_once';
}

export interface PublicationPlanV2 {
  readonly schema_version: '2.0';
  readonly plan_id: string;
  readonly run_id: string;
  readonly intent: PublicationIntentV2;
  readonly items: readonly PublicationItemV2[];
  readonly plan_digest: string;
  readonly planned_at: string;
  readonly provenance: Readonly<Record<string, string>>;
}

export interface CreatePublicationPlanV2Input {
  readonly planId: string;
  readonly runId: string;
  readonly targetAccount: string;
  readonly adapter: PublicationAdapterV2;
  readonly mode: XPublicationMode;
  readonly targetPost: PublicationTargetPostV2 | null;
  readonly media: readonly PublicationMediaV2[];
  readonly items: ReadonlyArray<{
    readonly ordinal: number;
    readonly text: string;
    readonly reply_to?: 'previous' | 'target';
  }>;
  readonly plannedAt: string;
  readonly provenance: Readonly<Record<string, string>>;
}

const ACCOUNT = /^@[A-Za-z0-9_]{1,15}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;

export function normalizePublicationText(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').normalize('NFC');
}

export function createPublicationPlanV2(
  input: CreatePublicationPlanV2Input
): PublicationPlanV2 {
  const items = input.items.map((item, index) => {
    const text = normalizePublicationText(item.text);
    if (item.ordinal !== index + 1 || text.length === 0) {
      throw new HarnessError('CONTRACT_INVALID', 'V2 publication items must be non-empty and contiguous');
    }
    return {
      ordinal: item.ordinal,
      text,
      digest: sha256(text),
      ...(item.reply_to === undefined ? {} : { reply_to: item.reply_to })
    };
  });
  const intent: PublicationIntentV2 = {
    schema_version: '2.0',
    platform: 'x',
    target_account: input.targetAccount,
    adapter: input.adapter,
    mode: input.mode,
    target_post: input.targetPost,
    media: input.media,
    items,
    action: 'publish_once'
  };
  const plan: PublicationPlanV2 = {
    schema_version: '2.0',
    plan_id: input.planId,
    run_id: input.runId,
    intent,
    items,
    plan_digest: sha256(intent),
    planned_at: input.plannedAt,
    provenance: input.provenance
  };
  assertPublicationPlanV2(plan);
  return plan;
}

export function assertPublicationPlanV2(plan: PublicationPlanV2): void {
  if (!ACCOUNT.test(plan.intent.target_account) || !SHA256.test(plan.plan_digest)) {
    throw new HarnessError('CONTRACT_INVALID', 'invalid V2 account or digest');
  }
  if (sha256(plan.intent) !== plan.plan_digest || plan.items.length !== plan.intent.items.length) {
    throw new HarnessError('APPROVAL_STALE', 'V2 publication intent no longer matches its digest');
  }
  plan.items.forEach((item, index) => {
    if (
      item.ordinal !== index + 1 ||
      item.digest !== sha256(normalizePublicationText(item.text)) ||
      item.digest !== plan.intent.items[index]?.digest
    ) {
      throw new HarnessError('APPROVAL_STALE', `V2 publication item ${item.ordinal} is stale`);
    }
  });
  const singleValid =
    plan.intent.mode === 'single' &&
    plan.items.length === 1 &&
    plan.intent.target_post === null &&
    plan.items[0]?.reply_to === undefined;
  const threadValid =
    plan.intent.mode === 'thread' &&
    plan.items.length >= 2 &&
    plan.intent.target_post === null &&
    plan.items[0]?.reply_to === undefined &&
    plan.items.slice(1).every((item) => item.reply_to === 'previous');
  const replyValid =
    plan.intent.mode === 'reply' &&
    plan.items.length === 1 &&
    plan.intent.target_post !== null &&
    plan.items[0]?.reply_to === 'target';
  if (!singleValid && !threadValid && !replyValid) {
    throw new HarnessError('CONTRACT_INVALID', 'V2 publication mode, target, and reply chain are inconsistent');
  }
}
```

Create the shared fixture with executable content rather than duplicating Plan literals:

```ts
import { createPublicationPlanV2 } from '../../harnesses/research-publishing/core/publication-plan-v2.js';

export function publicationPlanV2Fixture() {
  return createPublicationPlanV2({
    planId: 'plan_browser_1',
    runId: 'run_browser_1',
    targetAccount: '@runtime_ai',
    adapter: 'browser',
    mode: 'thread',
    targetPost: null,
    media: [],
    items: [
      { ordinal: 1, text: 'Runtime boundaries matter.' },
      { ordinal: 2, text: 'Evidence must survive.', reply_to: 'previous' }
    ],
    plannedAt: '2026-08-19T01:00:00.000Z',
    provenance: { draft_digest: `sha256:${'a'.repeat(64)}` }
  });
}
```

- [ ] **Step 4: Add the exact V2 JSON Schema and contract registration**

Create `publication-plan-v2.schema.json` with `$id` `rph://contracts/publication-plan-v2/2.0`, `additionalProperties: false`, and required fields matching `PublicationPlanV2`. Define `$defs.item`, `$defs.targetPost`, `$defs.media`, and `$defs.intent`; require SHA-256 patterns, contiguous ordinal validation in TypeScript, `adapter` enum `manual|browser`, `mode` enum `single|thread|reply`, `media` as an array of digest-bound descriptors, and `action` const `publish_once`.

Import `validateContract` in `publication-plan-v2.ts`; after `assertPublicationPlanV2(plan)`, return `validateContract<PublicationPlanV2>('publication-plan-v2', plan)`. Call the same validator at the start of `assertPublicationPlanV2` so externally loaded plans cannot bypass AJV.

Add only this name to `CONTRACT_NAMES` in `core/types.ts` and to the contract-name test array:

```ts
'publication-plan-v2'
```

Change the contract test to map V1 names to `1.0` and registered V2 names to `2.0`, then assert the exact `$id` for each entry. Later tasks append their own name only after creating its Schema.

- [ ] **Step 5: Add `XService.planXBrowser` without changing `planX`**

Extend `XServiceOptions` with `planId?: () => string`, default it to `plan_${randomUUID()}`, and add:

```ts
async planXBrowser(runId: string): Promise<PublicationPlanV2> {
  const prefix = this.runPrefix(runId);
  const metadata = await this.store.readJson<XRunMetadata>(`${prefix}/run.json`);
  const draft = await this.store.readJson<XDraft>(`${prefix}/draft-candidate.json`);
  const report = await this.store.readJson<ReviewReport>(`${prefix}/review-report.json`);
  if (!report.passed) {
    throw new HarnessError('EVIDENCE_GATE_BLOCKED', 'X review contains blocking findings');
  }
  const plan = createPublicationPlanV2({
    planId: this.planId(),
    runId,
    targetAccount: metadata.target_account,
    adapter: 'browser',
    mode: draft.format,
    targetPost: draft.target_post ?? null,
    media: [],
    items: draft.items.map((item) => ({
      ordinal: item.ordinal,
      text: item.text,
      ...(item.reply_to === undefined ? {} : { reply_to: item.reply_to })
    })),
    plannedAt: this.now().toISOString(),
    provenance: { draft_digest: sha256(draft) }
  });
  await this.store.writeNew(`${prefix}/publication-plan-v2.json`, plan);
  return plan;
}
```

- [ ] **Step 6: Run focused and regression tests**

Run:

```bash
pnpm exec vitest run tests/x/publication-plan-v2.test.ts tests/x/x-service.test.ts tests/contracts/contracts.test.ts
pnpm typecheck
```

Expected: all selected tests PASS and TypeScript exits `0`.

- [ ] **Step 7: Commit Task 1**

```bash
git add harnesses/research-publishing/core/publication-plan-v2.ts harnesses/research-publishing/contracts/publication-plan-v2.schema.json harnesses/research-publishing/core/types.ts harnesses/research-publishing/branches/x-harness/x-service.ts tests/fixtures/publication-plan-v2.ts tests/x/publication-plan-v2.test.ts tests/x/x-service.test.ts tests/contracts/contracts.test.ts
git commit -m "feat: add stable X publication plan v2"
```

---

### Task 2: Approval V2 and Browser Error Taxonomy

**Files:**
- Create: `harnesses/research-publishing/core/approval-v2.ts`
- Create: `harnesses/research-publishing/contracts/approval-v2.schema.json`
- Create: `tests/x/approval-v2.test.ts`
- Modify: `harnesses/research-publishing/core/errors.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `PublicationPlanV2`, `assertPublicationPlanV2`, `sha256`.
- Produces: `ApprovalV2`, `computeApprovalDigestV2`, `approvePublicationV2`, `verifyApprovalV2`, and the stable Browser error-code union.

- [ ] **Step 1: Write failing approval binding and expiry tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  approvePublicationV2,
  verifyApprovalV2
} from '../../harnesses/research-publishing/core/approval-v2.js';
import { publicationPlanV2Fixture } from '../fixtures/publication-plan-v2.js';

describe('ApprovalV2', () => {
  it('binds account, adapter, mode, plan digest, and publish-once scope', () => {
    const plan = publicationPlanV2Fixture();
    const approval = approvePublicationV2(
      plan,
      'human-reviewer',
      600_000,
      new Date('2026-08-19T02:00:00.000Z'),
      () => 'approval_v2_1'
    );
    expect(approval).toMatchObject({
      schema_version: '2.0',
      target_account: '@runtime_ai',
      adapter: 'browser',
      mode: 'thread',
      scope: 'publish_once'
    });
    expect(() => verifyApprovalV2(plan, approval, new Date('2026-08-19T02:09:59.000Z'))).not.toThrow();
  });

  it('rejects expiry and any intent mutation', () => {
    const plan = publicationPlanV2Fixture();
    const approval = approvePublicationV2(
      plan,
      'human-reviewer',
      60_000,
      new Date('2026-08-19T02:00:00.000Z')
    );
    expect(() => verifyApprovalV2(plan, approval, new Date('2026-08-19T02:01:00.000Z')))
      .toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
    const changed = {
      ...plan,
      intent: { ...plan.intent, target_account: '@changed' }
    };
    expect(() => verifyApprovalV2(changed, approval, new Date('2026-08-19T02:00:30.000Z')))
      .toThrowError(expect.objectContaining({ code: 'APPROVAL_STALE' }));
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run `pnpm exec vitest run tests/x/approval-v2.test.ts`.

Expected: FAIL because `core/approval-v2.ts` does not exist.

- [ ] **Step 3: Implement the complete Approval V2 API**

```ts
import { randomUUID } from 'node:crypto';

import type { PublicationPlanV2 } from './publication-plan-v2.js';
import { assertPublicationPlanV2 } from './publication-plan-v2.js';
import { sha256 } from './digest.js';
import { HarnessError } from './errors.js';

export interface ApprovalV2 {
  readonly schema_version: '2.0';
  readonly approval_id: string;
  readonly plan_id: string;
  readonly run_id: string;
  readonly plan_digest: string;
  readonly approval_digest: string;
  readonly target_account: string;
  readonly adapter: 'browser' | 'manual';
  readonly mode: 'single' | 'thread' | 'reply';
  readonly scope: 'publish_once';
  readonly approved_by: string;
  readonly approved_at: string;
  readonly expires_at: string;
}

export function computeApprovalDigestV2(plan: PublicationPlanV2): string {
  return sha256({
    plan_digest: plan.plan_digest,
    target_account: plan.intent.target_account,
    adapter: plan.intent.adapter,
    mode: plan.intent.mode,
    action: 'publish_once'
  });
}

export function approvePublicationV2(
  plan: PublicationPlanV2,
  approvedBy: string,
  ttlMs: number,
  now = new Date(),
  approvalId: () => string = () => `approval_${randomUUID()}`
): ApprovalV2 {
  assertPublicationPlanV2(plan);
  if (approvedBy.trim().length === 0 || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new HarnessError('CONTRACT_INVALID', 'V2 approval requires an approver and positive TTL');
  }
  return {
    schema_version: '2.0',
    approval_id: approvalId(),
    plan_id: plan.plan_id,
    run_id: plan.run_id,
    plan_digest: plan.plan_digest,
    approval_digest: computeApprovalDigestV2(plan),
    target_account: plan.intent.target_account,
    adapter: plan.intent.adapter,
    mode: plan.intent.mode,
    scope: 'publish_once',
    approved_by: approvedBy,
    approved_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttlMs).toISOString()
  };
}

export function verifyApprovalV2(
  plan: PublicationPlanV2,
  approval: ApprovalV2,
  now = new Date()
): void {
  assertPublicationPlanV2(plan);
  const matches =
    approval.plan_id === plan.plan_id &&
    approval.run_id === plan.run_id &&
    approval.plan_digest === plan.plan_digest &&
    approval.approval_digest === computeApprovalDigestV2(plan) &&
    approval.target_account === plan.intent.target_account &&
    approval.adapter === plan.intent.adapter &&
    approval.mode === plan.intent.mode &&
    approval.scope === 'publish_once';
  if (!matches || Date.parse(approval.expires_at) <= now.getTime()) {
    throw new HarnessError('APPROVAL_STALE', 'V2 approval is expired or does not match this publication');
  }
}
```

- [ ] **Step 4: Add `approval-v2.schema.json` and exact Browser error codes**

The schema must use `$id` `rph://contracts/approval-v2/2.0`, reject unknown fields, and require every `ApprovalV2` field above.

Import `validateContract` in `approval-v2.ts`; validate the constructed Approval before returning it and validate the supplied Approval at the start of `verifyApprovalV2`.

Register only `approval-v2` in `CONTRACT_NAMES` and the contract test in this task.

Add these `ErrorCode` members in `core/errors.ts`:

```ts
| 'BROWSER_EXECUTOR_UNAVAILABLE'
| 'BROWSER_EXECUTOR_INCOMPATIBLE'
| 'X_AUTH_REQUIRED'
| 'X_ACCOUNT_MISMATCH'
| 'X_SECURITY_CHALLENGE'
| 'PAGE_CONTRACT_UNSUPPORTED'
| 'DRAFT_CONFLICT'
| 'REPLY_TARGET_STALE'
| 'COMPOSER_ITEM_COUNT_MISMATCH'
| 'COMPOSER_CONTENT_MISMATCH'
| 'STALE_PAGE_REVISION'
| 'COMMAND_REPLAY_REJECTED'
| 'EXECUTION_BUSY'
| 'SUBMIT_ALREADY_ATTEMPTED'
| 'PUBLICATION_PARTIAL'
| 'PUBLICATION_OUTCOME_UNKNOWN'
| 'PUBLIC_VERIFICATION_CONFLICT'
| 'UNSUPPORTED_PUBLICATION_FEATURE'
```

- [ ] **Step 5: Run approval, contract, and V1 regression tests**

```bash
pnpm exec vitest run tests/x/approval-v2.test.ts tests/x/approval.test.ts tests/contracts/contracts.test.ts
pnpm typecheck
```

Expected: all tests PASS; the existing V1 `Approval` remains manual-only and unchanged.

- [ ] **Step 6: Commit Task 2**

```bash
git add harnesses/research-publishing/core/approval-v2.ts harnesses/research-publishing/contracts/approval-v2.schema.json harnesses/research-publishing/core/errors.ts harnesses/research-publishing/core/types.ts tests/x/approval-v2.test.ts tests/contracts/contracts.test.ts
git commit -m "feat: add digest-bound browser approval v2"
```

---

### Task 3: Browser Execution State, Ledger, Lock, and Rebuild

**Files:**
- Create: `harnesses/research-publishing/core/browser-execution.ts`
- Create: `harnesses/research-publishing/core/execution-store.ts`
- Create: `harnesses/research-publishing/contracts/browser-execution-event.schema.json`
- Create: `tests/core/browser-execution.test.ts`
- Create: `tests/core/execution-store.test.ts`
- Modify: `harnesses/research-publishing/core/workspace-store.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `WorkspaceStore`, `sha256`, `HarnessError`.
- Produces: `BrowserExecutionState`, `BrowserExecutionEventV2`, `BrowserExecutionSnapshot`, `transitionBrowserExecution`, and `ExecutionStore`.

- [ ] **Step 1: Write failing state-transition tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  type BrowserExecutionState,
  transitionBrowserExecution
} from '../../harnesses/research-publishing/core/browser-execution.js';

describe('BrowserExecution state machine', () => {
  it('allows the complete success path', () => {
    const path = [
      'preflight',
      'account_verified',
      'composer_prepared',
      'composer_verified',
      'submit_armed',
      'submit_attempted',
      'outcome_resolving',
      'public_verifying',
      'finalized'
    ] as const;
    let state: BrowserExecutionState = 'created';
    for (const next of path) state = transitionBrowserExecution(state, next);
    expect(state).toBe('finalized');
  });

  it('never allows a post-submit state to return to submit_armed', () => {
    expect(() => transitionBrowserExecution('outcome_unknown', 'submit_armed'))
      .toThrowError(expect.objectContaining({ code: 'STATE_TRANSITION_INVALID' }));
  });

  it('allows unknown outcomes to resume read-only verification', () => {
    expect(transitionBrowserExecution('outcome_unknown', 'public_verifying'))
      .toBe('public_verifying');
  });
});
```

- [ ] **Step 2: Implement the exact state union and transition table**

Define this union and map in `browser-execution.ts`:

```ts
export type BrowserExecutionState =
  | 'created'
  | 'preflight'
  | 'account_verified'
  | 'composer_prepared'
  | 'composer_verified'
  | 'submit_armed'
  | 'submit_attempted'
  | 'outcome_resolving'
  | 'public_verifying'
  | 'finalized'
  | 'pre_submit_failed'
  | 'cancelled_before_submit'
  | 'published_unverified'
  | 'outcome_unknown'
  | 'partial'
  | 'failed_after_submit'
  | 'verification_conflict';

const TRANSITIONS: Readonly<Record<BrowserExecutionState, readonly BrowserExecutionState[]>> = {
  created: ['preflight', 'pre_submit_failed', 'cancelled_before_submit'],
  preflight: ['account_verified', 'pre_submit_failed', 'cancelled_before_submit'],
  account_verified: ['composer_prepared', 'pre_submit_failed', 'cancelled_before_submit'],
  composer_prepared: ['composer_verified', 'pre_submit_failed', 'cancelled_before_submit'],
  composer_verified: ['submit_armed', 'pre_submit_failed', 'cancelled_before_submit'],
  submit_armed: ['submit_attempted', 'pre_submit_failed', 'cancelled_before_submit'],
  submit_attempted: ['outcome_resolving'],
  outcome_resolving: ['public_verifying', 'partial', 'published_unverified', 'outcome_unknown', 'failed_after_submit', 'verification_conflict'],
  public_verifying: ['finalized', 'partial', 'published_unverified', 'outcome_unknown', 'verification_conflict'],
  published_unverified: ['public_verifying'],
  outcome_unknown: ['public_verifying'],
  pre_submit_failed: ['preflight', 'cancelled_before_submit'],
  finalized: [],
  cancelled_before_submit: [],
  partial: [],
  failed_after_submit: [],
  verification_conflict: []
};
```

`transitionBrowserExecution` checks membership and throws `STATE_TRANSITION_INVALID` with `{from,to}` details.

Define the event, snapshot, and store input types in the same file so later tasks do not infer them:

```ts
export interface BrowserExecutionEventV2 {
  readonly schema_version: '2.0';
  readonly event_id: string;
  readonly execution_id: string;
  readonly attempt_id: string | null;
  readonly sequence: number;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly previous_state: BrowserExecutionState;
  readonly next_state: BrowserExecutionState;
  readonly command_id?: string;
  readonly evidence_digest?: string;
}

export interface BrowserExecutionSnapshot {
  readonly schema_version: '2.0';
  readonly execution_id: string;
  readonly run_id: string;
  readonly plan_id: string;
  readonly state: BrowserExecutionState;
  readonly sequence: number;
  readonly attempt_id: string | null;
  readonly submit_command_count: number;
  readonly latest_command_id: string | null;
  readonly latest_observation_id: string | null;
  readonly updated_at: string;
}

export interface CreateBrowserExecutionInput {
  readonly execution_id: string;
  readonly run_id: string;
  readonly plan_id: string;
  readonly created_at: string;
}

export interface TransitionEvidence {
  readonly event_type: string;
  readonly attempt_id?: string;
  readonly command_id?: string;
  readonly evidence_digest?: string;
  readonly submit_command_count?: number;
  readonly latest_observation_id?: string;
}
```

- [ ] **Step 3: Write failing durable-ledger tests**

Create `tests/core/execution-store.test.ts` that:

1. Creates an execution at sequence `0`.
2. Appends `created → preflight` and `preflight → account_verified`.
3. Deletes or corrupts `state.json` through the test filesystem.
4. Calls `rebuild(executionId)` and expects sequence `2`, state `account_verified`.
5. Starts two concurrent `withExecutionLock` calls and expects the second to reject with `EXECUTION_BUSY`.
6. Leaves a lock owned by a nonexistent PID, then expects the next call to remove that exact stale lock and proceed once.

Use a deterministic clock and event ID factory so artifact assertions are stable.

- [ ] **Step 4: Add focused persistence primitives to `WorkspaceStore`**

Add these methods without weakening `resolveAllowed`:

```ts
export interface WorkspaceExecutionApi {
  exists(relativePath: string): Promise<boolean>;
  appendLine(relativePath: string, line: string): Promise<ArtifactRef>;
  replaceAtomic(relativePath: string, value: string | object): Promise<ArtifactRef>;
  withLock<T>(relativePath: string, operation: () => Promise<T>): Promise<T>;
}
```

Implementation rules:

- `appendLine` opens with `'a'`, writes exactly one LF-terminated line, calls `sync`, and is only called while holding an execution lock.
- `replaceAtomic` writes and syncs a UUID temporary file in the same directory, renames it to the projection path, and treats a missing projection after a Windows replacement race as recoverable because Ledger is authoritative.
- `withLock` creates a JSON lock file with `'wx'`, `{pid, created_at}`, calls `sync`, closes it, runs the operation, and removes only that exact lock path in `finally`.
- If the lock already exists, read its PID and call `process.kill(pid, 0)`. Treat success or `EPERM` as active and throw `EXECUTION_BUSY`. Treat `ESRCH` as stale, remove only that lock file, and retry acquisition once. Any malformed lock is active and returns `EXECUTION_BUSY` rather than being deleted.
- All four methods resolve paths through the existing allowlist.

- [ ] **Step 5: Implement `ExecutionStore` with append-first projection**

Public API contract:

```ts
export interface ExecutionStoreApi {
  create(input: CreateBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
  read(executionId: string): Promise<BrowserExecutionSnapshot>;
  transition(
    executionId: string,
    next: BrowserExecutionState,
    evidence?: TransitionEvidence
  ): Promise<BrowserExecutionSnapshot>;
  rebuild(executionId: string): Promise<BrowserExecutionSnapshot>;
  withExecutionLock<T>(executionId: string, operation: () => Promise<T>): Promise<T>;
}
```

Implement `export class ExecutionStore implements ExecutionStoreApi` with constructor dependencies `WorkspaceStore`, `now: () => Date`, and `eventId: () => string`; default the last two to `new Date()` and `evt_${randomUUID()}`.

Persist below `runs/<run_id>/x/browser/<execution_id>/`. `transition` must hold the execution lock, read/rebuild current state, validate the transition, append one JSON event to `events.jsonl`, then replace `state.json`. If projection replacement fails after the append, return the error; the next read rebuilds from Ledger.

- [ ] **Step 6: Add the event JSON Schema and run persistence tests**

Create `browser-execution-event.schema.json` with `$id` `rph://contracts/browser-execution-event/2.0`, exact state enums, positive integer `sequence`, UTC date-time `occurred_at`, nullable `attempt_id`, and optional `command_id`/`evidence_digest`.

Register only `browser-execution-event` in `CONTRACT_NAMES` and the contract test in this task.

Run:

```bash
pnpm exec vitest run tests/core/browser-execution.test.ts tests/core/execution-store.test.ts tests/core/workspace-store.test.ts tests/contracts/contracts.test.ts
pnpm typecheck
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add harnesses/research-publishing/core/browser-execution.ts harnesses/research-publishing/core/execution-store.ts harnesses/research-publishing/core/workspace-store.ts harnesses/research-publishing/core/types.ts harnesses/research-publishing/contracts/browser-execution-event.schema.json tests/core/browser-execution.test.ts tests/core/execution-store.test.ts tests/core/workspace-store.test.ts tests/contracts/contracts.test.ts
git commit -m "feat: add durable browser execution ledger"
```

---

### Task 4: Browser Command, Observation, Claim, and Replay Protection

**Files:**
- Create: `harnesses/research-publishing/adapters/x/browser/browser-protocol.ts`
- Create: `harnesses/research-publishing/adapters/x/browser/command-broker.ts`
- Create: `harnesses/research-publishing/contracts/browser-command.schema.json`
- Create: `harnesses/research-publishing/contracts/browser-observation.schema.json`
- Create: `tests/x/browser-command-broker.test.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `WorkspaceStore`, `ExecutionStore`, `sha256`, Browser error codes.
- Produces: `BrowserCapabilityManifest`, `BrowserCommand`, `BrowserObservation`, `BrowserActionResult`, `CommandBroker.issue`, `claim`, and `acceptResult`.

- [ ] **Step 1: Write failing issue/claim/replay tests**

The focused test must prove:

```ts
const command = await broker.issue({
  execution_id: 'exec_1',
  run_id: 'run_1',
  kind: 'click',
  purpose: 'submit_once',
  expected_page_revision: 'rev_7',
  allowed_origin: 'https://x.com',
  side_effect: 'submit',
  payload: { target_ref: 'submit_button' }
});

await expect(broker.claim(command.execution_id, command.command_id)).resolves.toMatchObject({
  command_id: command.command_id,
  claimed: true
});
await expect(broker.claim(command.execution_id, command.command_id)).rejects.toMatchObject({
  code: 'COMMAND_REPLAY_REJECTED'
});
```

Add cases rejecting `https://example.com`, stale page revision, a result for an unclaimed command, and any Observation property named `cookie`, `local_storage`, `dom`, `direct_messages`, or `notifications`.

- [ ] **Step 2: Define the protocol as discriminated unions**

`browser-protocol.ts` must define:

```ts
export type BrowserCommandKind = 'observe_page' | 'navigate' | 'click' | 'set_text' | 'press_key' | 'wait';
export type BrowserSideEffect = 'read' | 'write' | 'submit';

export interface BrowserCapabilityManifest {
  readonly executor: 'codex-chrome';
  readonly executor_version: string;
  readonly browser_family: 'chrome';
  readonly capabilities: readonly BrowserCommandKind[];
  readonly observed_at: string;
}

export interface BrowserNodeObservation {
  readonly ref: string;
  readonly role: string;
  readonly name: string;
  readonly text: string;
  readonly test_id: string | null;
  readonly editable: boolean;
  readonly disabled: boolean;
  readonly parent_ref: string | null;
}

export interface BrowserObservation {
  readonly schema_version: '2.0';
  readonly observation_id: string;
  readonly execution_id: string;
  readonly command_id: string;
  readonly origin: 'https://x.com';
  readonly canonical_url: string;
  readonly page_revision: string;
  readonly observed_at: string;
  readonly nodes: readonly BrowserNodeObservation[];
  readonly public_posts: readonly BrowserPublicPostObservation[];
}

export interface BrowserObservedLink {
  readonly display_url: string;
  readonly expanded_url: string;
}

export interface BrowserPublicPostObservation {
  readonly post_id: string;
  readonly canonical_url: string;
  readonly author_handle: string;
  readonly text: string;
  readonly links: readonly BrowserObservedLink[];
  readonly published_at: string;
  readonly reply_to_id: string | null;
}

export type BrowserCommandPayload =
  | { readonly kind: 'observe_page'; readonly scope: 'x_page' | 'composer' | 'public_thread' }
  | { readonly kind: 'navigate'; readonly url: string }
  | { readonly kind: 'click'; readonly target_ref: string }
  | { readonly kind: 'set_text'; readonly target_ref: string; readonly text: string }
  | { readonly kind: 'press_key'; readonly target_ref: string; readonly key: string }
  | { readonly kind: 'wait'; readonly delay_ms: 0 | 3000 | 10000 | 30000 | 90000 };

export interface IssueBrowserCommandInput {
  readonly execution_id: string;
  readonly run_id: string;
  readonly kind: BrowserCommandKind;
  readonly purpose: string;
  readonly expected_page_revision: string | null;
  readonly allowed_origin: 'https://x.com';
  readonly side_effect: BrowserSideEffect;
  readonly payload: BrowserCommandPayload;
}

export interface BrowserCommand extends IssueBrowserCommandInput {
  readonly schema_version: '2.0';
  readonly command_id: string;
  readonly payload_digest: string;
  readonly issued_at: string;
}

export interface BrowserCommandClaim {
  readonly schema_version: '2.0';
  readonly execution_id: string;
  readonly command_id: string;
  readonly claimed: true;
  readonly claimed_at: string;
}

export interface BrowserActionResult {
  readonly schema_version: '2.0';
  readonly execution_id: string;
  readonly command_id: string;
  readonly status: 'success' | 'transient_failure' | 'uncertain' | 'rejected';
  readonly resulting_page_revision: string | null;
  readonly observation: BrowserObservation | null;
  readonly error_code: ErrorCode | null;
  readonly reported_at: string;
}

export type BrowserObservationInput = Omit<BrowserObservation, 'page_revision'>;

export interface BrowserActionResultInput {
  readonly schema_version: '2.0';
  readonly execution_id: string;
  readonly command_id: string;
  readonly status: 'success' | 'transient_failure' | 'uncertain' | 'rejected';
  readonly observation: BrowserObservationInput | null;
  readonly error_code: ErrorCode | null;
  readonly reported_at: string;
}

export declare function computePageRevision(input: BrowserObservationInput): string;
```

The implementation must verify `BrowserCommand.kind === BrowserCommand.payload.kind` before persistence. The Host never computes a revision: `CommandBroker` sanitizes `BrowserObservationInput`, computes `page_revision = sha256({origin, canonical_url, nodes, public_posts})`, and then persists `BrowserObservation` plus `BrowserActionResult`.

- [ ] **Step 3: Implement `CommandBroker` with write-new claims**

Implement `CommandBroker` against this exact API contract:

```ts
export interface CommandBrokerApi {
  issue(input: IssueBrowserCommandInput): Promise<BrowserCommand>;
  read(executionId: string, commandId: string): Promise<BrowserCommand>;
  claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
  acceptResult(executionId: string, result: BrowserActionResultInput): Promise<BrowserActionResult>;
}
```

Paths:

```text
runs/<run_id>/x/browser/<execution_id>/commands/<command_id>.json
runs/<run_id>/x/browser/<execution_id>/claims/<command_id>.json
runs/<run_id>/x/browser/<execution_id>/results/<command_id>.json
runs/<run_id>/x/browser/<execution_id>/observations/<observation_id>.json
```

`claim` uses `writeNew`; translate `ARTIFACT_EXISTS` to `COMMAND_REPLAY_REJECTED`. `acceptResult` requires a claim artifact, verifies origin, computes the resulting page revision inside Harness, validates payload digest, rejects duplicate result files, and persists only schema-allowed Observation fields. For actions based on an expected revision, compare the Command revision with the execution context's latest persisted Observation before accepting the claim.

- [ ] **Step 4: Add strict command and observation schemas**

Both schemas use version `2.0`, `additionalProperties: false` recursively, the exact `https://x.com` origin const, SHA-256 patterns, and discriminated payload requirements. `browser-observation.schema.json` permits only the minimal node and `BrowserPublicPostObservation` fields declared in `browser-protocol.ts`.

Register `browser-command` and `browser-observation` in `CONTRACT_NAMES` and the contract test only after both Schema files exist.

- [ ] **Step 5: Run protocol and security-focused tests**

```bash
pnpm exec vitest run tests/x/browser-command-broker.test.ts tests/contracts/contracts.test.ts
pnpm typecheck
```

Expected: PASS, including duplicate Submit claim rejection.

- [ ] **Step 6: Commit Task 4**

```bash
git add harnesses/research-publishing/adapters/x/browser/browser-protocol.ts harnesses/research-publishing/adapters/x/browser/command-broker.ts harnesses/research-publishing/core/types.ts harnesses/research-publishing/contracts/browser-command.schema.json harnesses/research-publishing/contracts/browser-observation.schema.json tests/x/browser-command-broker.test.ts tests/contracts/contracts.test.ts
git commit -m "feat: add durable browser command bridge"
```

---

### Task 5: Versioned X Page Contract

**Files:**
- Create: `harnesses/research-publishing/adapters/x/browser/page-contract.ts`
- Create: `harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.ts`
- Create: `tests/fixtures/x-browser-observations.ts`
- Create: `tests/x/x-page-contract.test.ts`

**Interfaces:**
- Consumes: sanitized `BrowserObservation` and `BrowserNodeObservation`.
- Produces: `XPageContract`, `XPageState`, `XComposerState`, `XSubmitControl`, `XWeb202608Contract`.

- [ ] **Step 1: Write failing semantic detection tests**

Fixtures must cover logged-in account, empty Composer, filled three-item Thread, active draft conflict, login page, security challenge, public Thread, and unknown page.

Test exact outcomes:

```ts
expect(contract.detectAccount(loggedIn)).toEqual({ handle: '@runtime_ai' });
expect(contract.readComposerItems(filledThread).map((item) => item.text)).toEqual([
  'First locked item',
  'Second locked item',
  'Third locked item'
]);
expect(() => contract.detectComposer(activeDraft)).toThrowError(
  expect.objectContaining({ code: 'DRAFT_CONFLICT' })
);
expect(() => contract.detectPage(unknownPage)).toThrowError(
  expect.objectContaining({ code: 'PAGE_CONTRACT_UNSUPPORTED' })
);
```

- [ ] **Step 2: Define the page-contract interface and fail-closed helpers**

```ts
export interface XPageContract {
  readonly id: string;
  readonly version: string;
  detectPage(observation: BrowserObservation): XPageState;
  detectAccount(observation: BrowserObservation): { readonly handle: string };
  detectComposer(observation: BrowserObservation): XComposerState;
  readComposerItems(observation: BrowserObservation): readonly XComposerItem[];
  detectSubmitControl(observation: BrowserObservation): XSubmitControl;
  detectPublishedPosts(observation: BrowserObservation): readonly BrowserPublicPostObservation[];
}

export type XPageState =
  | { readonly kind: 'authenticated_x' }
  | { readonly kind: 'login_required' }
  | { readonly kind: 'security_challenge' }
  | { readonly kind: 'composer' }
  | { readonly kind: 'public_thread' };

export interface XComposerItem {
  readonly ref: string;
  readonly ordinal: number;
  readonly text: string;
}

export interface XComposerState {
  readonly items: readonly XComposerItem[];
  readonly has_unknown_content: boolean;
  readonly add_control_ref: string | null;
}

export interface XSubmitControl {
  readonly ref: string;
  readonly enabled: boolean;
  readonly label: 'Post' | 'Post all' | 'Reply';
}

export declare function requireUniqueNode(
  nodes: readonly BrowserNodeObservation[],
  predicate: (node: BrowserNodeObservation) => boolean,
  purpose: string
): BrowserNodeObservation;
```

`requireUniqueNode` throws `PAGE_CONTRACT_UNSUPPORTED` for zero or multiple matches.

- [ ] **Step 3: Implement the first contract with fixed selector priority**

`XWeb202608Contract` must resolve each semantic target in this order:

1. Unique accessibility role/name pair.
2. Unique known `data-testid` in the sanitized node list.
3. Unique parent/child relationship among known semantic nodes.

The first contract does not implement coordinate fallback. It recognizes login/security pages before Composer nodes, extracts the account handle from the account switcher semantic node, recognizes composer item `textbox` nodes, recognizes `Add post` and `Post all` controls, and never returns a target when multiple candidates remain.

- [ ] **Step 4: Run contract tests and validate synthetic fixtures contain no private fields**

```bash
pnpm exec vitest run tests/x/x-page-contract.test.ts
rg -n -i "cookie|token|password|local_storage|direct_message|notification" tests/fixtures/x-browser-observations.ts
pnpm typecheck
```

Expected: contract tests PASS; `rg` returns no fixture data fields containing those names.

- [ ] **Step 5: Commit Task 5**

```bash
git add harnesses/research-publishing/adapters/x/browser/page-contract.ts harnesses/research-publishing/adapters/x/browser/contracts/x-web-2026-08.ts tests/fixtures/x-browser-observations.ts tests/x/x-page-contract.test.ts
git commit -m "feat: add fail-closed X page contract"
```

---

### Task 6: Deterministic Single, Thread, and Reply Composer Protocol

**Files:**
- Create: `harnesses/research-publishing/adapters/x/browser/composer-protocol.ts`
- Create: `tests/x/composer-protocol.test.ts`

**Interfaces:**
- Consumes: `PublicationPlanV2`, parsed X page/composer state, and retry counters.
- Produces: pure `nextComposerDecision(context, observation)` decisions: command, verified, or blocked.

- [ ] **Step 1: Write failing reducer tests for all three modes**

Tests must assert these exact sequences:

```text
Single: observe → set item 1 → observe → verified
Thread(3): observe → set 1 → observe → add → observe count 2 → set 2 → observe → add → observe count 3 → set 3 → observe all → verified
Reply: navigate locked target → observe snapshot → open reply → observe → set item 1 → observe → verified
```

Add failure cases for account mismatch, unknown draft, stale Reply target, extra Composer item, text mismatch, stale page revision, and an uncertain Add action. For uncertain Add, a fresh count of `N+1` continues, `N` allows one retry, and any other count blocks.

- [ ] **Step 2: Implement explicit decision types**

```ts
export interface ComposerContext {
  readonly plan: PublicationPlanV2;
  readonly expected_account: string;
  readonly created_item_refs: readonly string[];
  readonly next_ordinal: number;
  readonly add_retry_count: number;
  readonly last_page_revision: string | null;
}

export type ComposerDecision =
  | { readonly kind: 'command'; readonly input: IssueBrowserCommandInput; readonly next_context: ComposerContext }
  | { readonly kind: 'verified'; readonly page_revision: string; readonly submit_ref: string }
  | { readonly kind: 'blocked'; readonly code: ErrorCode; readonly message: string };

export function nextComposerDecision(
  context: ComposerContext,
  observation: BrowserObservation,
  contract: XPageContract
): ComposerDecision;
```

- [ ] **Step 3: Implement exact-mode reducers without Browser calls**

The reducer must:

- Compare account handles case-insensitively while preserving observed text.
- Require an empty Composer before the first Adapter-created item.
- Use `set_text`, never append typing, for content writes.
- Re-observe after every command.
- Normalize only NFC and CR/LF before digest comparison.
- Require exact item count, contiguous order, and no extra item before `verified`.
- Permit at most two proven-safe pre-submit retries.
- Return `REPLY_TARGET_STALE` when ID, author, URL, or snapshot digest changes.
- Never emit a `submit_once` command; Submit Barrier remains BrowserAdapter responsibility.

- [ ] **Step 4: Run the complete composer matrix**

```bash
pnpm exec vitest run tests/x/composer-protocol.test.ts tests/x/x-page-contract.test.ts
pnpm typecheck
```

Expected: all Single, Thread, Reply, conflict, mismatch, and uncertain-action cases PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add harnesses/research-publishing/adapters/x/browser/composer-protocol.ts tests/x/composer-protocol.test.ts
git commit -m "feat: add deterministic X composer protocol"
```

---

### Task 7: Public Thread Verifier and Immutable Receipt V2

**Files:**
- Create: `harnesses/research-publishing/adapters/x/browser/public-verifier.ts`
- Create: `harnesses/research-publishing/adapters/x/browser/receipt-v2.ts`
- Create: `harnesses/research-publishing/contracts/publish-receipt-v2.schema.json`
- Create: `tests/x/public-verifier.test.ts`
- Create: `tests/x/receipt-v2.test.ts`
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `PublicationPlanV2`, public Post observations with expanded links, Approval V2, and execution evidence.
- Produces: `PublicVerificationResult`, `verifyPublicThread`, `PublicationReceiptV2`, `createPublicationReceiptV2`, and `assertFinalReceiptV2`.

- [ ] **Step 1: Write failing full, partial, conflict, and `t.co` tests**

Use three synthetic Post observations with numeric IDs and explicit `reply_to_id`. Tests must prove:

- Full ordered chain returns `full_match` and the root URL.
- Missing ordinal 3 returns `partial` with `matched_ordinals: [1,2]` and `missing_ordinals: [3]`.
- Duplicate Post IDs return `conflict`.
- Wrong author/account returns `conflict`.
- Visible `https://t.co/abc` with `expanded_url` equal to the planned URL passes.
- Visible text, punctuation, quotes, or non-link whitespace changes fail.

- [ ] **Step 2: Implement deterministic text/link comparison and chain reconstruction**

Define:

```ts
export type PublicVerificationResult =
  | { readonly kind: 'full_match'; readonly root_url: string; readonly posts: readonly VerifiedPost[] }
  | { readonly kind: 'partial'; readonly matched_ordinals: readonly number[]; readonly missing_ordinals: readonly number[]; readonly posts: readonly VerifiedPost[] }
  | { readonly kind: 'no_match'; readonly reason: string }
  | { readonly kind: 'conflict'; readonly reason: string; readonly unexpected_post_ids: readonly string[] };

export interface VerifiedPost {
  readonly ordinal: number;
  readonly post_id: string;
  readonly canonical_url: string;
  readonly observed_digest: string;
  readonly reply_to_id: string | null;
}

export declare function verifyPublicThread(
  plan: PublicationPlanV2,
  observed: readonly BrowserPublicPostObservation[]
): PublicVerificationResult;
```

Use `twitterText.extractUrlsWithIndices` on expected text. Compare all non-URL segments exactly after NFC/LF normalization; compare observed links by ordered `expanded_url`; then reconstruct the chain by `reply_to_id`. Never fetch a link over the network.

- [ ] **Step 3: Write failing Receipt invariant and supersession tests**

Test that Final Receipt rejects wrong account, non-numeric/duplicate ID, wrong count, mismatched digest, missing Browser public verification, and `submit_command_count !== 1`. Test that upgrading `published_unverified` creates a new Receipt ID with `supersedes_receipt_id` while the old artifact remains readable.

- [ ] **Step 4: Implement immutable Receipt creation**

`PublicationReceiptV2` must use the exact status union from the spec and include:

```ts
export interface PublicationReceiptV2 {
  readonly schema_version: '2.0';
  readonly receipt_id: string;
  readonly supersedes_receipt_id: string | null;
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly run_id: string;
  readonly platform: 'x';
  readonly adapter: 'browser' | 'manual';
  readonly status: ReceiptStatusV2;
  readonly target_account: string;
  readonly observed_account: string | null;
  readonly approval: ApprovalEvidenceV2;
  readonly submission: SubmissionEvidenceV2;
  readonly public_result: PublicResultV2 | null;
  readonly verification: VerificationEvidenceV2;
  readonly created_at: string;
}
```

Define every nested Receipt type in `receipt-v2.ts`:

```ts
export type ReceiptStatusV2 =
  | 'finalized'
  | 'partial'
  | 'published_unverified'
  | 'outcome_unknown'
  | 'failed_after_submit'
  | 'verification_conflict';

export interface ApprovalEvidenceV2 {
  readonly plan_digest: string;
  readonly approval_digest: string;
  readonly approved_at: string;
  readonly expires_at: string;
}

export interface SubmissionEvidenceV2 {
  readonly armed_at: string;
  readonly attempted_at: string;
  readonly submit_command_count: 1;
  readonly page_contract_version: string;
  readonly executor_version: string;
}

export interface PublicResultV2 {
  readonly root_url: string;
  readonly published_at: string;
  readonly ordered_post_ids: readonly string[];
  readonly posts: readonly VerifiedPost[];
  readonly matched_ordinals: readonly number[];
  readonly missing_ordinals: readonly number[];
  readonly unexpected_post_ids: readonly string[];
}

export interface VerificationEvidenceV2 {
  readonly source: 'browser_public_page' | 'x_api_crosscheck' | 'user_report';
  readonly strength: 'public_browser_verified' | 'user_asserted' | 'unverified';
  readonly verified_at: string | null;
  readonly account_match: boolean;
  readonly count_match: boolean;
  readonly content_match: boolean;
  readonly order_match: boolean;
  readonly reply_chain_match: boolean;
  readonly links_match: boolean;
  readonly unique_post_ids: boolean;
  readonly evidence_digest: string;
}
```

`createPublicationReceiptV2` writes a new ID every time; it never overwrites a Receipt path. `assertFinalReceiptV2` enforces Browser source `browser_public_page`, strength `public_browser_verified`, exact plan count/order/digests, unique numeric IDs, account match, expanded-link match, UTC time order, and `submit_command_count === 1`.

- [ ] **Step 5: Add strict Receipt V2 Schema and run tests**

The schema `$id` is `rph://contracts/publish-receipt-v2/2.0`; every nested object rejects unknown fields. `verification.source` enum is `browser_public_page|x_api_crosscheck|user_report`, and `verification.strength` enum is `public_browser_verified|user_asserted|unverified`.

Register `publish-receipt-v2` in `CONTRACT_NAMES` and the contract test in this task.

Run:

```bash
pnpm exec vitest run tests/x/public-verifier.test.ts tests/x/receipt-v2.test.ts tests/contracts/contracts.test.ts
pnpm typecheck
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add harnesses/research-publishing/adapters/x/browser/public-verifier.ts harnesses/research-publishing/adapters/x/browser/receipt-v2.ts harnesses/research-publishing/core/types.ts harnesses/research-publishing/contracts/publish-receipt-v2.schema.json tests/x/public-verifier.test.ts tests/x/receipt-v2.test.ts tests/contracts/contracts.test.ts
git commit -m "feat: verify public X threads and issue receipts"
```

---

### Task 8: Browser Adapter Preflight, Composer Orchestration, and Submit Barrier

**Files:**
- Create: `harnesses/research-publishing/adapters/x/browser/browser-adapter.ts`
- Create: `tests/x/browser-adapter.test.ts`

**Interfaces:**
- Consumes: Plan V2, Approval V2, `ExecutionStore`, `CommandBroker`, `XPageContract`, composer reducer.
- Produces: `BrowserAdapter.start`, `next`, `claim`, `report`, `status`, and `cancelBeforeSubmit` through the first `submit_attempted` transition.

- [ ] **Step 1: Write failing start/preflight/submit-barrier tests**

The tests must verify:

1. `start` rejects a Manual V1 plan.
2. A V2 Plan whose `intent.media` is non-empty returns `UNSUPPORTED_PUBLICATION_FEATURE` before Browser preflight.
3. Missing `codex-chrome`, wrong browser family, or missing required commands returns `BROWSER_EXECUTOR_INCOMPATIBLE` before any write command.
4. Login/security page, account mismatch, draft conflict, and unsupported contract enter `pre_submit_failed`.
5. A complete three-item Thread reaches `composer_verified` and emits no Submit before a fresh account/composer observation.
6. Approval expiry at Submit Barrier returns `APPROVAL_STALE` and emits no Submit.
7. Successful Barrier writes `submit_armed`, one `submit_attempted` event, one Submit Command, and one attempt ID before returning the Command.
8. Calling `next` again never creates a second Submit Command.

- [ ] **Step 2: Implement the Browser Adapter facade and persisted execution context**

```ts
export interface BrowserAdapterApi {
  start(input: StartBrowserExecutionInput): Promise<BrowserExecutionSnapshot>;
  next(executionId: string): Promise<BrowserCommand | null>;
  claim(executionId: string, commandId: string): Promise<BrowserCommandClaim>;
  report(executionId: string, result: BrowserActionResultInput): Promise<BrowserExecutionSnapshot>;
  status(executionId: string): Promise<BrowserExecutionStatus>;
  cancelBeforeSubmit(executionId: string): Promise<BrowserExecutionSnapshot>;
}
```

Implement `export class BrowserAdapter implements BrowserAdapterApi` with constructor dependencies `WorkspaceStore`, `ExecutionStore`, `CommandBroker`, `XPageContract`, and `now: () => Date`.

Define its inputs and status response beside the class:

```ts
export interface StartBrowserExecutionInput {
  readonly execution_id: string;
  readonly plan: PublicationPlanV2;
  readonly approval: ApprovalV2;
  readonly capability_manifest: BrowserCapabilityManifest;
}

export interface BrowserExecutionStatus {
  readonly snapshot: BrowserExecutionSnapshot;
  readonly pending_command: BrowserCommand | null;
  readonly latest_receipt_path: string | null;
  readonly resumable_verification: boolean;
}
```

Persist `execution-context.json` with Plan/Approval paths, capability manifest digest, contract version, latest observation reference, current composer context, retry counters, pending Command ID, attempt ID, submit-command count, and observed account. Secrets and raw DOM are not legal fields.

- [ ] **Step 3: Implement preflight as read-only Commands**

`start` verifies Plan and Approval, writes immutable Plan/Approval/manifest artifacts, creates the execution, and queues `observe_page`. `report` passes each Observation through the page contract. It maps exact failure conditions to stable errors and never auto-selects another browser family.

Preflight success requires:

```ts
manifest.executor === 'codex-chrome';
manifest.browser_family === 'chrome';
required.every((kind) => manifest.capabilities.includes(kind));
observedOrigin === 'https://x.com';
observedAccount.toLowerCase() === plan.intent.target_account.toLowerCase();
```

- [ ] **Step 4: Connect composer decisions to issued Commands**

`next` reads the latest Observation and calls `nextComposerDecision`. It issues exactly the returned semantic Command. `report` stores the result and fresh Observation, then updates context. A transient read failure can issue a new read Command up to two times. An uncertain Add command requires a fresh count Observation before another Add.

- [ ] **Step 5: Implement the write-ahead Submit Barrier**

While holding the execution lock:

1. Re-run `verifyApprovalV2(plan, approval, now)`.
2. Require latest observed account match.
3. Require `composer_verified` and unchanged page revision.
4. Require exactly one enabled Submit control from the page contract.
5. Transition to `submit_armed`.
6. Create `attempt_id` once.
7. Issue one `click` Command with purpose `submit_once`, side effect `submit`, and current revision.
8. Persist `submit_command_issued` evidence and transition to `submit_attempted` before returning the Command.

If an attempt ID or Submit Command already exists, throw `SUBMIT_ALREADY_ATTEMPTED`.

- [ ] **Step 6: Run pre-submit orchestration tests**

```bash
pnpm exec vitest run tests/x/browser-adapter.test.ts tests/x/composer-protocol.test.ts tests/x/browser-command-broker.test.ts
pnpm typecheck
```

Expected: all selected tests PASS and no test performs network or Browser I/O.

- [ ] **Step 7: Commit Task 8**

```bash
git add harnesses/research-publishing/adapters/x/browser/browser-adapter.ts tests/x/browser-adapter.test.ts
git commit -m "feat: orchestrate safe X browser submission"
```

---

### Task 9: Outcome Resolver, Read-Only Retry, Partial, and Resume

**Files:**
- Create: `harnesses/research-publishing/adapters/x/browser/outcome-resolver.ts`
- Create: `tests/x/outcome-resolver.test.ts`
- Modify: `harnesses/research-publishing/adapters/x/browser/browser-adapter.ts`

**Interfaces:**
- Consumes: Submit result, public verifier, Receipt V2 factory, latest public observations, injected clock.
- Produces: `OutcomeResolver.classify`, verification schedule, `BrowserAdapter.resumeVerification`, and terminal/stage Receipt persistence.

- [ ] **Step 1: Write failing classification and schedule tests**

Tests must cover:

```ts
expect(verificationDelaysMs).toEqual([0, 3_000, 10_000, 30_000, 90_000]);
```

And these outcomes:

- Submit result uncertain plus later full public match → `finalized`.
- Success toast with no public match → never `finalized`.
- Partial public chain → `partial` with no write Command queued.
- No positive public signal after all delays → `outcome_unknown`.
- Positive root signal but incomplete evidence after all delays → `published_unverified`.
- Explicit platform rejection tied to current attempt → `failed_after_submit`.
- Timeline absence alone never → `failed_after_submit`.
- `resumeVerification` from unknown/unverified emits only read-side-effect Commands.

- [ ] **Step 2: Implement pure outcome classification**

```ts
export const verificationDelaysMs = [0, 3_000, 10_000, 30_000, 90_000] as const;

export type OutcomeDecision =
  | { readonly kind: 'verify_again'; readonly next_delay_ms: number }
  | { readonly kind: 'finalized'; readonly verification: Extract<PublicVerificationResult, { readonly kind: 'full_match' }> }
  | { readonly kind: 'partial'; readonly verification: Extract<PublicVerificationResult, { readonly kind: 'partial' }> }
  | { readonly kind: 'published_unverified'; readonly reason: string }
  | { readonly kind: 'outcome_unknown'; readonly reason: string }
  | { readonly kind: 'failed_after_submit'; readonly rejection_code: string }
  | { readonly kind: 'verification_conflict'; readonly reason: string };

export interface OutcomeInput {
  readonly attempt_id: string;
  readonly verification_index: number;
  readonly submit_result: BrowserActionResult;
  readonly public_verification: PublicVerificationResult;
  readonly positive_publish_signal: boolean;
  readonly platform_rejection: { readonly attempt_id: string; readonly code: string } | null;
}

export interface OutcomeResolver {
  classify(input: OutcomeInput): OutcomeDecision;
}
```

`failed_after_submit` requires a platform rejection signal containing the current `attempt_id`; it cannot be inferred from time passage or missing timeline content.

- [ ] **Step 3: Extend BrowserAdapter post-submit transitions**

After a claimed Submit result, transition `submit_attempted → outcome_resolving`. Queue only `observe_page`, allowed X navigation, and wait Commands. A UI toast is stored as weak evidence but cannot produce Final Receipt. Run the verifier after each public Observation and persist `verification-report-<sequence>.json`.

- [ ] **Step 4: Persist stage/final Receipts and implement resume**

For `partial`, `published_unverified`, `outcome_unknown`, `failed_after_submit`, and `verification_conflict`, write one immutable Receipt. `resumeVerification` accepts only unknown/unverified states, transitions to `public_verifying`, and creates a new Receipt that supersedes the earlier stage Receipt if verification later succeeds.

Assert every command after `submit_attempted` has `side_effect === 'read'`.

- [ ] **Step 5: Run resolver, receipt, and adapter tests**

```bash
pnpm exec vitest run tests/x/outcome-resolver.test.ts tests/x/browser-adapter.test.ts tests/x/public-verifier.test.ts tests/x/receipt-v2.test.ts
pnpm typecheck
```

Expected: all selected tests PASS.

- [ ] **Step 6: Commit Task 9**

```bash
git add harnesses/research-publishing/adapters/x/browser/outcome-resolver.ts harnesses/research-publishing/adapters/x/browser/browser-adapter.ts tests/x/outcome-resolver.test.ts tests/x/browser-adapter.test.ts
git commit -m "feat: resolve and resume X publication outcomes"
```

---

### Task 10: Host Bridge CLI

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`

**Interfaces:**
- Consumes: `XService.planXBrowser`, Approval V2, BrowserAdapter facade.
- Produces CLI operations `x plan --adapter browser`, `x browser start|next|claim|report|status|resume-verification|cancel-before-submit` with JSON-only output.

- [ ] **Step 1: Write failing CLI tests for the exact command surface**

Use temporary workspace/input files and the built CLI. Test:

- `x plan --adapter browser` returns a V2 Plan with state `approval_pending`.
- `x approve` dispatches a V2 Plan to `approvePublicationV2` and preserves the existing V1 Manual dispatch.
- `x browser start` returns `execution_id` and a read-only first command.
- `x browser next` returns the current pending command without duplicating it.
- `x browser claim --execution-id --command-id` succeeds once and exits with state-code `4` on replay.
- `x browser report` rejects wrong command ID, wrong origin, and stale revision.
- `x browser status` and `resume-verification` need no plan re-upload.
- `cancel-before-submit` rejects post-submit execution.
- Error JSON `operation` includes all three positional words, such as `x browser claim`.

- [ ] **Step 2: Extend argument parsing without adding a second CLI framework**

Add optional fields:

```ts
readonly executionId?: string;
readonly commandId?: string;
readonly adapter?: 'manual' | 'browser';
```

Parse `--execution-id`, `--command-id`, and `--adapter`; reject other Adapter values. Change error-operation capture to retain all positional tokens, not only two.

- [ ] **Step 3: Add the Browser operation handlers**

Inputs:

```text
x browser start: { plan, approval, capability_manifest }
x browser report: BrowserActionResultInput
x browser next/status/resume-verification/cancel-before-submit: execution ID option
x browser claim: execution ID and command ID options
```

Version dispatch for the existing commands is exact:

```ts
if (operation === 'x plan') {
  const runId = requiredRunId(options, input as { run_id?: string } | undefined);
  const artifact = options.adapter === 'browser'
    ? await x.planXBrowser(runId)
    : await x.planX(runId);
  return { ok: true, operation, artifact, state: 'approval_pending' };
}

if (operation === 'x approve') {
  const value = input as {
    plan: PublicationPlan | PublicationPlanV2;
    approved_by: string;
    ttl_ms: number;
  };
  const artifact = value.plan.schema_version === '2.0'
    ? approvePublicationV2(value.plan, value.approved_by, value.ttl_ms)
    : approvePublication(value.plan, value.approved_by, value.ttl_ms);
  await store.writeNew(`approvals/${artifact.approval_id}.json`, artifact);
  return { ok: true, operation, artifact, state: 'approved' };
}
```

Return `{ok, operation, artifact, state}` only. Do not call a browser, network, sleep, or X API from CLI. Map replay/stale/approval/state/busy errors to exit `4`, contract errors to `2`, and unavailable/incompatible Browser errors to `5`.

- [ ] **Step 4: Run CLI and complete regression tests**

```bash
pnpm build
pnpm exec vitest run tests/cli/cli.test.ts tests/integration/x-manual-workflow.test.ts
pnpm typecheck
```

Expected: Browser CLI tests PASS and V1 Manual CLI behavior remains unchanged.

- [ ] **Step 5: Commit Task 10**

```bash
git add harnesses/research-publishing/cli/index.ts tests/cli/cli.test.ts
git commit -m "feat: expose X browser host bridge CLI"
```

---

### Task 11: Browser-First X Skill and Explicit Manual Fallback

**Files:**
- Modify: `skills/x-publishing-copilot/SKILL.md`
- Create: `skills/x-publishing-copilot/references/browser-adapter-flow.md`
- Modify: `tests/skills/skill-boundary.test.ts`
- Modify: `docs/guides/quickstart.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: JSON CLI Host Bridge and Codex `chrome:control-chrome` capability.
- Produces: a thin, deterministic Browser-first Skill where Human confirms once and Skill never owns selectors, state transitions, success rules, or Receipt construction.

- [ ] **Step 1: Write failing Skill-boundary tests**

Extend `x-publishing-copilot` assertions:

```ts
expect(content).toContain('Browser Adapter');
expect(content).toContain('one explicit confirmation');
expect(content).toContain('x browser claim');
expect(content).toContain('resume-verification');
expect(content).toMatch(/Manual.*explicit.*fallback/is);
expect(content).not.toMatch(/querySelector|data-testid|CSS selector|screen coordinate/i);
expect(content).toMatch(/never.*(?:in-app browser|Edge|Computer Use)/i);
```

Read the reference file and assert it orders `next → claim → execute → report` and forbids a second Submit claim.

- [ ] **Step 2: Rewrite the Skill required flow with one Human gate**

The required flow must say, in order:

1. Run doctor and locate a compatible Harness.
2. Prepare/accept/review a V2 Browser Plan.
3. Render exact ordered Post text, target account, mode, link count, Adapter, expiry, and Digest in a separate Audit block.
4. Ask exactly one content-specific `publish_once` confirmation.
5. Run `x approve` only after that response.
6. Start the Browser execution using explicit Chrome.
7. For every Harness Command call `next`, `claim`, execute exactly that command, and `report` the structured result.
8. Never repeat a Submit claim; after uncertainty call `resume-verification` only.
9. Return root URL, ordered Post IDs, status, and Receipt path.
10. Offer Manual only after a pre-submit Browser failure and only with new explicit approval.

- [ ] **Step 3: Create the Host reference with exact safety behavior**

`browser-adapter-flow.md` must define:

```text
Harness next
→ verify command envelope and x.com origin
→ Harness claim
→ execute exactly one documented Chrome action
→ collect only sanitized Observation fields
→ Harness report
→ discard old tab target references
→ repeat
```

State that the Host reuses the Chrome Browser binding, reacquires only the X tab when its tab binding is stale, reads no Browser storage, and stops with `BROWSER_EXECUTOR_UNAVAILABLE` rather than switching surfaces.

- [ ] **Step 4: Document Browser and Manual flows**

Update Quickstart with a synthetic Browser Host Bridge example that stops before real Submit. Update README feature status so Browser Adapter is marked implemented only after Task 13 acceptance passes; before that commit, label it “V2 implementation branch.” Preserve V1 Manual instructions.

- [ ] **Step 5: Run Skill and docs checks**

```bash
pnpm exec vitest run tests/skills/skill-boundary.test.ts
rg -n -i "querySelector|screen coordinate|cookie|password" skills/x-publishing-copilot
```

Expected: tests PASS; `rg` finds only explicit prohibition language, not executable selector or credential instructions.

- [ ] **Step 6: Commit Task 11**

```bash
git add skills/x-publishing-copilot/SKILL.md skills/x-publishing-copilot/references/browser-adapter-flow.md tests/skills/skill-boundary.test.ts docs/guides/quickstart.md README.md
git commit -m "feat: add browser-first X publishing skill flow"
```

---

### Task 12: Artifact Retention and Safe Pruning

**Files:**
- Create: `harnesses/research-publishing/core/artifact-retention.ts`
- Create: `tests/core/artifact-retention.test.ts`
- Modify: `harnesses/research-publishing/core/workspace-store.ts`
- Modify: `harnesses/research-publishing/cli/index.ts`
- Modify: `tests/cli/cli.test.ts`

**Interfaces:**
- Consumes: execution snapshots, timestamped Browser artifacts, and the publishing-workspace allowlist.
- Produces: `DEFAULT_BROWSER_RETENTION`, `pruneBrowserArtifacts`, `BrowserPruneReport`, and CLI `x browser prune`.

- [ ] **Step 1: Write failing retention-boundary tests**

Create terminal and resumable executions with timestamped files. Prove that a prune at `2026-08-19T12:00:00.000Z`:

- Deletes terminal-execution Command, Claim, Result, and Observation files older than 30 days.
- Deletes terminal-execution diagnostic metadata older than 7 days.
- Retains Plan, Approval, Ledger, state projection, verification reports, and Receipts regardless of age.
- Retains every artifact for `published_unverified`, `outcome_unknown`, `pre_submit_failed`, and active states.
- Retains a terminal artifact that is exactly 30 days or 7 days old; expiry uses strict `age > retention`.
- Never follows symlinks and never deletes outside the publishing workspace.
- Returns exact deleted relative paths and byte count.

- [ ] **Step 2: Add minimal safe enumeration and deletion primitives**

Extend `WorkspaceStore` with:

```ts
export interface WorkspaceEntry {
  readonly name: string;
  readonly relative_path: string;
  readonly kind: 'file' | 'directory' | 'symlink';
}

export interface WorkspaceRetentionApi {
  list(relativeDirectory: string): Promise<readonly WorkspaceEntry[]>;
  removeFile(relativePath: string): Promise<number>;
}
```

Both methods resolve through `resolveAllowed`. `list` uses `readdir({withFileTypes:true})`, returns sorted entries, and labels symbolic links without traversing them. `removeFile` uses `lstat`, rejects directories and symlinks with `WORKSPACE_PATH_INVALID`, unlinks one regular file, and returns its prior byte size. It has no recursive mode.

- [ ] **Step 3: Implement exact retention policy and prune report**

```ts
export const DEFAULT_BROWSER_RETENTION = {
  command_observation_ms: 30 * 24 * 60 * 60 * 1000,
  diagnostics_ms: 7 * 24 * 60 * 60 * 1000
} as const;

export interface BrowserPruneReport {
  readonly schema_version: '2.0';
  readonly pruned_at: string;
  readonly deleted_paths: readonly string[];
  readonly deleted_bytes: number;
  readonly retained_audit_artifacts: number;
  readonly skipped_resumable_executions: readonly string[];
}

export declare function pruneBrowserArtifacts(
  store: WorkspaceStore,
  now?: Date
): Promise<BrowserPruneReport>;
```

The implementation scans only `runs/<run>/x/browser/<execution>/`. It reads `state.json` through `ExecutionStore` rebuild semantics. Only `finalized`, `partial`, `failed_after_submit`, `verification_conflict`, and `cancelled_before_submit` are prune-eligible. It reads each artifact's protocol timestamp rather than trusting filesystem mtime. It deletes only files below `commands`, `claims`, `results`, `observations`, and `diagnostics`; it never deletes a directory recursively.

- [ ] **Step 4: Expose explicit prune and invoke best-effort pruning at Browser start**

Add `research-publish x browser prune --workspace <path> --output json`. It returns the `BrowserPruneReport` and state `pruned`.

At `x browser start`, call pruning before creating the new execution. If pruning encounters a malformed old artifact, return its stable error and do not begin Browser writes; never silently skip an unsafe path.

- [ ] **Step 5: Prove screenshots are disabled in the first release**

Add a protocol test asserting `BrowserCommandKind` and both Browser schemas contain no `screenshot`, `capture_screen`, or arbitrary JavaScript command. A Host-supplied diagnostic metadata file is accepted only when it contains `local_only: true`, a SHA-256 digest, `created_at`, and `expires_at`; the Harness never requests the image bytes.

- [ ] **Step 6: Run retention, workspace, CLI, and protocol tests**

```bash
pnpm build
pnpm exec vitest run tests/core/artifact-retention.test.ts tests/core/workspace-store.test.ts tests/cli/cli.test.ts tests/x/browser-command-broker.test.ts
pnpm typecheck
```

Expected: all selected tests PASS, including path-boundary and symlink rejection.

- [ ] **Step 7: Commit Task 12**

```bash
git add harnesses/research-publishing/core/artifact-retention.ts harnesses/research-publishing/core/workspace-store.ts harnesses/research-publishing/cli/index.ts tests/core/artifact-retention.test.ts tests/core/workspace-store.test.ts tests/cli/cli.test.ts tests/x/browser-command-broker.test.ts
git commit -m "feat: prune expired browser execution artifacts"
```

---

### Task 13: Full Fake-Browser Acceptance, Security Audit, Manifest, and Release Evidence

**Files:**
- Create: `tests/integration/x-browser-workflow.test.ts`
- Create: `tests/security/browser-adapter-security.test.ts`
- Modify: `tools/acceptance.ts`
- Modify: `registry/manifests/research-publishing.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: every V2 contract and BrowserAdapter operation.
- Produces: reproducible, network-free evidence for all design acceptance criteria and a manifest containing final hashes.

- [ ] **Step 1: Write the complete synthetic six-Post workflow test**

The integration test must execute this real Harness sequence:

```text
Frozen Package
→ X draft review
→ Browser Plan V2
→ Approval V2
→ Browser start
→ observe logged-in target account
→ open empty Thread Composer
→ set/add/observe six locked items
→ fresh account/composer verification
→ issue and claim one Submit Command
→ report uncertain Submit result
→ observe six public Posts with ordered reply IDs
→ Final Receipt
```

Assert one Submit Command artifact, one Submit claim artifact, six unique numeric Post IDs, exact root URL, Browser public verification, and `submit_command_count: 1`.

- [ ] **Step 2: Add the complete failure/recovery matrix**

In the same integration test file, add scenario tables for:

- Two safe pre-submit retries then failure.
- Wrong account.
- Active draft conflict.
- Login/security challenge.
- Unknown Page Contract.
- Approval expiry at Barrier.
- Uncertain Add resolved by fresh count.
- Submit timeout with eventual full match.
- Partial three-of-six result.
- No match and resumable unknown.
- Unverified result later superseded by Final Receipt.
- Restart from Ledger with missing `state.json`.
- Duplicate Submit command/claim rejection.
- Explicit Manual fallback requiring a different Approval.

Every post-submit scenario asserts that all later commands have `side_effect: 'read'`.

- [ ] **Step 3: Add adversarial privacy and cross-origin tests**

`browser-adapter-security.test.ts` must reject:

- `https://twitter.com`, `https://example.com`, `javascript:`, and relative navigation origins.
- Observation objects containing credential/storage/full-DOM fields.
- A Home Timeline node set outside the permitted semantic scope.
- A result that changes payload digest or command ID.
- A stale page revision.
- Duplicate claims and duplicate results.
- Unsupported media in the Plan.
- A Skill-requested Browser-family switch.

Inspect all persisted JSON recursively and assert it does not contain values matching `Bearer `, `Cookie:`, password-field names, or the synthetic private marker `PRIVATE_TIMELINE_SENTINEL`.

- [ ] **Step 4: Extend `tools/acceptance.ts` with a network-free Browser result**

Keep existing Article and Manual acceptance. Add `browserXComplete` using the fake Host Bridge and return:

```json
{
  "ok": true,
  "article": "complete",
  "manual_x": "complete",
  "browser_x": "simulated_complete",
  "network": "unused",
  "submit_commands": 1,
  "submit_claims": 1
}
```

The acceptance cleanup must retain its existing verified-temp-path guard.

- [ ] **Step 5: Run the entire quality gate before changing feature status**

Run:

```bash
pnpm check
```

Expected:

- ESLint exits `0`.
- TypeScript build and no-emit typecheck exit `0`.
- All Vitest suites pass.
- Acceptance JSON reports `browser_x: simulated_complete`, `network: unused`, and exactly one Submit command/claim.

- [ ] **Step 6: Regenerate and verify the public manifest**

Run:

```bash
pnpm manifest
pnpm acceptance
git diff --check
git status --short
```

Expected: manifest hashes include all shipped source, contract, Skill, and reference files; acceptance remains green; diff check is clean. Update README from “V2 implementation branch” to “V2 Browser Adapter available” only now, with a warning that real Chrome smoke remains explicit and non-CI.

- [ ] **Step 7: Commit Task 13**

```bash
git add tests/integration/x-browser-workflow.test.ts tests/security/browser-adapter-security.test.ts tools/acceptance.ts registry/manifests/research-publishing.json README.md
git commit -m "test: accept X browser adapter v2"
```

- [ ] **Step 8: Record final verification evidence**

Run:

```bash
git status --short
git log --oneline --decorate -15
pnpm check
```

Expected: clean working tree; one focused commit per task; final `pnpm check` exits `0`. Do not run a live X smoke test without a separately approved test-account Publication Plan and Human confirmation.

---

## Spec Coverage Map

| Design acceptance criteria | Implementation evidence |
|---|---|
| 1–2 Stable Plan and Digest | Task 1 unit/schema tests |
| 3–5 separated Approval Card and exact one-time Approval scope | Tasks 2 and 11 |
| 6–8 Chrome session boundary, account check, draft protection | Tasks 5, 8, and 11 |
| 9–10 Composer count/order/text and fresh revisions | Tasks 5, 6, and 8 |
| 11–12 one Submit issue/claim and no blind retry | Tasks 3, 4, 8, and 9 |
| 13–16 public reconstruction, links, Receipt, and Partial evidence | Tasks 7 and 9 |
| 17–19 restart, Ledger rebuild, and Receipt supersession | Tasks 3, 7, and 9 |
| 20 privacy and retention | Tasks 4, 12, and 13 security tests |
| 21–24 no Browser/Adapter fallback and fail-closed Contract | Tasks 5, 8, 10, and 11 |
| 25 complete automated success/failure/recovery evidence | Task 13 scenario matrix |
| 26 no real X side effect in CI | Task 13 acceptance and final quality gate |

Self-review result: every one of the 26 design acceptance criteria maps to at least one implementation task and an explicit test or quality gate; no uncovered criterion remains.

---

## Context Handoff

- Design authority: `docs/superpowers/specs/2026-08-19-x-browser-adapter-v2-design.zh-CN.md`.
- V1 authority: `docs/architecture/research-publishing-harness-design.zh-CN.md`.
- Branch at plan creation: `codex/x-browser-adapter-v2-design`.
- V1 Manual semantics are compatibility constraints, not a Browser verification shortcut.
- The first implementation target is a deterministic fake Host Bridge; Codex Chrome integration is accepted through Skill/Host protocol plus explicit local smoke, never CI-side real publishing.
- Any implementation that can issue or claim a second Submit Command for one attempt violates the design even if all happy-path tests pass.
