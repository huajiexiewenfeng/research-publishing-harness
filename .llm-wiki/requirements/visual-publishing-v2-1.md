# Change Brief: Visual Publishing V2.1

## Summary

- title: Implement approved Visual Publishing V2.1
- status: implemented-local
- flow_id: `visual-publishing-v2-1`

## Routing

- intent: 将已批准 V2.1 规格转化为可执行计划并在当前 `main` 内联开发、验证和提交。
- primary_stage: `project-develop`
- secondary_bridges: `writing-plans`, `test-driven-development`, `executing-plans`, `verification-before-completion`, `project-finish`
- confidence: high
- reason: 规格、边界、兼容要求和 20 条验收标准均已书面批准。
- next_gate: External Bridge Gate → writing-plans

## Sources

- `docs/superpowers/specs/2026-08-20-visual-publishing-v2-1-design.zh-CN.md`
- `docs/superpowers/specs/2026-08-19-x-browser-adapter-v2-design.zh-CN.md`
- `docs/architecture/research-publishing-harness-design.zh-CN.md`
- `docs/superpowers/plans/2026-08-19-x-browser-adapter-v2.md`

## Requirement Summary

在不削弱 Claim、Boundary、Digest、Approval、Package path、write-ahead Submit Barrier、Host consumed-command、at-most-once 与公开验证的前提下，为 Canonical Markdown Article Package 增加静态视觉资产，并允许 X V2.1 显式复用其中一张图。Visual Skill 只拥有语义和创作；Harness 拥有安全导入、规范化、Manifest、Digest、锁定、受限 Browser 上传和诚实 Receipt。

## Scope

- active:
  - `harnesses/research-publishing/core/`
  - `harnesses/research-publishing/contracts/`
  - `harnesses/research-publishing/branches/article-harness/`
  - `harnesses/research-publishing/branches/x-harness/`
  - `harnesses/research-publishing/adapters/x/browser/`
  - `harnesses/research-publishing/cli/`
  - `skills/article-publishing-copilot/`, `skills/x-publishing-copilot/`
  - `tests/`, `tools/`, synthetic fixtures, README、Quickstart、架构文档、registry/manifest
- read-only:
  - 已批准 V2.1 规格、Browser V2 基线和总体架构基线
- candidate:
  - 一个锁定版本的本地图像解码/规范化依赖，只有在完整解码与隐私元数据清理无法由现有依赖满足时加入
- excluded:
  - V2.2 LLM Wiki Runtime Adapter
  - GIF、视频、动态图、多图、X Articles、自动选图、在线托管和通用媒体平台
  - 真实 X 账号自动发布或 CI 网络副作用

## Acceptance

1. 长文支持 required/optional Visual Slot。
2. Visual Skill 可提交候选但不控制物理路径。
3. Harness 生成移除非必要隐私元数据的规范化图片。
4. Canonical Package 自包含 Markdown、图片、Manifest 和可选编辑源。
5. 内部图片链接全部相对。
6. Claim 绑定和 Visual Review 保持 verified/hypothesis/planned 边界。
7. Package Digest 覆盖正文、图片、Alt、位置和顺序。
8. Article/X 复用同一 `VisualAssetRef`。
9. X V2.1 整个 Plan 最多一张图，Thread 仅 ordinal 1。
10. 单次 Human Approval 绑定账号、模式、正文、图片、Alt、ordinal、Adapter 与 `publish_once`。
11. Browser 只上传锁定 Plan、Canonical Package 内、Digest 匹配文件。
12. Submit 前回读正文、附件数量/位置和 Alt。
13. Harness/Host 双重 at-most-once 保持。
14. Receipt 区分 Source、Composer、Public 媒体证据。
15. 公开媒体不可验证时诚实降级。
16. V2.0 纯文本、现有 Article、V1 Manual 不回归。
17. 上传能力缺失时 fail closed。
18. 成功、失败、冲突、崩溃和恢复有自动测试。
19. CI 不产生真实账号副作用。
20. 不包含明确非目标能力。

## Non-Goals

- 不建设通用 Media Harness 或 Asset Registry 服务。
- 不由 Harness 判断图片美观或语义真实性。
- 不允许 Browser 任意选文件、切换 surface 或降级到 Manual。
- 不声称 X 公共媒体字节等于源资产。

## Verification Plan

- TDD：每个新行为先运行最小失败测试，再实现并回归相关测试。
- Unit：格式/签名/动画/尺寸/metadata/path/slot/manifest/digest/attachment/approval。
- Integration：完整 Article visual package 和显式 X handoff。
- Fake Browser：上传、Alt、观察、submit、public verify、降级、冲突、恢复。
- Security：package containment、symlink、digest、command allow-list、approval invalidation、无真实 X。
- Project：`pnpm check`、`git diff --check`、20 条验收逐项证据审计、工作树清洁。

## External Dependencies

- 无跨项目运行时依赖。
- 若加入图像库，必须锁定确切版本并由完整测试证明静态 PNG/JPEG/WebP 解码、metadata 清理和动画拒绝。

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | 批准规格提交 `d502ac9`、批准状态提交 `ff2d824` | 2026-08-20 |
| design | done | `docs/superpowers/specs/2026-08-20-visual-publishing-v2-1-design.zh-CN.md` | 2026-08-20 |
| plan | done | `docs/superpowers/plans/2026-08-20-visual-publishing-v2-1.md` | 2026-08-20 |
| development | done | Core/Article/X/Browser/CLI/Skills/Docs implementation and direct tests | 2026-08-20 |
| testing | passed-agent-local | `pnpm check` plus 20-item audit in `.llm-wiki/verification/visual-publishing-v2-1.md`; not external CI/reviewer evidence | 2026-08-20 |
| archive | done | `.llm-wiki/handoff/visual-publishing-v2-1-handoff.md` | 2026-08-20 |

## Open Questions

- 无需求阻断问题。剩余信任边界仅为本地验证尚非外部 CI/Reviewer 审核；无自接受的功能限制。
