# Bug Brief: 2026-08-20-visual-publication-evidence-binding

## Summary

- title: Bind visual publication bytes, approval identity, and receipt evidence
- status: done
- flow_id: `2026-08-20-visual-publication-evidence-binding`
- severity: P1
- owner: Codex
- updated_at: 2026-08-20

## Routing

- intent: 修复 V2.1 独立复核发现的三个发布证据边界缺口。
- primary_stage: `project-fix`
- secondary_bridges: `systematic-debugging`, `test-driven-development`, `verification-before-completion`
- confidence: high
- reason: 三个缺口均已通过当前代码的可重复执行路径复现。
- next_gate: Controlled Chrome smoke under the parent V2.1 flow
- routed_at: 2026-08-20

## Source

- path/url/log/user_report: parent review of commit `afa6200`
- source_proxy: 本 Bug Brief 中的复现摘要；不保存临时目录或原始二进制。
- sensitivity: internal project evidence only

## Symptom

1. 已选择并审核的 staged visual 在 finalize 前被替换，Article Package 仍可生成。
2. Approval 生成后替换 `article_package.root` 或 `article_package.digest`，原 Approval 仍可通过。
3. Receipt 使用错误的 `asset_id`、`source_digest` 和 `target_ordinal`，仍可声明 finalized。

## Expected

- finalize 必须重新读取 staged bytes，并与候选记录的 digest 一致后才可安装 Canonical Package。
- 一次确认必须绑定完整可执行 Plan，包括 Article Package identity；任何 Package identity 变化都使 Approval 失效。
- Receipt media evidence 必须逐字段匹配 Plan 中唯一授权附件的身份和目标 ordinal。

## Evidence

- 当前 `article-service.ts` 使用记录中的 digest 构造 Package identity，但复制 staged bytes 前没有重新校验。
- 当前 V2.1 `plan_digest` 只哈希 `intent`，而 `article_package` 位于 intent 外。
- 当前 Receipt 只校验附件存在性和验证布尔值，不校验 media evidence 与附件身份的对应关系。

## Reproduction

- status: reproduced
- command_or_steps: 分别篡改 staged file、批准后的 article_package、Receipt media identity 后调用真实服务函数。
- observed: 三个无效对象均被接受。
- expected: 分别抛出 visual digest mismatch、approval stale、public media unverified。
- limitation: 本次只验证本地确定性契约，不执行真实 X 发布。

## Scope

- active: `article-service.ts`, `publication-plan-v2-1.ts`, `approval-v2-1.ts`, `receipt-v2-1.ts`, 对应测试与本 flow 的 `.llm-wiki` 记录
- read_only: Command Broker、JSON Schema、V2.0 contracts、已批准 V2.1 requirement
- candidate: JSON Schema（仅当生产对象形状必须变化时升级）
- excluded: Chrome/browser UI 自动化、真实 X、V2.2、外部项目
- escalation_history: none

## Diagnosis

根因是三个边界只携带身份字段，却没有在状态转换处执行完整绑定：Package finalize 未重新绑定 bytes，Approval 未绑定 Package identity，Receipt 未绑定 media evidence identity。

## External Findings

- project-id: none
- edge_id: none
- evidence: 本次缺口完全位于当前仓库本地确定性契约。
- verification_status: source-verified
- derived_staleness: fresh
- conclusion: 不依赖外部项目或平台契约即可修复。
- impact_on_current_project: none external
- suggested_handoff: none

## Fix Plan

1. 先添加三个最小回归测试并分别观察预期失败。
2. finalize 读取 staged bytes 后重新计算 digest，并在写入 Package 前拒绝不一致。
3. 将 Article Package identity 纳入 V2.1 Plan digest，从而由 Approval 间接且不可变地绑定。
4. Receipt 要求 media evidence identity 与 Plan 中唯一附件逐字段匹配。
5. 运行定向测试、完整 `pnpm check`、manifest 和独立安全复现。

## Verification

- status: passed
- commands_or_checks: three targeted Vitest RED/GREEN cycles; `pnpm check`; `pnpm manifest`; `git diff --check`
- result_summary: targeted tests passed after reproducing one expected failure each; full check passed 40 files / 191 tests with lint, typecheck, build and offline acceptance clean; manifest generated 64 files; diff check clean.
- limitation: no real X side effect
- residual_risk: pending

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | parent review plus three executable reproductions | 2026-08-20 |
| design | done | identity binding gaps traced to three state transitions | 2026-08-20 |
| plan | done | scoped five-step fix plan above | 2026-08-20 |
| development | done | three production boundaries fixed with minimal changes | 2026-08-20 |
| testing | passed-agent-local | three RED/GREEN regressions plus full `pnpm check`, manifest and diff check | 2026-08-20 |
| archive | done | parent V2.1 verification, handoff, artifact registry, dashboard and log refreshed | 2026-08-20 |

## Artifacts

- This Bug Brief
- `tests/article/article-visual-service.test.ts`
- `tests/x/approval-v2-1.test.ts`
- `tests/x/receipt-v2-1.test.ts`

## Open Questions

- none

## Residual Risk

- Real X DOM and media transcoding remain outside this deterministic fix and require the separately planned controlled browser smoke test. Verification authority remains agent-local until external CI/reviewer or owner acceptance.
