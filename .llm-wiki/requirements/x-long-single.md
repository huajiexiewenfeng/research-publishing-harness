---
flow_id: x-long-single
status: done
---

# Change Brief: 长 Single 取消本地 280 字符限制

## Summary

用户于 2026-09-03 确认长 Single 文案后，明确授权取消阻塞发布的 280 字符限制。Single 表示一个独立 Post，而非短帖长度类别。

## Routing

- primary_stage: project-develop
- secondary_bridges: test-driven-development, verification-before-completion
- documentation_mode: create-new-change-brief
- next_gate: 独立的内容发布准备与精确 publish_once 确认

## Sources

- 当前用户确认：可以，取消 280 的限制。
- `../../harnesses/research-publishing/branches/x-harness/character-count.ts`
- `../../harnesses/research-publishing/branches/x-harness/x-service.ts`
- `../../harnesses/research-publishing/core/x-article-url-materializer.ts`

## Scope

- active: 字符校验、Single 审核、Article URL 注入 Single、对应测试及发布能力说明。
- reference-only: Browser Adapter、审批与证据 Gate。
- excluded: Thread/Reply 放宽、跳过文本有效性检查、自动发布、替换用户文案、修改已有 Approval/Receipt、Git 提交或发布版本。
- 保留工作树现有修改；源代码优先于过时 Wiki 初始化摘要。

## Acceptance

1. 超过 280 加权字符的 Single 通过本地文本长度检查，进入原有审核与计划流程，正文不截断、不拆分。
2. 同一 Single 规则适用于 Article URL 注入；URL 账户绑定和唯一占位符仍必须验证。
3. 空白、空内容、twitter-text 禁止字符仍拒绝；URL、中文、Emoji 的加权统计保持。
4. Thread 每项及 Reply 保持 280 默认上限；证据、隐私、摘要锁定、明确发布授权和 Browser 验证不变。
5. 本地校验通过不代表账户拥有长帖权限或 X 接受发布。网页 Submit 状态与公开正文验证仍是必要边界。

## Plan

- status: confirmed
- active_plan: 本页内联计划
- 新增单元与集成失败用例，先观察预期失败；最小修改字符策略及两个调用点；运行针对性、类型、构建与回归验证；回填实际结果。
- Single 显式选择无本地长度上限；标准校验默认仍为 280，不引入无限长度的错误平台承诺。

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | 用户明确授权 | 2026-09-03 |
| design | done | Scope / Acceptance | 2026-09-03 |
| plan | done | 本页内联计划 | 2026-09-03 |
| development | done | 三处生产实现、格式提示、dist 与 manifest 已同步 | 2026-09-03 |
| testing | done | [验证记录](../verification/x-long-single.md)，passed-agent-local；独立代码复核 | 2026-09-03 |
| archive | done | [交接](../handoff/x-long-single-handoff.md)；未发布、未提交 | 2026-09-03 |

## Verification

全仓回归在格式提示修正前为 1231 passed / 1 skipped；最终提示修正后 X / X Article / Bundle 51 个测试文件、560 项测试全部通过，含本次直接覆盖的 34 项测试。类型、lint、构建、manifest、diff 检查通过。详见[验证记录](../verification/x-long-single.md)。验证级别为 agent-local，独立复核没有必须修复项；不是 CI 或真实 X 账户发布验收。
