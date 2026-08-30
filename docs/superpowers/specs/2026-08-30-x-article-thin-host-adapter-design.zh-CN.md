# X Article Thin Host Adapter 设计规格

- 状态：待实施
- 日期：2026-08-30
- 范围：X Article Draft-only 封面与正文图片上传
- 决策：保留薄 Host Adapter，移除 `input.files` 素材绑定硬门槛

## 1. 背景

V3.5 Complete Host Bridge 将文件选择器内部状态纳入了成功判定：`setFiles` 后必须从页面中的 `input.files` 回读到恰好一个、大小和 MIME 均匹配的文件，才继续观察 X Article 编辑器。

这条约束不稳定。X 的前端可以在接收文件后立即清空或替换 file input；因此 `input.files` 是页面实现细节，不是可靠的发布契约。把它作为硬门槛，会在真实图片尚未被页面结果验证前提前返回 `file_transfer_missing`，增加失败面和调试成本。

## 2. 目标

1. 让上传成功与否由 X Article 编辑器的真实结果决定，而不是由临时 DOM 绑定状态决定。
2. 保留必要安全边界：一次确认、获批素材、digest 校验、Draft-only、有限尝试和共享截止时间。
3. 同时支持封面与 0–10 张正文图片，不为图片数量增加新分支。
4. 保留 Windows 长路径兼容：仅在必要时使用经过双重校验的短路径临时副本。
5. 让失败原因可解释，但不再为了诊断信号阻断正常流程。

## 3. 非目标

- 不修改 X Article 的标题、正文或图片内容。
- 不打开 Preview，不进入 Publish Review，不发布文章。
- 不改变 Audit、确认摘要、Command、Observation 或尝试预算的对外契约。
- 不引入新的重试循环、Subagent 或浏览器配置流程。
- 不以 X 内部 file input 的生命周期作为长期兼容承诺。

## 4. 不变量

- Host 只执行已被 Harness claim 的当前 Command。
- 素材绝对路径必须对应 Command 中获批的 digest 和 MIME。
- 每个 Command 最多进行一次 Host 文件交付；重试只由现有 Harness 策略决定。
- Host Bridge 必须在调度前拒绝 Preview 和 Publish 类命令。
- 成功必须有页面级 Observation 证据；`setFiles` 返回成功本身不等于上传成功。
- 临时传输副本必须与源素材字节完全一致，并在该 Host 事务结束后删除。

## 5. 架构决策

Host Bridge 降级为薄适配层，只承担三项职责：

1. 校验并准备获批素材；长路径需要时转换为短路径、同字节的事务临时副本。
2. 将一个 Draft-only Command 路由到封面或正文图片事务。
3. 在事务结束后清理临时副本，并返回由页面结果产生的 Outcome。

文件选择帮助器只负责打开单文件 chooser 并调用 `setFiles`。它不再回读或要求 `input.files` 保持绑定，也不再依据绑定为空返回失败。

## 6. 封面流程

1. 校验 claim、Command、源文件 digest 和 MIME。
2. 如果源路径超过 240 字符，创建短路径临时副本并再次校验 digest、字节长度和 MIME。
3. 定位唯一可见、可用的 `Add photos or video` 按钮和对应 cover 区域。
4. 打开单文件 chooser，并交付一次获批文件。
5. 等待有界、稳定的 Editor Observation。
6. 仅当页面存在唯一目标 cover、状态为 `uploaded` 且 autosave 为 `saved` 时返回成功。
7. 无论成功、失败或异常，都清理临时副本。

## 7. 正文图片流程

1. 保留现有锚点、上下文 digest、ordinal 和素材校验。
2. 在唯一目标锚点处打开 Media chooser，并交付一次获批文件。
3. 通过页面 Observation 确认目标 ordinal 出现唯一、属于本次执行的 inline visual。
4. 图片上传后删除原锚点，填写获批 Alt，并回读最终 Observation。
5. 仅当图片状态为 `uploaded`、Alt 完全匹配、锚点已消失且 autosave 为 `saved` 时返回成功。

正文图片流程同样不读取 `input.files` 作为成功条件。

## 8. 错误与状态分类

- chooser 未打开、控件不唯一或在文件交付前明确失败：返回无副作用的传输/控件失败。
- `setFiles` 返回后页面仍在 `processing` 或 `saving`：返回 `x_media_still_processing`。
- 页面已稳定保存但没有目标图片：返回 `x_media_effect_absent`。
- 文件交付可能发生，但无法取得可靠 Observation：返回 `observation_unavailable_after_selection`，不得假定成功或本地重试。
- 页面显示目标图片并满足最终校验：返回 `cover_uploaded` 或 `inline_image_uploaded`。

`input.files` 可以在临时诊断中观察，但不得参与上述状态机，也不得延迟正常流程。

## 9. 测试设计

必须先新增失败测试，再修改生产代码：

1. `input.files` 为空，但页面 Observation 显示封面已上传并保存，结果必须成功。
2. `input.files` 为空，但页面稳定后无封面，结果必须为 `x_media_effect_absent`。
3. 正文图片在页面出现、Alt 回读正确且锚点消失，结果必须成功，不依赖 input 绑定。
4. chooser 无法打开时不得调用页面结果成功分支。
5. 304 字符的真实获批素材必须转换为短路径同字节副本，事务结束后副本不存在。
6. Bridge 仍必须在 dispatch 前拒绝 Preview 和 Publish。
7. 现有 0/1/3/10 图片与断线恢复 acceptance 必须保持通过。

## 10. 验收标准

- 聚焦 Cover、Inline、Host Common、Host Bridge 测试全部通过。
- 全量 lint、typecheck、test 与 acceptance 通过。
- 新的 digest-bound Draft-only live smoke 能将封面从 0/1 变为 1/1，并产生保存完成的页面证据。
- 后续同一执行可依次完成三张正文图及 Alt 校验。
- 整个过程中 Preview/Publish 命令数为零，重复媒体写入数为零。
- Live smoke 在共享 15 分钟截止时间内完成或终止，不在 Host 内自行循环。

## 11. 迁移与回滚

这是一项 Host 内部行为调整，不修改外部协议或现有发布计划。旧的 file-input 绑定检查从主流程移除；若 live smoke 未改善，可单独回滚该行为变更，而不回滚 Audit、素材校验、页面 Observation 或短路径兼容层。
