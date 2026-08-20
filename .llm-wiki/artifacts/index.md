# Artifact Registry

| id | type | path | owner | related_session | status | last_checked | notes |
|---|---|---|---|---|---|---|---|
| dashboard-progress | dashboard | `.llm-wiki/dashboard/progress.html` | LLM | project | active | 2026-08-18 | 基于 Flow Record 的静态投影 |
| v1-design | design | `docs/architecture/research-publishing-harness-design.zh-CN.md` | project | research-publishing-harness-v1 | active | 2026-08-18 | 已确认设计基线 |
| v1-plan | plan | `docs/superpowers/plans/2026-08-18-research-publishing-harness-v1.md` | project | research-publishing-harness-v1 | active | 2026-08-18 | 已确认并进入执行 |
| v1-runtime | implementation | `harnesses/research-publishing/` | project | research-publishing-harness-v1 | verified | 2026-08-18 | Shared Kernel、Article、X、Manual Adapter 与 CLI |
| v1-skills | skills | `skills/` | project | research-publishing-harness-v1 | verified | 2026-08-18 | 两个薄 Skill，确定性机制全部委托 Harness |
| v1-manifest | manifest | `registry/manifests/research-publishing.json` | project | research-publishing-harness-v1 | verified | 2026-08-18 | 33 个 Harness/Skill 文件的确定性 SHA-256 |
| v1-verification | verification | `.llm-wiki/verification/v1.md` | project | research-publishing-harness-v1 | verified | 2026-08-18 | 17 条设计验收标准逐项证据 |
| v1-quickstart | guide | `README.md` | project | research-publishing-harness-v1 | verified | 2026-08-18 | Pre-alpha/V1 能力、边界与 Synthetic Quickstart |
| v1-handoff | handoff | `.llm-wiki/handoff/research-publishing-harness-v1-handoff.md` | project | research-publishing-harness-v1 | active | 2026-08-18 | codex/v1 本地交付入口；远端 push 待用户授权 |
| visual-v2-1-spec | design | `docs/superpowers/specs/2026-08-20-visual-publishing-v2-1-design.zh-CN.md` | project | visual-publishing-v2-1 | approved | 2026-08-20 | 批准提交 `d502ac9`，状态提交 `ff2d824` |
| visual-v2-1-plan | plan | `docs/superpowers/plans/2026-08-20-visual-publishing-v2-1.md` | project | visual-publishing-v2-1 | executed | 2026-08-20 | Tasks 1–9 implementation record |
| visual-v2-1-runtime | implementation | `harnesses/research-publishing/` | project | visual-publishing-v2-1 | implemented-local | 2026-08-20 | Core/Article/X/Browser/CLI V2.1 implementation |
| visual-v2-1-manifest | manifest | `registry/manifests/research-publishing.json` | project | visual-publishing-v2-1 | verified-local | 2026-08-20 | Deterministically regenerated after contract/runtime changes |
| visual-v2-1-verification | verification | `.llm-wiki/verification/visual-publishing-v2-1.md` | project | visual-publishing-v2-1 | passed-agent-local | 2026-08-20 | Full check and design §25 criteria 1–20 evidence |
| visual-v2-1-handoff | handoff | `.llm-wiki/handoff/visual-publishing-v2-1-handoff.md` | project | visual-publishing-v2-1 | active | 2026-08-20 | Inline `main` delivery summary; no push performed |
| visual-v2-1-evidence-binding-fix | bug | `.llm-wiki/bugs/2026-08-20-visual-publication-evidence-binding.md` | project | 2026-08-20-visual-publication-evidence-binding | passed-agent-local | 2026-08-20 | Three independently reproduced identity-binding gaps fixed with RED/GREEN regressions |
