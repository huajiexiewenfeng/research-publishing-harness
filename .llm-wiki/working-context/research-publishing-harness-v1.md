# Working Context: research-publishing-harness-v1

## Scope Lock

- active: Contracts、Shared Kernel、Article、X、Manual Adapter、两个 Skills、文档与测试。
- read-only: `LICENSE` 与外部研究仓库。
- candidate: Browser/API Adapter 的协议说明。
- excluded: 真实浏览器/API 发布、自动选题、定时发布和文章平台 Adapter。

## Accepted Assumptions

- TypeScript + Node.js 是 V1 参考实现。
- JSON Schema 是跨语言契约。
- Markdown、YAML、JSON、JSONL 是持久 Artifact；SQLite 不进入 V1 必需路径。
- 模型生成由 Agent Host 完成，Harness 只交换 Generation Task 与 Draft Candidate。
- Manual Adapter 是 V1 唯一执行 Adapter。

## Escalation Rule

如果实现需要网络发布、账号凭据、私有材料、Browser/API 或新的平台 Adapter，停止并作为后续 Change Brief 处理，不扩大当前 V1。

## Verification Plan

- Unit：Schema、状态、Gate、Digest、Approval、字符计数与 Artifact。
- Integration：Article 和 Manual X Synthetic Workflow。
- Security：Prompt Injection、路径、秘密、Restricted Source 与 Claim 强度。
- Project：lint、typecheck、test、build、acceptance、`git diff --check`。

## Plan Status

- `confirmed`：用户已经明确要求计划完成后继续实现。
