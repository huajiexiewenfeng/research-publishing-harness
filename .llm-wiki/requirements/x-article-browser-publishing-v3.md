# Change Brief: X Article Browser Publishing V3

## Summary

- title: Add evidence-backed X Articles browser publishing
- status: implemented-local
- flow_id: `x-article-browser-publishing-v3`

## Routing

- intent: 在保持 Article Package 证据边界和 Browser Adapter at-most-once 语义的前提下，增加 X Articles 的创建与发布能力。
- primary_stage: `project-develop`
- secondary_bridges: `brainstorming`, `writing-plans`, `test-driven-development`, `executing-plans`, `verification-before-completion`, `project-finish`
- confidence: high
- reason: 用户已确认独立 `x-article` 分支并要求设计、开发和验证完成。
- next_gate: optional independent review/CI, then action-time approval for the first real Article publication

## Sources

- `docs/superpowers/specs/2026-08-21-x-article-browser-publishing-v3-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-20-visual-publishing-v2-1-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-19-x-browser-adapter-v2-design.zh-CN.md`
- `docs/architecture/research-publishing-harness-design.zh-CN.md`
- X 官方 Articles 使用说明：`https://help.x.com/en/using-x/articles`
- 2026-08-21 对 `@Glen56121` Premium 账号 Article Editor 的只读/空草稿界面勘察。

## Requirement Summary

新增独立 `x-article` 发布分支。它只消费已经冻结、审查并 Finalize 的 Canonical Article Package，通过确定性 Markdown 编译、Article Publication Plan、一次 Human Approval、受限 Chrome Article Editor 协议、write-ahead `publish_once`、公开验证和不可变 Receipt 完成新 X Article 的创建与发布。不得把 Article 伪装为 Thread，也不得把 `article` 塞进现有 Post Composer 的 `single | thread | reply` 模型。

## Scope

- active:
  - `harnesses/research-publishing/core/`
  - `harnesses/research-publishing/contracts/`
  - `harnesses/research-publishing/branches/article-harness/`
  - `harnesses/research-publishing/branches/x-article-harness/`
  - `harnesses/research-publishing/adapters/x/article-browser/`
  - `harnesses/research-publishing/cli/`
  - `skills/article-publishing-copilot/`, `skills/x-publishing-copilot/`
  - `tests/`, fixtures, README、Quickstart、架构文档和 registry/manifest
- read-only:
  - 现有 Article、X Browser V2 和 Visual V2.1 规格与实现
  - X 官方 Articles 文档和脱敏页面观察
- candidate:
  - 仅在现有依赖无法确定性解析受支持 Markdown 子集时，增加一个锁定版本的 Markdown parser
- excluded:
  - 编辑、取消发布或删除已公开 Article
  - Subscriber-only Audience
  - 视频、GIF、嵌入 X Post、任意 HTML
  - 定时、批量发布、X API/OAuth
  - 接管 Human 已有草稿

## Acceptance

1. 只有 Finalized Article Package 可以生成 X Article Plan。
2. Markdown 先确定性编译为版本化 Article Document；不支持的格式 fail closed。
3. Plan Digest 锁定账号、Package Digest、标题、正文块、链接、图片、Alt、位置、Audience、Adapter 和 `publish_once`。
4. Human 只对完整 Audit Block 确认一次；内容变化使 Approval 失效。
5. 新分支与现有 `single | thread | reply` 类型、协议和 Receipt 隔离。
6. Browser 只复用现有 Chrome 登录态，不读取凭据或 Cookie。
7. 创建草稿后捕获唯一 `draft_id`；身份不确定时不得自动创建第二份。
8. 自动保存后的精确前缀可以恢复，未知或额外内容必须冲突停止。
9. 标题、Heading/Subheading/Body、段落、列表、引用、加粗、斜体和链接可确定性填充并回读。
10. 头图和正文图片只能来自锁定 Package，上传前校验路径与字节 Digest。
11. 图片位置与 Alt Text 在编辑器能力可用时提交前回读；能力缺失时 fail closed。
12. Preview 必须与 Plan 匹配后才可武装 Publish。
13. Harness/Host 双重 write-ahead 保证最终公开 Publish 最多执行一次。
14. Publish 结果不确定时只允许公开只读恢复，不允许再次提交。
15. Public Verifier 校验作者、标题、正文顺序、链接、图片和 canonical URL/Article ID。
16. Receipt 分离 Source Package、Editor/Preview 和 Public Article 证据，不虚构不可观察字段。
17. Page Contract、Protocol、恢复、安全、CLI、Skill 和端到端流程有自动测试。
18. 现有 Article、Manual X、Browser V2 和 Visual V2.1 全量回归通过。
19. 自动测试和 Chrome smoke 不发布测试内容。
20. README、Quickstart、架构范围和 registry capabilities 与实现同步。

## Non-Goals

- 不在 Browser Adapter 中重新写作或改写锁定正文。
- 不把 Article 视为第四种 Post Composer mode。
- 不允许任意 DOM、任意 JavaScript、任意本地文件上传或跨 origin 操作。
- 不声称 X 转码后的图片字节等于源 Package 资产。
- 不在首版自动清理冲突草稿或已公开内容。

## Verification Plan

- TDD：Contract、Compiler、Page Contract、Protocol、State、Verifier、Receipt、CLI 与 Skill boundary 逐层 RED/GREEN。
- Unit：AST、Digest、Approval、格式、图片、路径、状态迁移和错误码。
- Golden：Canonical `article.md` 到 X Article Document 的稳定输出。
- Fake Browser：创建草稿、部分恢复、图片不确定、Preview、Publish Barrier、公开验证。
- Security：错误账号、路径逃逸、Digest 漂移、未知草稿、恶意 DOM、command replay。
- Integration：Finalized Article Package 到 immutable X Article Receipt。
- Project：`pnpm check`、`git diff --check`、20 条验收逐项证据审计。
- Chrome：真实 Premium 账号仅做 editor/preflight smoke；任何文件上传和公开 Publish 需要独立 action-time 确认。

## External Dependencies

- 无跨项目运行时依赖。
- X Article Editor 是外部可变 UI，通过版本化 Page Contract 和脱敏 fixtures 隔离。

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | X 官方文档、现有 V2/V2.1 实现、Premium 账号编辑器勘察 | 2026-08-21 |
| design | done | `docs/superpowers/specs/2026-08-21-x-article-browser-publishing-v3-design.zh-CN.md` | 2026-08-21 |
| plan | done | `docs/superpowers/plans/2026-08-21-x-article-browser-publishing-v3.md` | 2026-08-21 |
| development | done | commits `a11adac`–`de58918` plus final integration commit; isolated `x-article` compiler/Plan/Approval/Page Contract/Adapter/CLI/Skill | 2026-08-21 |
| testing | passed-agent-local | `pnpm check`: 52 test files / 230 tests; offline acceptance includes `x_article_publish_commands:1`; 20-item audit in verification record | 2026-08-21 |
| archive | done | `.llm-wiki/handoff/x-article-browser-publishing-v3-handoff.md` | 2026-08-21 |

## Open Questions

- X 是否在所有账号/UI 变体中提供可回读的正文图片 Alt Text；当前 Fake Host 覆盖协议，真实图片上传仍需动作时确认并验证，缺失则 fail closed。
- 空草稿 `2090731994279755776` 是设计勘察产生的外部状态，删除需要 Human 单独确认。
