# X Article Fast Path V3.4 设计规格

**状态：** 已确认  
**日期：** 2026-08-28  
**目标版本：** V3.4

## 1. 背景

V3.2 和 V3.3 已经建立 X Article 的确定性导入、图片锚点、Alt、Browser Command、Observation、checkpoint 与现有 Draft 恢复边界。这些能力提高了安全性和可审计性，但没有显著改善发布者的直接体验：Human 仍需要频繁说“继续”，Browser Host 仍逐步手工编排，仓库内的新协议也可能尚未同步到全局安装的 Skill。

因此，V3.4 不再以增加 Command、Contract 或异常分类为目标。它把现有原子能力组合成一条可度量的端到端 Fast Path。

## 2. North Star

从 Human 对最终 Audit 进行一次确认开始，到 Harness 到达 `draft_reconciled`：

- Human 只确认一次；
- 正常情况下 Human 手动操作为零；
- 自动完成正文导入或现有 Draft 接管、封面、最多 10 张正文图片、全部 Alt 与最终对账；
- 正常浏览器状态下总耗时不超过 10 分钟；
- 不创建重复 Draft，不重复上传图片，不遗留视觉锚点；
- 不打开 Preview，不点击 Publish。

## 3. 设计原则

1. **优化端到端结果，而不是协议数量。** V3.4 的效果由确认次数、Human 操作次数、总耗时和最终 Draft 正确性衡量。
2. **对外一次执行，对内保持原子 checkpoint。** Human 不感知逐图命令，但每张图片完成后仍留下可恢复证据。
3. **先清理内容，再打开浏览器。** 内部编辑信息、图片清单和 Alt 问题必须在 Chrome 操作前解决。
4. **不确定时先观察，不盲目重写。** 任何已经可能产生写入效果的操作都不能直接重传。
5. **保持范围小。** V3.4 只负责到 `draft_reconciled`；Preview 和 Publish 仍属于后续独立流程。

## 4. 架构

### 4.1 Publication Preflight

Preflight 接收最终 Article Package，并在浏览器执行前生成一个锁定的 Sanitized Package。

它负责：

- 区分可发布正文与内部编辑元数据；
- 自动移除已知内部状态内容，例如 `Draft v0.1`、`Evidence review date` 和同类编辑说明；
- 将所有自动删除内容作为 Diff 放进唯一一次 Audit；
- 检查标题、正文、封面、正文图片、图片顺序、锚点、文件摘要和 Alt；
- 对未知或无法安全判断的可疑内容停止处理，而不是静默删除；
- 检查仓库协议版本与实际安装 Skill 版本一致。

Preflight 不操作 Chrome，不创建 Draft。

### 4.2 Fast Path Orchestrator

Fast Path Orchestrator 在 Human 确认一次锁定 Audit 后自动驱动完整流程。

它对外表现为一个执行，对内依次调用现有原子语义步骤：

1. 解析目标 Draft；
2. 创建新 Draft 或接管指定 Draft；
3. 导入清理后的正文（仅新 Draft 或正文尚未导入时）；
4. 上传封面；
5. 按 Article Package 顺序处理正文图片与 Alt；
6. 执行一次最终 Draft 对账；
7. 到达 `draft_reconciled` 后停止。

Orchestrator 不在每张图片后请求 Human 继续，也不将多张图片合并为一个不可恢复的大型写操作。

### 4.3 Atomic Browser Worker

Browser Worker 继续遵守 `next → verify → claim → execute → observe → report` 的原子边界，但由 Orchestrator 自动循环。

Browser Worker 的实现必须把封面与正文媒体控件限定在各自页面区域。正文图片只能从当前正文插入位置进入 `Insert → Media`，不能通过页面全局媒体按钮推断目标。控件定位细节属于 Adapter 实现和测试，不扩展为用户可见协议。

### 4.4 Checkpoint

每个成功步骤至少记录：

- Draft ID；
- 当前完成阶段；
- 已完成的封面或正文 `asset_id`；
- 正文图片完成序号；
- Alt 回读结果；
- 最后可信页面 revision。

Checkpoint 用于继续执行，不用于绕过页面观察或授权重传。

### 4.5 Final Reconciler

Final Reconciler 在媒体循环完成后只执行一次完整检查：

- 标题与 Sanitized Package 一致；
- 正文不存在内部编辑状态句；
- 正文没有残留视觉锚点；
- 封面存在且唯一；
- 正文图片数量、顺序和位置与 Package 一致；
- 每张正文图片的 Alt 与锁定值一致；
- 正文没有未知漂移；
- 自动保存状态为 `saved`。

全部通过后进入 `draft_reconciled`。

## 5. Draft Resolution

V3.4 向用户隐藏 V3.2“新 Draft”和 V3.3“现有 Draft 补全”的内部差异。

- 没有目标 Draft 时，只创建一次新 Draft，并导入 Sanitized Package。
- 已提供明确 Draft ID 时，先核对账号、Draft ID、标题、正文与 checkpoint，再从未完成阶段继续。
- 页面状态无法唯一判断时停止，不创建第二个 Draft。

Draft Resolution 是内部状态选择，不增加新的 Human 决策。

## 6. 最小恢复机制

V3.4 不新增复杂错误分类或重试矩阵，只保留三条规则：

1. Preflight 未通过时不启动浏览器执行。
2. 每完成一张图片和 Alt 后保存 checkpoint。
3. 遇到不确定写入效果时，只读恢复一次，最多等待 2 分钟；恢复后先观察实际页面，再从下一未完成步骤继续。无法确认时暂停并返回精确 checkpoint，绝不直接重传。

恢复机制不创建 Subagent，不重新创建执行，也不通过重置计时延长任务。

## 7. 时间预算

正常浏览器状态下，从 Human 确认开始计算：

- Draft 创建或接管、正文导入：最多 2 分钟；
- 封面和最多 10 张正文图片：合计最多 6 分钟；
- Alt 稳定、自动保存和最终对账：最多 2 分钟；
- 总计：最多 10 分钟。

断线恢复可额外使用最多 2 分钟。恢复失败后暂停，不继续隐藏运行。

## 8. Human 体验

### 8.1 确认前

唯一一次 Audit 展示：

- 目标账号与 Draft 处理方式；
- 标题；
- 自动删除内容 Diff；
- 封面；
- 正文图片数量和顺序；
- Alt 摘要；
- 锁定 Plan Digest。

### 8.2 执行中

只展示阶段进度，不请求逐步确认：

```text
Draft ready → Cover 1/1 → Inline images 2/3 → Final check
```

### 8.3 完成

返回：

- Draft 链接；
- `draft_reconciled` 状态；
- 实际耗时；
- 封面和正文图片完成数量；
- Alt 核验结果；
- checkpoint 与最终验证记录路径。

## 9. 部署一致性

Fast Path 启动前必须验证：

- 仓库 Harness 支持目标 V3.4 协议；
- 仓库内 `x-publishing-copilot` 与全局实际安装版本兼容；
- Browser Host capabilities 满足正文导入、媒体、Alt、checkpoint 和最终对账要求。

版本不一致时直接阻止 Fast Path，并给出同步动作。不得在旧 Skill 上静默降级为逐步手工流程。

## 10. 验收标准

必须提供 0、1、3、10 张正文图片四条端到端场景，并记录真实执行耗时。

每条场景都必须证明：

- Human 确认一次；
- Human 手动浏览器操作为零；
- 正常执行在 10 分钟内完成；
- 最终状态为 `draft_reconciled`；
- 无内部状态句、无残留锚点；
- 图片数量、顺序和 Alt 正确；
- Preview 和 Publish 操作次数为零。

另外提供一条断线恢复场景，证明从 checkpoint 恢复后不存在重复 Draft、重复图片或重复写入。

## 11. 非目标

V3.4 不负责：

- X Article Preview；
- X Article Publish；
- 发布后的 Single 或 Thread 宣发；
- 自动生成文章内容或图片；
- 引入新的多代理执行模式；
- 为每一种 Browser 故障建立新的公共错误协议。

## 12. 与 V3.3 的关系

V3.3 的现有 Draft 绑定、媒体原子命令、Alt 验证、checkpoint 和不确定效果保护继续有效。V3.4 的核心变化是：

- 在浏览器前增加 Publication Preflight；
- 用一个 Fast Path Orchestrator 自动消费原子命令；
- 统一新 Draft 与现有 Draft 的用户入口；
- 用端到端耗时和 Human 操作数代替功能数量作为主要成功指标。
