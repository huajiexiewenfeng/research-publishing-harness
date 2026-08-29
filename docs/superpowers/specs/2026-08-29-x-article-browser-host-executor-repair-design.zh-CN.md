# X Article Browser Host 可执行上传修复规格

**状态：** 待书面确认

**日期：** 2026-08-29

**Flow ID：** `x-article-browser-host-executor-gap-2026-08-29`

## 1. 问题

V3.4 已有 Audit、Command、Claim、Observation、Checkpoint 与 Recovery，但媒体写入仍由 Codex 在每次对话中临时拼装 Chrome 调用。结果是控制层能够描述“上传封面”，却没有一个随 Skill 发布、可重复调用和离线验证的上传事务。

本修复不再增加发布协议。它只补齐缺失的 Host 执行层，并让已有时间和重试预算成为真正的停止条件。

## 2. 三种方案

### A. 继续强化 Skill 文字步骤

只补充更多 `waitForEvent`、`setFiles` 和错误处理说明。

- 优点：改动最小。
- 缺点：仍依赖每个 Agent 临时重写调用；本次回归已经证明文字约束不足。
- 结论：不采用。

### B. Codex-hosted 可执行 Helper + Harness 硬护栏（推荐）

在 `x-publishing-copilot` 中发布一个可导入的 JavaScript Helper。它不自行寻找 Chrome、账号或登录态，而是接收 Codex 已选择的 Chrome tab/session port、已 claim 的命令和锁定文件路径，完成一个封面事务。Harness 继续拥有命令、授权、checkpoint、重试和截止时间。

- 优点：复用现有 Chrome 登录态；消除临时 API 拼装；可用 fake port 和本地上传页测试；保持公开仓库可分发。
- 缺点：仍需要 Codex 宿主提供 Chrome tab，不能让 npm CLI 独立控制任意浏览器。
- 结论：采用。

### C. 独立 Playwright/CDP 浏览器进程

由仓库 CLI 启动或连接浏览器并直接执行上传。

- 优点：最接近传统全自动程序。
- 缺点：当前项目没有运行时依赖；复用用户现有 Chrome 登录态需要远程调试或独立 profile；扩大安全、部署和账号风险。
- 结论：当前版本不采用。

## 3. 修复边界

第一刀只实现 `upload_article_cover`，因为它是当前阻塞点，也能验证 Host 架构是否成立。

包含：

- 一个随 Skill 发布的 executable cover helper；
- 一个不接触 X 的本地文件上传传输测试；
- 封面操作结果分类；
- 每个媒体资产最多首次加一次授权重试；
- 600/900 秒 Audit budget 的硬终止；
- focused tests、Skill 校验与 packaged parity。

不包含：

- 正文图片 Helper；
- Preview、Publish 或 Draft 删除；
- 新 Command、Approval、Digest 或错误分类；
- 自动读取浏览器 Cookie、Profile 或凭据；
- standalone Chrome/Playwright 产品化。

## 4. 组件设计

### 4.1 `x-article-cover-host.mjs`

Helper 暴露一个窄入口，概念接口如下：

```js
runCoverUpload({ tab, command, claim, absoluteAssetPath, timeoutMs })
```

入口必须：

1. 校验命令为已 claim 的 `upload_article_cover`，身份和 payload 未改变；
2. 拒绝相对路径、缺失文件和不匹配的摘要/MIME；
3. 只定位 Article 顶部唯一的可见封面 `Choose File` 控件；
4. 在点击前建立 `waitForEvent('filechooser', { timeoutMs })`；
5. 只使用 `chooser.setFiles([absoluteAssetPath])`；
6. 等待有界的上传/自动保存结果；
7. 返回结构化 Host outcome，不写 Harness Workspace，也不自行重试。

Helper 不打开 Draft、不选择账号、不 claim 命令、不生成 Observation，也不点击 Preview/Publish。这些仍由现有 Host loop 和 Harness 负责。

### 4.2 Host outcome

结果保持在 Host 内部，不扩展现有 adapter report schema：

```text
effect = complete | none | unknown
status = success | transient_failure | uncertain | rejected
retry_authorized = false
```

- chooser 在文件选择前没有出现：`none + transient_failure`；
- `setFiles` 后页面出现唯一封面并稳定保存：`complete + success`；
- 文件选择后无法证明页面最终状态：`unknown + uncertain`；
- 身份、文件或控件不唯一：`none + rejected`。

Helper 永远不做本地重试。只有 Harness 后续发出的新命令可以授权下一次尝试。

### 4.3 Harness attempt guard

Checkpoint/进度投影必须能回答某一 `asset_id` 已经发出过多少次媒体写命令。

- 首次命令：允许；
- 第一次报告为 `none/transient_failure` 且后续真实观察仍无媒体：最多允许一个新命令；
- 已有两次写命令、任何 `unknown` 效果、或已经存在媒体：不再发出写命令，进入明确 blocked/failed terminal state；
- `status`、`next`、`recover` 使用同一个计数来源，不能通过重启或新 Agent 重置。

当前报告中的 `retry_count` 不再只是展示字段，必须参与下一命令决策。

### 4.4 Hard deadline

Audit 的 `time_budget_seconds` 从“状态显示值”改成执行授权边界。

在以下入口读取同一 `started_at + time_budget_seconds`：

- `next`：超时后禁止发出新的 write command；
- `status`：投影明确 terminal timeout；
- `recover`：原 deadline 已过时拒绝恢复；
- report：允许记录已经发生的真实结果，但不能借此延长 deadline。

超时不会删除 Draft，也不会打开 Preview/Publish。

## 5. 测试设计

严格采用 RED → GREEN：

1. Host helper 单元测试先证明当前没有可调用入口。
2. Fake tab 测试验证调用顺序必须是“arm chooser → exact cover click → `setFiles([path])`”。
3. chooser timeout、错误控件、摘要不匹配和 effect unknown 分别验证 fail-closed。
4. 本地 HTML upload fixture 验证宿主文件传输，不访问 X、不使用账号状态。
5. Adapter 测试证明同一 cover 最多两条 write command，第三次被终止。
6. 时间边界测试证明 900 秒前可继续、达到/超过 deadline 后不可再发 write command。
7. 现有 V3.2/V3.3/V3.4 focused suite、typecheck、Skill validate 和 manifest parity 全部重新运行。

真实 X Draft smoke 不是本实施阶段的自动测试。离线验证通过后，必须另行获得一次 Draft-only 写入批准。

## 6. 验收标准

- Agent 不再手写 cover `filechooser/setFiles` 调用；只调用 packaged Helper。
- Helper 在本地 fixture 中能完成文件选择并验证所选文件。
- 同一封面最多首次加一次 Harness 授权重试。
- Fast Path 达到 Audit deadline 后进入终止状态，不再停留在可继续写入的 `materialization_reconciling`。
- 对 preserved Draft 不产生任何 Preview、Publish、删除或额外图片写入。
- Cover-only 离线 slice 通过后，才设计正文图片 executable helper。

## 7. 成功指标

本阶段不是以“协议文件更多”为成功，而以：

- 本地 cover transaction 小于 30 秒；
- live smoke 的封面步骤目标小于 90 秒；
- 失败时 1 次报告内给出明确结果；
- 任何执行最多 2 次同资产写入命令；
- 15 分钟后写入授权必然关闭。

## 8. 兼容性

现有 X Article Plan、Approval、Command、Observation 和 Report schema 不变。V3.2/V3.3 的正文与媒体 checkpoint 保持原有数据形状。新增 Helper 属于 Host 实现；attempt/deadline guard 属于已有 Fast Path 安全语义的执行修复。
