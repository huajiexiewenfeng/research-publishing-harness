# X Article Existing Draft Media Completion V3.3 设计规格

- 状态：已确认设计
- 日期：2026-08-27
- 基线：X Article Fast Materialization & Recovery V3.2
- 首次目标：为一个正文已经完成的既有 X Article Draft 补齐 1 张封面和 3 张正文图片

## 1. 问题

V3.2 已经能够把完整文章正文一次性导入 X Article Editor，并验证标题、结构、格式、链接和图片锚点。但真实浏览器执行暴露了一个后续缺口：正文导入成功后，如果对应 execution 已经进入失败终态，新的 execution 不能继续使用这个已有 Draft，只能创建新 Draft 或重新导入正文。

当前真实状态是：

- 已有 Draft 的标题和正文正确；
- 正文内保留 3 个已批准的图片锚点；
- 封面和正文图片尚未上传；
- 旧 execution 必须保持不可变失败证据；
- 新 execution 需要从图片阶段继续，而不是重写文章。

因此 V3.3 不重新设计文章写入，也不扩大为任意 Draft 恢复系统。它只补齐一个边界明确的能力：

> 在不创建新 Draft、不重新导入正文、不修改未知人工内容的前提下，为已验证的完整 X Article Draft 补齐已锁定的封面和正文图片。

## 2. North Star

> Codex 可以安全地接续一个正文已完成的 X Article Draft，自动补齐图片并留下可恢复、可审计的 Draft；Human 不需要重新填写文章，且任何不确定状态都不会导致正文覆盖、图片重复或意外发布。

## 3. 目标

V3.3 必须实现：

1. 只读观察并验证一个指定的既有 X Article Draft；
2. 确认账号、Draft ID、标题、正文结构、锚点和零图片状态与锁定计划一致；
3. 在新的 execution 中绑定该 Draft，不恢复或修改旧 execution；
4. 上传并验证一张锁定封面；
5. 按锚点顺序逐张插入锁定的正文图片；
6. 设置并验证每张正文图片的 Alt；
7. 删除已完成图片对应的临时锚点；
8. 每张图片完成后写入 checkpoint，并支持浏览器断开后的观察式恢复；
9. 完成全文与媒体 Reconcile；
10. 停止在 `draft_reconciled`，不进入公开发布。

## 4. 非目标

V3.3 不包含：

- 创建新的 X Article Draft；
- 重新导入、重排或覆盖正文；
- 恢复旧的 `materialization_blocked` 或其他失败 execution；
- 接管正文不完整、锚点缺失或已经存在部分未知图片的 Draft；
- 自动修复人工修改；
- 自动生成、改写或选择文章内容；
- 修改 V3.2 的 Preview、最终确认或 `publish_once` 语义；
- 自动打开 Preview 或公开发布；
- 为测试删除或清理真实 Draft。

## 5. 设计原则

### 5.1 正文是只读前置条件

V3.3 把标题和正文视为已经完成的输入。任何正文写入命令都不属于本流程。运行期间如果检测到正文漂移，流程必须停止。

### 5.2 接管只是内部绑定

`adopt_existing_draft` 不是面向用户的独立发布模式，而是图片补全流程的内部前置步骤。它只建立新的 execution、目标 Draft 和已验证编辑器状态之间的审计绑定。

### 5.3 页面实际状态优先

Checkpoint 是恢复线索，不是重复执行依据。恢复时必须先观察 X Editor 的实际状态，再决定跳过、继续或阻塞，绝不能盲目重放上传命令。

### 5.4 每张图片是独立可恢复事务

一张图片完成后立即形成稳定 checkpoint。后续图片失败或浏览器断开时，已经完成的图片不重新上传。

### 5.5 零 Publish

V3.3 的所有执行路径都必须保持 Publish commands 为 0。图片补全成功只意味着 Draft 可继续核对，不意味着获得公开发布授权。

## 6. 输入与锁定计划

V3.3 复用 V3.2 的 X Article Materialization Plan，并增加既有 Draft 绑定信息。计划至少锁定：

```json
{
  "draft_binding": {
    "mode": "adopt_existing",
    "draft_id": "2092851979932647424",
    "expected_account": "@Glen56121",
    "expected_editor_revision": "sha256:<normalized-editor-state>",
    "expected_title_digest": "sha256:<title>",
    "expected_document_digest": "sha256:<normalized-article-document>",
    "expected_anchor_manifest_digest": "sha256:<ordered-anchor-manifest>",
    "expected_cover_count": 0,
    "expected_inline_media_count": 0
  },
  "media_completion": {
    "cover_asset_digest": "sha256:<cover-file>",
    "inline_assets": [
      {
        "anchor_id": "<stable-anchor-id>",
        "asset_digest": "sha256:<image-file>",
        "alt_digest": "sha256:<approved-alt>"
      }
    ]
  }
}
```

`expected_editor_revision` 是规范化编辑器状态摘要，不包含自动保存时间、易变 DOM 属性或页面加载噪声。只要标题、正文结构、锚点和媒体状态未发生变化，该摘要必须稳定。

“正文完全匹配”指规范化 Article AST 完全匹配，而不是 X 内部 HTML 字节相同。比较范围包括：

- 标题；
- Heading 层级；
- 段落顺序和文本；
- Quote、List、Bold、Italic；
- 链接文字与 URL；
- 锚点内容、顺序和唯一性；
- 封面与正文媒体数量。

## 7. 组件边界

### 7.1 Existing Draft Inspector

职责：只读打开指定 Draft，将账号、Draft ID、标题、规范化正文、锚点、媒体和保存状态转换为稳定 Observation。

它不领取任何页面写入命令。

### 7.2 Existing Draft Verifier

职责：把 Observation 与锁定计划进行精确比较，产生：

- `ADOPTABLE`：所有前置条件完全满足；
- `STALE`：计划中的 editor revision 已过期；
- `DRIFT_DETECTED`：标题、正文或锚点发生变化；
- `UNSUPPORTED_MEDIA_STATE`：已经存在封面或正文图片；
- `UNVERIFIABLE`：页面状态不足以安全判断。

只有 `ADOPTABLE` 可以建立新的 Draft 绑定。

### 7.3 Draft Binder

职责：创建新 execution 的 checkpoint，并记录：

```json
{
  "draft_origin": "adopted_existing",
  "body_status": "adopted_verified",
  "source_execution_id": null
}
```

Binder 不修改旧 execution，也不伪造“正文由本次 execution 导入”的历史。

### 7.4 Media Completion Driver

职责：复用 V3.2 已有封面和正文图片事务，按锁定顺序完成媒体补全。它不得发出任何正文导入、新 Draft 创建或 Publish 命令。

### 7.5 Draft Reconciler

职责：在图片完成后验证最终 Draft：标题与正文保持一致，媒体数量、顺序、位置与 Alt 正确，所有临时锚点已经删除。

## 8. 状态机

V3.3 使用新的 execution，不改变旧 execution 终态：

```text
prepared
  → adoption_observing
  → adoption_verified
  → draft_bound
  → body_verified
  → cover_materializing
  → media_materializing
  → draft_reconciling
  → draft_reconciled
```

阻塞状态：

```text
adoption_rejected
media_completion_blocked
```

`adoption_rejected` 发生在任何页面变更之前。`media_completion_blocked` 只在图片事务已经开始但页面状态无法安全解释时使用。二者都不会自动重试或转为创建新 Draft。

## 9. 数据流

```text
只读检查现有 Draft
        ↓
生成 Draft Snapshot 与 editor revision
        ↓
生成并锁定 media-completion Plan
        ↓
重新观察同一 Draft
        ↓
验证账号、Draft、revision、正文、锚点、零图片
        ↓
绑定新的 execution 与 checkpoint
        ↓
上传并验证封面
        ↓
按锚点逐张上传正文图片
        ↓
设置 Alt → 验证位置 → 删除锚点 → 自动保存 → checkpoint
        ↓
最终 Reconcile
        ↓
draft_reconciled（Publish commands = 0）
```

锁定计划后必须再次观察 Draft。首次只读 Snapshot 不能替代执行前的并发变化检查。

## 10. 封面事务

封面事务执行：

1. 验证当前封面仍为空；
2. 验证本地文件路径、文件摘要、格式和尺寸；
3. 上传锁定封面；
4. 等待 X 媒体处理与自动保存；
5. 验证页面存在唯一封面；
6. 记录媒体节点证据和新的 editor revision；
7. 写入 checkpoint。

首次真实目标封面采用 5:2 比例，建议尺寸为 1600×640，并保证标题类关键信息位于 X 裁切安全区。封面 Alt 继续沿用 V3.2 的真实能力边界：若 X Article cover UI 不暴露可验证 Alt 控件，则诚实记录为 unavailable，不伪造已设置结果。

## 11. 正文图片事务

每张正文图片独立执行：

1. 定位唯一 `anchor_id`；
2. 验证该锚点仍存在且目标图片尚不存在；
3. 将编辑位置绑定到该锚点；
4. 上传锁定图片；
5. 等待 X 媒体处理完成；
6. 设置并验证锁定 Alt；
7. 验证图片位于批准的前后文之间；
8. 删除对应锚点；
9. 等待自动保存；
10. 写入图片完成 checkpoint。

图片按 Anchor Manifest 顺序处理。实现不得依赖固定三张图片；运行数量由锁定 manifest 决定。首次真实 smoke 使用三张正文图片。

## 12. 中断恢复

恢复时针对每张图片分类：

| 页面实际状态 | 处理 |
|---|---|
| 锚点存在，目标图片不存在 | 允许继续上传 |
| 锚点和目标图片同时存在 | 验证图片与 Alt，仅完成锚点清理 |
| 锚点消失，目标位置存在匹配图片 | 标记为完成，不重复上传 |
| 锚点消失，图片身份不明确 | 阻塞，不上传 |
| 锚点存在，但出现未知图片 | 阻塞，不覆盖 |
| 标题或正文发生漂移 | 阻塞，不修改正文 |

图片身份使用组合证据：

- 本地 asset digest；
- 上传命令 receipt；
- X media node 或 URL；
- Alt；
- 锚点对应的前后文；
- 必要时使用视觉相似度，因为 X 可能重新编码图片。

## 13. 失败处理

### 13.1 接管前失败

账号、Draft ID、revision、正文、锚点、图片数量或素材摘要任一不匹配时，生成 `adoption_rejected` 证据并停止。页面变更数必须为 0。

### 13.2 上传效果未知

命令超时或浏览器断开后，必须先观察页面。只有观察明确证明上传完全没有生效，才允许在预算内重试一次。状态不明确时进入 `media_completion_blocked`。

### 13.3 人工修改

执行期间出现未知人工修改时，不自动清空、覆盖或重新导入正文。生成差异报告并停止，由 Human 决定是否重新生成锁定计划。

### 13.4 Publish 隔离

V3.3 命令 broker 不得签发 Preview 或 Publish 命令。即使 Draft Reconcile 成功，也只返回 `draft_reconciled`。

## 14. 性能与进度预算

沿用 V3.2 的分钟级目标。对首次 1 张封面和 3 张正文图片：

- 自动化目标：6 分钟以内；
- 每个阶段超过 20 秒必须写入可解释进度；
- 普通 UI 操作预算：15 秒；
- 单张图片上传与媒体处理预算：60 秒；
- 自动保存预算：30 秒；
- 不使用固定长时间 sleep；
- 不以连续完整 DOM Snapshot 作为正常等待机制。

超出目标不是自动重试或放宽校验的理由。执行必须记录耗时最大的阶段及其等待原因。

## 15. 安全与审计

审计链至少绑定：

- 新 execution ID；
- 旧失败 execution 不可变声明；
- 目标账号；
- Draft ID；
- Plan digest；
- 初始和最终 editor revision；
- 标题与正文 digest；
- Anchor Manifest digest；
- 封面与全部正文图片 digest；
- 每张图片的上传 receipt、Alt 和上下文证据；
- checkpoint revisions；
- Browser commands 与 observations 数量；
- Publish commands 固定为 0。

任何路径都不得把旧 execution 的失败证据改写为成功。

## 16. 测试设计

### 16.1 Existing Draft Verifier 单元测试

覆盖：

- 完全匹配且零图片的正例；
- 账号、Draft ID 和 revision 分别不匹配；
- 标题或正文改变；
- Heading、List、Quote、链接或强调格式改变；
- 锚点缺失、重复、乱序或出现额外锚点；
- 已存在封面；
- 已存在任意正文图片；
- Observation 无法规范化。

### 16.2 Binder 与状态机测试

验证：

- 只有 `ADOPTABLE` 可以建立 checkpoint；
- 新 checkpoint 使用 `adopted_existing` 和 `adopted_verified`；
- 不修改旧 execution；
- 不签发正文导入、新 Draft 创建、Preview 或 Publish 命令；
- 终态重放保持幂等。

### 16.3 Media Reconciler 测试

在以下边界模拟中断：

1. 封面上传前；
2. 封面上传完成但 checkpoint 前；
3. 正文图片上传开始后；
4. 图片出现但 Alt 尚未完成；
5. Alt 完成但锚点尚未删除；
6. 锚点删除但 checkpoint 尚未写入；
7. 第 N 张图片完成后；
8. 最终 Reconcile 前。

每种情况都必须证明正文不重写、图片不重复、未知状态不盲目重试。

### 16.4 Browser Host 契约测试

验证 Host：

- 所有操作绑定唯一 Chrome tab 和精确 Draft ID；
- 上传前验证文件选择器和锁定素材；
- 使用条件等待和紧凑 Observation；
- 每张图片后验证自动保存；
- inline Alt 强验证；
- cover Alt 诚实报告 capability；
- 页面结构不匹配时 fail closed；
- Publish commands 始终为 0。

### 16.5 真实 Draft-only smoke

实现完成后只执行一次新的、受控的真实 smoke：

1. 使用正文已经完成、三个锚点存在、零图片的既有 Draft；
2. 不创建新 Draft；
3. 不重新导入正文；
4. 上传一张封面和三张正文图片；
5. 验证 Alt、位置、顺序、锚点清理和自动保存；
6. 停止在 `draft_reconciled`；
7. Publish commands 必须为 0；
8. 保留 Draft 给 Human 检查。

若 smoke 失败，只固化一次失败证据，不在同一运行中连续创建新 execution 或重复上传。

## 17. 验收标准

V3.3 完成必须同时满足：

1. 现有 Draft 被新 execution 安全绑定；
2. 没有创建新 Draft；
3. 正文导入命令为 0；
4. 标题和正文内容保持不变；
5. 封面数量为 1，且与锁定资产一致；
6. 正文图片数量、顺序、位置和 Alt 与 manifest 一致；
7. 所有临时锚点消失；
8. 中断恢复不产生重复图片；
9. 未知页面状态会阻塞而不是覆盖；
10. 当前 1+3 图片目标在正常 X 响应下 6 分钟以内完成；
11. 超过 20 秒的阶段具有可解释进度；
12. Preview 和 Publish 命令均为 0；
13. 旧失败 execution 保持不可变；
14. 新 execution 形成完整 checkpoint、性能与审计证据。

## 18. 实施边界

V3.3 应作为 V3.2 之上的小型增量实现：

- 新增既有 Draft 验证与绑定；
- 复用 V3.2 已有规范化 Observation、媒体事务、checkpoint 和 Reconcile；
- 不复制一套新的图片上传框架；
- 不改写正文导入协议；
- 不扩大为通用任意状态接管。

实现计划必须优先以失败测试证明：当前系统无法为正文完成的既有 Draft 签发第一条媒体命令；随后以最小改动打通验证、绑定、媒体补全和 Draft-only smoke。
