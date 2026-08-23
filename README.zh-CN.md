# Research Publishing Harness

[English](README.md) | 简体中文

> **Pre-alpha** — 一个本地优先、由人治理的研究发布工作流，将持续技术研究转化为有证据支撑的文章、X 发布内容和可复用的研究知识。

Research Publishing Harness 是包裹在 AI 辅助研究与写作之外的确定性控制层。模型可以协助调研、提炼论点和起草内容；Harness 则负责什么可以被视为证据、必须经过哪些 Human Gates、获批的精确内容、发布状态、Receipt，以及持久知识的受控提升。

## 为什么需要它

AI 辅助研究跨越三条边界，而仅凭内容生成无法证明它们：

- 草稿并非已经验证的 Claim；
- 提交操作并非已经验证的发布；
- 反馈不会自动成为持久知识。

Harness 通过 Claim/Evidence 谱系、Human Gates、不可变工件、内容绑定的 Approval 和可恢复的 Receipts，明确这些边界。它清晰区分模型的提议、人类的确认、适配器的执行，以及系统事后能够证明的内容。

## 工作方式

```text
Optional governed Query
          ↓
Research → Evidence → Human Review → Frozen Content Package
                                       ├→ Canonical Markdown Article
                                       ├→ X Single / Thread / Reply
                                       └→ X Article
Publication → Public Verification → Immutable Receipt
                                            ↓
                         Human-selected feedback or evidence
                                            ↓
                       Digest-bound Semantic Promotion
                                            ↓
                                 Next governed Query
```

可选的 Query 会在构建新包之前提供有边界、可审查的上下文。模型可以协助调研、提炼论点和起草内容，但 Harness 负责状态、Digest、Approval、发布状态和 Receipt。持久研究知识只能通过经过明确人工确认的受控 Runtime 路径发生变更。

## 职责边界

| 层级 | 负责内容 |
| --- | --- |
| Domain Skills | 领域语义和任务方法：如何定义研究任务、哪些输入有用，以及调用哪个 Harness 工作流。 |
| Harness | 确定性编排、状态转换、Digest 计算、Approval、Receipt、契约校验和恢复边界。 |
| Adapters | 有边界的手动或浏览器交接。它们仅暴露 Harness 所需的语义操作，不会演变为通用浏览器或社交媒体客户端。 |
| `llm-wiki-runtime` | 用于受治理记忆工作流的确定性 Query、校验、受控复制、记录写入、索引和日志。 |
| Humans | 内容、隐私、视觉、发布和语义审查，以及对被授权内容和 Digest 的精确确认。 |

## 当前可以完成什么

### 研究打包与审查

- 捕获并筛选研究 Candidates，构建带版本的 Research Content Packages，并明确保留 Claim/Evidence、来源谱系、隐私、编辑和发布检查。
- 审查并冻结不可变的包版本。可选的受治理 Query 可以在构建新包之前提供经 Human 审查的 Context refs；它不能在之后修补已经冻结的包。

### 文章和 X 输出

- 生成包含 Claim maps、来源谱系、Boundary notes 和相对资源引用的规范 Markdown Article Packages。
- 准备 X Single、Thread、Reply 及新发布 X Article 工作流，具备加权字符校验、精确有序内容、Digest 绑定的 Approval，以及将强制执行委托给一个 CLI 的精简 Skills。
- 文章与 X 分支是相互独立的可选输出；Article 绝不会被静默转换为 Thread。

### 视觉发布

- 在 Content Review 后附加必需或可选的 Article Visual Slots，规范化 PNG、JPEG 和静态 WebP 元数据，并生成包含 Visual Manifest 与资源覆盖的 Package Digest 的自包含 Package。
- 向 X 交接明确的 `asset_id`；Thread Post 1 最多包含一张图片，并在 Approval 绑定中包含获批的 Alt Text 和序号。

### 手动和浏览器执行

- 创建离线 Manual 复制包，并记录人工提供的发布 URL、帖子 ID 和发布时间；Manual Adapter 不访问 X。
- 对明确选定且已登录的 Chrome 会话使用有边界的 Browser Host Bridge，执行账号、草稿、编辑器、全新的 Submit-barrier 和公开验证检查。真实浏览器操作必须明确选择该会话，且从不属于 CI 验收的一部分。
- 按其精确审计、一次 `publish_once` 确认、操作时上传/发布门禁和只读验证恢复，运行 X Article 浏览器流程。

### 验证与恢复

- 生成不可变的 Final、Partial 和 Unknown Receipts，重建账本，恢复只读验证，并仅保留有边界的工件。
- 将不确定的发布视作一种核对状态：不盲目重试、不在 Adapters 之间静默回退，也不发出第二个 Submit/Publish 命令。

### 受治理的研究记忆

- 在构建包之前运行确定性 Runtime Query，并在发布后运行明确的 `publication_checkpoint` 或由 Human 选择的 `feedback_insight` Ingest plans。
- 构建 Research Increments 和证据对象，审查 Semantic Deltas，并通过 Digest 绑定的 Human Gate、Catalog-last 可见性和 Catalog-first 渐进式 Query 进行提升。
- 保持历史研究 Import 有边界且明确。Context 和外部反馈始终是 `data_only`；一条反馈可以启发 Candidate Insight，但不能自动成为已经验证的结论。

## 核心保证与 Human Gates

- `Context` 和外部反馈始终是 `data_only`；它们是审查的输入，本身不是已验证的 Claims。
- 工作材料被排除在默认 Mainline Query 之外。新包只能使用经过人工审查并绑定的 Context refs。
- Content、Privacy、Visual、Publish 和 Semantic Promotion 各自都有明确的 Human Gate。Approval 会绑定精确有序的内容、账号、模式、adapter、Digest，以及适用场景中的到期时间。
- Skill 和 Harness 代码不能写入 `.llm-wiki`；只有显式配置的 `llm-wiki-runtime` 可以执行受治理的 Runtime 操作。
- 发布不确定性绝不会被盲目重试。恢复流程区分安全恢复、校验和核对，以及需要人工决定的操作。
- Catalog-last 会让不完整的 Promotion 在其完整且已验证的投影可从活动 Catalog 到达前，对默认 Query 保持不可见。
- CI 和自动化验收使用临时工作区与伪浏览器主机。它们不会向真实账号发布、使用已存储的凭据，或写入用户 Wiki。

## 快速开始

需要 Node.js `20.19+` 和 pnpm `11.19`。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm build
node dist/harnesses/research-publishing/cli/index.js doctor \
  --workspace ./publishing-workspace \
  --output json
```

`pnpm check` 是离线验证：它会运行 lint、类型检查、测试、构建，以及 Article/X/Visual/X Article/Memory 验收；不需要账号、凭据、真实浏览器发布、网络发布，也不会写入用户 Wiki。CLI 构建完成后，`doctor` 命令会检查本地发布工作区。

## 选择你的入口

- [快速上手](docs/guides/quickstart.md) — 安装、运行验收，并了解 Article、X、Browser、Visual 和 Memory 流程。
- [V2.3 Memory Loop](docs/guides/memory-loop.md) — 跟随受治理的证据、Promotion、Catalog-last 和渐进式 Query 循环。
- [Domain Skill + Harness + Runtime 集成指南](docs/guides/skill-harness-llm-wiki-runtime-integration.zh-CN.md) — 在接入 Domain Skill 时复用 Runtime 边界。
- [架构设计](docs/architecture/research-publishing-harness-design.zh-CN.md) — 阅读系统意图、契约与信任边界。
- [JSON 契约](harnesses/research-publishing/contracts) — 查看 Harness 使用的版本化 schemas。

## 仓库地图

```text
.
├── harnesses/research-publishing/  # 确定性的领域 Harness 与 CLI
├── skills/                         # 精简的 Agent Skill 入口
├── tests/                          # 单元、集成、安全和验收测试
├── docs/
│   ├── guides/                     # 上手与可复用工作流指南
│   └── superpowers/                # 设计与实施记录
└── registry/                       # 可验证的 manifest 与 Harness 注册信息
```

## 项目演进

| 阶段 | 主要新增内容 |
| --- | --- |
| V1 | 内容包与 Manual 发布 |
| V2 | 有边界的 Browser 发布与不可变 Receipts |
| V2.1 | 视觉打包与审查 |
| V2.2 | 受治理的 Runtime Query/Ingest |
| V2.3 | Evidence 飞轮与 Catalog-first Query |
| V3 | 新发布 X Article 工作流 |

这些阶段说明了当前能力的来源；上面的工作流分组才是使用本仓库的推荐方式。

## 明确的非目标

本项目不会自主选择主题、安排发布、存储发布凭据、绕过 Approval 或 Human Gates、自动提升 Claims、盲目重试不确定的发布、支持任意富 HTML、提供云端或团队记忆，或从 CI 执行真实发布。它不是通用的社交媒体排程工具；没有人工提供的 receipt，手动交接绝不会被描述为发布证明。

## 环境要求与许可证

- Node.js `20.19+`
- pnpm `11.19`
- 受治理记忆工作流可选使用 `llm-wiki-runtime` `0.2.0`
- Apache-2.0 License

采用 Apache-2.0 许可证。
