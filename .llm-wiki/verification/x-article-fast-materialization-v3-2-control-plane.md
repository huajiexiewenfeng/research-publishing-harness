# X Article Fast Materialization V3.2 Control Plane Verification

## Verdict and provenance

- executor: Codex agent in the assigned local worktree
- authority: agent-local verification, not CI and not an independent review
- trust level: `passed-agent-local-with-known-baseline-failure`
- repository base: `0424c3c58ea425aa3fad3937ff67e28b20bf89d9`
- Task 10 starting HEAD: `3577ba0f7aa9acafa2981ab8a1b87d98889d81d1`
- tested integration HEAD before the Task 10 evidence commit: `14cde33c68e5156cee5eaeb8f5dacd669305ef08`
- environment: Node.js `v22.17.1`; Windows; all Browser workflows used deterministic offline fake Hosts
- external side effects: no public network request, real browser edit, upload, Preview action, or publication

The V3.2 control-plane acceptance surface passes its focused gates. The repository-wide gate is intentionally not recorded as all-green: `tests/tools/acceptance-output.test.ts` and the direct `pnpm acceptance` command still stop at `published_unverified`. That pre-existing state-output mismatch belongs to the Browser Host companion plan and was not hidden or changed here.

## Integrated commit record

All commits integrated after the repository base and exercised by this verification are listed below in chronological order.

| Work | Commits |
|---|---|
| V3.1 design and implementation | `1c32c6e8e99cfacc8af8c19791344bf71e18882a`, `2af8110c12e76c2b142e939351627c4a0fc82b89`, `198fbe61e532300324de3ddad496e6cd8a89ecba`, `3349fbca98a7ec04cd4de10c56110401a93c8d3b`, `24610d15397f39ab943fd84f97e18b1172c3856c`, `db3e892ea75a00fdf7fd1ae6ca8470a17baf8142`, `89a52a1da98aa1947ffb225da35ed512b31e89e4`, `82ec18c3c413eb0f44cd64a3111877dfd52c33b9`, `4f65f47f1f926096eb9d0864f92a2f533d1f5894`, `9aee5b75b42b8c1330bf8f2136fb7bceb4619c47`, `9e1728875d26e6867a18e2823a65b4fc9fcfe358`, `1ba1a9be3261f03869391419ab3d18f715448a5e`, `90e1419d2e56bf15a619d75a74394181099c2cf3`, `730e09654be8a6bfe8ab75a569e94a3bb14b3e89`, `b7658b9d2b0486853cc8168325b7d01f807820e1` |
| Task 2: contracts | `b3633fb47c55ac4f2ddb5b7179af925b7b017045`, `65212c7ff1dc3368f291cc0a779f872f632f9be5` |
| Task 3: checkpoints | `a793ed9734495284adbfde4dcbc7dd7b3b44cd67`, `50052688c0d3499921e8bcf2c37e291a015660aa` |
| Task 4: reconciliation | `9c8387d76902b5bd9568e6a22cfa528ea76b0b07`, `ce879bb541f3c131b7803e8e77c6ff9852b16fde` |
| Task 5: materialization | `e93bba2a21540727eb8c02a8e94bf6d12c354a53`, `a27572efe11687efdfb4e4c87522a77ebbf65720`, `d7905208c9438297bfd33b644d66fa32bfb31960`, `4d7419dc9a8332ac084ecf46b5de268452df1ca0`, `bd1ca4d12492634beb4bd9290cdaadce3b488803`, `4f850f11b494a6f157429590dbcb2e519c795c70` |
| Task 6: confirmation and Publish claim | `6be75e53fea95cfdbdfe9afb091d95a056c14b98`, `cfe8acc5122629ed6be6d837aa9db2ec027d4e35`, `5e5183fde3b1e7fca8ab9b1a37d6b1c24e0b4d18` |
| Task 7: receipt and performance | `a2dc5888d27e6d6359f6843b539059f43140bad8`, `b2ca2b5e7b32aafaf4867ab7bd3ae48e90b164d2`, `5ce357ae40c191422af9b252c94b51432552f481`, `60ce9737fa4b81953ce082b6553317a7d0be92fb` |
| Task 8: CLI control plane | `578e8c47786086aee08a51f5ccb89a921fed2168`, `b9aa1d55c97f89a17c5b8f4a5dc19437796b1da6`, `62ccecaad860f5fd28536cf504d4c3a83e14cafa` |
| Task 9: Publication Bundle approval | `799133fd3a3dab9469bfe35263b0c9a1f35b5772`, `4fac22140962357b2caa22707dd20df7fc61534a`, `fe2245bd4f326060f9967969dd7ec06340f5c2c2`, `3577ba0f7aa9acafa2981ab8a1b87d98889d81d1` |
| Cover progress follow-up found by Task 10 | `8a84bec602e916baee46fd780dbabbc0cda98a9d`, `14cde33c68e5156cee5eaeb8f5dacd669305ef08` |

## Test integrity and RED/GREEN record

The integration test runs the actual `WorkspaceStore` and `XArticleBrowserAdapter`. The fake Host owns only the mutable editor boundary. It persists command identity and reports through the production adapter, counts irreversible effects separately from commands, reconstructs the adapter from the durable workspace at each crash, and never exposes a public network or browser implementation.

The first valid RED was `3 passed / 10 failed` in the new 13-case workflow surface. Initial failures identified incorrect fixture timestamp/progress assumptions and the zero-image anchor-clearing behavior. After correcting the fixture and modeling the zero-anchor stabilization observation, the no-cover workflow was `13/13` green. Adding a planned cover then exposed a production regression: the receipt progress validator rejected the planned cover asset ID. The cover-inclusive regression remained RED until the separate production fix `8a84bec602e916baee46fd780dbabbc0cda98a9d`; after integration, the workflow was `14/14` green. Missing local `pnpm vitest` and a sandbox `spawn EPERM` were environment failures and are not counted as RED evidence.

No assertion was repeated superficially across the matrix. Every row captures the boundary checkpoint, report durability, claimed command where one exists, external effect count, recovery path, and terminal control state. Every row also proves exactly one bulk body import, zero incremental block insertion, the exact unique completed asset set, no more than one Publish command/effect, zero Human-content overwrite attempts, stable Human-reviewed text digest, and `network = unused`.

## Nine-boundary crash matrix

| Boundary | Durable/effect state at crash | Recovery evidence | Terminal state |
|---|---|---|---|
| `after_draft_create` | draft-create command claimed and its Host effect exists; completion report absent; checkpoint remains before verified body import | reconstructed adapter receives the same pending command and reports it without a second create/import effect | `confirmation_pending` |
| `after_metadata` | the create report is durable and the Host has completed the local draft shell/metadata substage | V3.2 exposes no standalone metadata adapter command, so this row truthfully restarts from that durable shell instead of inventing a hook | `confirmation_pending` |
| `import_effect_before_checkpoint` | one bulk-import effect exists; import completion report is absent; body checkpoint is `issued` | the same claimed import command is reported after restart; body import remains exactly one | `confirmation_pending` |
| `before_media_1` | first media command is claimed but no upload effect/report exists; body is `verified`, media 1 is `upload_started`, later media is `pending` | restart receives and completes the same first media command | `confirmation_pending` |
| `media_effect_before_anchor_cleanup` | first media has a Host-local partial effect; its adapter report is absent; media checkpoint remains `upload_started` | the same claimed command resumes local anchor cleanup, then reports once; no second media effect | `confirmation_pending` |
| `media_complete_before_checkpoint` | first media Host effect is complete; report/checkpoint completion is absent and media remains `upload_started` | the same claimed command is reported after restart; exact asset set stays unique | `confirmation_pending` |
| `after_preview` | checkpoint phase is `preview_verified`; immutable Preview receipt exists; no Publish command exists | restart returns to confirmation wait without rematerialization | `confirmation_pending` |
| `after_confirmation_before_publish` | confirmation is consumed into checkpoint phase `human_confirmed` with `publish_confirmation = armed`; no Publish claim/effect exists | restart exposes `publish_armed`; it does not silently submit | `publish_armed` |
| `publish_effect_unknown` | checkpoint phase is `publish_submitted`, confirmation is `consumed`, and exactly one Publish effect has an uncertain report | restart does not reissue Publish and preserves the ambiguity boundary for read-only resolution | `outcome_unknown` |

`after_metadata` and `media_effect_before_anchor_cleanup` are deliberately Host-local boundary models because the current adapter has no standalone metadata command and no partial-DOM checkpoint. This limitation is explicit; the matrix does not claim hooks that do not exist.

## Measured command and observation budgets

Counts are persisted command/observation totals from the real adapter with a no-cover document. They are exact expectations as well as ceiling checks.

| Inline images | Commands measured | Command ceiling | Observations measured | Observation ceiling | Result |
|---:|---:|---:|---:|---:|---|
| 0 | 5 | 12 | 5 | 9 | pass |
| 3 | 7 | 15 | 7 | 12 | pass |
| 10 | 14 | 22 | 14 | 19 | pass |

The zero-image case includes one required stabilization observation that clears the empty import-state anchor set. The cover-inclusive 3-image case measures `8 commands / 8 observations`, exactly one cover effect, exactly one bulk body import, four unique completed assets, no Publish, and no network use.

## Gate record

| Gate | Result |
|---|---|
| workflow matrix/budgets/cover | `1 file / 14 tests passed`; 21.53 s |
| V3.2 focused control-plane regression | `19 files / 350 tests passed`; 77.72 s |
| repository build | `pnpm build`; exit 0 |
| repository lint | `pnpm lint`; exit 0 |
| repository typecheck | `pnpm typecheck`; exit 0 |
| repository full test | `165 files / 1007 tests passed`, `1 file / 1 test failed`, `1 file / 1 test skipped`; 1009 total tests; 91.31 s |
| direct offline acceptance | exit 1 at `published_unverified` |
| whitespace | `git diff --check`; no whitespace errors (Windows line-ending advisories only) |

The only full-gate failure is `tests/tools/acceptance-output.test.ts > offline acceptance > reports the simulated X Article workflow and at-most-once Publish evidence`: `tools/acceptance.ts` rejects the `published_unverified` state. The direct `pnpm acceptance` command reproduces the same error. This is the documented Browser Host companion-plan baseline, not a Task 10 control-plane regression, and no test or runtime behavior was weakened to mask it. No load-sensitive timeout occurred.

## Registry manifest evidence

- command: `pnpm manifest`, repeated twice
- each run: `{ "ok": true, "files": 251, "output": "registry\\manifests\\research-publishing.json" }`
- final SHA-256: `D07EE8F6C082EC261E0176111530B9C68FC02D38CE15085E8D8A17DD45395B98`
- size: `52,348` bytes
- entries: `251`, lexical order verified, duplicate count `0`
- machine-path scan: no `C:/Users`, `D:/tmp`, `New project 2`, or drive-qualified backslash path
- scope explanation: the entry count increased from 250 to 251 because the integrated Task 9 contract source is now present; `README.zh.md` and this verification note are not manifest inventory inputs

No unintended `dist/` changes remain after build or manifest generation.

## Security and residual limitations

- An observed unknown Human draft blocks materialization and preserves the exact observation; the adapter issues no import or Publish command and makes no overwrite attempt.
- Publication Bundle approval and confirmation arm the prepared Article child without issuing `publish_article_once`; the offline Host stays unused.
- The default flow is `prepare -> materialize -> verified Preview -> confirm-publish`; bulk document import is required, and compatibility fallback is explicit rather than silent.
- No public network/browser publication was performed.
- Known limitation: real Chrome performance pending Browser Host plan.
