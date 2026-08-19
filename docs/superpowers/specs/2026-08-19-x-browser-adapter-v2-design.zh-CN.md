# X Browser Adapter V2 设计规格

## 文档状态

- 日期：2026-08-19
- 状态：设计候选，待书面确认
- 适用仓库：`research-publishing-harness`
- 设计语言：中文
- 首版实现范围：复用现有 Chrome 登录态的 X 纯文本 Single、Thread 与 Reply 发布
- 前置基线：`docs/architecture/research-publishing-harness-design.zh-CN.md`

## 1. 摘要

V1 已经能够把经过研究、证据、边界和隐私审查的 X 内容锁定为 Publication Plan，要求 Human 对精确 Digest 做发布确认，并通过 Manual Adapter 生成复制包与人工回执。

第一次真实的六条 Thread 发布验证了 V1 的研究与内容门禁，但也暴露出最后一公里仍然过度依赖 Human：Human 需要逐条复制文本、创建 Composer、点击发布、收集 URL 和 Post ID，再手工补录 Receipt。浏览器能力失败后，Skill 和 Human 之间也缺少明确、可恢复的执行协议。

V2 增加一个 Harness 管理的 X Browser Adapter。它复用 Human 已经登录的 Chrome 会话，在一次内容级确认后自动完成 Composer 填充、单次提交、公开验证和 Receipt 生成。Human 保留最终发布权和异常恢复权，但不再承担机械操作。

V2 的核心保证是：

> Harness 决定动作，Browser Executor 执行动作，Skill 只做编排；发布按钮最多提交一次，提交后的不确定性只能通过公开验证解决。

投递语义为：

```text
at-most-once submit
+
eventually verified outcome
```

## 2. 背景与问题证据

### 2.1 V1 已证明有效的部分

第一次真实发布流程证明以下能力值得保留：

- 研究主线先于日常内容输出。
- Claim、Evidence、Lineage 与 Boundary 能阻止把计划写成已交付能力。
- Canonical Article/Gist 与 X Thread 可以形成清晰的长短内容关系。
- Publication Digest 能把批准绑定到精确文本。
- Manual fallback 能在 Browser 能力不可用时诚实交付，不虚构“已经发布”。
- 发布后从公开页面核验 URL 和 Post ID，能形成可审计 Receipt。

### 2.2 V1 暴露的问题

当前实现和真实操作存在以下缺口：

1. Manual Preview 把复制正文和 Digest 混在同一文档中，Human 容易误复制审计文字。
2. Manual 流程没有在开始前说明 Thread 需要多个 Composer item，并通过一次 `Post all` 提交。
3. Skill 明确是 manual-only，但流程曾经尝试继续调试 Browser 能力，说明 Adapter 能力边界没有成为机器可判定的协议。
4. `record-manual` 要求 Human 提供根 URL、全部 Post ID 和时间，机械负担过高。
5. `verification_source: manual` 无法区分“Human 声明”和“系统从公开页面验证”。
6. Manual Receipt 没有强制验证账号、数量、顺序、唯一 ID、正文和回复链。
7. 通用 Run 状态把 `handed_off` 设为终态，但 Manual Receipt 又可以从 handoff 进入 recorded，语义不一致。
8. Publication Digest 当前包含 `planned_at`，相同内容重新计划也会得到不同 Digest。
9. Browser 失败后的降级边界不够明确，导致在无确定能力时消耗过多时间。

V2 直接解决自动发布和可验证执行；与 Browser 无关但会影响 V2 正确性的 V1 契约问题，也在本设计中给出兼容迁移规则。

## 3. 目标

V2 必须实现：

1. 复用 Human 现有 Chrome 登录态，不读取 Cookie、Token 或密码。
2. 在发布前精确确认当前 X 账号与 Publication Plan 目标账号一致。
3. Human 对最终正文、账号、模式和 Browser Adapter 只确认一次。
4. Harness 管理完整 Browser 执行状态、幂等、审计和恢复。
5. Browser Adapter 以确定性 Page Contract 填充 Single、Thread 或 Reply Composer。
6. 填充后回读数量、顺序和正文，确认与锁定 Plan 一致。
7. 对发布副作用提供 at-most-once 保护。
8. 从公开 X 页面验证账号、正文、顺序、外链和回复链。
9. 自动生成不可变的 Publication Receipt V2。
10. 对 Partial、Unknown、崩溃和重启提供安全恢复路径。
11. 保留 Manual Adapter 作为显式 fallback，不静默切换。
12. 让平台规则、Browser 控制和 Skill 编排保持可测试、可替换的边界。

## 4. 非目标

V2 首版不实现：

- 自动登录、输入凭据或自动切换 X 账号。
- CAPTCHA、风控、账号锁定或安全挑战绕过。
- 图片、视频、GIF、Poll 等媒体发布。
- X Articles。
- 定时发布或后台常驻 Daemon。
- 自动编辑、删除或补发已经公开的 Post。
- 自动点赞、转发、关注或参与讨论。
- X API/OAuth 发布。
- 多社交平台抽象。
- 根据 X UI 提示自动改写已锁定正文。
- 无人值守的长期或批量发布授权。

Schema 可以预留媒体描述，但 Browser Adapter 首版遇到媒体必须返回 `UNSUPPORTED_PUBLICATION_FEATURE`。

## 5. 已确认的关键决策

| 主题 | 决策 |
|---|---|
| 首选 Adapter | Browser Adapter |
| 登录方式 | 复用现有 Chrome 登录态 |
| Human 发布确认 | 一次，绑定精确 Plan Digest |
| Adapter 所有权 | Harness 管理 |
| Skill 角色 | 流程编排与 Browser Command 搬运 |
| Browser 控制 | 通过 Host 注入的 Browser Executor |
| 成功验证 | Browser 公开页面验证为必需源 |
| 第二验证源 | 可选，例如未来的 X API cross-check |
| 提交语义 | at-most-once，不自动重复点击 |
| 点击前恢复 | 只对可安全判定的瞬时故障，最多两次 |
| 点击后未知 | 只读验证，绝不盲目重发 |
| Partial | 保留现场，不删除、不补发，重新确认恢复计划 |
| Manual fallback | 必须由 Human 显式选择并重新批准 |

## 6. 总体架构

```text
Human
  │ 一次明确确认
  ▼
X Publishing Skill
  │ Plan / Approval / Browser Command transport
  ▼
Harness Core ────────────────┐
  │                          │
  ├─ Digest / Approval       │
  ├─ State / Ledger          │
  ├─ Idempotency / Receipt   │
  │                          │
  ▼                          │
X Browser Adapter            │
  │ XPageContract            │
  │ deterministic command    │
  ▼                          │
Browser Executor             │
  │ observe / navigate /     │
  │ set text / click         │
  ▼                          │
Existing Chrome session      │
  │ structured observation   │
  └──────────────────────────┘
  ▼
Public Thread Verifier
  ▼
Publication Receipt V2
```

### 6.1 Human

Human 负责：

- 审阅最终可发布正文。
- 确认目标账号、发布模式和 Adapter。
- 做一次发布确认。
- 对冲突、Partial、重新发布或 Manual fallback 做新的决定。

Human 不再负责：

- 逐条复制推文。
- 创建多个 Composer item。
- 点击 `Post all`。
- 收集 Post ID。
- 填写 Receipt。
- 手工重建回复链。

### 6.2 X Publishing Skill

Skill 负责：

- 识别 X 发布意图。
- 调用 Harness 完成 prepare、draft acceptance、review 和 plan。
- 展示 Human Approval Card。
- 只在 Human 明确确认后记录 Approval。
- 启动或恢复 Browser Execution。
- 执行 Harness 返回的 Browser Command，并把结构化结果原样报告给 Harness。
- 向 Human 汇报最终 Receipt 或异常决策点。

Skill 不得包含：

- CSS Selector、DOM 结构或坐标。
- X 页面成功判定规则。
- Browser 重试或状态迁移规则。
- Receipt 拼装逻辑。
- 绕过 Harness 自行点击发布的逻辑。

### 6.3 Harness Core

Harness Core 负责平台无关能力：

- Publication Intent 与 Plan。
- Stable Digest 和 Approval。
- Browser Execution 标识与状态机。
- Command 幂等和副作用约束。
- append-only Execution Ledger。
- Artifact 原子持久化。
- Receipt 生命周期与 supersession。
- 恢复、审计和错误码。

Harness Core 不知道 X 页面有哪些控件。

### 6.4 X Browser Adapter

Browser Adapter 负责 X 平台语义：

- X 页面和账号预检。
- Single、Thread 与 Reply Composer 协议。
- Composer item 数量、文本和顺序验证。
- 提交武装与单次提交命令。
- 发布结果解析。
- 公开 Thread 验证。
- X 特定错误、Partial 与 Receipt 数据。

Browser Adapter 使用 Browser Executor，但不直接依赖 Chrome、CDP、Playwright 或某个 Codex 工具。

### 6.5 Browser Executor

Browser Executor 是 Host 注入的有限能力端口。首个 Host 实现是 Codex 对现有 Chrome 会话的控制能力。

它执行 Harness 已经决定的动作，不负责决定下一步，也不能扩展动作范围。

因为 Human 已明确选择 Chrome，Host 不得在 Chrome 不可用、未登录或断开时静默切换到 Codex 内置浏览器、Edge 或独立自动化进程。Chrome 不可用必须作为明确的 Preflight 失败返回。

### 6.6 Public Thread Verifier

Verifier 是 Browser Adapter 的只读子组件，负责：

- 定位根 Post。
- 读取公开账号和发布时间。
- 重建有序回复链。
- 校验正文、外链和 Post ID。
- 形成 Verification Report。

Verifier 不允许调用任何发布、编辑或删除动作。

## 7. Publication Plan V2 与稳定 Digest

### 7.1 将内容意图与运行元数据分离

V1 直接对包含 `planned_at` 的 Plan 做 Hash。V2 定义独立、稳定的 `PublicationIntent`：

```ts
interface PublicationIntentV2 {
  readonly schema_version: '2.0';
  readonly platform: 'x';
  readonly target_account: string;
  readonly adapter: 'manual' | 'browser';
  readonly mode: 'single' | 'thread' | 'reply';
  readonly target_post: {
    readonly id: string;
    readonly url: string;
    readonly author: string;
    readonly snapshot_digest: string;
  } | null;
  readonly items: readonly PublicationItemV2[];
  readonly action: 'publish_once';
}
```

`PublicationPlanV2` 包含 Intent、Digest 和非稳定元数据：

```ts
interface PublicationPlanV2 {
  readonly schema_version: '2.0';
  readonly plan_id: string;
  readonly run_id: string;
  readonly intent: PublicationIntentV2;
  readonly plan_digest: string;
  readonly planned_at: string;
  readonly provenance: Record<string, string>;
}
```

`plan_digest` 只计算规范化后的 `intent`，不包含：

- `planned_at` 或其他时间。
- 本地绝对路径。
- Artifact 输出路径。
- UI 展示文字。
- Browser 或 Contract 版本。
- 重试次数。

### 7.2 文本规范化

Composer 文本 Digest 允许的规范化仅为：

- Unicode NFC。
- CRLF/CR 转 LF。

不得 trim、合并空格、替换引号、改变标点或重排链接。

如果 Browser 的 accessibility 表示把 emoji 拆成 glyph 与可访问标签，`XPageContract` 只能使用版本化、测试覆盖的等价映射，不能做开放式语义近似。

Composer 回读必须按文本 Digest 精确匹配。公开页面中的链接允许被 X 包装为 `t.co`，但 Verifier 必须解析最终目标并与 Intent 中的原链接比较。

### 7.3 Approval Digest

Approval 绑定完整副作用范围：

```text
approval_digest = SHA-256({
  plan_digest,
  target_account,
  adapter,
  mode,
  action: "publish_once"
})
```

账号、文本、顺序、链接、Reply 目标、Adapter 或模式任意变化都会使 Approval 失效。

Approval 必须在以下两个时点有效：

1. Browser Execution 开始时。
2. 生成 Submit Command 前。

一旦 Submit Command 已经写入 Ledger，Approval 后续过期不影响只读结果解析和公开验证。

## 8. Human Approval Card

Approval Card 将发布正文与审计信息分区，避免 Digest 被误复制：

```text
Publish once via Browser Adapter

Account: @target-handle
Mode: Thread
Posts: 6
External links: 1
Adapter: Existing Chrome session

[完整、有序、只读正文预览]

Audit
Plan digest: sha256:...
Approval expires: ...

Approve this publication?
```

Human 的一次确认同时批准：

- 当前有序正文。
- 当前目标账号。
- 当前发布模式。
- 当前 Reply 目标（如有）。
- 由 Browser Adapter 提交一次。

系统级 Browser 权限弹窗不属于产品发布确认；它不能被记录成 Human 的内容批准。

## 9. Browser Execution 状态机

Browser 发布使用独立状态机，不复用 V1 中语义不足的通用 `RunState`。

### 9.1 主成功路径

```text
created
→ preflight
→ account_verified
→ composer_prepared
→ composer_verified
→ submit_armed
→ submit_attempted
→ outcome_resolving
→ public_verifying
→ finalized
```

### 9.2 异常与恢复状态

```text
pre_submit_failed
cancelled_before_submit
published_unverified
outcome_unknown
partial
failed_after_submit
verification_conflict
```

语义：

- `pre_submit_failed`：没有发出 Submit Command，可以在修复后基于仍有效的原 Approval 恢复。
- `cancelled_before_submit`：Human 在提交前明确取消；该 Approval 随取消失效，如需再次开始必须重新确认。
- `published_unverified`：有发布迹象但公开证据不足，只允许恢复只读验证。
- `outcome_unknown`：不能判断是否发布，只允许恢复只读验证。
- `partial`：公开发现部分有序 item，不自动删除或补发。
- `failed_after_submit`：有充分证据表明提交未形成目标发布；任何新提交都需要新 Approval。
- `verification_conflict`：发现账号、内容、顺序或回复关系冲突，需要 Human 判断。

`published_unverified` 与 `outcome_unknown` 可以在恢复时回到 `public_verifying`。Receipt 每次升级都生成新文件，旧 Receipt 不修改。

### 9.3 Write-ahead Submit Barrier

Browser Host 和 Harness 之间存在崩溃窗口。为了保证 at-most-once，Harness 必须在把 Submit Command 返回给 Host 之前：

1. 验证 Approval 仍有效。
2. 重新观察并验证当前账号仍与 Plan 目标账号一致。
3. 验证 Composer Observation、page revision 和 Submit 控件仍匹配 Plan。
4. 持久化 `submit_armed` 事件。
5. 创建唯一 `attempt_id` 和 `submit_once` Command。
6. 持久化 `submit_command_issued` / `submit_attempted` 事件。
7. 原子提交 Ledger 与当前状态。
8. 才把 Command 返回给 Host。

`submit_attempted` 的精确定义是“Submit Command 已经不可逆地发给 Host”，不是“已经证明 X 接收了点击”。因此，即使在第 7 步后、第 8 步前崩溃，恢复时也不会再次生成 Submit Command。代价是极少数情况下可能实际没有点击，但状态仍要求 Human 新确认后才能重新发布；这是 at-most-once 的预期安全取舍。

同一个 `attempt_id` 永远不能生成第二个 `submit_once` Command。

## 10. XPageContract

### 10.1 语义接口

```ts
interface XPageContract {
  readonly id: string;
  readonly version: string;

  detectPage(observation: BrowserObservation): XPageState;
  detectAccount(observation: BrowserObservation): AccountResult;
  detectComposer(observation: BrowserObservation): ComposerResult;
  readComposerItems(observation: BrowserObservation): readonly ComposerItem[];
  detectSubmitControl(observation: BrowserObservation): SubmitControlResult;
  detectPublishedPosts(observation: BrowserObservation): readonly PublicPost[];
}
```

### 10.2 控件解析优先级

1. Accessibility role/name。
2. 稳定且已在 Fixture 中验证的 `data-testid`。
3. 已验证的 DOM 结构关系。
4. 仅在显式 Contract 版本中允许的坐标兜底。

无法确定唯一控件时返回 `PAGE_CONTRACT_UNSUPPORTED`，不能让 Agent 猜测。

### 10.3 Contract 生命周期

每个 Contract 必须声明：

- Contract ID 和版本。
- 支持的 X 页面变体。
- 对应的脱敏 Fixture 版本。
- 发布时间和弃用状态。
- Compatibility Test 结果。

X 页面变化只要求更新 Contract 和 Fixture，不应改变 Harness Core、Approval 或 Receipt 语义。

## 11. Browser Executor 与 Host Bridge

### 11.1 Executor 能力

```ts
interface BrowserExecutor {
  observePage(scope: ObservationScope): Promise<BrowserObservation>;
  navigate(command: NavigateCommand): Promise<BrowserActionResult>;
  click(command: ClickCommand): Promise<BrowserActionResult>;
  setText(command: SetTextCommand): Promise<BrowserActionResult>;
  pressKey(command: KeyCommand): Promise<BrowserActionResult>;
  waitFor(command: WaitCommand): Promise<BrowserObservation>;
}
```

首版不提供任意 JavaScript 执行、Cookie 读取、文件下载或跨域网络请求能力。

### 11.2 Browser Command

每条 Command 至少包含：

```ts
interface BrowserCommandEnvelope {
  readonly execution_id: string;
  readonly command_id: string;
  readonly kind: string;
  readonly expected_page_revision: string | null;
  readonly allowed_origin: 'https://x.com';
  readonly scope: string;
  readonly side_effect: 'read' | 'write' | 'submit';
  readonly payload_digest: string;
  readonly issued_at: string;
}
```

Host 只能执行 Envelope 描述的动作。`command_id`、origin、revision 或 payload 不匹配时必须拒绝。

Host Bridge 也必须为 `submit` 维护 write-ahead consumed-command 集合：在真正调用 Browser click 前先把 `command_id` 标记为已消费，同一个 Submit Command 再次送达时返回 `COMMAND_REPLAY_REJECTED`。Harness 和 Host Bridge 的双重 write-ahead 共同保证不会因进程重启或消息重放重复点击。

### 11.3 Observation

Observation 是结构化、最小化的页面事实：

- 当前 origin 和 canonical URL。
- 页面类型。
- 观察到的账号。
- Contract 识别的 Composer item。
- Contract 识别的有限控件及稳定 target handle。
- 页面 revision。
- 公开 Post 的最小验证字段。

Observation 不包含完整 DOM、Home Timeline、私信、通知或其他标签页内容。

每个动作完成后必须重新观察。旧 Observation 中的 target handle 立即失效。

### 11.4 Host Bridge

本地 TypeScript CLI 不能直接调用 Codex 的 Chrome 工具，因此 V2 使用可恢复的 Host Bridge：

```text
Harness 生成下一条 Browser Command
→ Skill/Host 调用 Browser Executor
→ Host 返回结构化 Browser Result
→ Harness 验证并持久化 Result
→ Harness 决定下一条 Command
```

建议命令面：

```text
research-publish x browser start
research-publish x browser next
research-publish x browser report
research-publish x browser status
research-publish x browser resume-verification
research-publish x browser cancel-before-submit
```

Skill 可以循环调用这些接口，但不能自行增加、替换或跳过 Browser Command。

### 11.5 Codex Chrome Host 约束

Codex Host 实现必须遵守当前 Chrome 控制面的实际能力边界：

- 通过受支持的 browser-client runtime 选择明确的 Chrome family。
- 第一次建立 Chrome binding 时完整读取该 binding 的能力文档，再把实际能力映射到 `BrowserExecutor` capability manifest。
- 在同一执行中复用持久 Chrome binding，不因新一轮 Agent turn 重新选择浏览器。
- Tab binding 与 Browser binding 分离；tab stale、被关闭或被清理时，只重新获取受允许的 X tab，不重新初始化 Browser binding。
- 不读取 Cookie、local storage、浏览器 Profile、密码或 session store。
- 不使用外部 Playwright server、独立 Browser MCP 或 Computer Use 作为 Chrome 的静默替代面。
- 如果明确的 Chrome family 不可用，返回 `BROWSER_EXECUTOR_UNAVAILABLE`，由 Human 修复连接或显式选择其他 Adapter。

浏览器能力文档可能随 Host 版本变化，因此 `BrowserExecutor` capability manifest 和版本必须进入 Preflight 证据，但不能进入内容 Plan Digest。

## 12. Browser 预检

Browser Adapter 开始写操作前必须验证：

1. Browser Executor 版本和能力兼容。
2. 已有 Chrome 会话可访问。
3. 当前活动页面或允许导航目标属于 `https://x.com`。
4. 当前没有登录页、CAPTCHA、风控、账号锁定或安全挑战。
5. 当前登录账号与 Plan 目标账号精确匹配；handle 比较可大小写归一化，但保留观察原值。
6. 页面能够匹配受支持的 `XPageContract`。
7. 当前 Composer 没有未知正文或附件。
8. Reply 模式的目标 Post Snapshot 仍然有效。

Adapter 不自动登录、不自动切换账号、不关闭未知草稿，也不读取其他标签页寻找账号信息。

如果 Chrome family 不可用，Adapter 必须停止并指导 Human 修复 Chrome 连接；不能自行改用内置浏览器或其他 browser family。

发现已有 Composer 内容时返回 `DRAFT_CONFLICT`。系统不得覆盖、追加或关闭该内容。

## 13. Composer 发布协议

### 13.1 Single

1. 打开空 Composer。
2. 使用 `setText` 写入唯一 item。
3. 重新观察并验证 item Digest。
4. 验证 Submit 控件唯一且可用。
5. 进入 Submit Barrier。

### 13.2 Thread

1. 打开空 Composer。
2. 写入第一个 item。
3. 按顺序创建其余 `N - 1` 个 Composer item。
4. 每次增加 item 后重新观察实际数量。
5. 按 ordinal 写入对应文本。
6. 重新读取全部 item。
7. 验证数量恰好为 N、ordinal 连续、没有额外 item、每条 Digest 匹配。
8. 验证唯一的 Thread Submit 控件。
9. 进入 Submit Barrier，一次提交整条 Thread。

### 13.3 Reply

1. 重新打开 Plan 锁定的目标 Post。
2. 比较 Post ID、author、canonical URL 和 snapshot digest。
3. 打开目标 Post 的 Reply Composer。
4. 写入并回读唯一 item。
5. 进入 Submit Barrier。

目标 Post Snapshot 不一致时返回 `REPLY_TARGET_STALE`，不能在旧 Approval 下继续。

### 13.4 点击前恢复规则

“最多自动重试两次”只适用于可证明安全的操作：

- `observe` 和只读导航可以对瞬时失败重试。
- `setText` 只能在重新观察确认目标仍是 Adapter 创建的 item 后重试。
- “增加 Composer item”结果未知时，必须先重新观察数量；只有数量确认没有变化时才允许再次点击。
- 如果数量已经增加，继续下一步；如果结果矛盾，停止为 `pre_submit_failed`。
- `submit` 永远不自动重试。

Browser Action 后不得基于旧 selector、坐标或 revision 连续盲点。

## 14. 发布结果解析

Submit Command 发出后，Outcome Resolver 只执行读操作：

1. 检查 X 是否返回根 Post URL。
2. 检查 Composer 是否被清空或关闭。
3. 读取成功提示，但提示本身不能证明发布成功。
4. 打开目标账号的公开时间线或已知根 URL。
5. 在 `armed_at` 之后的合理窗口匹配第一条 item。
6. 根据公开 reply 关系重建完整 Thread。
7. 校验账号、数量、顺序、正文、外链和回复链。

### 14.1 Outcome 分类

| 观察结果 | 状态 | 行为 |
|---|---|---|
| 全部 item 精确匹配 | `finalized` | 生成 Final Receipt |
| 只匹配部分 item | `partial` | 保存已匹配和缺失 ordinal，不删除、不补发 |
| 有发布迹象但证据不足 | `published_unverified` | 保存阶段 Receipt，只读恢复 |
| 无法判断是否发布 | `outcome_unknown` | 禁止重发，只读恢复 |
| 有充分证据确认没有目标发布 | `failed_after_submit` | 新提交必须重新确认 |
| 账号、正文或回复关系冲突 | `verification_conflict` | 停止并交给 Human |

X 时间线暂时不可读不能直接证明“没有发布”。任何 Submit 后状态都不得自动生成第二次 Submit Command。

`failed_after_submit` 只能来自与当前 attempt 关联的平台明确拒绝信号，或 Human 在审阅完整证据后作出的恢复决策；“在时间线中没找到”本身永远不是充分证据。

### 14.2 验证节奏

默认只读验证节奏：

```text
立即 → 3 秒 → 10 秒 → 30 秒 → 90 秒
```

约两分钟后仍不能确认则持久化 `published_unverified` 或 `outcome_unknown`。稍后可通过 `execution_id` 恢复验证，不需要新的 Human Approval，因为恢复操作没有写副作用。

## 15. Partial 恢复

Partial Receipt 至少记录：

- 已匹配 ordinal、Post ID 和 URL。
- 缺失 ordinal。
- 意外发现的 Post ID。
- 最后确认的回复关系。
- 恢复建议和风险。

Adapter 不允许：

- 自动删除已发布 Post。
- 自动补发缺失 item。
- 猜测缺失 item 应接到哪个公开 Post。
- 在原 Approval 下创建新的副作用。

Harness 可以生成一个新的 Recovery Plan，但 Human 必须审阅并重新批准。

## 16. Execution Ledger 与 Receipt V2

### 16.1 三层证据

```text
Execution Ledger     append-only 过程事实
Verification Report  某一次只读验证结果
Publication Receipt  不可变的阶段或最终结论
```

### 16.2 Ledger Event

```ts
interface ExecutionEventV2 {
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
```

`sequence` 必须从 1 连续递增。`state.json` 只是 Ledger 的当前投影；二者不一致时必须从 Ledger 重建。

### 16.3 Receipt 公共字段

```ts
interface PublicationReceiptV2 {
  readonly schema_version: '2.0';
  readonly receipt_id: string;
  readonly supersedes_receipt_id: string | null;
  readonly execution_id: string;
  readonly attempt_id: string;
  readonly run_id: string;
  readonly platform: 'x';
  readonly adapter: 'browser' | 'manual';
  readonly status:
    | 'finalized'
    | 'partial'
    | 'published_unverified'
    | 'outcome_unknown'
    | 'failed_after_submit'
    | 'verification_conflict';
  readonly target_account: string;
  readonly observed_account: string | null;
  readonly approval: ApprovalEvidenceV2;
  readonly submission: SubmissionEvidenceV2;
  readonly public_result: PublicResultV2 | null;
  readonly verification: VerificationEvidenceV2;
  readonly created_at: string;
}
```

### 16.4 Verification Source

明确枚举：

- `browser_public_page`：Browser Adapter 必需验证源。
- `x_api_crosscheck`：未来可选第二验证源。
- `user_report`：Manual Adapter 的 Human 声明。

验证强度单独表达：

- `public_browser_verified`
- `user_asserted`
- `unverified`

不能再以 `verification_source: manual` 同时表达执行方式和证据强度。

### 16.5 Final Receipt 不变量

Browser Final Receipt 必须满足：

- 目标账号与观察账号匹配。
- 根 URL 属于 X，且路径账号与目标账号匹配。
- Post ID 均为有效、唯一的数字 ID。
- Post 数量与 Plan 完全一致。
- item ordinal、正文和顺序匹配。
- Reply/Thread 关系匹配。
- 外链最终目标匹配。
- `submit_command_count === 1`，且 Host consumed-command 记录唯一。
- Approval Digest 与执行 Plan 匹配。
- 时间为 UTC，并满足合理先后关系。

### 16.6 Receipt 不可变与升级

Receipt 写入后不可修改。`published_unverified` 后续验证成功时，生成新的 `finalized` Receipt，并通过 `supersedes_receipt_id` 指向旧 Receipt。

## 17. Artifact 与隐私

### 17.1 运行目录

Browser 运行数据位于内容工作区，不进入公共代码仓库：

```text
<content-workspace>/
└─ runs/<run_id>/x/browser/<execution_id>/
   ├─ execution-manifest.json
   ├─ publication-plan.json
   ├─ approval-record.json
   ├─ state.json
   ├─ events.jsonl
   ├─ commands/
   ├─ observations/
   ├─ verification/
   ├─ receipts/
   └─ diagnostics/
```

### 17.2 默认保留策略

- Plan、Approval、Ledger 和 Receipt：长期保留。
- 脱敏 Command 与 Observation：30 天。
- 截图：默认关闭；诊断启用后保留 7 天。
- Cookie、Token、密码和完整 DOM：永不落盘。

公共仓库只包含协议、模板、测试和脱敏/合成 Fixture。所有实际运行目录必须被 `.gitignore` 覆盖。

### 17.3 截图规则

诊断截图只能：

- 截取 Composer 或目标公开 Thread 区域。
- 标记 `local_only`。
- 记录 SHA-256 和过期时间。
- 排除 Home Timeline、私信、通知和其他标签页。

## 18. Error Code

V2 至少提供以下稳定错误码：

| Error Code | 含义 |
|---|---|
| `BROWSER_EXECUTOR_UNAVAILABLE` | Host Browser 能力不可用 |
| `BROWSER_EXECUTOR_INCOMPATIBLE` | Executor 版本或能力不兼容 |
| `X_AUTH_REQUIRED` | 当前会话未登录 |
| `X_ACCOUNT_MISMATCH` | 当前账号不是目标账号 |
| `X_SECURITY_CHALLENGE` | CAPTCHA、风控或安全页 |
| `PAGE_CONTRACT_UNSUPPORTED` | 页面不能匹配受支持 Contract |
| `DRAFT_CONFLICT` | Composer 存在未知内容或附件 |
| `REPLY_TARGET_STALE` | Reply 目标 Snapshot 已变化 |
| `COMPOSER_ITEM_COUNT_MISMATCH` | Composer item 数量不匹配 |
| `COMPOSER_CONTENT_MISMATCH` | Composer 回读正文不匹配 |
| `APPROVAL_STALE` | Approval 过期或与 Plan 不匹配 |
| `STALE_PAGE_REVISION` | Browser Command 基于旧 Observation |
| `COMMAND_REPLAY_REJECTED` | Command 已执行或顺序无效 |
| `SUBMIT_ALREADY_ATTEMPTED` | 当前 attempt 禁止再次提交 |
| `PUBLICATION_PARTIAL` | 只发现部分目标 item |
| `PUBLICATION_OUTCOME_UNKNOWN` | 无法判断发布结果 |
| `PUBLIC_VERIFICATION_CONFLICT` | 公开结果与 Plan 冲突 |
| `UNSUPPORTED_PUBLICATION_FEATURE` | 首版不支持的媒体或交互类型 |

Error Code 是机器契约；用户可读错误信息可以演进。

## 19. Skill 端到端流程

```text
Frozen Research Content Package / Article Handoff
→ x prepare
→ Agent 生成一个完整 Draft Candidate
→ x accept-draft
→ x review
→ x plan --adapter browser
→ 展示 Approval Card
→ Human 一次确认
→ x approve
→ x browser start
→ [Harness Command ↔ Browser Executor Result] 循环
→ Public Thread Verification
→ Final / Partial / Unverified Receipt
→ 向 Human 返回根 URL、状态和下一步
```

Browser 预检失败时，Skill只报告原因并提供选择。除非 Human 明确选择 Manual，否则不能调用 Manual Adapter。

Submit 已尝试后，即使 Browser 断开，Skill也只能恢复结果验证，不能建议直接手工再发同一内容。

## 20. 测试策略

### 20.1 Unit Tests

- Stable Plan Digest 不受 `planned_at` 影响。
- Approval Digest 绑定账号、Adapter、模式和正文。
- Approval 到期规则。
- Browser Execution 合法与非法状态迁移。
- `submit_command_count <= 1`，且 Submit Command ID 不可重放。
- Command replay 和旧 page revision 拒绝。
- Ledger 连续性和 `state.json` 重建。
- Receipt Schema 与不变量。
- Post ID 唯一性。
- X URL 与 `t.co` 最终目标归一化。

### 20.2 XPageContract Tests

使用脱敏、合成 Fixture 覆盖：

- 正常账号页。
- Single Composer。
- Thread Composer。
- Reply Composer。
- 登录页。
- CAPTCHA/风控页。
- 已有草稿。
- 未知页面结构。
- 成功发布后的公开 Thread。
- 不完整或冲突的回复链。

### 20.3 Fake Browser Executor Scenario Tests

必须覆盖：

1. 正常发布六条 Thread。
2. 点击前瞬时失败并安全恢复。
3. 超过两次恢复上限后停止。
4. 账号不匹配。
5. Composer 已有内容。
6. Composer 回读正文不一致。
7. Approval 在 Submit Barrier 前过期。
8. Submit 返回超时，但实际已经公开发布。
9. 只发布部分 item。
10. 时间线暂时不可读取。
11. 恢复验证后成功并 supersede 旧 Receipt。
12. 重启后尝试重复提交被拒绝。
13. Adapter 改变使 Approval 失效。
14. Reply 目标变化。
15. 公开链接被 X 包装为 `t.co`。
16. 出现账号锁定或安全验证页。
17. 增加 Composer item 的点击结果未知，但重新观察可判定是否成功。
18. Chrome family 不可用时 fail closed，且不切换 Browser surface。
19. Chrome binding 仍有效但 tab stale 时，只恢复目标 X tab。

### 20.4 Integration Tests

使用本地 Mock X 页面验证完整 Host Bridge：

```text
start → next → execute → report → next → finalized
```

CI 不允许对真实 X 账号执行发布。

真实账号 smoke test 必须显式启用、使用测试账号，并默认停在 `submit_armed`。真正的 Submit 仍需要内容级 Human Approval。测试结束不自动删除 Post。

### 20.5 Manual Regression

Manual Adapter V1 仍需通过现有端到端测试；V2 迁移不能把 V1 handoff 虚构为 Browser 验证结果。

## 21. 兼容与迁移

### 21.1 Schema 共存

- V1 Manual Plan、Approval 和 Receipt 保持可读。
- Browser Adapter 只接受 V2 Plan 和 Approval。
- V2 公共类型把 Adapter 扩展为 `manual | browser`。
- V1 Receipt 不原地升级；如执行新的公开验证，生成 V2 Receipt 并引用原 Receipt。

### 21.2 Run State 与 Browser State 分离

V1 的 `handed_off` 终态问题不通过强行改变所有通用 Run 语义解决。V2 增加独立 `BrowserExecutionState`；Run 只引用当前 Browser Execution 和其结论。

Manual `record-manual` 后续应通过明确的 Receipt supersession 表达，而不是假装从 Browser 状态迁移。

### 21.3 Preview 分离

V2 将 Human 可复制正文、Approval Card 和审计 Digest 分为独立 Artifact。Manual Adapter 的后续兼容改进也应采用相同分离，避免 Digest 混入正文。

### 21.4 推荐实施顺序

1. V2 Contracts、Stable Digest、Approval 与 Browser State/Ledger。
2. Fake Browser Executor 和状态场景测试。
3. XPageContract 与合成 Fixture。
4. Host Bridge CLI。
5. 本地 Mock X 集成测试。
6. Codex Chrome Browser Executor 接入。
7. Public Thread Verifier 与 Receipt V2。
8. X Publishing Skill 的 Browser 分支和 Manual fallback。
9. 显式、受控的真实测试账号 smoke test。

该顺序是实施依赖关系，不表示其中尚未实现的部分已经交付。

## 22. 风险与缓解

### X 页面频繁变化

缓解：版本化 XPageContract、Fixture compatibility test、无法唯一识别即 fail closed。

### Submit 后 Browser 断开

缓解：write-ahead Submit Barrier、at-most-once Command、公开只读恢复。

### X 最终一致性导致暂时找不到 Post

缓解：有界只读重试、`published_unverified` Receipt、按 execution ID 恢复。

### Partial Thread

缓解：保留现场、记录 ordinal、不自动删除或补发、生成需要新确认的 Recovery Plan。

### 错误账号发布

缓解：Plan/Approval 绑定账号，预检和 Submit Barrier 前两次检查观察账号。

### Skill 能力漂移

缓解：Skill 只搬运 Harness Command；Selector、重试、成功判定和 Receipt 都由版本化代码拥有。

### 隐私泄露

缓解：最小 Observation、禁止 Cookie/DOM 落盘、截图默认关闭、实际运行目录不进入 Git。

## 23. 验收标准

Browser Adapter V2 实现只有满足全部条件才能称为完成：

1. Harness 从已审核母稿生成稳定 V2 Publication Plan。
2. 相同 Intent 不因生成时间变化而改变 Plan Digest。
3. Approval Card 不把 Digest 混入任何 Post 正文。
4. Human 只进行一次内容和发布确认。
5. Approval 精确绑定账号、Adapter、模式、Reply 目标和有序正文。
6. Adapter 复用现有 Chrome 登录态，不读取认证秘密。
7. Submit 前验证当前账号确实是目标账号。
8. 已有未知 Composer 内容时绝不覆盖。
9. Composer item 数量、顺序和正文经过回读验证。
10. Browser Action 后不复用旧 page revision。
11. Submit Command 在 Harness Ledger 和 Host consumed-command 记录中都最多出现一次。
12. Submit 结果未知时绝不自动再次点击。
13. 系统能从公开页面重建完整 Thread。
14. Verifier 校验账号、正文、顺序、外链和回复链。
15. 成功时返回根 URL、全部 Post ID 和 Final Receipt。
16. Partial 时准确记录已匹配/缺失 ordinal，以及任何意外 Post ID。
17. 崩溃或重启后能按 execution ID 恢复只读验证。
18. 状态可以从 append-only Ledger 完整重建。
19. Receipt 升级不修改旧 Receipt，而是建立 supersession 链。
20. 运行产物不含 Cookie、Token、密码、完整 DOM 或无关页面数据。
21. 明确选择 Chrome 后不会静默切换到其他 Browser surface。
22. Browser 失败不会静默切换 Manual Adapter。
23. Manual fallback、Partial recovery 和重新发布都需要新的明确确认。
24. Contract 不能识别页面时 fail closed。
25. 所有关键成功、失败、崩溃和恢复路径有自动测试证据。
26. CI 不对真实 X 账号产生发布副作用。

## 24. 完整性结论

本设计已经确定：

- 产品授权边界。
- Harness、Skill、Adapter、Contract、Executor 和 Verifier 的组件边界。
- Stable Digest 与一次 Approval 的绑定语义。
- Browser Command/Observation Host Bridge。
- Composer 和 Submit 确定性协议。
- at-most-once 与点击后未知结果的恢复规则。
- Ledger、Receipt、Artifact、隐私和兼容契约。
- 首版支持范围、错误码、测试矩阵和验收条件。

实现阶段不得以“Browser 自动化方便”为由绕过任何内容门禁、Approval、write-ahead Submit Barrier 或公开验证要求。
