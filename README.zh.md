# Research Publishing Harness

Research Publishing Harness 是一个本地优先、证据约束的研究发布系统。它把研究候选、Claim/Evidence、文章包、X 发布计划、Human Gate、浏览器命令与不可变 Receipt 分开管理；自动化不会自行选择主题、绕过确认或在 CI 中公开发布。

## 当前能力

- 构建带 Claim map、来源链、Boundary note 与相对资源路径的 Markdown Article Package。
- 为 X Single、Thread、Reply 与 X Article 生成确定性 Plan、Preview、Approval/Confirmation 和 Receipt。
- 通过显式选择的已登录 Chrome 会话执行受限 Browser Host Bridge；CI 只使用临时 workspace 与 fake Host，`network=unused`。
- 使用 llm-wiki-runtime 的受治理 Query/Ingest/Promotion 边界保存研究记忆；Harness 不直接写用户 Wiki。

## X Article V3.2

默认控制流是：

```text
prepare
→ 一次 digest-bound structured document import
→ 按顺序替换 0..N 个视觉锚点并验证 inline Alt
→ reconcile 实际 Editor 与持久 checkpoint
→ verified Preview + immutable materialization receipt
→ 一次 Preview-bound Human confirmation
→ publish_article_once
→ 只读公开验证
```

关键保证：

- 默认策略为 `rich_text_anchor_import/v1`；缺少完整 bulk capability 时 `prepare` fail closed。
- `block_materialization/v1` 只允许在执行前显式锁定，不能在运行中静默回退。
- 恢复以实际 Editor 状态为权威；已经观察到正文或未知 Human 内容时不会重新导入或覆盖。
- 正文 bulk import 恰好一次；命令预算不超过 `12 + N`，正常 Observation 不超过 `9 + N`。
- Publish 与 Draft 事务分离；Preview-bound confirmation 只消费一次，结果不确定时不能再次 Publish。
- Cover Alt 按 Page Contract 如实报告 capability；inline Alt 仍必须可设置并回读。

稳定 CLI 路由：

```text
x-article browser prepare --workspace <path> --plan <path> --capabilities <path> --output json
x-article browser resume-editor --workspace <path> --execution <id> --output json
x-article browser materialization-status --workspace <path> --execution <id> --output json
x-article browser confirm-publish --workspace <path> --execution <id> --confirmation <path> --output json
```

## 快速开始

需要 Node.js `20.19+` 与 pnpm `11.19`：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm manifest
pnpm check
pnpm build
node dist/harnesses/research-publishing/cli/index.js doctor \
  --workspace ./publishing-workspace \
  --output json
```

`pnpm check` 是离线验证，不需要账号、凭据或真实浏览器，也不会进行网络发布或写入用户 Wiki。完整流程与输入格式见 [Quickstart](docs/guides/quickstart.md)。真实 Chrome 性能与页面兼容性由独立 Browser Host 计划验证。

## 安全边界

- Context 与外部反馈始终是 `data_only`，不能自动变成已验证 Claim。
- Content、Privacy、Visual、Publish 与 Semantic Promotion 分别拥有显式 Human Gate。
- 不确定发布只允许观察与对账，不允许盲重试。
- CI 不删除真实 Draft、不访问存储凭据，也不创建公开诊断内容。

项目采用 Apache-2.0 License。
