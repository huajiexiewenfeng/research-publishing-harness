# X Article Complete Host Bridge 设计规格

**日期：** 2026-08-29
**状态：** 待用户 Review
**目标版本：** X Article Browser Host V3.5
**执行方式：** Inline Execution，不派 Subagent

## 1. 背景与已确认事实

V3.4 已经具备 Audit、一次确认、命令 claim/report、媒体尝试预算和 15 分钟硬 deadline，但真实 Chrome 验收仍未完成封面上传。执行 `x_article_execution_105d34cd-44ce-478c-bc58-a2630a16c74b` 提供了以下当前证据：

- 目标草稿、账号、标题、76 个正文块和 3 个视觉锚点均通过实时页面核对；
- 封面文件是有效的 `1600×900`、8-bit RGBA PNG；
- 文件 SHA-256 为 `13dfa0d931a42c9bf016fe26037550acfdaa9f59ad2b0fead8db53da9cbaa9c8`，与批准的命令一致；
- Chrome file chooser 被打开，`setFiles` 返回，但 X 页面没有出现封面媒体效果；
- 临时 Observation 回调依赖当前对话中的脚本环境，并因 `process is not defined` 失败；
- Cover Host 因无法取得 Observation，将“页面已证明无效果”报告为 `uncertain`；
- deadline 在 `905.985` 秒时正确阻止后续写入，草稿未被重复上传，也未进入 Preview 或 Publish；
- 合并后的 TypeScript 源码包含 V3.4 命令，但 checkout 内的已提交 `dist` CLI 一度仍为旧版。

因此本次缺陷不是单一选择器错误。控制面已经存在，缺失的是一个完整、可打包、可测试的 Browser Host Bridge：它必须从当前 Chrome 页面生成真实 Observation，执行媒体事务，并把传输失败与页面无效果区分开。

## 2. 目标

本版本必须做到：

1. 将当前 X Article 编辑器转换为确定性的、可由 Harness 校验的实时 Observation；
2. 让封面和正文图片使用同一个 Observer、同一种结果分类和同一 deadline；
3. 区分文件未绑定、X 未产生媒体效果、页面仍在处理、Observation 失败和成功上传；
4. 保证每个 claim 只执行一个媒体事务，不因 Observation 失败重复选择文件；
5. 在 15 分钟内完成“1 张封面 + N 张正文图片”，否则按现有 Fast Path deadline 停止；
6. 阻止源码与已打包 `dist` CLI 的协议漂移；
7. 保持 Draft-only 权限边界：本版本不打开 Preview、不点击 Publish。

## 3. 非目标

- 不修改 Article 内容、标题或既有正文结构；
- 不改变 Audit、Confirmation、Approval、Plan 或 Publish Gate；
- 不创建独立浏览器配置文件，不读取 cookie、密码、localStorage 或完整页面数据；
- 不把 Browser Host 改造成常驻服务；
- 不增加无界重试、坐标点击或跨浏览器 fallback；
- 不把 Chrome 扩展权限问题伪装成 Harness 成功。

## 4. 方案选择

采用 **Complete Host Bridge**，而不是只修改 Cover Host。

最小修补只能让封面错误信息更清楚，三张正文图片仍会依赖对话内临时代码。常驻 Browser Host 服务则超出当前范围并增加生命周期和权限风险。Complete Host Bridge 在当前控制面内补齐缺失的数据面，能同时解决真实 Observation、封面、正文图片和可诊断失败。

## 5. 架构

### 5.1 Chrome Editor Extractor

新增打包脚本：

`skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs`

它只接收已选择的 Chrome `tab`，在页面作用域中读取：

- canonical URL 与目标账号；
- 标题控件；
- 编辑器的段落、标题、引用、列表、链接和 bold/italic marks；
- `RPH_VISUAL_ANCHOR:*` 锚点及其当前顺序；
- 封面和正文媒体的可见引用、位置、Alt 与处理状态；
- autosave 状态；
- 必需控件的存在性、唯一性和 disabled 状态。

Extractor 返回 `XArticleHostPageSnapshotV1`，不计算 Harness digest，也不解释 Approval。它不得返回侧栏、时间线、私信、cookie、session 或完整 DOM。

### 5.2 Deterministic Observation Builder

新增 TypeScript 模块：

`harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.ts`

它接收：

- immutable command；
- 当前 Adapter context 中的 Plan 与 materialization plan；
- Extractor 的最小页面快照；
- 当前时间和 observation ID。

它负责：

- 使用现有 `createXArticleImportTemplate` 与 `normalizeXArticleHostEditor`；
- 校验账号、origin、Draft ID、标题、正文、锚点顺序和未知内容；
- 将已完成媒体映射到批准的 `asset_id`，不从页面文本猜测资产身份；
- 计算 `page_revision`；
- 生成 schema-valid `XArticleBrowserObservation`；
- 在任何外来、重复、错序或无法归属的媒体上 fail closed。

这一层是 Harness 的确定性边界，Extractor 不复制这些 Gate。

### 5.3 Cover Transaction

更新：

`skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`

事务顺序固定为：

1. 验证 command、claim、绝对路径、digest、MIME 和 PNG/JPEG/WebP/GIF 签名；
2. 定位唯一封面区域及其 file input；
3. 在点击前注册 file chooser；
4. 只绑定命令中的一个文件；
5. 读取 file input 的只读绑定证据；
6. 调用正式 Extractor 和 Observation Builder；
7. 在有界稳定窗口内观察 X 的媒体状态与 autosave；
8. 返回一次结构化结果。

结果增加稳定的 `reason`：

- `success` / `cover_uploaded`；
- `transient_failure` / `file_transfer_missing`；
- `transient_failure` / `x_media_effect_absent`；
- `transient_failure` / `x_media_still_processing`；
- `uncertain` / `observation_unavailable_after_selection`；
- `rejected` / `command_or_asset_invalid`；
- `rejected` / `cover_control_ambiguous`。

只有 fresh Observation 明确证明“零效果”，控制面才可以签发预算内的一次恢复。Observation 不可用时禁止重选文件。

### 5.4 Inline Image Transaction

新增：

`skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`

每个 claim 只处理一个 `replace_article_visual_anchor`：

1. 实时确认命令绑定的 anchor 仍存在且 ordinal 正确；
2. 将编辑器插入点限定到该 anchor；
3. 通过 `Insert → Media` 打开唯一 chooser；
4. 绑定一个批准文件；
5. 将媒体恢复到锁定 ordinal；
6. 写入并读回批准的 Alt；
7. 确认 anchor 被移除、媒体唯一、前后 context digest 不变、autosave 为 saved；
8. 返回 Observation 或结构化失败原因。

它不得追加到文章尾部，不得跳过锚点，不得一次上传多张图片。

### 5.5 Host Bridge Dispatcher

新增：

`skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs`

它接收 `tab + command + claim + verified asset path + context`，仅分发以下 Draft-only 事务：

- `navigate`；
- `observe_article_page`；
- `upload_article_cover`；
- `replace_article_visual_anchor`。

Dispatcher 返回 report-ready outcome，但不自行调用 `claim`、`report`、Preview 或 Publish。Harness 仍拥有状态机、尝试预算、deadline 和 Receipt。

## 6. 数据流

```text
Fast Path status/next
  → verify command + page identity
  → claim
  → Host Bridge dispatch
      → Extractor (current Chrome page)
      → one scoped media transaction
      → Extractor (fresh post-state)
      → Observation Builder
  → one structured outcome
  → browser report
  → status/next or terminal stop
```

任何步骤都不得从旧 Observation 复制当前证据。历史 Observation 只能用于绑定和对比，不能冒充 fresh page state。

## 7. 错误与恢复

- chooser 未打开：`transient_failure`，无媒体效果；
- chooser 打开但 file input 没有绑定文件：`file_transfer_missing`，提示检查 Chrome 扩展的 **Allow access to file URLs**；
- file input 已绑定但 X 未出现媒体：`x_media_effect_absent`；
- X 仍显示处理中：在当前事务的稳定窗口内等待，不重新选择文件；
- Observation 生成失败：`uncertain`，停止写入；
- fresh Observation 证明零效果且 Harness 仍有恢复预算：允许一次新 command/claim；
- deadline 到达：立即终止，不签发或执行新媒体命令；
- 外来/重复/错序媒体：阻断并保留草稿供人工检查。

## 8. 打包一致性

新增独立的 packaged CLI parity gate，在任何会重建 `dist` 的测试之前运行：

- 从共享的控制路由定义读取源码协议；
- 直接执行 checkout 内的 `dist/.../cli/index.js --help`；
- 比较 Fast Path 路由和协议版本；
- 若源码支持 V3.5 而 `dist` 不支持，验证立即失败并要求重新构建、提交打包产物。

`pnpm check` 必须先执行 parity gate，再执行会更新 `dist` 的 build/test，防止构建过程掩盖陈旧产物。

## 9. 测试策略

严格使用 TDD：每个生产修改先有失败测试，并保存 RED/GREEN 证据。

### 9.1 Extractor 与 Observation Builder

- 解析真实 X Article 结构的脱敏 fixture；
- 保留 links、marks、列表和三个 anchor ordinal；
- 拒绝错误账号、Draft、标题、正文、锚点、外来媒体和重复媒体；
- 生成稳定且 schema-valid 的 Observation；
- 不读取或返回编辑器范围之外的页面数据。

### 9.2 Cover Host

- chooser 注册顺序正确；
- file input 未绑定与 X 无效果使用不同 reason；
- Observation 失败后不重选文件；
- 成功时只出现一个批准封面；
- 文件 digest、MIME、绝对路径或 control 不匹配时零浏览器写入。

### 9.3 Inline Image Host

- 三个不同 ordinal 的单事务成功路径；
- Alt 写入并读回；
- 不允许 append-to-end、重复图片、错锚点、错 asset 或错 context；
- 一个 claim 只调用一次 chooser；
- 无效果和 uncertain 均不在 Host 内自行重试。

### 9.4 集成与回归

- `0 / 1 / 3 / 10` 图片 Fast Path acceptance；
- disconnect recovery；
- 15 分钟 deadline；
- zero Preview / Publish commands；
- packaged CLI parity；
- 完整 `pnpm check`。

## 10. 真实验收

离线测试全部通过后，生成新的 digest-bound Audit 与一次 Confirmation，并在 `@Glen56121` 的草稿 `2093554993261654016` 上执行：

- 1 张封面；
- 3 张正文图片；
- 3 个 Alt；
- 终止于 `draft_reconciled`；
- 总预算 15 分钟；
- 不打开 Preview、不点击 Publish。

成功标准不是“命令已执行”，而是 fresh Observation 和 Harness checkpoint 同时证明：`cover 1/1`、`inline 3/3`、锚点为零、媒体顺序正确、Alt 全部验证、autosave saved。

## 11. 文件范围

### Active scope

- `skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs`
- `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`
- `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`
- `skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs`
- `harnesses/research-publishing/adapters/x/article-browser/article-browser-host-observation.ts`
- 对应 focused tests、fixture、Skill reference、manifest 和 parity 工具
- `.llm-wiki/bugs/2026-08-29-x-article-browser-host-executor-gap.md`

### Read-only scope

- V3.2/V3.3/V3.4 contract、state machine、deadline 与尝试预算；
- 已存在的 Article Package 和草稿证据。

### Excluded scope

- Article 内容和图片字节；
- Approval/Confirmation schema；
- Preview、Publish、public verification；
- Chrome 账号、cookie、扩展安装或系统设置；
- Subagent 工作模式。

## 12. 完成条件

本版本只有在以下条件全部满足时才可声明完成：

1. focused RED/GREEN 测试留有证据；
2. `pnpm check` fresh pass；
3. packaged CLI parity pass；
4. 主实现没有对话专用绝对路径或临时脚本依赖；
5. 真实 Draft-only smoke 在 15 分钟内达到 `draft_reconciled`，或明确记录为外部 Chrome 传输阻断；
6. 无 Preview/Publish 命令；
7. Bug Brief 记录最终根因、修复、验证和剩余外部风险。
