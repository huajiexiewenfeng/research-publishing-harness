# 项目日志

## 2026-08-18

- 以 `automatic-minimal` 模式初始化项目上下文。
- 保留用户目标：迁入设计基线、生成 V1 实施计划并完成 V1 开发。
- 目标主阶段：`project-develop`。
- 下一 Gate：创建 Change Brief，锁定 V1 范围与验收标准。
- 已迁入公共设计基线并创建 `research-publishing-harness-v1` Change Brief。
- V1 范围锁定为 M0–M2；Browser/API 实现明确排除。
- 下一 Gate：通过 `writing-plans` 生成确认计划。
- 已生成并自审 V1 实施计划，进入 inline `executing-plans`。
- 完成 M0 Contracts、Shared Kernel、不可变 Package 生命周期与确定性 Gates。
- 完成 Canonical Article Harness、X Single/Thread/Reply Harness、Approval lock 与 Offline Manual Adapter。
- 完成完整 CLI、两个薄 Skill、Synthetic Fixtures、Registry、Manifest、README、Quickstart 与 CI。
- fresh verification：20 个测试文件、81 项测试全部通过；lint、typecheck、build、Manifest、Acceptance 与 diff check 通过；信任级别为 agent-local。
- Acceptance 在一次性临时工作区完成 Article 与 Manual X，结果 `network: unused`。
- V1 development 标记 done，testing 标记 passed-agent-local；已写入本地 handoff 并完成 archive，未执行 Git push。

## 2026-08-20

- 依据批准提交 `d502ac9` 与批准状态 `ff2d824`，锁定 Visual Publishing V2.1 范围并生成同日实施计划。
- 完成静态图片规范化、原子 Canonical Article Package、显式 X Asset Handoff、V2.1 Plan/Approval、受限 Browser upload/Alt、公开媒体证据与 Receipt V2.1。
- 材料化自审修复零附件 V2.1、编辑源路径冲突、Package root/path collision、上传不确定结果有限恢复及审批后源替换防护。
- 测试完整性：生产代码与 fixtures/expected values 同改；断言直接经过 Sharp、WorkspaceStore、CommandBroker、BrowserAdapter 和 Receipt validator，Fake Browser 仅替代外部页面/Host，不 mock Digest、Approval 或 Submit Barrier。
- 本地 `pnpm check` 通过并由 `.llm-wiki/verification/visual-publishing-v2-1.md` 逐项映射 20 条验收；信任级别 `passed-agent-local`，未冒充外部 CI/Reviewer。
- 独立复核复现并修复三个 P1 identity-binding 缺口：finalize 前 staged bytes 替换、Approval 未绑定 Article Package、Receipt media evidence 错配。三个真实路径回归均先 RED 后 GREEN。
- 修复后 fresh `pnpm check` 通过 40 个测试文件 / 191 项测试，manifest 64 个文件，`git diff --check` 通过；下一 Gate 为停止在 `submit_armed` 的受控 Chrome smoke。
