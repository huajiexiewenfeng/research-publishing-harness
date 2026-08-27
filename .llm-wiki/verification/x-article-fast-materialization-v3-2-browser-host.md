# X Article Fast Materialization V3.2 Browser Host Verification

## Verdict and provenance

- verdict: **FAIL — truthful terminal Host evidence**
- smoke kind: real existing-Chrome, Draft-only
- starting HEAD: 96d32cfe48642f5a4c4e6cedc75cb0293413a480
- target account: exact live DOM match @Glen56121
- Browser Host/version: Chrome companion 26.820.60940
- protocol/strategy: x-article-materialization/v3.2 / rich_text_anchor_import/v1
- Plan ID: x_article_plan_66d8ff9e-3b0f-437c-a2fa-2cb2334dac7d
- execution ID: x_article_execution_8a739b6d-6a40-4316-af0b-f5c31b80d929
- live Draft ID: 2092793637604294656
- live Draft URL: https://x.com/compose/articles/edit/2092793637604294656
- terminal execution state: materialization_blocked
- Draft mutation: a new Draft was created and the exact title was set; cover/body/inline images were not reached
- Preview: not reached
- Publish command/click: zero / zero
- Draft deletion or cleanup: zero / zero
- evidence authority: current-branch runtime artifacts plus live Chrome observations; not CI and not an independent review

The control plane blocked immediately after the successful create/title report. Its exact reconciliation result was unverifiable, with reason: checkpoint has no stable editor revision for materialized draft content. Strict one-execution scope required a stop. The Draft remains unpublished, undeleted, and open in the user's existing Chrome.

## Immutable input and parity evidence

| Item | Observed value | Result |
|---|---|---|
| source | C:\Users\admin\Documents\New project 2\from-skill-memory-to-shared-agent-knowledge.x-article-illustrated-v2.md | pass |
| source file digest | sha256:3b959165aeef507f76b34b6ab1ddca75097bebe2f7ae7ce48aa769ad21713eae | pass |
| visual manifest digest | sha256:8afbc708674f25b4ce5dac555d0b4e142896e25d18a6628d7d89bf495dad9ae3 | pass |
| approved visual set | one cover plus exactly three inline assets | pass |
| package root | articles/from-skill-memory-to-shared-agent-knowledge/task4_v32_draft_smoke_article_retry1 | pass |
| package digest | sha256:dbee576341c587a8b366545b13847f1ccd28e2b87dab8b3d23c2768dd29b8901 | pass |
| canonical Markdown digest | sha256:ee6b8d3b6d900cb81bdd02e3e22f24258248b2ed418523abc1d31bccc5eadab8 | pass |
| Article Document digest | sha256:2d885ac78e372052ae55e5d956eb77dc71780964f4422f64212622350324b325 | pass |
| import-template digest | sha256:f6043bb74f2d33eeac1d55705b7fc37f2202ff01e871c165d58ec86f646842c2 | pass |
| Plan digest | sha256:5c51972378d0f249e159fe930c8bc2b81658ef48044fbd2bf3d3ea0b484e4d22 | pass |
| materialization digest | sha256:3ac29f0e0e72fabe9b0dae67eae4262b233a902242b856b714a12d6d047f9dc6 | pass |
| materialization-start digest | sha256:54885e562bb36cb59ab235271e2c0fd50b27a6be95a41ece6cd384d5d248c6f2 | pass |

The first package/Plan attempt stopped before execution with ARTICLE_FORMAT_UNSUPPORTED: ordered lists must be contiguous and start at one. The single allowed targeted preprocessing retry used canonical syntax-only normalization: visual HTML comments and inline code tags were removed, the Markdown table was represented as bullets, and ordered-list continuation lines were joined. No production code was changed, no semantic content was deliberately hidden, and only the retry package above was executed.

The configured launcher resolved to a stale parent-checkout build and did not know x-article browser prepare. The current worktree was built and the current branch CLI was invoked directly. This yielded exactly one execution.

## Asset evidence

| Planned role / ordinal | Asset ID | Approved SHA-256 | Exact Alt |
|---|---|---|---|
| cover / separate | asset-cover-shared-agent-knowledge | 13dfa0d931a42c9bf016fe26037550acfdaa9f59ad2b0fead8db53da9cbaa9c8 | Cover titled From Skill Memory to Shared Agent Knowledge. A producer Skill passes a card through a policy gate into durable Domain knowledge, which authorized Agents reuse through governed Runtime access. |
| inline / 37 | asset-architecture-runtime-boundary | 2d31f4aaf7a192b0d08288919eb5b0b9acc07f743961dd6410ecc0c20d9d96a8 | Producer and consumer HR Agents access Domain-owned knowledge through llm-wiki-runtime, while raw resumes and internal paths remain restricted and the Graph is only a one-way derived view. |
| inline / 45 | asset-process-consumer-agent-connection | b8ee6275576cf5882f4db07b9949dc60086ae75b12c98b9f0e41fab31cded81d | Seven-step consumer Agent access flow from Domain contract and declared intent through policy, identity, bounded context, Domain work, and an authorized write, with explicit failure states leading to fallback. |
| inline / 55 | asset-comparison-knowledge-vs-context | 43da063797255010783991b06b5a2c57dbb6c85895f1b9650c9b2519713bec38 | Shared knowledge sends one policy-selected record to an authorized Agent, while raw resumes, other candidates, unauthorized access, and broadcasting all private data into every prompt are blocked. |

All four asset paths were accessible, regular package files; manifest approval/validation passed and Markdown Alt matched the manifest. None was uploaded because the execution blocked before the cover command.

## Preflight and parity matrix

| Gate | Required | Live/prepared evidence | Result |
|---|---|---|---|
| doctor | ready before mutation | ready; Node 22.17.1; network_required=false | pass |
| existing Chrome only | explicit chrome binding | initialized per Host docs; no substitute browser | pass |
| account | exact @Glen56121 | live DOM showed exact account, verified status, Premium, and Articles | pass |
| protocol | x-article-materialization/v3.2 | registry, Skill, Plan, and runtime aligned | pass |
| strategy | rich_text_anchor_import/v1 | Plan and runtime aligned | pass |
| inline count | exactly 3 | ordinals 37, 45, 55 | pass |
| expected commands | at most 15 | runtime ceiling 15 | pass |
| fallback | disabled for smoke | registry explicit_only; no fallback command used | pass |
| page contract | x-article-web/2026-08 | Host capability parity passed | pass |
| release set | compatible Skill/runtime/manifest/Host | compatible_runtime_skill_manifest_browser_host | pass |
| package/digests/assets | all accessible and exact | locked retry package and digests above | pass |

No Draft mutation occurred before all preflight gates passed.

## Real Host command and observation ledger

| # | Command | Claim | Normalized observation | Result |
|---|---|---|---|---|
| 1 | x_article_command_71ae6ac6-2dee-4911-8e2d-4be2ddfeb60a / observe_article_page | claimed=true at 2026-08-27T01:54:37.075Z; payload sha256:90ea286f4cafef47f673177bfaa6d4ea50cb6f49555032747668d87466f30c24 | obs_x_article_command_71ae6ac6-2dee-4911-8e2d-4be2ddfeb60a; revision sha256:cf2f72fb7e0d45d73e975f4e3ca5f540aef4c32e52592501dbdf7bbda0a05190; exact account and unique create control | success |
| 2 | x_article_command_23c85ff4-5835-4eb5-9e9c-dd5a718555ce / create_article_draft | claimed=true at 2026-08-27T01:57:22.198Z; payload sha256:de178a2700110cad979073d610e450fe9784a2c1cb317fd20a57b68ed16997df | obs_x_article_command_23c85ff4-5835-4eb5-9e9c-dd5a718555ce; revision sha256:58f1996d4ee420f26955a62b3b4eff8b1be7365dd6e589ddc5a2b6d7660295d1; Draft 2092793637604294656; exact title; blocks []; visuals []; unknown false; autosave saved; Publish disabled | success, then block |

Observed title: From Skill Memory to Shared Agent Knowledge. Command 2's semantic create transaction also set the exact title, so a separate title command was not issued.

Totals at stop:

- commands 2 of 15; observations 2 of 12; claims 2
- Publish commands 0; persisted progress records 2, both completion records (one for each completed command)
- materialization start 2026-08-27T01:53:58.105Z
- terminal block 2026-08-27T01:58:37.205Z
- automation time to block approximately 279.1s, within six minutes
- command 1 issue-to-observation gap 159.751s had no persisted progress during the gap; its completion progress record was written 0.523s after the observation, so the two persisted completion records do not satisfy bounded-wait progress

## Terminal block and recovery result

Event 000006.json records materialization_blocked. Reconciliation evidence:

- file: runs/x_article_execution_8a739b6d-6a40-4316-af0b-f5c31b80d929/x-article/browser/reconciliation-evidence/7fd56854d69f9308e928fea0a7df451f6b84cb65d17289abfeb59fdd2bf50e2b.json
- digest: sha256:7fd56854d69f9308e928fea0a7df451f6b84cb65d17289abfeb59fdd2bf50e2b
- result: unverifiable
- reason: checkpoint has no stable editor revision for materialized draft content

Checkpoint revision 3 is terminal blocked: body is pending with no digest, all three media items are pending, last_editor_revision is null, and publish confirmation is absent. No next command existed. This was a deterministic runtime stop, not Chrome uncertainty.

The deliberate disconnect/reacquire plus resume-editor step could occur only after the first image. The blocker occurred before cover, body import, and the first image, so that recovery point was not reachable. No reconnect or resume call was invented, and no second execution was created.

## Preview and Draft acceptance matrix

| Criterion | Required | Observed | Result |
|---|---|---|---|
| exact account | @Glen56121 | exact live match before mutation and in editor | pass |
| fresh Draft | one new Draft | 2092793637604294656 | pass |
| exact title | approved title | exact live title | pass |
| cover | approved cover | command not issued | fail |
| one document import | digest-bound import | command not issued | fail |
| three inline images | ordinals 37/45/55 | zero uploaded | fail |
| exact inline Alt | three approved strings | not reachable | fail |
| first-image reconnect/resume | reacquire then resume-editor | not reachable before terminal block | fail |
| marker-free Preview | anchors 0; duplicates 0 | Preview not reached | fail |
| exact body | approved canonical document | import not reached | fail |
| autosave | saved | saved after create/title | partial pass |
| confirmation | confirmation_pending | confirmation absent; phase blocked | fail |
| Publish command count | 0 | 0 | pass |
| command/observation budgets | commands <=15; observations <=12 | 2 / 2 | pass |
| automation time | <=6 min | approximately 279.1s | pass |
| bounded progress | no silent gap | 159.751s with no progress during the gap; first of two completion progress records followed the observation by 0.523s | fail |
| no deletion/cleanup | zero | zero | pass |

## Runtime evidence and receipt boundary

Workspace:

C:\Users\admin\Documents\New project 2\publishing-workspace\v3-2-draft-smoke\task4-20260827

Execution evidence:

C:\Users\admin\Documents\New project 2\publishing-workspace\v3-2-draft-smoke\task4-20260827\runs\x_article_execution_8a739b6d-6a40-4316-af0b-f5c31b80d929\x-article\browser

Expected receipt:

C:\Users\admin\Documents\New project 2\publishing-workspace\v3-2-draft-smoke\task4-20260827\runs\x_article_execution_8a739b6d-6a40-4316-af0b-f5c31b80d929\x-article\browser\materialization-receipt.json

The receipt does not exist because the run terminated at materialization_blocked. It must not be treated as a successful receipt. The checkpoint, commands, claims, reports, observations, event 000006, and reconciliation evidence are the durable terminal failure record.

No publish_article_once command was issued, claimed, executed, or simulated. No Publish approval was requested. No Draft was published, deleted, or cleaned up. The diagnostic Draft intentionally remains unpublished and undeleted.
