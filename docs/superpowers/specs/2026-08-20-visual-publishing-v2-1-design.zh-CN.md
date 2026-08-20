# Visual Publishing V2.1 设计规格

## 文档状态

- 日期：2026-08-20
- 状态：方案已确认，书面规格待用户审阅
- 适用仓库：`research-publishing-harness`
- 设计语言：中文
- 前置基线：`docs/architecture/research-publishing-harness-design.zh-CN.md`
- Browser 基线：`docs/superpowers/specs/2026-08-19-x-browser-adapter-v2-design.zh-CN.md`
- 首版范围：Canonical Markdown 长文内嵌静态图片，并允许 X Single、Reply 或 Thread 第一条复用一张主图

## 1. 摘要

V2 已经建立纯文本 X Browser Adapter：Human 对精确 Publication Plan 做一次确认，Harness 通过受限 Browser Command 完成 Composer 填充、at-most-once Submit、公开验证和不可变 Receipt。V2 明确拒绝图片、视频和 GIF。

V2.1 在不削弱 V2 安全门的前提下增加静态视觉资产。视觉首先是 Canonical Article Package 的解释性内容，而不是为了 X 强行生成 Thread。Article 与 X 仍然是独立输出；当用户显式创建 X Handoff 时，X 可以复用文章中的一张主图。

V2.1 的核心原则是：

> Visual Skill 负责视觉语义与创作；Harness 负责确定性资产管理；Human 的一次最终确认同时绑定文字、图片和发布副作用。

V2.1 不把 Harness 建设成通用媒体平台。Core 只增加一个最小、Digest-bound 的 `VisualAssetRef`，让 Article Manifest、X Attachment、Approval 和 Receipt 能够证明它们引用的是同一份规范化图片资产。

## 2. 背景与问题证据

### 2.1 当前代码基线

当前仓库已经具备以下事实：

- Article Harness 输出 Canonical Markdown Article Package。
- Article 可以显式创建 X Handoff，但不会自动拆成 Thread。
- Publication Plan V2 预留了 `image | video | gif` 媒体描述。
- Browser Adapter 遇到非空媒体时主动返回 `UNSUPPORTED_PUBLICATION_FEATURE`。
- Browser Command 协议当前没有文件上传能力。
- X Browser V2 的 Plan Digest、Approval、Submit Barrier、公开验证和 Receipt 已形成确定性安全边界。

V2.1 必须作为兼容扩展实现，不能直接移除 text-only 拒绝逻辑后让 Browser Executor 任意选择本地文件。

### 2.2 内容策略证据

已确认的发布策略不是“每条内容都配图”，而是：

- 普通研究判断和技术讨论可以纯文字。
- 长文在需要解释结构、边界或证据时使用内嵌图片。
- 每篇内容突出一张主视觉，避免把文章变成密集演示文稿。
- 静态图承担结构，未来动态图承担状态变化。
- X Thread 只是讨论形式，不是承载长文视觉的前置条件。

因此视觉能力必须先进入 Article Package，再作为可选资产进入 X，而不能只实现“给 Thread 上传图片”。

## 3. 目标

V2.1 必须实现：

1. Article Draft 可以声明必需或可选的 Visual Slot。
2. Content Review 通过后，Visual Skill 可以为 Slot 生成候选静态图。
3. Harness 能安全导入图片，生成去除非必要元数据的规范化副本并计算 Digest。
4. Canonical Article Package 自包含 Markdown、图片、Visual Manifest 和可选编辑源。
5. Article Markdown 只使用 Package 内相对图片路径。
6. 图片绑定有效 Claim 引用、Alt Text、文章位置和来源信息。
7. Article Package Digest 覆盖正文、图片、Alt Text、位置和顺序。
8. Article 与 X 通过同一个 `VisualAssetRef` 复用图片。
9. X V2.1 支持 Single、Reply 或 Thread 第一条附一张静态图。
10. X Approval 一次性绑定账号、模式、正文、图片、Alt Text、Post ordinal、Adapter 和 `publish_once`。
11. Browser Host 只能上传锁定 Plan 中、位于 Canonical Package 内且 Digest 匹配的文件。
12. Submit 前回读 Composer 正文、附件数量、位置和 Alt Text。
13. Submit 后延续 V2 at-most-once 和公开只读恢复语义。
14. Receipt 区分源资产、Composer 附件和公开媒体的证据强度。
15. 保持 V2.0 纯文本 Browser Plan、V1 Manual Adapter 和现有 Article 流程兼容。

## 4. 非目标

V2.1 不实现：

- GIF、视频、动态图、Poll 或多图轮播。
- X Articles 的浏览器编辑或发布。
- 自动决定文章一定需要图片。
- 自动从文章中选择“最好的一张图”用于 X。
- 通用数字资产管理系统或跨平台媒体服务。
- 在线图片托管、CDN 上传或外部 URL 作为图片事实源。
- Figma、Mermaid、ImageGen 或其他创作工具的固定耦合。
- 图片质量、美观度或语义正确性的纯确定性判定。
- 发布后自动编辑、删除或替换错误图片。
- LLM Wiki Runtime 接入；该能力作为独立 V2.2 设计。

## 5. 已确认的关键决策

| 主题 | 决策 |
|---|---|
| 长文事实源 | Canonical Markdown Article Package |
| 资产保存 | Package 自包含，Markdown 使用相对路径 |
| 创作责任 | Visual Skill 生成，Harness 校验、锁定和打包 |
| 共享抽象 | 最小 `VisualAssetRef`，不建设独立 Media Harness |
| 首版格式 | PNG、JPEG、静态 WebP |
| 编辑源 | 可选保存 Mermaid、SVG 或其他源文件，但不能直接作为发布图片 |
| 生成时机 | Content Review 通过后生成视觉，Article Finalize 前完成 Visual Review |
| X 媒体数 | 整个 Publication Plan 最多一张图片 |
| Thread 位置 | 只允许 `ordinal: 1` |
| 图片选择 | X Handoff 必须显式指定 `asset_id` |
| Human 确认 | 一次最终确认，同时绑定文字和图片 |
| Browser 权限 | 只允许上传 Plan 中 Digest-bound 的 Package 文件 |
| 公开验证 | 不声称 X 转码后的公开媒体与本地文件字节相同 |
| 记忆接入 | 独立 V2.2，通过 SCP Query/Ingest 实现受控 RSI 闭环 |

## 6. 总体架构

```text
                         Visual Skill
                    Visual Brief → Image
                              │
                              ▼
Research Package → Article Harness
                              │
                    Visual Asset Import
                              │
                              ▼
                    Harness Core
                ┌──────────────────────┐
                │   VisualAssetRef     │
                │ Digest / Alt / Claims│
                └──────────┬───────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
    Canonical Article Package       Optional X Handoff
    article.md                       item 1 attachment
    visual-manifest.json             exact asset digest
    assets/*                         explicit asset_id
                                         │
                                         ▼
                                X Browser Adapter
                           upload → attachment verify
                           → submit once → public verify
                                         │
                                         ▼
                                      Receipt
```

### 6.1 Visual Skill

Visual Skill 负责：

- 根据文章论证判断某个 Slot 应表达什么。
- 选择架构图、概念图、流程图、证据图等表达形式。
- 生成候选图片和可选编辑源。
- 检查图片是否忠实于 Claim、Boundary 和实际完成状态。
- 生成 Visual Review Report，供 Human 选择最终候选。

Visual Skill 不负责：

- 决定物理存储路径。
- 构造 Article Package Digest 或 X Plan Digest。
- 绕过 Harness 直接修改 Finalized Package。
- 直接发起 Browser 上传或 X Submit。

### 6.2 Article Harness

Article Harness 负责：

- 管理 Draft 中的 Visual Slot。
- 在 Content Review 通过后接受候选图片。
- 调用 Core 导入和规范化图片。
- 将 `VisualAssetRef` 绑定到 Slot 和文章位置。
- 生成 Visual Manifest 和相对 Markdown 引用。
- 在必需 Slot 未解析时阻止 Finalize。
- 生成显式、可审计的 X Handoff。

### 6.3 Harness Core

Core 只拥有跨分支必需的确定性能力：

- 文件边界、安全读取和文件签名验证。
- 静态图片解码、元数据清理和规范化输出。
- SHA-256 Digest。
- 原子复制与不可变 Artifact 写入。
- `VisualAssetRef` Schema 校验。
- Package Manifest 与 Digest 组合。

Core 不理解图片的领域含义，也不评价图片质量。

### 6.4 X Harness 与 Browser Adapter

X Harness 负责将显式选择的 `VisualAssetRef` 绑定到 Publication Item。Browser Adapter 负责：

- 检查 Host 是否声明文件上传能力。
- 生成受限 `upload_attachment` 和 `set_attachment_alt_text` Command。
- 观察并验证 Composer 附件。
- 在附件和正文都匹配后进入既有 Submit Barrier。
- 发布后验证公开 Post 与媒体关联。

## 7. 最小共享契约

V2.1 不引入独立 Asset Registry 服务。唯一共享的 Core 契约是：

```ts
interface VisualAssetRef {
  readonly asset_id: string;
  readonly relative_path: string;
  readonly digest: `sha256:${string}`;
  readonly mime_type: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly alt_text: string;
  readonly claim_refs: readonly string[];
}
```

字段语义：

- `asset_id`：一个 Canonical Article Package 内稳定且唯一的逻辑标识。
- `relative_path`：相对于 Package root 的路径；绝对路径永不进入公开契约。
- `digest`：规范化发布副本的字节 SHA-256。
- `mime_type`：由文件签名和成功解码共同确认，不信任扩展名。
- `alt_text`：Article 与 X 复用的可访问性描述。
- `claim_refs`：图片被允许表达的 Frozen Research Claim 集合。

宽高、文件大小、生成工具、规范化版本、编辑源等属于 Manifest 审计字段，不扩大最小共享接口。

## 8. Article Visual Slot 与 Manifest

### 8.1 Visual Slot

Visual Slot 属于 Article Draft，不属于 Core：

```ts
interface VisualSlot {
  readonly slot_id: string;
  readonly placement:
    | { readonly kind: 'cover' }
    | { readonly kind: 'after_section'; readonly section_id: string };
  readonly purpose: 'cover' | 'explanation' | 'architecture' | 'evidence';
  readonly required: boolean;
  readonly brief: string;
  readonly claim_refs: readonly string[];
}
```

Slot 表达文章需要解释什么，不预先绑定文件。`claim_refs` 必须是当前 Frozen Research Content Package 中存在的 Claim。

### 8.2 Visual Manifest

Finalize 时自动生成 `visual-manifest.json`，至少记录：

```ts
interface ArticleVisualManifest {
  readonly schema_version: '1.0';
  readonly article_run_id: string;
  readonly bindings: readonly {
    readonly slot_id: string;
    readonly asset: VisualAssetRef;
    readonly placement_ordinal: number;
    readonly width: number;
    readonly height: number;
    readonly byte_size: number;
    readonly normalization_version: string;
    readonly provenance: {
      readonly method: 'deterministic' | 'generated' | 'manual';
      readonly tool: string | null;
      readonly source_digest: string | null;
    };
    readonly editable_source: {
      readonly relative_path: string;
      readonly digest: `sha256:${string}`;
    } | null;
  }[];
  readonly manifest_digest: `sha256:${string}`;
}
```

Manifest 是 Package Artifact，不是独立服务。

`manifest_digest` 对不包含 `manifest_digest` 字段本身的规范化 Manifest 计算，避免自引用。Article Package Digest 对稳定排序的 Package 文件清单计算；清单包含每个持久 Artifact 的相对路径和文件 Digest，但不包含 `package-ref.json` 中保存的 Package Digest 自身。相同文件集合与顺序必须得到相同结果。

### 8.3 Article Package 布局

```text
articles/<slug>/<run-id>/
├─ article.md
├─ article.meta.yaml
├─ visual-manifest.json
├─ assets/
│  ├─ 01-runtime-boundary.png
│  ├─ 01-runtime-boundary.mmd
│  └─ 01-runtime-boundary.source.json
├─ claim-map.json
├─ source-lineage.json
├─ boundary-note.md
├─ review-report.json
├─ visual-review-report.json
├─ package-ref.json
└─ x-handoff.json                 # 仅在显式创建后存在
```

`article.md` 使用相对路径：

```markdown
![Enterprise Agent Runtime boundary](assets/01-runtime-boundary.png)
```

外部 URL 可以作为 provenance，但不能作为 Canonical 图片引用。

Canonical Article Package Digest 在 Finalize 时只覆盖文章事实集：`article.md`、metadata、Visual Manifest、规范化资产、Claim map、Lineage、Boundary 和两类 Review。`package-ref.json` 以及 Finalize 后显式创建的 `x-handoff.json` 是引用或派生 Artifact，不进入已经冻结的 Article Package Digest，也不能修改文章事实集。

## 9. 图片导入与规范化

`article visual attach` 接受 Human/Skill 明确提供的 Slot、候选文件、Alt Text 和 provenance。导入过程必须：

1. 确认目标 Article Run 尚未 Finalize。
2. 确认 Content Review 已通过。
3. 确认 Slot 存在且 Claim 引用有效。
4. 使用安全文件打开方式拒绝目录、符号链接和路径逃逸。
5. 读取文件签名并使用受支持解码器完整解码。
6. 拒绝 GIF、动画 WebP、SVG 和伪装文件。
7. 应用配置化的文件大小、宽高和总像素上限。
8. 生成规范化发布副本，移除 EXIF、GPS、设备、作者、软件注释和其他非必要隐私元数据；保证正确渲染所需且不携带隐私的色彩配置可以保留。
9. 对规范化副本计算 Digest；后续所有契约只引用该 Digest。
10. 使用原子写入复制到 Package 暂存区。
11. 如提供编辑源，只复制显式选择的源文件并单独计算 Digest。
12. 写入 `VisualAssetRef` 和 Manifest 候选记录。

规范化不得改变图片的视觉语义。若解码器无法安全规范化，导入失败，不以原文件直接发布作为降级路径。

Finalize 前的候选资产保存在 Article Run 的暂存目录，而不是提前创建 Canonical Package。Finalize 以原子方式把 Human 已选择且通过 Review 的资产写入最终 Package；未选择候选不进入最终 Package，也不影响其 Digest。

## 10. 两阶段 Article 流程

```text
Frozen Research Content Package
→ article prepare
→ Article Draft with Visual Slots
→ article accept-draft
→ article review
→ article visual status
→ Visual Skill 生成候选图片
→ article visual attach
→ article visual review
→ article finalize
→ Canonical Article Package
```

先审正文、后生成视觉，避免正文持续变化导致图片反复生成，也避免图片先于 Claim 和 Boundary 被锁定。

建议新增命令：

```text
article visual status
article visual attach
article visual remove
article visual review
```

- `status`：列出 Slot、required 状态、当前候选和阻塞原因。
- `attach`：导入并绑定一个候选图片；同一 Slot 的替换产生新候选记录。
- `remove`：只允许在 Finalize 前移除绑定。
- `review`：执行确定性 Gate，并保存 Human/Visual Skill 的语义 Review 结论。

Article Finalize 必须满足：

- Content Review 无阻塞项。
- 所有 required Slot 已绑定且通过 Visual Review。
- 可选 Slot 缺失只产生提示。
- 每个 Asset Digest、Claim 引用和相对路径有效。
- Markdown 图片位置和 Manifest 一致。
- Markdown 不包含未登记的本地图片路径。
- Package Digest 覆盖正文、Visual Manifest 和全部规范化资产。

视觉候选选择属于内容制作，不构成外部发布授权。

## 11. X Handoff 与 Publication Plan V2.1

### 11.1 显式选择

`article handoff-x` 可选接收一个 `asset_id`。Harness 不自动根据封面、位置或模型判断选择图片。

无 `asset_id` 时生成纯文本 Handoff；有 `asset_id` 时必须确认该资产属于 Finalized Article Package。

### 11.2 Item 级附件

V2.1 将附件绑定在具体 Post item 上：

```ts
interface PublicationItemV2_1 {
  readonly ordinal: number;
  readonly text: string;
  readonly attachments: readonly VisualAssetRef[];
}
```

首版约束：

- 一个 Plan 的附件总数只能是 0 或 1。
- Single 和 Reply 只能在唯一 item 上附图。
- Thread 只能在 `ordinal: 1` 上附图。
- 只能引用当前 Handoff 已授权的 Article Package Asset。
- V2.1 Intent 不再定义顶层 `media`；V2.0 Plan 仍按旧 Schema 读取，其中 `intent.media` 非空继续返回 `UNSUPPORTED_PUBLICATION_FEATURE`。

### 11.3 Schema 兼容

- V2.0 纯文本 Plan、Approval 和 Browser Execution 继续可读和执行。
- V2.1 Plan 使用 `schema_version: '2.1'` 并包含 item 级 `attachments`。
- V2.0 Approval 不能批准 V2.1 Plan。
- 不原地改写已经存在的 V2.0 Artifact。

## 12. Digest 与一次 Human Approval

V2.1 的规范化 Publication Intent 必须包含有序 Item 和有序 Attachment。Plan Digest 因而绑定：

- 目标账号。
- Adapter 和模式。
- Reply 目标。
- 每条正文和顺序。
- Attachment 所在 ordinal。
- `asset_id`、规范化文件 Digest、MIME、Alt Text 和 Claim 引用。
- `publish_once` 动作。

以下任意变化都会改变 Plan Digest 并使已有 Approval 失效：

- 图片像素或文件内容变化。
- Alt Text 变化。
- 图片在 Article 中的位置变化并触发新的 Handoff。
- 图片对应的 Post ordinal 变化。
- 图片替换、移除或增加。
- 正文、账号、模式、Reply 目标或 Adapter 变化。

Approval Card 增加独立 Media 区域：

```text
Publish once via Browser Adapter

Account: @target-handle
Mode: Thread
Posts: 6
Media: 1 static image
Attached to: Post 1
Adapter: Existing Chrome session

[完整、有序、只读正文]
[图片预览]

Alt text: ...
Asset digest: sha256:...

Audit
Plan digest: sha256:...
Approval expires: ...

Approve this publication?
```

Human 仍然只做一次最终发布确认。图片预览失败、文件不可读或 Digest 无法复算时不能请求 Approval。

## 13. Browser Command 与 Host 能力

### 13.1 Capability Manifest

Browser Host 必须显式声明兼容的 `file_upload` 和 `attachment_alt_text` 能力。缺少任一能力时，Browser Execution 在 Preflight 返回稳定错误，不切换 Browser surface，也不静默转为 Manual。

### 13.2 新增受限命令

```text
upload_attachment
set_attachment_alt_text
```

`upload_attachment` Envelope 至少绑定：

- `execution_id`、`command_id` 和 page revision。
- 目标 Composer item ordinal。
- Package root identity。
- 相对文件路径。
- 预期 SHA-256 Digest 和 MIME。
- `allowed_origin: https://x.com`。
- `side_effect: write`。

Host 在打开文件前重新解析绝对路径，并要求最终路径位于锁定 Package root 内。Host 读取文件后重新计算 Digest，再把文件交给受控上传能力。Browser Command 不允许任意文件选择器路径或目录通配符。

`set_attachment_alt_text` 只接受 Plan 中的精确 Alt Text，不能由 Host 改写。

### 13.3 Composer Observation

XPageContract 扩展为能够观察：

- 每个 Composer item 的 attachment count。
- 支持页面所暴露的附件类型。
- Attachment 所属 item ordinal。
- Alt Text 或其可访问性状态。
- 是否存在未知的已有附件。
- 上传完成、处理中或失败状态。

Submit Barrier 前必须回读并验证：

- 正文数量、内容和顺序不变。
- 附件总数为 1。
- 附件位于预期 item。
- Alt Text 精确匹配。
- 当前账号、页面 revision 和 Submit 控件仍有效。

任何无法唯一判定的状态都 fail closed。

## 14. Browser 状态与恢复语义

V2.1 复用 V2 Browser Execution 状态机，在 `composer_prepared` 与 `composer_verified` 之间增加附件操作和观察事件，不创建第二套提交状态机。

### 14.1 Submit 前

- 文件上传能力缺失：`pre_submit_failed`。
- 已存在未知附件：停止，不覆盖、不删除。
- 上传失败且 Observation 明确没有附件：可以在原 Approval 有效且命令重放规则允许时生成新的上传命令。
- 上传结果未知：先重新观察；只有明确没有附件时才允许重试上传。
- 已知由本 Execution 上传的附件可以在 Submit 前由受限清理命令移除；未知附件不能自动清理。
- Attachment、Alt Text 或正文回读不一致：禁止生成 Submit Command。

### 14.2 Submit 后

一旦 Submit Command 已不可逆地发给 Host：

- 不重新上传。
- 不重新提交。
- Browser 断开后只恢复公开验证。
- 发现错误图片、额外附件或媒体关联冲突时进入 `verification_conflict`。
- 公开正文已验证但媒体证据不足时生成 `published_media_unverified` Receipt。

at-most-once 的写前日志、Host consumed-command 和恢复规则完全继承 V2，不因加入图片而放宽。

## 15. 公开验证与证据强度

X 可能压缩、重编码或转换上传图片，因此公开页面不能用字节 SHA-256 证明媒体与本地文件完全相同。Receipt 必须分别记录三类证据：

### 15.1 Source Asset Evidence

`source_asset_verified` 表示：

- 上传前文件位于锁定 Package 内。
- Host 重新计算的 Digest 与 Plan 一致。
- MIME 与规范化资产记录一致。

### 15.2 Composer Evidence

`composer_attachment_verified` 表示：

- Submit 前 Composer 附件数量和位置匹配。
- Alt Text 匹配。
- 文本未被上传操作改变。

### 15.3 Public Media Evidence

`public_media_verified` 表示：

- 公开目标 Post 存在一份媒体关联。
- 媒体关联属于正确账号和正确 Post ID。
- 页面可观察到的媒体数量、类型和 Alt Text 与 Plan 一致。

它不表示公开媒体字节等于源文件。若公开页面不暴露足够字段，只能记录实际可验证字段并降级证据强度。

## 16. Receipt 扩展

Publication Receipt V2.1 增加：

```ts
interface MediaEvidenceV2_1 {
  readonly asset_id: string;
  readonly source_digest: `sha256:${string}`;
  readonly source_asset_verified: boolean;
  readonly composer_attachment_verified: boolean;
  readonly public_media_verified: boolean;
  readonly target_ordinal: number;
  readonly alt_text_verified: boolean | null;
  readonly public_media_url: string | null;
  readonly limitations: readonly string[];
}
```

Browser Receipt 状态扩展：

- `finalized`：正文和要求的公开媒体字段均已验证。
- `published_media_unverified`：正文已公开验证，但媒体证据不足。
- `verification_conflict`：公开媒体与 Plan 存在可证明冲突。

Receipt 写入后仍然不可修改。后续公开验证补足媒体证据时生成新的 Receipt，并通过 `supersedes_receipt_id` 指向旧 Receipt。

## 17. Visual Review 与语义边界

Harness 的确定性 Gate 能验证：

- 图片属于哪个 Slot 和章节。
- 文件是否发生变化。
- Alt Text 是否存在。
- Claim 引用是否有效。
- Article、X、Approval 和 Receipt 是否引用同一个 Digest。

Harness 不能仅凭文件结构验证：

- 图中架构是否真实。
- 图中数字是否被证据支持。
- 图中是否把计划写成已完成能力。
- 图是否清晰、准确或符合个人视觉风格。

Visual Review Report 必须由 Visual Skill 与 Human 内容选择共同提供：

- `claim_alignment`：图中命题能够映射到允许的 Claim。
- `boundary_alignment`：verified、hypothesis、planned 边界没有被视觉抹平。
- `mobile_legibility`：关键标题、节点和箭头在移动端预览可读。
- `single_message`：主图只服务一个中心命题。
- `privacy_review`：不存在私有路径、账号信息、窗口内容或敏感截图。

这一步是内容 Gate，不是发布授权。

## 18. Error Code

V2.1 至少增加：

| Error Code | 含义 |
|---|---|
| `VISUAL_ASSET_INVALID` | 文件无法安全读取、解码或规范化 |
| `VISUAL_FORMAT_UNSUPPORTED` | 图片格式或动态能力超出首版范围 |
| `VISUAL_DIGEST_MISMATCH` | 文件 Digest 与锁定契约不一致 |
| `VISUAL_CLAIM_REF_INVALID` | 图片引用不存在或不允许的 Claim |
| `VISUAL_SLOT_UNRESOLVED` | 必需 Slot 未解析，不能 Finalize |
| `VISUAL_PATH_OUTSIDE_PACKAGE` | 最终文件路径逃逸 Canonical Package |
| `BROWSER_FILE_UPLOAD_UNAVAILABLE` | Host 不支持受限文件上传能力 |
| `X_ATTACHMENT_CONFLICT` | Composer 存在未知或额外附件 |
| `X_ATTACHMENT_UPLOAD_FAILED` | 附件上传明确失败 |
| `X_ATTACHMENT_OUTCOME_UNKNOWN` | 无法确定上传是否形成附件 |
| `X_ATTACHMENT_MISMATCH` | 附件数量、类型或 Post ordinal 不匹配 |
| `X_ALT_TEXT_MISMATCH` | Composer Alt Text 与 Plan 不一致 |
| `PUBLIC_MEDIA_UNVERIFIED` | 公开正文已验证但媒体证据不足 |

Error Code 是机器契约；用户可读文字可以演进。

## 19. Artifact 与隐私

### 19.1 Article Package

Canonical Package 长期保存：

- 规范化发布图片。
- Visual Manifest。
- Visual Review Report。
- 可选编辑源及其 Digest。
- Article Package Digest 和 X Handoff。

原始候选图片默认不复制进 Final Package。

### 19.2 Browser Execution

Browser 运行目录只保存：

- Attachment Command Envelope。
- 文件 Digest 和相对路径，不复制第二份图片。
- 最小化 Attachment Observation。
- 公开媒体 URL、可验证字段和 Receipt。

不保存文件选择器历史、任意目录列表、完整 DOM、Cookie、Token 或无关页面截图。

### 19.3 隐私元数据

规范化发布副本默认移除 EXIF、GPS、设备、作者和软件注释等非必要 metadata。无法确定安全清理结果时导入失败，而不是原样发布。

## 20. Skill 端到端流程

### 20.1 Article

```text
article prepare
→ article accept-draft
→ article review
→ article visual status
→ Agent/Visual Skill 生成候选
→ article visual attach
→ article visual review
→ Human 选择最终候选
→ article finalize
→ 返回 Canonical Article Package 路径与 Digest
```

`article-publishing-copilot` 仍然是薄 Skill，不重写文件校验、Digest、Slot Gate 或 Package 规则。

### 20.2 X

```text
article handoff-x --asset-id <id>
→ x prepare
→ x accept-draft
→ x review
→ x plan --adapter browser
→ 展示精确正文、图片预览与 Audit
→ Human 一次确认 publish_once
→ x approve
→ x browser start
→ upload / alt text / observe / verify
→ Submit Barrier
→ submit exactly once
→ public verification
→ Receipt
```

Browser 预检失败时只报告稳定错误和下一步。Manual fallback、图片移除或改为纯文本都改变 Plan，需要新的 Review、Plan 和 Approval。

## 21. 测试策略

### 21.1 Unit Tests

- 同一输入和规范化版本产生稳定 Asset Digest。
- 像素、Alt Text、Claim 绑定或位置变化改变 Package Digest。
- 文件扩展名与签名不一致时拒绝。
- GIF、动画 WebP、SVG 和损坏图片被拒绝。
- 路径逃逸和符号链接被拒绝。
- EXIF/GPS 等 metadata 不出现在规范化副本。
- 必需 Slot 未完成时禁止 Finalize。
- 可选 Slot 缺失只产生提示。
- Manifest 和 Markdown 相对路径一致。
- 未登记本地图片引用阻止 Finalize。
- V2.1 只允许第一条的一张静态图。
- 图片变化使旧 Approval 失效。

### 21.2 Article Integration Tests

- 从带 required Slot 的 Draft 生成完整 Canonical Article Package。
- 同一 Slot 替换候选后只锁定 Human 选择的最终 Asset。
- Final Package 包含 Markdown、Asset、Manifest、Review 和可选编辑源。
- Finalized Package 不允许原地替换图片。
- X Handoff 只能引用当前 Package 中存在的 `asset_id`。

### 21.3 Fake Browser Executor Tests

- 正常上传一张图、设置 Alt Text、回读、单次提交和公开验证。
- Host 缺少 `file_upload` capability。
- Approval 后源文件被替换。
- Composer 已有未知附件。
- 上传明确失败。
- 上传结果未知但重新观察确认成功。
- 上传结果未知且重新观察仍未知。
- 上传后正文发生变化。
- 附件出现在错误 Thread item。
- Alt Text 回读不一致。
- Submit 超时但正文和媒体已经公开。
- 正文公开成功但媒体字段无法验证。
- 公开媒体数量冲突。
- 重启后重复 Submit Command 被拒绝。

### 21.4 Security Tests

- Browser Command 不能上传 Plan 外文件。
- 相对路径不能逃逸 Package root。
- Command 不能使用通配符、目录或符号链接。
- Skill 不能伪造 Upload Command 绕过 Harness。
- 非图片文件不能仅靠扩展名进入 Package。
- 未经确认的 Asset、Alt Text 或 ordinal 变化使 Approval 失效。
- CI 不访问真实 X 账号或产生发布副作用。

### 21.5 Acceptance

Acceptance 使用合成图片和 Mock X 页面覆盖完整 Article → X 流程。真实账号 Smoke Test 必须显式启用，默认停止在 `submit_armed`；真正 Submit 仍需要内容级 Human Approval，测试结束不自动删除 Post。

## 22. 兼容与迁移

- 现有不含 Visual Slot 的 Article Draft 等价于纯文本文章。
- 现有 Canonical Article Package 保持可读，不原地补 Manifest。
- V2.0 纯文本 Browser Plan 和 Approval 继续执行。
- V1 Manual Adapter 继续支持纯文本；V2.1 不自动为 Manual Handoff 增加图片复制说明。
- V2.0 顶层 `intent.media` 保持兼容读取，但非空仍明确拒绝；V2.1 不再包含该字段。
- 新媒体能力只通过 V2.1 item-level `attachments` 启用。
- Browser Host Capability Manifest 必须显式升级，旧 Host fail closed。

## 23. 推荐实施顺序

本节只是依赖顺序，不构成实施授权或实施计划：

1. 最小 `VisualAssetRef`、Visual Slot 和 Schema 兼容。
2. 安全图片导入、规范化和 Manifest。
3. Article Visual 命令、Review Gate 和 Finalize Digest。
4. X Handoff 的显式 Asset 选择和 Publication Plan V2.1。
5. Approval Card 的图片预览与 Digest 绑定。
6. Browser Host 文件上传 Capability 与受限 Command。
7. XPageContract Attachment Observation 和 Composer Verification。
8. 公开媒体验证与 Receipt V2.1。
9. Skills、合成 Fixture、Acceptance 和受控 Smoke Test。

## 24. V2.2 LLM Wiki Memory Adapter 连接点

V2.2 独立设计以下受控 RSI 闭环：

```text
长期研究记忆
→ SCP Query
→ Research Content Package
→ Article / Visual / X
→ Public Feedback and Receipt
→ Candidate Insight
→ Evidence/Boundary/Human Gate
→ SCP Ingest
→ 下一轮研究上下文
```

V2.1 只保留稳定连接点：

- Research Package 已有的 Claim、Evidence 和 Lineage。
- `claim_refs`。
- Article Package Digest、Visual Manifest Digest 和 X Receipt 引用。
- 未来可由 Runtime 使用的 `context_refs`，但 V2.1 不动态查询或写入 Wiki。

关键不变量：LLM Wiki 可以影响内容形成，但不能在 Publication Plan 冻结后改变已批准的正文、图片或动作。任何新的记忆检索结果必须先进入新的 Research Content Package，再生成新的 Plan 和 Approval。

## 25. 验收标准

V2.1 只有满足全部条件才能称为完成：

1. 长文可以声明必需和可选 Visual Slot。
2. Visual Skill 可以提交静态图片候选而不拥有物理存储规则。
3. Harness 能生成去除非必要隐私元数据的规范化副本。
4. Canonical Article Package 自包含 Markdown、图片、Manifest 和可选编辑源。
5. 所有内部图片链接使用相对路径。
6. 图片绑定有效 Claim；语义 Review 不把计划或假设伪装成已验证事实。
7. Package Digest 覆盖正文、图片、Alt Text、位置和顺序。
8. Article 和 X 通过同一个 `VisualAssetRef` 复用图片。
9. X V2.1 最多允许第一条附一张静态图片。
10. Human 一次确认同时绑定文字、图片、账号、模式、Adapter 和 `publish_once`。
11. Browser 只能上传 Plan 中、位于锁定 Package 内且 Digest 匹配的文件。
12. Composer Submit 前完成附件数量、位置、Alt Text 和正文回读。
13. Submit 继续满足 Harness 与 Host 双重 at-most-once 保护。
14. 公开验证区分 Source、Composer 和 Public 三类媒体证据。
15. 无法验证公开媒体时生成诚实的降级 Receipt，不虚构完整成功。
16. V2.0 纯文本流程、现有 Article 流程和 Manual Adapter 不回归。
17. X 页面或 Host 不支持受限上传时 fail closed，不切换 Browser surface。
18. 所有关键成功、失败、冲突、崩溃和恢复路径有自动测试证据。
19. CI 不对真实账号产生发布副作用。
20. V2.1 不包含动态图、视频、X Articles 自动发布或 LLM Wiki 动态接入。

## 26. 完整性结论

本设计已经确定：

- 长文视觉优先、X 可选复用的产品边界。
- Visual Skill、Article Harness、Core、X Harness、Browser Adapter 和 Human 的职责。
- 最小 `VisualAssetRef`，避免建设过重的媒体契约层。
- 自包含 Canonical Package、相对路径和不可变 Digest。
- 两阶段 Article 流程和一次最终发布确认。
- 受限文件上传、Composer 回读和 at-most-once Submit。
- X 转码条件下诚实的媒体证据等级和 Receipt。
- 错误恢复、隐私、兼容、测试和验收标准。
- 后续 V2.2 LLM Wiki Memory Adapter 的连接点和 RSI 安全边界。

实施阶段不得以创作便利、Browser 自动化能力或平台限制为由绕过 Claim、Digest、Approval、Package 路径、Submit Barrier 或公开验证要求。
