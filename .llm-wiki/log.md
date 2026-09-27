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
- 初始化持久 Publishing Workspace `D:\workspaces\research-publishing`；Runtime resolve 与 Harness `memory doctor` 均为 healthy。
- 首次 Query 正确返回 `empty`；用户确认精确 checkpoint Plan 后，真实 Ingest 在 `write_records` 因裸 SHA-256/规范 Digest 不一致诚实停为 partial。
- 根因定位在 Adapter wire normalization；增加 raw SHA-256 → `sha256:<hex>` 规范化及 unit/real integration 断言。同一 Approval 从 `write_records` 恢复，已完成 source copy 未重放，record 返回 `already_exists` 并安全完成 register/log。
- 后续真实 Query 返回 `loaded`，读取到首篇 Thread 的 `publication_evidence`，分类保持 `data_only` 且未提升 `manual_recorded` 的公开验证等级。
- 修复后 fresh `pnpm check`：69 个测试文件 / 297 项测试通过，离线 acceptance 通过；显式 Runtime integration 1/1 通过。

## 2026-08-23

- Research Program Orchestration V2.4 Phase 1 inline 实现完成：新增 Research Program 契约与五个 Schema、不可变 Roadmap/Topic revision、可重建 Backlog Catalog、Evidence Ready 节奏护栏、Monthly Review、Program Status 与 10 条 JSON-only CLI 路由。
- Phase 1 任务提交为 `923d914`、`1b75f75`、`0c58ee6`、`39b8269`；未修改 Article/X/Browser、`llm-wiki-runtime` 或执行真实外部写入。
- fresh 验证：聚焦 gate 10 个测试文件 / 101 项测试通过；最终 `pnpm test` 115 个测试文件通过、1 项既有 opt-in 跳过，500 项测试通过；lint/typecheck 通过。信任级别 `passed-agent-local`。
- Phase 1 verification 与 handoff 已归档；V2.4 Flow 保持 active，下一步为审阅 Phase 2 Weekly Cycle 与 Evidence Package 计划。

- 完成 Research Data Flywheel V2.3 四个阶段：Evidence/Increment、Review/Promotion/Index、Catalog-first progressive Query、Publication Flywheel 与显式历史 Import。
- Task 5 补齐 terminal-hook 与 Import CLI、Article/X 薄 Skill 路由、Memory Loop 指南、完整 Import 示例及 167 文件确定性 manifest。
- 完整离线 acceptance 真实经过 Promotion 中断/恢复、Catalog-last、Query 回绑 Package、terminal Evidence 中断/恢复、Publication Expression 与下一条未批准 Delta，并输出 AC 1–38 映射。
- fresh `pnpm check` 通过：108 个测试文件 / 457 项测试通过，1 项显式 opt-in 测试跳过；`network: unused`。
- 安全审计未发现 V2.3 宽目录 Query、直接 `.llm-wiki` 写入、凭据或用户绝对路径；命中项仅为防护检测器和 V2.2 兼容声明。
- development/testing/archive 已按 `passed-agent-local` 同步；未冒充 CI/独立复核，未 push、未访问真实 X 或执行真实 Wiki Promotion。
- 首次真实 Import 前修复发布时间绑定：新增 `thread.published_at`，Publication Expression/Index 保留历史发布时间，`imported_at` 仅表示导入与生命周期时间；聚焦测试先 RED 后 GREEN。
- 修复后 fresh `pnpm check` 通过：108 个测试文件 / 458 项测试通过，1 项 opt-in 跳过，AC 1–38 离线验收通过且 `network: unused`；验证级别为 `passed-agent-local`。
- 首次真实 Capture 暴露 Gist/Thread canonical URL 与 Increment source refs 重复；Harness 在 Evidence 边界改为保持顺序的确定性去重。真实尝试仅写入本地 Import Manifest/gap report，未创建 Evidence/Delta/Review/Promotion，也未触发 Runtime 或 X。
- source-ref 修复聚焦测试先复现 duplicate-items RED，再以 3/3 GREEN；随后 fresh `pnpm check` 再次通过 108 个测试文件 / 458 项测试及 AC 1–38 离线验收。
- 首个未批准 Delta 的语义 Review 发现 X Thread `intended_content` 错绑母稿而非包含 6 条原文的 Import Manifest；修复后聚焦测试先 RED 后 3/3 GREEN，fresh `pnpm check` 再次通过。旧 Delta 保持未 Review/未批准，作为审计证据，不进入 Runtime。
- 替代 Delta `delta_import_first_runtime_boundary_v2` 已完成 agent-prepared Review，6 个 operation 全部保留，等待一次 Promotion Plan 确认接受语义选择并授权执行。
- 首次 Plan lookup 暴露 Workspace active Profile 仍为 V2.2 snapshot；旧 snapshot 已按 SHA-256 版本化备份，并通过 Runtime `init-profile` 原子刷新到 V2.3。精确 Catalog lookup 返回首建态 `not_found`，Harness Doctor healthy。
- 已生成但未批准/未执行 Plan `promotion_plan_d48de57241b34ea5981bd69629d38ea7`，digest `sha256:00652a0191193e044d28ef0697152879867817ac8979fd9ea7801af16545d8d6`。
- 用户精确确认上述 Plan 后，Promotion 写入 6 个 immutable semantic records，但在 `write_index_shards` 安全停为 partial；Catalog 未提交，默认 Query 仍不可见，且 `reconciliation_required: false`。
- 隔离 Runtime 复现确认 Windows 路径溢出：真实 shard 目标 259 字符，原子临时路径约 296 字符。Projector/Profile 改为 `tracks/{track}/i/{generation}/{view}/{digest}.md`，聚焦测试先以 301>260 RED，修复后 11/11 GREEN；隔离真实 Runtime 写入成功。
- 修复后 fresh `pnpm check` 通过 108 个测试文件 / 459 项测试及 AC1–38；active/packaged Profile 已原子刷新并一致，旧 Plan 因 Profile/path digest 变化按设计 stale，必须生成新 Plan 并重新确认。
- Windows-safe 替代 Plan `promotion_plan_e320140f634a460ba35d31da016cb6bd` 已生成，digest `sha256:eedf7b0c36cff855deeb573ba484ae3bb2b82ddc24ee84cc633534c00f68acaf`；尚未批准或执行。
- 用户精确确认 Windows-safe Plan 后，Promotion 完整执行：6 个既有语义记录按 `already_exists` 幂等协调，3 个 Index Shard 写入成功，Catalog-last 提交成功；Receipt `promotion_receipt_a3dcd1257f774f62b696a6e15fded5ca_1` 为 `complete`。
- 独立 exact lookup 只找到一个 Catalog，内容 checksum `sha256:dc761be59746d413cb26d84f3f1db37b5e2207501b019ad29017adfefed9518f`。
- 真实 progressive mainline Query `query_first_runtime_boundary_acceptance_20260823` 返回 `loaded`，读取 `increment_skill_runtime_boundary@1`，Runtime `0.2.0`，无风险标记；Index Doctor 返回 `healthy`，校验 3 个 shard 与 6 个语义记录。

## 2026-08-24

- 完成 Research Program Orchestration V2.4 Phase 2：Weekly Cycle、2–3 Candidate Briefs、一次 Human explicit Selection/cancellation、Package V1.2、六状态 Claim Boundary、Selected-Brief Compiler、四个本地内容 Gate、结构化 Article Package、6 条 Weekly CLI 与 Article Skill 路由。
- V1.0/V1.1 Package 与旧 Research Memory/Import 状态保持兼容；`shipped` 不被解释为 `validated`，Publication Expression 使用偏序而非数字等级。
- Skill reference 经先 RED 后 GREEN 的边界测试和 `quick_validate.py` 校验；端到端验收停在本地 `article finalize`，`x/` 与 `receipts/` 均无写入。
- fresh 验证：Phase 2 focused gate 27 个测试文件 / 206 项测试通过；最终 `pnpm test` 121 个测试文件通过、1 个跳过，545 项测试通过、1 项跳过；lint/typecheck 通过。信任级别 `passed-agent-local`。
- Phase 2 handoff 已归档；未调用 Browser、未执行外部发布、未修改 `llm-wiki-runtime`、未 push/PR。下一步须先审阅并显式授权 Phase 3 Publication Bundle 计划。
- 完成 Research Program Orchestration V2.4 Phase 3：一个精确 Bundle 确认锁定 Article-first 发布意图与 TTL，派生两个 child authorization，并以 create-only Execution Binding 强制 `start` 后、`next` 前绑定。
- 新增 10 个 Bundle Schema、确定性 Audit/Publish Gate、Article Receipt 校验、严格 X Article URL 材料化、V2/V2.1 Single、逐 Receipt 绑定、joint Receipt、状态恢复、Weekly `publication_planned` 投影和 11 条 JSON-only CLI。
- X Publishing Skill 固化一次确认、bind-before-next、unknown 只读恢复、禁止重放 Submit、Memory Promotion 另行确认；Fake Host 观察到 `publish_article_once` → `submit_once` 且 `network: unused`。
- fresh 验证：Phase 3 聚焦 21 个测试文件 / 59 项测试通过；最终 141 个测试文件 / 611 项测试通过，1 个文件 / 1 项测试显式跳过；ESLint、typecheck、build、Skill validator 与 diff check 通过。
- Phase 3 handoff 已归档；未执行真实 Browser/X/GitHub/Runtime/Wiki 操作，Weekly Cycle 未越过 `publication_planned`。Phase 4 尚未开始，仍需独立确认。
- Phase 4 进入设计审阅：提出事实型 Weekly Outcome、默认一 Outcome 一 Increment、保守 Claim Projection、Article/Single 双 Publication Expression、Evidence、可产生新知识但不强制创新的 AI Research Synthesis，以及独立可忽略的 Continuation Proposal。
- 设计明确“固化已发生事实、保持未来研究方向可调整”：发布后 Topic 返回 `available` 而非自动 `completed`；Roadmap、下一篇文章、Claim 与 Memory Promotion 均不自动变更。规格尚待用户书面确认，未创建实施计划或修改生产代码。
- 用户确认 Phase 4 设计源摘要 `sha256:674847eb5582837cba20195eb1ed15a204335f24cf84b942d085bae4cc23fbd5`。设计 Flow 已完成；实施计划、生产代码、测试及所有外部操作仍需后续独立授权。
- 用户于 2026-08-25 明确要求开始 Phase 4 实施计划。已起草九项 TDD 任务，分别覆盖 Program Closure、Research Bridge、AI Research Partner 与完整 Fake-AI 验收；当前仅进入计划审阅，未修改生产代码或测试，未执行任何外部操作。
- 用户确认 Phase 4 实施计划摘要 `sha256:9fe9cae3ddb6d07a9d4422d11ab2c43411fd31529c81c9d26cbf967f23c20891`。计划 Flow 已完成；开发仍需单独的 `开始 Phase 4 inline 实现` 授权。
- 用户于 2026-08-25 明确授权 `开始 Phase 4 inline 实现`。实现按已确认九任务计划在当前 `main` 内联推进，首先进入 Gate A / Task 1 Weekly Outcome 契约；不使用子代理，不执行真实 Browser/X/GitHub/Runtime/Wiki 写入。

## 2026-08-25

- 完成 Research Program Orchestration V2.4 Phase 4：Weekly Outcome/Closure、Cycle `published`、Topic 释放、Outcome-to-Increment/Claim Projection、Article/Single Expression 与 terminal Evidence、bounded AI Synthesis、非权威 Continuation Proposal，以及 8 条 JSON-only `research` 路由。
- 新增 `research-synthesis-copilot`，允许 `material_update`、`conflicting_evidence`、`no_material_change`、`insufficient_evidence` 四种诚实结果；不强制创新、不保存 chain-of-thought、不自动修改 Topic/Roadmap 或执行 Memory Promotion。
- TDD 安全门补齐 Evidence Manifest 隐私等级校验，拒绝 `internal -> public` 降级；并发记录按既有锁契约 fail-fast，安全重试形成下一条不可变 revision。
- Phase 4 实现提交为 `6b01bb3`、`f500ed9`、`923e6fe`、`43505c8`、`1c5a0ab`、`5ea3516`、`5557967`、`5a5a654`、`da6350f`。
- fresh 验证：focused gate 22 个测试文件 / 86 项测试通过；全仓 161 个文件 / 692 项测试通过，1 个文件 / 1 项真实 Runtime opt-in 测试跳过；lint、typecheck、build、Skill validator、acceptance 和 diff check 通过。
- Manifest 含 236 个文件、3 个 Skills，Runtime 仍固定为 `0.2.0`；离线 acceptance 返回 `network: unused`。
- Phase 4 handoff 已归档；验证级别 `passed-agent-local`，未执行真实 Browser/X/GitHub/Runtime/Wiki 写入，未创建或执行 Memory Promotion。
- 生产实现保持当前任务 inline；`writing-skills` 的新 Skill 前向验证使用了一个只读、无副作用评估子代理，该代理未修改仓库，也不构成独立代码复核。

## 2026-09-03：长 Single 本地限制移除

- 用户明确授权取消 Single 280 字符限制。字符校验、审核、Article URL 注入及生成提示已同步，Thread/Reply 保持标准限制，证据和发布授权不变。
- 全仓回归 1231 passed / 1 skipped；最后格式提示修正后的 X/X Article/Bundle 回归 560 passed。类型、lint、构建、摘要清单和 diff 检查通过；只读代码复核未发现必须修复项。
- 验证级别 `passed-agent-local`，原始报告与测试完整性记录见 [verification](verification/x-long-single.md)，后续入口见 [handoff](handoff/x-long-single-handoff.md)。没有真实发帖、Git commit/push 或发布 Approval。
