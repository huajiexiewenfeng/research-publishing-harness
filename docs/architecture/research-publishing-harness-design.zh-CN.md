# Research Publishing Harness V1 设计基线

## 状态

- 日期：2026-08-18
- 状态：已确认，可进入实施
- 仓库：<https://github.com/huajiexiewenfeng/research-publishing-harness>
- 默认内容语言：英文
- 设计语言：中文

本文是 V1 实现的公共设计基线。它把长期 AI 技术研究转化为有证据支撑的文章与 X 技术交流，同时保留研究血缘、事实边界、隐私和人工控制。

## 1. 产品目标

V1 服务个人长期技术研究，当前主线包括：

- Enterprise AI Agent Runtime。
- `llm-wiki-runtime`。
- Project Develop Copilot（PDC）。
- Thinking Skills 与 Skill Engineering。
- 小型、聚焦、可复用的 Agent Skills。

外部 AI 信号只能支撑、挑战或推进这些研究方向，不能因为热点本身自动成为选题。选题权始终属于用户。

## 2. V1 范围

V1 由一个共享研究内核、两个平级 Harness 分支和两个薄 Skill 组成：

```text
User-selected Topic / Candidate
              │
              ▼
       Shared Research Kernel
 Candidate → Evidence → Research Content Package
              │
       ┌──────┴──────────┐
       ▼                 ▼
Article Skill          X Skill
       │                 │
       ▼                 ▼
article-harness       x-harness
       │                 │
Canonical Article     Manual Publication Package
```

V1 包含：

- Candidate、Research Track、Source、Claim、Evidence、Lineage 与 Boundary 契约。
- Research Content Package 生命周期与冻结版本。
- Article Generation Task、Draft Candidate、Review 与 Canonical Markdown Package。
- X Single、Thread、Reply 的 Draft、Review、字符验证、Publication Plan 与 Approval。
- Manual Adapter 和手工发布回执补录。
- 两个薄 Skill：`article-publishing-copilot` 与 `x-publishing-copilot`。
- CLI、Manifest、Fixtures、测试和开源文档。

V1 不包含：

- Browser 自动操作。
- X API/OAuth 发布。
- 无人值守定时发布。
- 自动选题、热点追踪或流量优化。
- 微信公众号、知乎、CSDN 或个人网站 Adapter。
- 自动修改研究结论、项目代码或 Skills。

## 3. 关键原则

### Research before content

先建立研究问题、Claim、Evidence、Lineage 与 Boundary，再生成文章或 X 文本。

### Evidence before fluency

文字流畅不能替代证据。所有重要 Claim 都必须有状态和证据关系。

### One research unit, optional outputs

Research Content Package 是共享研究事实源。Article 与 X 都是可选输出；X 不要求先写文章，文章也不会自动被切碎成 Thread。

### Generative plane and deterministic plane

- Agent/Skill：理解意图、综合研究、起草、语言编辑。
- Harness：Schema、状态、证据映射、字符计数、门禁、内容指纹、Artifact 与回执。

Harness 不直接绑定任何模型供应商。它生成结构化 `Generation Task`，Skill 让当前 Agent 返回 `Draft Candidate`，Harness 再进行确定性校验。

### Human authority

用户决定主题、观点、最终文本和是否发布。Approval 只对一个最终内容指纹有效。

## 4. 公共仓库结构

```text
research-publishing-harness/
├── .github/workflows/
├── docs/
│   ├── architecture/
│   └── guides/
├── harnesses/research-publishing/
│   ├── contracts/
│   ├── core/
│   ├── branches/
│   │   ├── article-harness/
│   │   └── x-harness/
│   ├── adapters/x/manual/
│   ├── examples/
│   └── tests/
├── skills/
│   ├── article-publishing-copilot/
│   └── x-publishing-copilot/
├── registry/manifests/
├── tests/
└── tools/
```

公共仓库只包含通用能力和脱敏示例。个人配置、真实草稿、账号状态、企业材料和发布回执位于仓库外。

## 5. 运行边界

```text
公共代码仓库
  通用 Harness / Skills / Contracts / Tests

用户级状态目录
  ~/.research-publishing-harness/
  配置、缓存、锁、可重建索引

内容工作区
  <content-workspace>/
  candidates / packages / articles / x / reviews / receipts / feedback

来源仓库和文档
  默认只读，由 Source Registry 显式授权
```

SQLite 只作为可重建索引。Markdown、YAML、JSON 和 JSONL Artifact 是持久事实源。

## 6. 核心对象

### Research Track

描述长期研究主线，由个人内容工作区注册，不硬编码进公共 Harness。

### Content Candidate

Candidate 是轻量 Backlog 条目，只表示可能值得研究表达，不表示可发布。

```yaml
candidate_id: candidate_2026_001
title: ""
source_type: commit | design | failure | eval | discussion | external_signal
research_track: llm-wiki-runtime
thesis_hint: ""
source_refs: []
privacy: public | needs_review | private
status: idea
```

### Research Content Package

```yaml
schema_version: "1.0"
package_id: rcp_2026_001
status: draft
research_track:
  id: llm-wiki-runtime
  parent: enterprise-agent-runtime
topic: ""
research_question: ""
content_intent:
  purpose: share_finding
  audience: [ai-agent-developers, ai-infra-developers]
thesis:
  summary: ""
  claim_status: observed
claims: []
evidence: []
boundaries:
  established: []
  not_established: []
  explicitly_not_claimed: []
  planned_work: []
research_lineage: []
open_questions: []
sources: []
privacy: {}
```

### Claim Status

| 状态 | 含义 | 典型英文表达 |
|---|---|---|
| `verified` | 代码、公开材料或可复现实验证明 | `The implementation does...` |
| `observed` | 真实使用观察 | `In my use, I observed...` |
| `inferred` | 从证据推导 | `This suggests...` |
| `hypothesis` | 当前假设 | `My current hypothesis is...` |
| `planned` | 尚未实现的计划 | `I plan to explore...` |

生成内容不能把较弱状态升级为较强状态。Phase 3、Phase 4、Trace、Eval 与 Controlled Learning Loop 不能被写成当前已交付能力。

### Source 与 Evidence

Source 必须声明：

- `access`: `public | private | restricted`
- `publication_policy`: `cite | paraphrase_only | internal_only`
- `revision`: Commit SHA 或内容 Digest

只有 `cite` Source 可以直接暴露位置。只依赖 `internal_only` Source 的公开 Claim 默认被 Evidence Gate 阻断。

### Research Lineage

允许关系：

- `extracted_from`
- `informed_by`
- `built_on`
- `integrates_with`
- `replaces`
- `independent_of`

涉及 PDC、Obsidian LLM Wiki 和 `llm-wiki-runtime` 时必须存在 Lineage，不能依靠模型记忆猜测项目关系。

### Run、Review、Approval 与 Receipt

- Run：一个 Package 进入一个分支的一次执行。
- Review Report：确定性检查和人工判断问题。
- Approval：对锁定 Publication Plan 的一次授权。
- Publish Receipt：发布或手工交接后的不可变结果。

## 7. 状态机

Package：

```text
draft → evidence_ready → reviewed → frozen
```

Run：

```text
created
→ generation_ready
→ drafted
→ reviewed
→ approval_pending
→ approved
→ handed_off | finalized | failed | cancelled
```

冻结对象不原地修改。任何修改产生新 Version 或新 Run。

## 8. Intake 与 Evidence

V1 入口：

1. 用户明确提出研究问题。
2. 用户选择 Candidate。
3. 用户指定 Commit、设计文档、失败记录或 Eval。
4. 用户指定一条与研究主线有关的外部讨论。
5. 用户从已完成文章创建 X Handoff。

流程：

```text
User-selected Topic
→ Candidate Qualification
→ Source Revision Capture
→ Claim Extraction
→ Evidence Mapping
→ Boundary and Lineage Review
→ Privacy Classification
→ Research Content Package
→ Evidence Gate
```

外部 Signal 只能成为 Supporting Evidence、Counterexample 或 Open Question，不能因为热门自动成为 Thesis。

## 9. Article 分支

```text
Frozen Package
→ Article Brief
→ Claim-led Outline
→ Generation Task
→ Draft Candidate
→ Claim/Citation/Lineage Check
→ Boundary/Privacy/Editorial Review
→ Human Finalization
→ Canonical Article Package
→ Optional X Handoff
```

输出：

```text
articles/<slug>/<run-id>/
├── article.md
├── article.meta.yaml
├── claim-map.json
├── sources.md
├── review-report.json
├── generation-task.json
├── draft-candidate.json
└── x-handoff.json
```

默认文章语言为英文。中文适配是独立派生 Artifact，需要自己的 Draft Digest 与 Review。

## 10. X 分支

内容类型：`anchor | research_note | reply`。

表现形式：`single | thread | reply`。

```text
Frozen Package
→ X Brief
→ Select One Angle
→ Generation Task
→ Draft Candidate
→ Claim/Lineage/Privacy Review
→ Weighted Character Validation
→ Locked Publication Plan
→ Human Approval
→ Manual Adapter
→ Hand-off Receipt
```

默认只生成一个主草稿；用户明确要求比较时最多生成两个备选。

字符验证必须兼容 X 官方 `twitter-text` 加权规则，默认标准上限 280，不能使用普通 `string.length`。Thread 中每个 Post 独立验证。

Thread 部分失败时必须停止、保留已完成回执，不自动删除，也不能未经新批准继续。

## 11. Manual Adapter

Manual Adapter 是 V1 唯一真实交付 Adapter：

- 生成最终 Preview 和逐项复制包。
- 不访问浏览器或外部网络。
- Run 进入 `handed_off`。
- 用户发布后可以补录 URL、Post ID 与发布时间。
- Adapter 不得改写已经锁定的文本。

Browser 与 X API 只保留接口目录或文档说明，不作为 V1 已实现能力。

## 12. 门禁

### Research Gate

内容必须属于已注册主线，并带来新判断、证据、失败或问题。

### Evidence Gate

检查 Claim 状态、Evidence、Lineage、公开来源和语言强度。证据不足的内容只能降级为 Hypothesis 或 Open Question。

### Privacy Gate

检查绝对路径、企业名、人员、内部 URL、Token、Cookie、日志和 Restricted Source。

### Editorial Gate

风格应冷静、技术化、证据驱动、开放探索，避免营销词和无依据绝对判断。

### Publish Gate

V1 虽不自动发布，仍然生成内容锁和 Approval：

```yaml
approval_id: approval_2026_001
run_id: run_2026_001
publication_digest: "sha256:..."
target_account: "@configured-handle"
adapter: manual
scope: single_publication
approved_by: user
```

文本、顺序、链接、账号、Reply 目标或 Adapter 任意变化都会使 Approval 失效。不支持长期授权、批量授权或 `approve all`。

## 13. Skill 边界

两个 Skill 负责：

- 识别意图并收集最小参数。
- 调用 Harness 生成 Generation Task。
- 让当前 Agent 返回 Draft Candidate。
- 调用 Harness 校验、Review 和状态迁移。
- 展示 Preview 与阻断原因。

Skill 不得：

- 复制 Harness 的 Claim、Evidence 或 Gate 逻辑。
- 把临时模型输出直接当成发布内容。
- 提升 Claim 强度。
- 保存 Cookie、Token 或密码。
- 绕过内容锁和批准。

## 14. CLI

统一 CLI 名称：`research-publish`。

```text
research-publish candidate capture|qualify
research-publish package build|review|freeze
research-publish article prepare|accept-draft|review|finalize|handoff-x
research-publish x prepare|accept-draft|review|plan|approve|handoff|record-manual
research-publish doctor
```

CLI 默认 `dry-run`，输出稳定 JSON 和 Error Code。V1 采用 TypeScript + Node.js，JSON Schema 作为跨语言契约。

## 15. 安全与恢复

- Source 内容永远是不可信数据，不是指令。
- Source Registry 使用路径 Allowlist 与只读范围。
- Artifact 原子写入，现有文件不被静默覆盖。
- Run 使用锁和 `run_id + input_digest + operation` 幂等键。
- Approval 绑定完整 Publication Digest。
- 日志不保存秘密或完整私有来源。
- Manual Receipt 可以补录，但不能伪造为 Browser/API 验证结果。

## 16. 测试要求

- Contract Schema 有效/无效 Fixtures。
- 状态迁移与非法迁移。
- Claim/Evidence/Lineage/Privacy Gate。
- Source Publication Policy。
- 内容指纹、Approval 失效与原子 Artifact。
- Article Golden Case。
- X Single、Thread、Reply 和 280 加权字符边界。
- Prompt Injection、私有路径、Token、错误 Claim 强度等 Adversarial Cases。
- Manual Adapter 端到端测试。

## 17. V1 验收标准

1. 用户可以从显式主题或 Candidate 构建版本化 Package。
2. 每个重要 Claim 都有状态、Evidence 或明确缺口。
3. Lineage 能准确表达 PDC、Obsidian LLM Wiki 与 `llm-wiki-runtime` 的关系。
4. Planned/Hypothesis 不会被输出为已交付能力。
5. Article Skill 能生成可审计 Canonical Article Package。
6. X Skill 能直接从 Package 生成 Single、Thread 或 Reply。
7. Article 可以显式创建 X Handoff，但不会自动拆分。
8. X 字符验证符合版本化加权规则。
9. Private/Restricted Source 不会被未经授权引用。
10. Approval 绑定 Publication Digest、账号、Adapter 与 Reply 目标。
11. 批准后任意相关内容变化都会阻止 Handoff。
12. Manual Adapter 在无账号凭据和无网络时可完整运行。
13. Browser/API 不存在时不会绕过门禁。
14. Feedback 不会自动修改研究结论或 Skills。
15. 公共仓库不包含个人路径、私有材料或真实凭据。
16. Contract、Manifest、Golden Cases 和安全测试通过。
17. README 能引导开发者用 Synthetic Example 完成 Article 与 Manual X 流程。

## 18. North Star

> Turn ongoing AI systems research into evidence-backed public artifacts and technical conversations without losing lineage, boundaries, privacy, or human control.
## Visual Publishing V2.1 增量

V2.1 将 Canonical Markdown Article Package 定义为静态视觉资产的事实源。Core 只增加最小 `VisualAssetRef`；Article Harness 管理 Slot、候选、Visual Review、Manifest 和 Package Digest；X Harness 只通过显式 `asset_id` Handoff 复用一个资产。Browser Host 只能上传锁定 Package 内、路径受限且 Digest/MIME 匹配的 PNG、JPEG 或静态 WebP。

V2.1 不改变 V2 write-ahead Submit Barrier、Host consumed-command、at-most-once 或公开只读恢复。Receipt 分别记录 Source Asset、Composer Attachment 和 Public Media 证据；不声称 X 转码后的公开媒体与源文件字节相同。动态图、GIF、视频、多图、自动选图和 LLM Wiki 动态接入均不在本版本范围内。X Articles 已由后续 V3 独立分支支持，不属于 V2.1 Post 契约。

## X Article Browser Publishing V3 增量

V3 新增与 Post 分支并列的 `x-article-harness`，只接受已经 Finalize 的 Article Package。Canonical Markdown 会先编译成受限、版本化的 Article Document；Plan 与一次 Approval 锁定账号、`everyone`、完整文档、视觉资产、Browser Adapter 与 `publish_once`。现有 `single | thread | reply` 契约不增加 `article` 枚举值。

Chrome Host 逐条执行语义命令：观察 Articles 页、创建并识别自动保存 Draft、填充标题和正文、上传 Package 内锁定图片、验证 Preview、打开 Publish Review，最后经过 write-ahead barrier 只签发一次 `publish_article_once`。真实文件上传与最终公开发布仍需要动作时 Human 确认；发布命令一旦签发，恢复路径只读，禁止再次 Publish 或降级成 Thread。

公开验证分别比较作者、标题、块顺序与文本、展开链接以及可观察的图片/Alt 证据，并生成不可变 Receipt。V3 不支持编辑、删除或取消发布既有 Article、订阅者可见、GIF/视频、嵌入 Post、排程和任意 HTML。

## LLM Wiki Memory Adapter V2.2 增量

V2.2 在生成平面之前增加受控长期研究记忆，但不在 Harness 内建设第二个知识库 Runtime。`research-publishing` Domain 的语义、Claim/Boundary 判断和 Candidate Insight 提议仍归 Article/X Skill；Harness 负责 Query/Ingest Plan、Digest、Review、Approval、状态和 Receipt；只有 `llm-wiki-runtime` 0.2.0 可以确定性读取或写入 Publishing Workspace 的 `.llm-wiki`。

项目源码仓库的 `.llm-wiki` 与 Publishing Workspace 完全隔离。首版 Primary Domain 固定为 `research-publishing`，所有长期记录位于 `domains/research-publishing/tracks/{research_track}/...`。Adapter 只接受显式绝对 executable、固定 `python-module | console-script` launcher、固定 argv allow-list 和单个 JSON stdout envelope；禁止 shell、任意命令、静默 PATH 发现和直接文件降级。

读取闭环为：

```text
Query Plan → Runtime Context Pack → frozen Context Snapshot
→ Human Context Review → draft Package 1.1 binding → Package Review/Freeze
```

Query Plan 锁定 Domain、track、用途、allow/exclude path、预算、排序、Profile/SCP digest 和 Runtime 版本。Context Snapshot 固定有序 refs、相对路径、checksum、截断和风险字段。外部内容统一按 `data_only` 处理。Runtime 不可用时可以诚实降级为 `memory_unavailable`；没有选择内容时记录 `memory_not_applied`。既有 Package 1.0 保持只读兼容，Package 冻结后不得追加或替换 Context。

写入闭环分为 `publication_checkpoint` 与 `feedback_insight`。前者保存终态 Publication Receipt；后者要求 Human 显式选择公开反馈、绑定原 Receipt、生成 Candidate Insight，并经过 Evidence Review。Candidate Insight 区分 `counterexample`、`research_question`、`candidate_claim`、`audience_signal`、`format_signal` 和 `visual_signal`，永远不是自动 verified conclusion。

```text
source/feedback/insight bytes → immutable staging + preview
→ exact Ingest Plan → one Human Approval
→ validate-mapping → copy-source → write-record
→ register-artifact → append-log → immutable Ingest Receipt
```

Approval 同时绑定 Plan digest、Workspace identity、Domain/Profile、资产 digests、Runtime 版本和动作。任一变化都会 stale。`already_exists` 是明确幂等成功；partial/failed 不得伪装完成。Harness 在每个副作用前后持久化步骤状态，恢复时跳过已确认步骤。由于 Runtime 0.2.0 的 `register-artifact` 本身尚无 idempotency key，进程若恰在该命令成功后、Harness 状态落盘前崩溃，不能证明安全自动重放；该极窄窗口必须停止并人工核对 artifact index，不能声称无条件 exactly-once。

V2.2 不包含自动监控 X、自动选择反馈、向量/语义搜索、跨 Domain 写入、后台 daemon、云/团队同步或无人审批 Ingest。自动化测试只使用临时 Workspace 和 Fake Runtime；真实 Runtime integration 也只在显式路径启用后写系统临时目录。

## Research Data Flywheel V2.3 增量

V2.3 的 North Star 是：把持续的 AI 系统研究转成有证据的公开作品和技术对话，同时不丢失 lineage、boundary、privacy 与 Human control。Canonical Package 仍是事实源；Evidence、Semantic、Index 三个平面分别保存验证字节、研究语义和可检索投影。

Research Increment 使用不可变 revision，并通过 Claim、Open Question、Decision、Lifecycle Event、Evolution Edge 与 Publication Expression 连接研究演进。Publication Expression 严格区分 intended 与 observed；反馈只能作为 `data_only` supporting evidence，不自动强化 Claim。

长期语义更新必须经过 Semantic Delta → Human Review → exact Promotion Plan → 一次确认 → Runtime，Catalog 永远最后提交。Query 按 Catalog → Shard → exact record → bounded Chunk 渐进加载，默认 Mainline 不包含 Working。V2.2 数据只读兼容；历史迁移限定为一次显式 Import、一个 Increment 和六条有序 Thread，缺失字段保持 gap。

CLI 还公开 `memory terminal-hook status|resume` 与 `memory import inspect|capture|propose`。Article/X Skills 只选择语义输入和请求一次 Promotion 确认，文件、Digest、Runtime 调用、状态迁移与恢复全部由 Harness 负责。
