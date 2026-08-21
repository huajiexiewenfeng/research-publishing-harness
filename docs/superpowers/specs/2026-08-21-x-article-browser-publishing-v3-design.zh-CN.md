# X Article Browser Publishing V3 设计规格

## 文档状态

- 日期：2026-08-21
- 状态：设计已确认，可进入实施计划
- 适用仓库：`research-publishing-harness`
- 前置基线：X Browser Adapter V2、Visual Publishing V2.1
- 首版范围：使用现有 Chrome 登录态创建并发布新的公开 X Article

## 1. 摘要

当前 Harness 已支持 Canonical Article Package，也支持 X `single`、`thread`、`reply` 的可审计 Browser 发布，但不支持 X Articles。长文不能被错误降级为 Thread，也不能被加入以 Post item 为中心的现有协议。

V3 新增独立 `x-article` 分支。Article Harness 继续拥有研究、写作、Claim/Source、视觉审查和 Canonical Package；X Article 分支只拥有从锁定 Package 到 X Article Editor 的确定性投递、一次批准、at-most-once Publish、公开验证和 Receipt。

核心边界：

> Article Harness 决定写什么；X Article Branch 决定如何把已锁定内容可靠地发布到 X Articles。

## 2. 已验证的平台事实

- X 官方说明 Articles 面向 Premium、Premium+、Premium Business 和 Premium Organizations。
- Articles 支持标题、正文、Heading/Subheading、基础富文本、列表、引用、链接和媒体。
- `@Glen56121` 当前 Premium 登录态存在 Articles 入口。
- 点击 `create` 会立即创建云端草稿并分配 `/compose/articles/edit/<draft_id>`。
- 编辑器会自动保存；空草稿也会出现在 Drafts 列表。
- 当前观察到标题 textarea、`data-testid=composer` 正文编辑器、Heading/Subheading/Body、bold/italic/strikethrough、blockquote、ul、ol、link、头图上传、正文媒体、Preview、Focus mode 和 Publish。
- 头图 UI 推荐 5:2；文件输入当前接受 PNG/JPEG/WebP 且单文件选择。

这些事实只进入版本化 Page Contract fixture，不成为永久平台假设。

## 3. 目标与非目标

### 3.1 目标

1. 从 Finalized Article Package 生成稳定、可审计的 X Article Plan。
2. 在一次 Human Approval 后使用现有 Chrome 登录态完成编辑器填充和公开发布。
3. 对标题、正文结构、链接、视觉资产、Alt、账号、Audience 和副作用范围做精确绑定。
4. 对自动保存、部分填写、图片上传不确定、浏览器崩溃和 Publish 结果不确定安全恢复。
5. 从公开 Article 页面形成不可变 Receipt。
6. 不回归现有 Post 和 Article 能力。

### 3.2 非目标

- 编辑、取消发布或删除已公开 Article。
- Subscriber-only Audience。
- 视频、GIF、嵌入 X Post、任意 HTML。
- 定时、批量、无人值守授权。
- X API/OAuth。
- 接管或覆盖 Human 已有草稿。
- Browser Adapter 临场改写内容。

## 4. 总体架构

```text
Frozen Research Content Package
        │
        ▼
Article Harness
  draft → evidence/privacy/visual review → Finalized Article Package
        │ article.md + metadata + Claim map + Visual Manifest + digest
        ▼
X Article Branch
  Document Compiler
        ▼
  XArticlePublicationPlanV1
        ▼
  Human Approval (once)
        ▼
  X Article Browser Adapter
        ├─ Article Editor Page Contract
        ├─ deterministic edit protocol
        ├─ write-ahead Publish barrier
        └─ recovery ledger
        ▼
  Public Article Verifier
        ▼
  immutable XArticleReceiptV1
```

现有 `XPublicationMode = single | thread | reply` 保持不变。X Article 使用独立 Contract、Service、Adapter、状态机、Verifier 和 Receipt；只复用平台无关 Core。

## 5. Canonical Article Document

Browser Adapter 不直接解释 Markdown。Plan 生成前，版本化 Compiler 将 `article.md` 和 Visual Manifest 编译为受控 AST：

```ts
interface XArticleDocumentV1 {
  readonly schema_version: '1.0';
  readonly title: string;
  readonly blocks: readonly XArticleBlockV1[];
}

type XArticleBlockV1 =
  | { kind: 'heading' | 'subheading' | 'paragraph' | 'quote'; runs: readonly InlineRunV1[] }
  | { kind: 'bullet_list' | 'ordered_list'; items: readonly (readonly InlineRunV1[])[] }
  | { kind: 'image'; asset_id: string; alt_text: string };

interface InlineRunV1 {
  readonly text: string;
  readonly marks: readonly ('bold' | 'italic')[];
  readonly link: string | null;
}
```

规则：

- 只接受明确列出的 Markdown 子集。
- HTML、嵌套复杂列表、表格、脚注、代码块或无法无损表达的节点返回 `ARTICLE_FORMAT_UNSUPPORTED`。
- 编译发生在 Approval 之前；Approval 后不允许 LLM 或 Skill 再转换。
- 文本规范化仅允许 Unicode NFC 和换行统一，不 trim 或改写标点。
- 图片必须来自 Visual Manifest，位置由 Visual Slot binding 决定。

## 6. Publication Plan 与 Approval

`XArticlePublicationPlanV1` 锁定：

- target account、adapter、audience=`everyone`、action=`publish_once`
- Article Package root/digest 与 article run/package identity
- 完整 `XArticleDocumentV1`
- cover 和 inline visual refs：asset id、relative path、byte digest、MIME、Alt、block ordinal
- provenance 和 planned_at（planned_at 不进入稳定 Digest）

Plan Digest 只计算规范化 Intent。Approval Digest 绑定 Plan Digest、账号、Audience、Adapter 和 `publish_once`。任何标题、正文、链接、格式、图片、Alt、顺序、Audience 或账号变化均使 Approval 失效。

Human Approval Card 展示完整标题、正文预览、图片缩略图/位置/Alt、目标账号、Audience、Adapter、Plan Digest 和过期时间。

## 7. Browser Protocol

### 7.1 状态机

```text
created → preflight → account_verified
→ draft_create_armed → draft_created
→ content_filling → content_partially_verified → content_verified
→ preview_verified → publish_armed → publish_attempted
→ outcome_resolving → public_verifying → finalized
```

异常状态：

- `draft_identity_unknown`
- `pre_publish_failed`
- `cancelled_before_publish`
- `published_unverified`
- `outcome_unknown`
- `verification_conflict`
- `failed_after_publish`

### 7.2 确定性编辑命令

Compiler 生成固定操作序列：`set_title`、`upload_cover`、`insert_block`、`set_block_style`、`apply_inline_mark`、`insert_inline_image`、`set_image_alt_text`、`verify_document`、`open_preview`、`verify_preview`。

每条命令绑定 execution/draft id、expected editor revision、payload digest 和唯一 command id。Host 只执行该命令，不决定下一步。每次操作后重新观察并验证已完成前缀。

### 7.3 草稿身份与自动保存

- 创建前持久化 `draft_create_armed`。
- 创建成功后从 canonical editor URL 捕获唯一 `draft_id`。
- 命令已发出但身份未捕获时进入 `draft_identity_unknown`，不得自动再次创建。
- 已知 draft 的内容是 Plan 精确前缀时可继续。
- 完整匹配时可进入 Preview。
- 额外、未知或被 Human 修改的内容返回 `ARTICLE_DRAFT_CONFLICT`，不得覆盖。
- 首版不自动删除孤儿或冲突草稿。

### 7.4 图片

- 上传命令只能指向 Package-relative、Manifest-authorized、digest-matched 文件。
- Cover 和 inline image 使用不同语义命令和观察字段。
- 不确定上传先回读；不能证明缺失时不得重传。
- Alt capability 缺失或不能回读时在提交前 fail closed。
- Receipt 不声称公开转码图片与源文件字节相同。

## 8. Preview 与 Publish Barrier

只有 Editor 和 Preview 都与 Plan 匹配才进入 `publish_armed`。如果平台有 Audience/确认弹窗，Page Contract 必须明确区分预提交控件和最终公开控件；无法区分则 fail closed。

最终公开 Publish 延续双重 write-ahead：Harness 在返回命令前持久化 attempt/command，Host 在点击前持久化 consumed command。同一 attempt 永远不能生成或消费第二个最终 Publish command。

Publish 命令发出后，超时、崩溃或不确定结果只能进入公开只读查找与验证；不得重新点击。

## 9. Public Verification 与 Receipt

Verifier 校验：作者账号、标题、规范化正文块与顺序、链接目标、图片数量/顺序、可观察 Alt、canonical URL、Article ID 和发布时间。

Receipt 分离：

1. Source Package Evidence：Package/Document/Asset Digest。
2. Editor/Preview Evidence：draft id、editor/preview revision、标题/正文/媒体匹配。
3. Public Article Evidence：URL/ID/author/content/link/media/时间匹配。

公开媒体字段不可观察时使用诚实降级状态；标题或正文冲突必须 `verification_conflict`，不能 finalized。

## 10. 错误模型与安全

新增错误：`ARTICLE_FORMAT_UNSUPPORTED`、`ARTICLE_DRAFT_IDENTITY_UNKNOWN`、`ARTICLE_DRAFT_CONFLICT`、`ARTICLE_CONTENT_MISMATCH`、`ARTICLE_ASSET_MISMATCH`、`ARTICLE_PREVIEW_MISMATCH`、`ARTICLE_PAGE_CONTRACT_UNSUPPORTED`、`ARTICLE_OUTCOME_UNKNOWN`、`ARTICLE_PUBLICATION_CONFLICT`。

安全规则：只允许 `https://x.com`；不读取凭据、Cookie、localStorage 或完整 DOM；不允许任意 JS、任意文件路径和跨 origin；不接受未知 Human 草稿；所有外部写命令必须来自已批准 Plan。

## 11. CLI 与 Skill

新增 `x-article plan/approve/browser start|next|claim|report|status|resume-verification|cancel-before-publish`。不新增第三个顶层 Skill：Article 写作继续由 `article-publishing-copilot` 负责；`x-publishing-copilot` 根据已 Finalize Package 路由到独立 `x-article` 分支。

## 12. 测试与验收

测试覆盖 Contract、Compiler golden、Digest/Approval、Page fixtures、Editor Protocol、自动保存恢复、视觉上传、Preview、Publish Barrier、Verifier、Receipt、Security、CLI、Skill boundary、端到端和既有全量回归。

真实 Chrome smoke 只验证 Premium/account/editor contract，不发布测试内容；上传任何本地图片和删除空草稿需要 action-time Human 确认。

本规格的 20 条可验收条目记录在 `.llm-wiki/requirements/x-article-browser-publishing-v3.md`，实施完成前必须逐项建立源码或测试证据。
