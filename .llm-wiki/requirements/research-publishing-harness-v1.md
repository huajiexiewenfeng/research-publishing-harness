# Change Brief: research-publishing-harness-v1

## Summary

- title: Build the evidence-backed Article and Manual X publishing V1
- status: ready
- flow_id: `research-publishing-harness-v1`

## Routing

- intent: 迁入设计基线、生成可执行实施计划并开发 V1。
- primary_stage: `project-develop`
- secondary_bridges: `writing-plans`, `test-driven-development`, `executing-plans`, `verification-before-completion`
- confidence: high
- reason: 用户已确认完整设计并明确要求立即实现。
- next_gate: External Bridge Gate → writing-plans

## Sources

- `docs/architecture/research-publishing-harness-design.zh-CN.md`
- 用户确认的公共 GitHub 仓库与 V1 开发目标。

## Requirement Summary

建立共享 Research Kernel、Article Harness/Skill 和 X Harness/Skill，使用户能够从有证据的 Research Content Package 生成 Canonical Markdown Article 与经过内容锁、人工批准的 Manual X Publication Package。

## Scope

- active:
  - `docs/`
  - `harnesses/research-publishing/contracts/`
  - `harnesses/research-publishing/core/`
  - `harnesses/research-publishing/branches/article-harness/`
  - `harnesses/research-publishing/branches/x-harness/`
  - `harnesses/research-publishing/adapters/x/manual/`
  - `skills/article-publishing-copilot/`
  - `skills/x-publishing-copilot/`
  - `registry/`, `tests/`, `tools/`, `.github/workflows/`
- reference-only:
  - `LICENSE`
  - 用户其他研究仓库，仅作为未来真实内容来源，不作为 V1 代码依赖。
- candidate:
  - Browser Adapter 接口说明。
  - X API Adapter 接口说明。
- excluded:
  - Browser 自动化实现。
  - X API/OAuth 实现。
  - 自动选题、定时发布、平台文章 Adapter。

## Acceptance

- 设计基线第 17 节的 17 项 V1 验收标准全部有实现或测试证据。
- 所有生产代码按 TDD 建立失败测试后实现。
- `npm test`、`npm run typecheck`、`npm run lint` 和 Acceptance 命令退出码为 0。
- Synthetic Example 可在无网络、无凭据环境完成 Article 与 Manual X 流程。
- 公共文件不包含本地绝对路径、秘密或真实发布状态。

## Non-Goals

- V1 不执行真实 X 发布。
- V1 不调用模型 API。
- V1 不成为 CMS、营销工具或自主 Agent。
- V1 不实现 Browser/API Adapter。

## Plan

- active_plan: `docs/superpowers/plans/2026-08-18-research-publishing-harness-v1.md`
- status: confirmed
- evidence: 用户已明确要求生成计划并开发 V1。

## External Dependencies

- 无跨项目运行时依赖。
- npm 依赖必须公开、最小化并锁定版本范围。

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | `docs/architecture/research-publishing-harness-design.zh-CN.md` | 2026-08-18 |
| design | done | 已确认 V1 设计基线 | 2026-08-18 |
| plan | done | `docs/superpowers/plans/2026-08-18-research-publishing-harness-v1.md` | 2026-08-18 |
| development | pending |  | 2026-08-18 |
| testing | pending |  | 2026-08-18 |
| archive | pending |  | 2026-08-18 |

## Open Questions

- 无阻断问题。Browser/API 属于后续版本。

## Notes

- M0–M2 是本次 V1；不与个人研究规划中的 Phase 3/Phase 4 混淆。
- 实施计划已确认并进入 inline execution。
