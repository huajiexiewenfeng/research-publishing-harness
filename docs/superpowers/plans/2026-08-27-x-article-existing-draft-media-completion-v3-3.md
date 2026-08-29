# X Article Existing Draft Media Completion V3.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely bind a body-complete, zero-media X Article Draft to a new execution, upload its approved cover and inline images without rewriting the article, and stop at a reconciled unpublished Draft.

**Architecture:** Add a digest-bound existing-Draft snapshot contract and embed it in the V3.2 materialization plan. A new `media_completion_v3_3` adapter mode navigates to the exact Draft, re-observes and re-verifies the locked editor state, initializes an adopted-body checkpoint, then reuses the existing cover and visual-anchor transactions. The driver terminates at `draft_reconciled`; command guards make Draft creation, title/body writes, Preview, and Publish impossible in this mode.

**Tech Stack:** Node.js >=20.19, pnpm 11.19.0, TypeScript 6.0.3, AJV 8.20.0, Vitest 4.1.10, Commander 14.0.3, Codex Chrome Browser Host, JSON Schema 2020-12.

## Global Constraints

- Work on top of commit `9c33e35` in `codex/x-article-fast-materialization-v3-2`; preserve the verified V3.2 new-Draft path.
- Add no runtime or development dependency.
- Existing-Draft mode must issue zero `create_article_draft`, `set_article_title`, `import_article_document`, `insert_article_block`, `open_article_preview`, `open_publish_review`, and `publish_article_once` commands.
- The adopted Draft must have the exact approved title, normalized body, complete ordered anchor manifest, `autosave_state=saved`, zero cover, zero inline images, and no unknown content.
- Every write remains bound to account, Draft ID, publication Plan digest, materialization digest, page revision, package digest, asset digest, and anchor context.
- Unknown or changed editor state fails closed; no automatic fallback to new Draft creation or block-by-block body insertion.
- Recovery always observes before retrying and never uploads an image twice when effect is uncertain.
- Initial live target is Draft `2092851979932647424`, one 5:2 cover, and three inline images; the run stops at `draft_reconciled` with Publish command count 0.
- Normal automation target is <=6 minutes for one cover plus three inline images; stages longer than 20 seconds emit a progress reason.
- Use TDD for every production change. Each task must show RED before GREEN and end in its own commit.

---

## File Map

**New files**

- `harnesses/research-publishing/contracts/x-article-existing-draft-binding.schema.json` — immutable snapshot contract for the body-complete Draft.
- `harnesses/research-publishing/core/x-article-existing-draft-binding.ts` — snapshot creation and exact-state verification.
- `tests/x-article/article-existing-draft-binding.test.ts` — positive and negative binding cases.
- `skills/x-publishing-copilot/references/x-article-existing-draft-media-completion-v3-3.md` — operator and Browser Host flow.
- `.llm-wiki/verification/x-article-existing-draft-media-completion-v3-3-browser-host.md` — real Draft-only smoke evidence.

**Modified files**

- `harnesses/research-publishing/core/types.ts` — register the new contract name.
- `harnesses/research-publishing/core/x-article-materialization.ts` — bind the snapshot into Plan/checkpoint digests and model adopted body origin.
- `harnesses/research-publishing/core/x-article-execution.ts` — add terminal pre-public `draft_reconciled` state.
- `harnesses/research-publishing/contracts/x-article-materialization-plan.schema.json` — optional binding with mode consistency.
- `harnesses/research-publishing/contracts/x-article-materialization-checkpoint.schema.json` — Draft origin and adopted body status.
- `harnesses/research-publishing/contracts/x-article-execution-event.schema.json` — `draft_reconciled` state.
- `harnesses/research-publishing/core/schema-validator.ts` — command/observation ceilings for the existing-Draft mode.
- `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts` — prepare, navigate, re-verify, bind, drive, and stop.
- `harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts` — return `complete` instead of Preview for Draft-only completion.
- `harnesses/research-publishing/adapters/x/article-browser/article-draft-reconciler.ts` — preserve adopted body phase and recover media effects.
- `harnesses/research-publishing/cli/index.ts` — expose `prepare-existing-media` and support its status.
- `tests/x-article/article-materialization.test.ts` — Plan/checkpoint digest and backward compatibility.
- `tests/x-article/article-execution.test.ts` — terminal Draft reconciliation transition.
- `tests/x-article/article-browser-adapter.test.ts` — end-to-end adapter lifecycle and crash recovery.
- `tests/x-article/article-editor-protocol.test.ts` — Draft-only completion decision.
- `tests/x-article/article-draft-reconciler.test.ts` — adopted body and media recovery matrix.
- `tests/security/x-article-browser-security.test.ts` — forbidden commands, foreign observations, drift, and path boundaries.
- `tests/cli/cli.test.ts` — strict CLI routing and redacted status.
- `skills/x-publishing-copilot/SKILL.md` — route body-complete Draft requests to V3.3.
- `skills/x-publishing-copilot/references/x-article-materialization-v3-2.md` — compatibility note and V3.3 handoff.
- `skills/x-publishing-copilot/references/browser-adapter-flow.md` — Host command contract.
- `registry/manifests/research-publishing.json` and `registry/harnesses.json` — generated manifest refresh.
- `tests/tools/manifest-content.test.ts`, `tests/tools/acceptance-output.test.ts` — packaged protocol evidence.

---

### Task 1: Define and verify the immutable existing-Draft binding

**Files:**
- Create: `harnesses/research-publishing/contracts/x-article-existing-draft-binding.schema.json`
- Create: `harnesses/research-publishing/core/x-article-existing-draft-binding.ts`
- Modify: `harnesses/research-publishing/core/types.ts:28-129`
- Test: `tests/x-article/article-existing-draft-binding.test.ts`
- Test: `tests/contracts/contracts.test.ts`

**Interfaces:**
- Consumes: `XArticlePublicationPlanV1`, `XArticleBrowserObservation`, `createXArticleImportTemplate()`, `sha256()`, `validateContract()`.
- Produces: `XArticleExistingDraftBindingV1`, `computeXArticleExistingDraftRevision(observation)`, `createXArticleExistingDraftBinding(input)`, `verifyXArticleExistingDraftBinding(binding, plan, observation)`.

- [ ] **Step 1: Write the failing contract and verifier tests**

Create `tests/x-article/article-existing-draft-binding.test.ts` with one canonical observation and a mutation table:

```ts
import { describe, expect, it } from 'vitest';
import { sha256 } from '../../harnesses/research-publishing/core/digest.js';
import {
  computeXArticleExistingDraftRevision,
  createXArticleExistingDraftBinding,
  verifyXArticleExistingDraftBinding
} from '../../harnesses/research-publishing/core/x-article-existing-draft-binding.js';
import { createXArticleImportTemplate } from '../../harnesses/research-publishing/adapters/x/article-browser/article-import-template.js';
import { computeXArticlePageRevision } from '../../harnesses/research-publishing/adapters/x/article-browser/article-browser-protocol.js';
import { createXArticlePublicationPlan } from '../../harnesses/research-publishing/core/x-article-publication-plan.js';

const inlineAsset = {
  asset_id: 'asset_runtime_boundary', relative_path: 'assets/runtime-boundary.png',
  digest: `sha256:${'a'.repeat(64)}` as `sha256:${string}`, mime_type: 'image/png' as const,
  alt_text: 'Runtime boundary diagram', claim_refs: ['claim_runtime']
};
const publicationPlan = createXArticlePublicationPlan({
  planId: 'plan_existing_body', runId: 'run_existing_body', targetAccount: '@Glen56121',
  articlePackage: { root: 'articles/runtime/existing-body', digest: `sha256:${'b'.repeat(64)}` },
  document: {
    schema_version: '1.0', title: 'Runtime boundary', cover_asset_id: null,
    blocks: [
      { kind: 'paragraph', runs: [{ text: 'Skills own semantics.', marks: [], link: null }] },
      { kind: 'image', asset_id: inlineAsset.asset_id, alt_text: inlineAsset.alt_text }
    ]
  },
  visuals: [{ asset: inlineAsset, placement: { kind: 'block', block_ordinal: 2 } }],
  plannedAt: '2026-08-27T05:55:00.000Z', provenance: {}
});

function observation(plan: typeof publicationPlan) {
  const template = createXArticleImportTemplate(plan.intent.document);
  const body = {
    schema_version: '1.0' as const,
    observation_id: 'obs_existing_body',
    execution_id: 'source_execution',
    command_id: 'source_command',
    origin: 'https://x.com' as const,
    canonical_url: 'https://x.com/compose/articles/edit/2092851979932647424',
    observed_at: '2026-08-27T05:56:04.000Z',
    account_handle: '@Glen56121',
    page_kind: 'article_editor' as const,
    controls: [],
    editor: {
      draft_id: '2092851979932647424',
      title: plan.intent.document.title,
      blocks: plan.intent.document.blocks.filter((block) => block.kind !== 'image'),
      visuals: [],
      import_state: {
        template_digest: template.template_digest,
        source_document_digest: template.source_document_digest,
        unresolved_anchors: template.anchors
      },
      has_unknown_content: false,
      autosave_state: 'saved' as const
    },
    preview: null,
    publish_review: null,
    public_article: null
  };
  return { ...body, page_revision: computeXArticlePageRevision(body) };
}

it('locks an exact body-complete zero-media Draft', () => {
  const plan = publicationPlan;
  const observed = observation(plan);
  const binding = createXArticleExistingDraftBinding({ publication_plan: plan, observation: observed });
  expect(binding).toMatchObject({
    schema_version: 'x-article-existing-draft-binding/v1',
    mode: 'adopt_existing',
    draft_id: '2092851979932647424',
    expected_account: '@Glen56121',
    expected_editor_revision: computeXArticleExistingDraftRevision(observed),
    expected_cover_count: 0,
    expected_inline_media_count: 0
  });
  expect(binding.binding_digest).toBe(sha256(
    Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'binding_digest'))
  ));
  expect(verifyXArticleExistingDraftBinding(binding, plan, observed)).toEqual(binding);
});

it.each([
  ['account', (value: any) => ({ ...value, account_handle: '@Foreign' })],
  ['draft', (value: any) => ({ ...value, editor: { ...value.editor, draft_id: '2090000000000000000' } })],
  ['title', (value: any) => ({ ...value, editor: { ...value.editor, title: 'Changed' } })],
  ['body', (value: any) => ({ ...value, editor: { ...value.editor, blocks: [] } })],
  ['anchors', (value: any) => ({ ...value, editor: { ...value.editor, import_state: null } })],
  ['cover', (value: any) => ({ ...value, editor: { ...value.editor, visuals: [{
    ref: 'cover', asset_id: 'cover', kind: 'cover', block_ordinal: null,
    alt_text: null, status: 'uploaded', owned_by_execution: false
  }] } })],
  ['unknown', (value: any) => ({ ...value, editor: { ...value.editor, has_unknown_content: true } })],
  ['saving', (value: any) => ({ ...value, editor: { ...value.editor, autosave_state: 'saving' } })]
])('rejects %s drift before binding', (_name, mutate) => {
  const plan = publicationPlan;
  expect(() => createXArticleExistingDraftBinding({
    publication_plan: plan,
    observation: resign(mutate(observation(plan)))
  })).toThrowError(/existing X Article Draft/i);
});
```

Define `resign()` in the same test file; it removes and recomputes `page_revision` after each mutation.

- [ ] **Step 2: Run the focused tests to prove RED**

Run:

```powershell
pnpm exec vitest run tests/x-article/article-existing-draft-binding.test.ts tests/contracts/contracts.test.ts
```

Expected: FAIL because the contract and `x-article-existing-draft-binding.ts` do not exist.

- [ ] **Step 3: Add the schema and exact verifier**

Create the schema with `additionalProperties: false` and these required fields:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "rph://contracts/x-article-existing-draft-binding/v1",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version", "mode", "draft_id", "expected_account",
    "expected_editor_revision", "expected_title_digest", "expected_document_digest",
    "expected_import_template_digest", "expected_anchor_manifest_digest",
    "expected_cover_count", "expected_inline_media_count", "source_observation_digest",
    "observed_at", "binding_digest"
  ]
}
```

Implement the public model and functions:

```ts
export interface XArticleExistingDraftBindingV1 {
  readonly schema_version: 'x-article-existing-draft-binding/v1';
  readonly mode: 'adopt_existing';
  readonly draft_id: string;
  readonly expected_account: string;
  readonly expected_editor_revision: `sha256:${string}`;
  readonly expected_title_digest: `sha256:${string}`;
  readonly expected_document_digest: `sha256:${string}`;
  readonly expected_import_template_digest: `sha256:${string}`;
  readonly expected_anchor_manifest_digest: `sha256:${string}`;
  readonly expected_cover_count: 0;
  readonly expected_inline_media_count: 0;
  readonly source_observation_digest: `sha256:${string}`;
  readonly observed_at: string;
  readonly binding_digest: `sha256:${string}`;
}

export function computeXArticleExistingDraftRevision(
  observation: XArticleBrowserObservation
): `sha256:${string}` {
  return sha256({
    origin: observation.origin,
    canonical_url: observation.canonical_url,
    account_handle: observation.account_handle,
    page_kind: observation.page_kind,
    editor: observation.editor
  });
}

export function createXArticleExistingDraftBinding(
  input: CreateXArticleExistingDraftBindingInput
): XArticleExistingDraftBindingV1 {
  assertAdoptableEditor(input.publication_plan, input.observation);
  const template = createXArticleImportTemplate(input.publication_plan.intent.document);
  const body = {
    schema_version: 'x-article-existing-draft-binding/v1' as const,
    mode: 'adopt_existing' as const,
    draft_id: input.observation.editor!.draft_id,
    expected_account: input.publication_plan.intent.target_account,
    expected_editor_revision: computeXArticleExistingDraftRevision(input.observation),
    expected_title_digest: sha256(input.publication_plan.intent.document.title),
    expected_document_digest: sha256(input.publication_plan.intent.document),
    expected_import_template_digest: template.template_digest as `sha256:${string}`,
    expected_anchor_manifest_digest: sha256(template.anchors),
    expected_cover_count: 0 as const,
    expected_inline_media_count: 0 as const,
    source_observation_digest: sha256(input.observation),
    observed_at: input.observation.observed_at
  };
  return validateContract('x-article-existing-draft-binding', {
    ...body, binding_digest: sha256(body)
  });
}
```

`assertAdoptableEditor()` must compare the exact account, editor Draft ID from the canonical URL, exact title, normalized non-image blocks, the complete import-template digests and ordered unresolved anchors, `visuals.length === 0`, `has_unknown_content === false`, and `autosave_state === 'saved'`. `verifyXArticleExistingDraftBinding()` first verifies `binding_digest`, then repeats those semantic checks against the fresh Observation and requires `computeXArticleExistingDraftRevision(fresh) === binding.expected_editor_revision`. It does not compare fresh observation IDs, command IDs, timestamps, or `source_observation_digest`; those remain immutable provenance for the original Snapshot. Existing `page_revision` continues to guard a single Browser command and is not used as the cross-execution Draft lock.

Add `'x-article-existing-draft-binding'` to `CONTRACT_NAMES`.

- [ ] **Step 4: Run focused tests to prove GREEN**

Run:

```powershell
pnpm exec vitest run tests/x-article/article-existing-draft-binding.test.ts tests/contracts/contracts.test.ts
```

Expected: PASS with all binding mutations rejected.

- [ ] **Step 5: Commit**

```powershell
git add harnesses/research-publishing/contracts/x-article-existing-draft-binding.schema.json harnesses/research-publishing/core/x-article-existing-draft-binding.ts harnesses/research-publishing/core/types.ts tests/x-article/article-existing-draft-binding.test.ts tests/contracts/contracts.test.ts
git commit -m "feat: lock existing X Article drafts"
```

---

### Task 2: Bind the snapshot into materialization Plan and checkpoint state

**Files:**
- Modify: `harnesses/research-publishing/core/x-article-materialization.ts:13-314`
- Modify: `harnesses/research-publishing/contracts/x-article-materialization-plan.schema.json`
- Modify: `harnesses/research-publishing/contracts/x-article-materialization-checkpoint.schema.json`
- Modify: `harnesses/research-publishing/core/schema-validator.ts:45-75`
- Test: `tests/x-article/article-materialization.test.ts`
- Test: `tests/x-article/article-materialization-store.test.ts`

**Interfaces:**
- Consumes: `XArticleExistingDraftBindingV1` from Task 1.
- Produces: `draft_binding` on `XArticleMaterializationPlanV1`; `draft_origin`, `source_execution_id`, and `adopted_verified` checkpoint evidence; `createAdoptedXArticleMaterializationCheckpoint()`.

- [ ] **Step 1: Write failing Plan/checkpoint tests**

Add tests that prove a binding changes the materialization digest and creates an adopted checkpoint without claiming a body import:

```ts
it('creates an adopted-body checkpoint bound to the locked Draft snapshot', () => {
  const plan = createXArticleMaterializationPlan({
    execution_id: 'execution_existing_media',
    publication_plan: publicationPlan,
    import_template: template,
    strategy: 'rich_text_anchor_import/v1',
    draft_binding: existingDraftBinding
  });
  const checkpoint = createAdoptedXArticleMaterializationCheckpoint({
    plan,
    observation: freshMatchingObservation,
    updated_at: '2026-08-27T06:00:00.000Z'
  });
  expect(plan.draft_binding).toEqual(existingDraftBinding);
  expect(checkpoint).toMatchObject({
    draft_id: existingDraftBinding.draft_id,
    draft_origin: 'adopted_existing',
    source_execution_id: null,
    phase: 'body_verified',
    body: { status: 'adopted_verified', observed_digest: plan.import_template_digest },
    last_editor_revision: freshMatchingObservation.page_revision,
    publish_confirmation: 'absent'
  });
  expect(checkpoint.media.every((entry) => entry.status === 'pending')).toBe(true);
});

it('preserves the V3.2 initial checkpoint for a null binding', () => {
  const plan = createXArticleMaterializationPlan({
    execution_id: 'execution_new_draft', publication_plan: publicationPlan,
    import_template: template, strategy: 'rich_text_anchor_import/v1', draft_binding: null
  });
  expect(createInitialXArticleMaterializationCheckpoint({ plan, updated_at: now })).toMatchObject({
    draft_id: null, draft_origin: 'created_new', source_execution_id: null,
    phase: 'preflight_pending', body: { status: 'pending', observed_digest: null }
  });
});
```

Add negative tests for a foreign observation, a changed binding digest, and a binding paired with `block_materialization/v1`.

- [ ] **Step 2: Run tests to prove RED**

```powershell
pnpm exec vitest run tests/x-article/article-materialization.test.ts tests/x-article/article-materialization-store.test.ts
```

Expected: FAIL because Plan/checkpoint do not model existing-Draft binding.

- [ ] **Step 3: Extend Plan and checkpoint without breaking V3.2**

Use these exact type additions:

```ts
export interface XArticleMaterializationPlanV1 {
  // existing fields stay unchanged
  readonly draft_binding: XArticleExistingDraftBindingV1 | null;
}

export interface CreateXArticleMaterializationPlanInput {
  readonly execution_id: string;
  readonly publication_plan: XArticlePublicationPlanV1;
  readonly import_template: XArticleImportTemplateV1;
  readonly strategy: XArticleMaterializationStrategy;
  readonly draft_binding?: XArticleExistingDraftBindingV1 | null;
}

export interface XArticleMaterializationCheckpointV1 {
  // existing fields stay unchanged
  readonly draft_origin: 'created_new' | 'adopted_existing';
  readonly source_execution_id: string | null;
  readonly body: {
    readonly status: 'pending' | 'issued' | 'verified' | 'adopted_verified';
    readonly observed_digest: `sha256:${string}` | null;
  };
}

export function createAdoptedXArticleMaterializationCheckpoint(
  input: CreateAdoptedXArticleMaterializationCheckpointInput
): XArticleMaterializationCheckpointV1 {
  if (input.plan.draft_binding === null) {
    throw new HarnessError('ARTICLE_DRAFT_CONFLICT', 'existing Draft binding is absent');
  }
  verifyXArticleExistingDraftBinding(
    input.plan.draft_binding, input.publication_plan, input.observation
  );
  return validateContract('x-article-materialization-checkpoint', {
    ...initialCheckpointBody(input.plan, input.updated_at),
    draft_id: input.plan.draft_binding.draft_id,
    draft_origin: 'adopted_existing',
    source_execution_id: null,
    phase: 'body_verified',
    body: { status: 'adopted_verified', observed_digest: input.plan.import_template_digest },
    last_editor_revision: input.observation.page_revision
  });
}
```

`CreateAdoptedXArticleMaterializationCheckpointInput` contains `plan`, `publication_plan`, `observation`, and `updated_at`. Make `draft_binding` explicit in the produced Plan (`null` when the optional V3.2 input is omitted) so it participates in `materialization_digest`. Update `materializationPlanConsistent`:

```ts
const existingDraft = Reflect.get(value, 'draft_binding') !== null;
const expectedCommands = existingDraft ? 4 + visualAnchors.length : 12 + visualAnchors.length;
const expectedObservations = existingDraft ? 3 + visualAnchors.length : 9 + visualAnchors.length;
```

Require `strategy === 'rich_text_anchor_import/v1'` for non-null binding. Update both schemas and all exact-object fixtures.

- [ ] **Step 4: Run focused and contract tests**

```powershell
pnpm exec vitest run tests/x-article/article-materialization.test.ts tests/x-article/article-materialization-store.test.ts tests/contracts/contracts.test.ts tests/core/schema-validator.test.ts
```

Expected: PASS; V3.2 null-binding fixtures and V3.3 adopted fixtures both validate.

- [ ] **Step 5: Commit**

```powershell
git add harnesses/research-publishing/core/x-article-materialization.ts harnesses/research-publishing/contracts/x-article-materialization-plan.schema.json harnesses/research-publishing/contracts/x-article-materialization-checkpoint.schema.json harnesses/research-publishing/core/schema-validator.ts tests/x-article/article-materialization.test.ts tests/x-article/article-materialization-store.test.ts tests/contracts/contracts.test.ts tests/core/schema-validator.test.ts
git commit -m "feat: model adopted X Article checkpoints"
```

---

### Task 3: Add the existing-Draft Adapter lifecycle and stop at Draft reconciliation

**Files:**
- Modify: `harnesses/research-publishing/core/x-article-execution.ts:4-55`
- Modify: `harnesses/research-publishing/contracts/x-article-execution-event.schema.json`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts:84-505,1330-1484,1983-2264`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts:36-106`
- Test: `tests/x-article/article-execution.test.ts`
- Test: `tests/x-article/article-browser-adapter.test.ts`
- Test: `tests/x-article/article-editor-protocol.test.ts`

**Interfaces:**
- Consumes: binding-aware Plan and adopted checkpoint from Tasks 1-2.
- Produces: `prepareExistingDraftMedia(plan, sourceObservation, capabilities)`; `execution_mode='media_completion_v3_3'`; terminal `draft_reconciled` execution state.

- [ ] **Step 1: Write the failing lifecycle test**

Add an Adapter test that asserts the exact command sequence and forbidden command set:

```ts
it('adopts a body-complete Draft and issues the first media command without rewriting content', async () => {
  const store = await WorkspaceStore.open(await mkdtemp(join(tmpdir(), 'rph-existing-media-')));
  const adapter = new XArticleBrowserAdapter(store, new XArticleWeb2026_08Contract(), {
    executionId: () => 'execution_existing_media'
  });
  const issued: string[] = [];
  const execution = await adapter.prepareExistingDraftMedia(
    coverInlinePlan, sourceBodyCompleteObservation, coverBulkCapabilities
  );

  let next = await adapter.next(execution.execution_id);
  issued.push(next.command!.kind);
  expect(next.command).toMatchObject({
    kind: 'navigate', draft_id: '2092851979932647424', side_effect: 'read',
    payload: { kind: 'navigate', url: 'https://x.com/compose/articles/edit/2092851979932647424' }
  });

  await reportSuccess(
    adapter,
    execution.execution_id,
    next.command!,
    freshBodyCompleteObservation(execution.execution_id, next.command!.command_id)
  );
  next = await adapter.next(execution.execution_id);
  issued.push(next.command!.kind);
  expect(next.command?.kind).toBe('upload_article_cover');

  expect(issued).not.toEqual(expect.arrayContaining([
    'create_article_draft', 'set_article_title', 'import_article_document',
    'insert_article_block', 'open_article_preview', 'open_publish_review', 'publish_article_once'
  ]));
});
```

Define `coverInlinePlan` in the same test file by combining its existing `coverAsset` and `inlineAsset` fixtures into one document with one cover and at least one image block. Define `sourceBodyCompleteObservation` with the source execution identity and `freshBodyCompleteObservation(executionId, commandId)` with the same normalized editor state but new command identity; their `computeXArticleExistingDraftRevision()` values must match while their `page_revision` values differ. Add a completion test that reports cover plus all inline image effects, calls `next()`, and expects `{ state: 'draft_reconciled', command: null, publish_command_count: 0 }`.

- [ ] **Step 2: Run tests to prove RED**

```powershell
pnpm exec vitest run tests/x-article/article-execution.test.ts tests/x-article/article-browser-adapter.test.ts tests/x-article/article-editor-protocol.test.ts
```

Expected: FAIL because the mode, preparation API, and terminal state do not exist.

- [ ] **Step 3: Add the mode and preparation API**

Extend context and materialization decision inputs:

```ts
type XArticleExecutionMode =
  | 'materialization_v3_2'
  | 'media_completion_v3_3'
  | 'legacy_preapproved';

export interface XArticleMaterializationEditorContext {
  readonly plan: XArticlePublicationPlanV1;
  readonly materialization_plan: XArticleMaterializationPlanV1;
  readonly draft_id: string;
  readonly completion_target: 'preview' | 'draft_reconciled';
}
```

Implement preparation as a sibling of `prepare()`:

```ts
async prepareExistingDraftMedia(
  plan: XArticlePublicationPlanV1,
  sourceObservation: XArticleBrowserObservation,
  capabilities: XArticleBrowserCapabilityManifestV1
): Promise<XArticleExecutionSnapshotV1> {
  assertXArticlePublicationPlan(plan);
  this.verifyPreparedCapabilities(plan, capabilities);
  const binding = createXArticleExistingDraftBinding({
    publication_plan: plan, observation: sourceObservation
  });
  return this.prepareLocked(plan, capabilities, this.executionId(), {
    execution_mode: 'media_completion_v3_3', draft_binding: binding
  });
}
```

For `created` in `media_completion_v3_3`, transition to `preflight` and issue one read-only navigation to the bound Draft URL. In `preflight`, require the exact account, `article_editor`, Draft ID, and fresh binding verification; then transition `preflight -> account_verified -> draft_created -> materialization_reconciling`, persist `createAdoptedXArticleMaterializationCheckpoint()`, and call `nextMaterializationCommand()`.

Do not enter `draft_create_armed`.

Use the existing execution states as the outer orchestration layer and record the specification's finer adoption phases as durable event/checkpoint evidence:

```text
adoption_observing  → event article_adoption_observing while snapshot=preflight
adoption_verified   → event article_adoption_verified while snapshot=account_verified
draft_bound         → checkpoint phase draft_bound before adopted checkpoint promotion
body_verified       → checkpoint phase body_verified with body.status=adopted_verified
cover/materializing → progress stages while snapshot=materialization_reconciling
adoption_rejected   → event reason + terminal snapshot materialization_blocked
media_completion_blocked → event reason + terminal snapshot materialization_blocked
draft_reconciled    → both checkpoint and terminal execution state
```

Add `isPreparedMaterializationMode(context)` and replace all direct `execution_mode === 'materialization_v3_2'` checks in report projection, recovery, pending-issue repair, and progress accounting so both prepared modes share the same durable machinery without enabling legacy publication paths.

- [ ] **Step 4: Add the Draft-only completion target**

Add execution state and transition:

```ts
// Add this member to the existing XArticleExecutionState union:
| 'draft_reconciled';

materialization_reconciling: [
  'draft_reconciled', 'confirmation_pending', 'materialization_blocked',
  'pre_publish_failed', 'cancelled_before_publish'
],
draft_reconciled: []
```

At the end of `nextMaterializationEditorDecision()`:

```ts
if (reconciliation.kind === 'exact' || reconciliation.kind === 'semantically_equivalent') {
  return context.completion_target === 'draft_reconciled'
    ? { kind: 'complete' }
    : command(context, observation, 'open_article_preview', 'open_article_preview', {
        kind: 'open_article_preview',
        target_ref: contract.detectControl(observation, 'preview').ref
      });
}
```

When `nextMaterializationCommand()` receives `complete` in V3.3, require checkpoint phase `draft_reconciled`, `publish_confirmation='absent'`, and Publish count 0, then transition the execution snapshot to `draft_reconciled` and return `command: null`.

- [ ] **Step 5: Run focused tests to prove GREEN**

```powershell
pnpm exec vitest run tests/x-article/article-execution.test.ts tests/x-article/article-browser-adapter.test.ts tests/x-article/article-editor-protocol.test.ts
```

Expected: PASS; the V3.3 sequence has no body/Preview/Publish command and V3.2 still opens Preview.

- [ ] **Step 6: Commit**

```powershell
git add harnesses/research-publishing/core/x-article-execution.ts harnesses/research-publishing/contracts/x-article-execution-event.schema.json harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts harnesses/research-publishing/adapters/x/article-browser/article-editor-protocol.ts tests/x-article/article-execution.test.ts tests/x-article/article-browser-adapter.test.ts tests/x-article/article-editor-protocol.test.ts
git commit -m "feat: complete media on existing X Article drafts"
```

---

### Task 4: Harden media recovery, drift blocking, and command isolation

**Files:**
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-draft-reconciler.ts:182-631`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts:772-874,1017-1131,1386-1484,1983-2264`
- Test: `tests/x-article/article-draft-reconciler.test.ts`
- Test: `tests/x-article/article-browser-adapter.test.ts`
- Test: `tests/security/x-article-browser-security.test.ts`

**Interfaces:**
- Consumes: adopted checkpoint and V3.3 Adapter lifecycle from Tasks 2-3.
- Produces: observation-first recovery for cover and each inline anchor; immutable forbidden-command guard.

- [ ] **Step 1: Write the recovery matrix tests**

Add table tests for these exact states, extending the existing `editorObservation()` and `reportSuccess()` helpers already defined in `article-browser-adapter.test.ts`:

```ts
const cases = [
  { name: 'anchor present / image absent', anchor: true, image: null, expected: 'replace_article_visual_anchor' },
  { name: 'anchor present / matching image present', anchor: true, image: 'matching', expected: 'observe_article_page' },
  { name: 'anchor absent / matching image present', anchor: false, image: 'matching', expected: 'next_media' },
  { name: 'anchor absent / image unknown', anchor: false, image: 'unknown', expected: 'materialization_blocked' }
] as const;

it.each(cases)('recovers $name without duplicate upload', async (testCase) => {
  const result = await runRecoveryCase(testCase); // define below using editorObservation + adapter.report
  expect(result.outcome).toBe(testCase.expected);
  expect(result.assetCommandCount).toBe(testCase.expected === 'replace_article_visual_anchor' ? 1 : 0);
});

async function runRecoveryCase(testCase: typeof cases[number]) {
  const execution = await createAdoptedExecutionFixture();
  const observation = editorObservationForRecovery(execution, testCase.anchor, testCase.image);
  await reportSuccess(execution.adapter, execution.id, execution.pendingCommand, observation);
  const next = await execution.adapter.next(execution.id);
  const outcome = next.snapshot.state === 'materialization_blocked'
    ? 'materialization_blocked'
    : next.command?.kind ?? 'next_media';
  const assetCommandCount = execution.commands.filter((command) =>
    command.kind === 'replace_article_visual_anchor'
    && command.payload.kind === 'replace_article_visual_anchor'
    && command.payload.asset.asset_id === execution.assetId
  ).length;
  return { outcome, assetCommandCount };
}
```

Define `createAdoptedExecutionFixture()` and `editorObservationForRecovery()` in the same test file by composing its existing `WorkspaceStore`, `XArticleBrowserAdapter`, `editorObservation()`, and command ledger helpers. Add crash-injection tests after observation persistence, checkpoint update, and context update, replaying the identical report exactly once. Assert one media command and one completed checkpoint record.

- [ ] **Step 2: Run recovery/security tests to prove RED**

```powershell
pnpm exec vitest run tests/x-article/article-draft-reconciler.test.ts tests/x-article/article-browser-adapter.test.ts tests/security/x-article-browser-security.test.ts
```

Expected: FAIL on adopted body status, partial media reconciliation, or forbidden V3.3 command issuance.

- [ ] **Step 3: Preserve adopted body and reconcile effects before retry**

Update lifecycle checks so both body statuses are verified evidence:

```ts
function bodyIsVerified(checkpoint: XArticleMaterializationCheckpointV1): boolean {
  return (checkpoint.body.status === 'verified'
      || checkpoint.body.status === 'adopted_verified')
    && checkpoint.body.observed_digest !== null;
}
```

In `reconcileReportedEditor()`, never downgrade an adopted body:

```ts
const body = checkpoint.body.status === 'adopted_verified'
  ? checkpoint.body
  : bodyObserved
    ? { status: 'verified' as const, observed_digest: plan.import_template_digest }
    : checkpoint.body;

const phase = finalEditor
  ? 'draft_reconciled'
  : media.some((entry) => entry.status === 'completed')
    ? 'media_materializing'
    : body.status === 'adopted_verified'
      ? 'body_verified'
      : bodyObserved ? 'body_imported' : checkpoint.phase;
```

For an uncertain cover or anchor replacement, keep `needs_editor_observation=true`; never reissue until the next editor Observation classifies the effect as absent, complete, or ambiguous. Persist `ambiguous` before transitioning to `materialization_blocked`.

- [ ] **Step 4: Add a hard V3.3 command allowlist**

Add one guard called from `assertPreparedCommandBinding()` and repaired-command paths:

```ts
const V3_3_ALLOWED_COMMANDS = new Set<XArticleBrowserCommandKind>([
  'navigate', 'observe_article_page', 'upload_article_cover',
  'replace_article_visual_anchor', 'set_article_image_alt'
]);

if (
  context.execution_mode === 'media_completion_v3_3'
  && !V3_3_ALLOWED_COMMANDS.has(input.kind)
) {
  throw new HarnessError(
    'PUBLISH_GATE_BLOCKED',
    `existing Draft media completion cannot issue ${input.kind}`
  );
}
```

Security tests must tamper persisted `pending_issue`, `pending_command`, binding Draft ID, account, page revision, package root, asset digest, and `owned_by_execution`; every case fails before a second write.

- [ ] **Step 5: Run recovery, security, and adjacent regression tests**

```powershell
pnpm exec vitest run tests/x-article/article-draft-reconciler.test.ts tests/x-article/article-browser-adapter.test.ts tests/security/x-article-browser-security.test.ts tests/integration/x-article-browser-workflow.test.ts
```

Expected: PASS; duplicate upload assertions remain at one or zero as specified, and V3.2 integration remains green.

- [ ] **Step 6: Commit**

```powershell
git add harnesses/research-publishing/adapters/x/article-browser/article-draft-reconciler.ts harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts tests/x-article/article-draft-reconciler.test.ts tests/x-article/article-browser-adapter.test.ts tests/security/x-article-browser-security.test.ts
git commit -m "fix: recover existing Draft media transactions safely"
```

---

### Task 5: Expose the strict CLI and package the V3.3 Skill protocol

**Files:**
- Modify: `harnesses/research-publishing/cli/index.ts:139-153,363-557,1353-1450`
- Modify: `tests/cli/cli.test.ts`
- Modify: `skills/x-publishing-copilot/SKILL.md`
- Create: `skills/x-publishing-copilot/references/x-article-existing-draft-media-completion-v3-3.md`
- Modify: `skills/x-publishing-copilot/references/x-article-materialization-v3-2.md`
- Modify: `skills/x-publishing-copilot/references/browser-adapter-flow.md`
- Modify: `tools/manifest-content.ts`
- Modify: `tests/tools/manifest-content.test.ts`
- Modify: `tests/tools/acceptance-output.test.ts`
- Regenerate: `registry/manifests/research-publishing.json`
- Regenerate: `registry/harnesses.json`

**Interfaces:**
- Consumes: `prepareExistingDraftMedia()` from Task 3 and binding contract from Task 1.
- Produces: `x-article browser prepare-existing-media --workspace <path> --plan <path> --observation <path> --capabilities <path> --output json`.

- [ ] **Step 1: Write failing CLI and packaged-Skill tests**

Add this route to the help expectation and test strict preparation:

```ts
const prepared = runSource([
  'x-article', 'browser', 'prepare-existing-media',
  '--workspace', workspace,
  '--plan', planPath,
  '--observation', observationPath,
  '--capabilities', capabilitiesPath,
  '--output', 'json'
]);
expect(prepared.status).toBe(0);
expect(JSON.parse(prepared.stdout)).toMatchObject({
  ok: true,
  operation: 'x-article browser prepare-existing-media',
  artifact: { state: 'created', draft_id: null },
  state: 'created'
});
```

Read the persisted materialization Plan and assert `draft_binding.draft_id`, its binding digest, and mode. Add rejection cases for a malformed observation, extra option, unsafe execution ID, wrong account, changed revision, existing cover, and unknown inline image.

Manifest tests must require:

```ts
expect(manifest.interfaces.x_article_browser.materialization).toMatchObject({
  protocol: 'x-article-materialization/v3.3',
  modes: {
    new_draft: 'materialization_v3_2',
    existing_draft_media_completion: 'media_completion_v3_3'
  }
});
```

- [ ] **Step 2: Run CLI/manifest tests to prove RED**

```powershell
pnpm exec vitest run tests/cli/cli.test.ts tests/tools/manifest-content.test.ts tests/tools/acceptance-output.test.ts
```

Expected: FAIL because the route and V3.3 Skill reference do not exist.

- [ ] **Step 3: Implement exact CLI routing**

Add the route constant:

```ts
'x-article browser prepare-existing-media --workspace <path> --plan <path> --observation <path> --capabilities <path> --output json'
```

Route it with exact options only:

```ts
if (operation === 'x-article browser prepare-existing-media') {
  validateExactOptions(operation, providedOptions, ['plan', 'observation', 'capabilities']);
  const plan = await readJsonFile<XArticlePublicationPlanV1>(options.plan!, 'plan');
  assertXArticlePublicationPlan(plan);
  const observation = validateContract<XArticleBrowserObservation>(
    'x-article-browser-observation',
    await readJsonFile<unknown>(options.observation!, 'existing Draft observation')
  );
  const capabilities = await readCapabilityManifest(options.capabilities!);
  const artifact = await browser.prepareExistingDraftMedia(plan, observation, capabilities);
  return { ok: true, operation, artifact, state: artifact.state };
}
```

`materialization-status` accepts both `materialization_v3_2` and `media_completion_v3_3` but remains redacted: no title, body, Draft ID, local paths, command IDs, or account details in stdout.

- [ ] **Step 4: Update the Skill protocol and generated manifests**

The new reference must state:

- Use only when title/body are already complete and the Draft contains all locked anchors with zero media.
- First input is a durable normalized Observation; execution re-observes the same Draft before mutation.
- Never create a Draft or rewrite title/body in this branch.
- Use `navigate`, observations, cover upload, anchor replacement, inline Alt verification, checkpoints, and final reconciliation only.
- Stop at `draft_reconciled`; Preview and Publish require a different later workflow.
- On uncertain media effect, observe before one bounded retry; ambiguity blocks.

Run:

```powershell
pnpm manifest
```

Expected: both registry JSON files update deterministically and include the new schema/reference.

- [ ] **Step 5: Run CLI, Skill, acceptance, and schema tests**

```powershell
pnpm exec vitest run tests/cli/cli.test.ts tests/tools/manifest-content.test.ts tests/tools/acceptance-output.test.ts tests/contracts/contracts.test.ts
pnpm acceptance
```

Expected: PASS and acceptance reports no absolute-path, manifest-digest, or packaged-contract mismatch.

- [ ] **Step 6: Commit**

```powershell
git add harnesses/research-publishing/cli/index.ts tests/cli/cli.test.ts skills/x-publishing-copilot/SKILL.md skills/x-publishing-copilot/references/x-article-existing-draft-media-completion-v3-3.md skills/x-publishing-copilot/references/x-article-materialization-v3-2.md skills/x-publishing-copilot/references/browser-adapter-flow.md tools/manifest-content.ts tests/tools/manifest-content.test.ts tests/tools/acceptance-output.test.ts registry/manifests/research-publishing.json registry/harnesses.json
git commit -m "docs: expose existing Draft media completion"
```

---

### Task 6: Run the full regression and one real Draft-only smoke

**Files:**
- Create: `.llm-wiki/verification/x-article-existing-draft-media-completion-v3-3-browser-host.md`
- Modify only if a verified defect is found before the smoke: production/test files from Tasks 1-5, with a new RED test first.

**Interfaces:**
- Consumes: the complete V3.3 CLI/Adapter/Skill protocol.
- Produces: one real, immutable Browser Host verification record; no public Article receipt.

- [ ] **Step 1: Run the full local quality gate**

```powershell
pnpm check
git diff --check
```

Expected: lint, typecheck, all Vitest suites, acceptance, and diff check pass with zero failures.

- [ ] **Step 2: Verify deployment and live-input parity before touching Chrome**

Use these exact live inputs:

```text
Draft:
https://x.com/compose/articles/edit/2092851979932647424

Source normalized Observation:
C:/Users/admin/Documents/New project 2/publishing-workspace/v3-2-draft-smoke/task4-title-rerun-20260827/runs/x_article_execution_a2f1c834-3a45-4bb2-9800-d25890dc489b/x-article/browser/observations/obs_x_article_command_18cba238-6ff2-4cac-bbbf-6bbb6aa2e824.json

Cover:
C:/Users/admin/Documents/New project 2/asset_cover_shared_agent_knowledge_x-safe-v2.png

Inline images in anchor order:
C:/Users/admin/Documents/New project 2/assets/from-skill-memory-to-shared-agent-knowledge/02-architecture-runtime-boundary.png
C:/Users/admin/Documents/New project 2/assets/from-skill-memory-to-shared-agent-knowledge/03-process-consumer-agent-connection.png
C:/Users/admin/Documents/New project 2/assets/from-skill-memory-to-shared-agent-knowledge/04-comparison-knowledge-vs-context.png
```

Before any write, verify:

- deployed/source interface manifest digests match;
- Chrome account is exactly `@Glen56121`;
- Draft ID is exactly `2092851979932647424`;
- title and normalized body match the locked publication Plan;
- all three unresolved anchors are present in order;
- cover count and inline media count are both zero;
- autosave state is `saved`;
- all four files exist and their SHA-256 values match the Plan;
- command budget is `<=7`, observation budget is `<=6`, Publish budget is `0`.

If any precondition differs, stop before mutation and record the rejection. Do not create another Draft.

- [ ] **Step 3: Prepare exactly one existing-media execution**

Run the built CLI with a fresh workspace/output directory and the locked publication Plan, normalized source Observation, and live capability manifest:

```powershell
node dist/harnesses/research-publishing/cli/index.js x-article browser prepare-existing-media --workspace "C:/Users/admin/Documents/New project 2/publishing-workspace/v3-3-existing-draft-media-smoke-20260827" --plan "C:/Users/admin/Documents/New project 2/publishing-workspace/v3-3-existing-draft-media-smoke-20260827/inputs/locked-plan.json" --observation "C:/Users/admin/Documents/New project 2/publishing-workspace/v3-2-draft-smoke/task4-title-rerun-20260827/runs/x_article_execution_a2f1c834-3a45-4bb2-9800-d25890dc489b/x-article/browser/observations/obs_x_article_command_18cba238-6ff2-4cac-bbbf-6bbb6aa2e824.json" --capabilities "C:/Users/admin/Documents/New project 2/publishing-workspace/v3-3-existing-draft-media-smoke-20260827/inputs/live-capabilities.json" --output json
```

Expected: state `created`; materialization Plan has `draft_binding.mode=adopt_existing`; no Chrome write has occurred.

- [ ] **Step 4: Drive the bounded Browser Host loop**

For each command:

1. call `next`;
2. claim the exact command;
3. verify page revision and Draft ID;
4. execute only the command payload;
5. normalize one compact Observation;
6. report success, uncertain, or rejected exactly once;
7. read checkpoint/status before the next command.

The expected write order is:

```text
upload_article_cover
replace_article_visual_anchor (02-architecture-runtime-boundary.png)
replace_article_visual_anchor (03-process-consumer-agent-connection.png)
replace_article_visual_anchor (04-comparison-knowledge-vs-context.png)
```

After the first inline image completes, deliberately release and reclaim the Chrome tab, call `resume-editor`, and prove the next command targets the second anchor without re-uploading the first image.

- [ ] **Step 5: Verify the terminal Draft without Preview or Publish**

Require all of the following evidence:

```text
execution state: draft_reconciled
checkpoint phase: draft_reconciled
Draft ID: 2092851979932647424
new Draft count: 0
title writes: 0
body imports: 0
cover count: 1
inline image count: 3
remaining anchor count: 0
inline Alt mismatches: 0
duplicate media: 0
Preview commands: 0
Publish commands: 0
automation time: <=360 seconds under normal X response
```

Leave the reconciled Draft open for Human inspection. Do not open Preview, publish, or delete Drafts.

- [ ] **Step 6: Write and commit the immutable verification record**

The verification document records:

- implementation commit range;
- exact execution ID and Draft ID;
- Plan, binding, initial/final editor revision, package, and asset digests;
- command/observation/progress counts;
- per-stage timing and any X waiting reason;
- reconnect checkpoint evidence;
- title/body unchanged comparison;
- image count/order/Alt/anchor evidence;
- Preview and Publish command counts;
- final `git status --short` and `pnpm check` output.

Commit:

```powershell
git add .llm-wiki/verification/x-article-existing-draft-media-completion-v3-3-browser-host.md
git commit -m "test: verify existing X Article media completion"
```

---

## Final Verification Checklist

- [ ] Binding contract rejects every non-exact or non-zero-media Draft state.
- [ ] Binding participates in the materialization digest and is re-verified before the first write.
- [ ] Old failed execution artifacts remain unchanged.
- [ ] V3.2 new-Draft prepare, bulk import, Preview, confirmation, and Publish tests remain green.
- [ ] V3.3 command allowlist structurally forbids Draft creation, title/body writes, Preview, and Publish.
- [ ] Cover and each inline image are independently checkpointed and recoverable.
- [ ] Uncertain effects are observed before retry and ambiguous effects block.
- [ ] CLI rejects malformed, foreign, stale, extra-option, and unsafe-path inputs.
- [ ] Skill and manifests expose protocol `x-article-materialization/v3.3` deterministically.
- [ ] `pnpm check` and `git diff --check` pass.
- [ ] Exactly one real Draft-only smoke completes or produces one immutable fail-closed record.
- [ ] Live smoke ends with Preview commands 0 and Publish commands 0.
