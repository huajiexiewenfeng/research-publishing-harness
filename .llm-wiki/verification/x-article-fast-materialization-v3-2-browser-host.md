# X Article Fast Materialization V3.2 Browser Host Verification

## Verdict and provenance

- verdict: `live smoke pending`
- live Chrome execution: `not run`
- live Draft mutation: `not run`
- live image upload: `not run`
- Preview action: `not run`
- Publish command/click: `not run` / zero
- Draft deletion or cleanup: `not run` / zero
- evidence authority: documentation and offline repository checks only; not CI and not an independent review
- starting HEAD: `d71e508fde58578795ca443b4c7d2ce7c82d349e`

No Chrome session was opened or controlled for this Task. No current X page, account, Draft, revision, import, media, autosave, Preview, or Publish result is claimed below. Empty observed-evidence slots are intentional.

## RED to GREEN documentation record

Before editing the packaged reference, a temporary retrieval probe checked for `body blocks = 0`, `one target anchor`, `retry_authorized`, and `Publish outcome unknown`. It exited 1 with all four markers missing. No test file was committed.

The GREEN documentation adds exact import/image preconditions and postconditions, the operator-facing failure record, deterministic adapter-authorized recovery, and the Draft-only safety boundary. Offline gate results are recorded only after the corresponding commands run.

## Live body-import checklist — not run

| Slot | Required value | Observed evidence | Result |
|---|---|---|---|
| Chrome binding | one explicit existing Chrome session |  | `not run` |
| origin | `https://x.com` |  | `not run` |
| account | materialization Plan target |  | `not run` |
| URL Draft ID | exact claimed command Draft ID |  | `not run` |
| page revision | exact `expected_page_revision` |  | `not run` |
| title | approved publication Plan title |  | `not run` |
| body blocks | `0` before import |  | `not run` |
| inline visuals | `0` before and after import |  | `not run` |
| unknown content | `false` |  | `not run` |
| command claim | exact identities and `claimed=true` |  | `not run` |
| template digest | exact command and materialization Plan digest |  | `not run` |
| source digest | exact command and materialization Plan digest |  | `not run` |
| unresolved anchors | exact command order |  | `not run` |
| autosave | `saved` |  | `not run` |

## Live image checklist — not run

| Slot | Required value | Observed evidence | Result |
|---|---|---|---|
| target anchor before upload | exactly one claimed anchor |  | `not run` |
| Package containment | regular non-symlink file inside locked Package |  | `not run` |
| Package/asset digest and MIME | exact claimed values |  | `not run` |
| completed target media before upload | none |  | `not run` |
| target anchor after upload | absent |  | `not run` |
| execution-owned media | exactly one at approved ordinal |  | `not run` |
| inline Alt | exact claimed Alt read back |  | `not run` |
| surrounding context digest | exact materialization Plan digest |  | `not run` |
| remaining anchors | exact planned suffix order |  | `not run` |
| unknown content | `false` |  | `not run` |
| autosave | `saved` |  | `not run` |

## Failure/recovery checklist — not run

| Scenario | Observed evidence | Adapter report | Safe next action | Result |
|---|---|---|---|---|
| page drift |  |  |  | `not run` |
| anchor ambiguity |  |  |  | `not run` |
| upload uncertainty |  |  |  | `not run` |
| autosave failure |  |  |  | `not run` |
| Chrome disconnect |  |  |  | `not run` |
| Preview mismatch |  |  |  | `not run` |
| Publish outcome unknown |  |  |  | `not run` |

Every eventual failure result must retain `retry_authorized=false`. A live run may proceed only under separate authorization and must stop at the verified Preview with zero Publish. It must not delete diagnostic Drafts or fill any slot from offline fixtures or earlier evidence.

## Offline gate record

| Gate | Result |
|---|---|
| required-marker GREEN probe | pass; 9 required, 0 missing |
| exact reference/requirements retrieval | pass via the marker probe |
| Skill `quick_validate.py` | pass; `Skill is valid!` |
| focused packaged-reference test | not run; digest-sensitive manifest refresh is deferred to Task 4/final packaging |
| `git diff --check` | pass; line-ending advisory only |
| tracked-scope audit | pass; exactly the three Task 3 owned tracked paths |

## Packaging boundary

The generated registry manifest hashes the packaged reference. Task 3 does not own `registry/manifests/research-publishing.json`, so this Task neither regenerates nor commits it. Task 4/final packaging must refresh the manifest and rerun manifest-consistency tests. Until then, a digest-sensitive manifest gate is expected to report the stale reference hash and must not be misreported as green.
