# Change Brief: LLM Wiki Memory Adapter V2.2

## Summary

- title: Design controlled research-memory loop through llm-wiki-runtime
- status: design-approved
- flow_id: `llm-wiki-memory-adapter-v2-2`

## Routing

- intent: 为 Research Publishing Harness 增加受控长期研究记忆，使既有研究上下文能够进入下一份 Research Content Package，并使公开发布及人工选中的反馈经过 Evidence、Boundary 与 Human Gate 后形成下一轮候选洞察。
- primary_stage: `project-develop`
- secondary_bridges: `brainstorming`, `llm-wiki-core`, `project-graph-human-edge`
- confidence: high
- reason: V2.1 已明确预留 SCP Query/Ingest 连接点；用户确认下一阶段优先设计 LLM Wiki Memory Adapter，并要求形成 Skill + Harness + Runtime 的可持续 RSI 闭环。
- next_gate: 实施计划需要用户另行明确授权

## Sources

- `docs/superpowers/specs/2026-08-22-llm-wiki-memory-adapter-v2-2-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-20-visual-publishing-v2-1-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-21-x-article-browser-publishing-v3-design.zh-CN.md`
- `docs/architecture/research-publishing-harness-design.zh-CN.md`
- source-verified local runtime: `D:/tmp/github/llm-wiki-runtime`
- runtime contracts: `llm-wiki-profile.yml`, `scp.yml`, `ingest-mapping.yml` and the `llm-wiki` JSON CLI

## Requirement Summary

在不允许 Skill 或 Harness 直接写 `.llm-wiki`、不允许外部反馈自动成为研究结论、也不允许新记忆改变已冻结 Publication Plan 的前提下，增加一个受限 Runtime Adapter。Article/X Skills 继续拥有领域语义；Harness 拥有 Memory Plan、Digest、状态、人类确认和 Receipt；`llm-wiki-runtime` 拥有确定性查询、校验、复制、记录写入和日志追加。首版以 `research-publishing` Domain 和 `enterprise-agent-runtime` research track 建立 Query → Package → Publication → Human-selected Feedback → Candidate Insight → Approved Ingest → Next Package 的最小完整闭环。

## Scope

- active:
  - `harnesses/research-publishing/core/`
  - `harnesses/research-publishing/contracts/`
  - 新的受限 LLM Wiki Runtime Adapter
  - Article、X 与 X Article 在 Package 冻结前的 Memory Query 连接点
  - Publication Receipt 到显式 Feedback Snapshot 的连接点
  - Candidate Insight、Ingest Plan、Approval、Receipt 和幂等恢复
  - `skills/article-publishing-copilot/`, `skills/x-publishing-copilot/`
  - `research-publishing` Domain 的 Profile、SCP 与 Ingest Mapping
  - CLI、合成 fixtures、测试、README、Quickstart、架构和 registry/manifest
- read-only:
  - 已完成的 Article、Visual V2.1、X Browser V2 和 X Article V3 契约
  - `llm-wiki-runtime` 已有 CLI、Profile、SCP、Mapping 与 fallback 语义
- candidate:
  - 将 `llm-wiki-runtime` 以明确可发现的本地 executable/runtime dependency 注册到 Project Graph
- excluded:
  - 自动定时监控 X、自动选择反馈、无人批准 Ingest
  - 向量/语义搜索、后台 daemon、团队或云同步
  - 跨 Domain 写入、自动改写既有研究结论
  - 冻结后修改 Research Content Package、Publication Plan 或 Approval
  - 依赖 X API 的完整互动指标采集

## Acceptance

1. 首版 Primary Domain 为 `research-publishing`，所有长期记录按 `research_track` 隔离。
2. 源码仓库的项目开发 Wiki 与 Publishing Workspace 的研究记忆明确隔离。
3. Harness 只能通过固定 executable、固定 argv、JSON envelope 的 Runtime Adapter 调用 `llm-wiki-runtime`。
4. Skill 和 Harness 均不能直接写 `.llm-wiki`。
5. Query Plan 锁定 Domain、track、用途、读取范围、预算、Profile/SCP digest 和确定性 plan digest。
6. Query 结果冻结为带有有序 `context_refs`、path/checksum、风险和截断信息的 Context Snapshot。
7. V2.2 新建的 Research Content Package 使用 `schema_version: 1.1`，只绑定已审查 Context Snapshot；既有 1.0 artifacts 保持只读兼容，Package 冻结后不得追加或替换记忆。
8. Runtime/Query 不可用时原发布流程可以诚实降级，并记录 `memory_unavailable` 或 `memory_not_applied`。
9. Publication Feedback 只来自 Human 显式选择的公开条目，并绑定原 Publication Receipt。
10. 外部反馈始终按 `data_only` 不可信输入处理，不能触发命令或自动写入。
11. Skill 只能从 Feedback Snapshot 提出 Candidate Insight，不得自动宣称其为 verified conclusion。
12. Candidate Insight 明确区分反例、研究问题、候选主张、受众、格式和视觉信号。
13. Ingest 支持不依赖公开回复的 `publication_checkpoint` 和包含人工选择反馈的 `feedback_insight`；两者都必须经过 preview 和与精确 Ingest Plan digest 绑定的一次 Human Approval。
14. Profile、SCP、Mapping、来源、目标或内容变化会使 Ingest Approval 失效。
15. Runtime 写入通过 copy-source、write-record、register-artifact、append-log 等稳定契约执行。
16. `already_exists` 被视为幂等成功；partial/failed 不得伪装为完成。
17. Ingest Receipt 能从最后一个已确认步骤安全恢复，不能盲目重复整个写入。
18. V2.2 不允许跨 Domain 写入，未声明支持 Domain 的读取被拒绝。
19. Article、X、X Article 与 Visual V2.1/V3 发布和审批语义不回归。
20. Unit、contract、fake runtime、真实本地 runtime integration、安全和端到端闭环测试覆盖关键成功与失败路径。
21. CI 不访问真实 X 账号，不写入用户真实研究 Wiki。
22. README、Quickstart、架构文档、Skills 与 registry capabilities 同步反映 V2.2。

## Non-Goals

- 不建设第二个知识库 Runtime。
- 不让 Harness 判断某个观点是否为领域事实。
- 不把互动量自动等同于研究价值或事实强度。
- 不把发布后反馈直接注入当前已批准内容。
- 不自动抓取、回复、编辑、删除或重新发布 X 内容。
- 不在首版提供跨设备、团队或云端记忆。

## Verification Plan

- Contract：Research Content Package 1.0/1.1 version dispatch，以及 Query Plan、Context Snapshot、Feedback Snapshot、Candidate Insight、Ingest Plan/Approval/Receipt 的 schema、digest 和兼容验证。
- Unit：状态迁移、预算、排序、路径、风险标签、审批失效、幂等和错误码。
- Fake Runtime：正常 JSON、malformed stdout、超时、非零退出、partial failure、already_exists 和恢复。
- Real Runtime Integration：针对锁定的本地 `llm-wiki-runtime` 版本，在临时 Publishing Workspace 完成 resolve/query/preview/copy/write/register/log。
- Security：shell 注入、argv 注入、路径逃逸、错误 Workspace、源码仓库误用、跨 Domain、prompt injection、secret leakage。
- Regression：现有 Article、X、X Article、Visual、Browser Adapter 和 Manual Adapter 全量测试。
- End-to-end：历史研究记忆 → 新 Package → synthetic Publication Receipt → 人工选择反馈 → Candidate Insight → approved ingest → 下一次 Query。
- Project：`pnpm check`、`git diff --check`、22 条验收逐项证据审计、工作树清洁。

## External Dependencies

- cross-project runtime: `llm-wiki-runtime`
- relationship: `research-publishing-harness` consumes the stable JSON CLI and Profile/SCP/Mapping contracts; it does not copy runtime storage logic.
- evidence: 依赖已经从本地源仓库核对，但 Project Graph edge/pin/registry 仍应在规格确认或实施前正式登记。
- version policy: 实施计划必须选择兼容范围或固定版本，并增加 runtime doctor/preflight；不能默默使用任意 PATH 中同名程序。

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | V2.1 section 24、V3 基线及本地 llm-wiki-runtime 源码契约 | 2026-08-22 |
| design | done-approved | 用户于 2026-08-22 确认；`docs/superpowers/specs/2026-08-22-llm-wiki-memory-adapter-v2-2-design.zh-CN.md` | 2026-08-22 |
| plan | not-started | 必须等待用户确认书面规格 | 2026-08-22 |
| development | not-started | 无 | 2026-08-22 |
| testing | not-started | 规格中已定义验证矩阵 | 2026-08-22 |
| archive | not-started | 实施和验证完成后生成 handoff | 2026-08-22 |

## Open Questions

- 进入实施前，是否立即登记 `research-publishing-harness -> llm-wiki-runtime` Project Graph dependency edge。
- 第一版真实 Publishing Workspace 的位置应由用户显式选择；不得默认使用源码仓库根目录。
