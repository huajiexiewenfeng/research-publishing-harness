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

## 2026-08-21

- 完成 X Article Browser Publishing V3：独立 compiler/Plan/Approval/Page Contract/Adapter/Public Verifier/Receipt/CLI，并保持 Post `single | thread | reply` 契约不变。
- 测试完整性：端到端测试走真实 finalized-package、WorkspaceStore、command claim、at-most-once barrier、public verifier 和 Receipt；Fake Host 只替代外部 X UI。
- fresh `pnpm check` 通过 ESLint、typecheck、build、52 个测试文件 / 230 项测试和离线 acceptance；输出 `x_article:"simulated_complete"`、`network:"unused"`、X Article Publish 命令数 1。
- 只读 Chrome smoke 复用 `@Glen56121` 登录态，验证 Articles 入口、既有空草稿 ID 和编辑器控件；未输入、上传、创建第二草稿或发布。
- V3 development 标记 done，testing 标记 `passed-agent-local`，20 条验收证据与 handoff 已归档；未执行 push/PR。

## 2026-08-22

- 用户批准 V2.2 LLM Wiki Memory Adapter 完整规格，并明确要求按设计完成开发。
- 通过只读跨项目边界检查核对 `llm-wiki-runtime` 0.2.0 的 JSON CLI、Profile、SCP 与 Mapping 契约；远端源码 commit 为 `1ebcb04b9cb6ecd129af0386f59e469a2f2853ac`。
- 手工登记 source-verified dependency `edge-001`，并创建 cross-ref `llm-wiki-runtime`；未修改远端项目。
- 完成 V2.2：Package 1.1、确定性 Query/Snapshot/Review、Receipt-bound Feedback、Candidate Insight/Evidence Review、两类精确批准 Ingest、受限 Runtime Adapter、CLI 与两个薄 Skill 已交付。
- 真实 Runtime integration 暴露并修复两处 0.2.0 契约错位：`copy-source` 受控 metadata，以及 `write-record` 必须引用 Runtime 由 source checksum 推导的真实 `source_id`。
- 恢复审计新增 `MEMORY_INGEST_RECONCILIATION_REQUIRED`：幂等步骤可按 write-ahead 状态恢复；结果不确定的非幂等 `register-artifact` 不自动重放。
- fresh `pnpm check` 通过：69 个测试文件 / 296 项测试通过，1 个显式真实 Runtime 测试默认跳过；离线 acceptance 的四个 Memory 闭环信号全部完成且 `network: unused`。
- 显式本地 `llm-wiki-runtime` 0.2.0 integration 在临时 Workspace 1/1 通过；manifest 112 个文件；`git diff --check` 通过。
- 22 项验收证据和 handoff 已归档，信任级别 `passed-agent-local`；未写用户真实 Wiki、未访问真实 X、未 push/PR。
