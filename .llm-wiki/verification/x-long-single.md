# 长 Single 验证记录

- flow_id: x-long-single
- date: 2026-09-03
- executor / authority: agent-local（非 CI、非真人验收）
- requirement: [Change Brief](../requirements/x-long-single.md)

## 实现与测试完整性

取消的是 Single 本地长度策略，不是文本有效性或发布授权。标准工具默认仍为 280，Single 两个生产调用点显式传入 `null`。`twitter-text` 原生 defaults 保留 Emoji、URL、中文权重，解析器上限同步设置，不再残留内部 280 校验。无上限的结果使用 JSON-safe `null` 表示，不向计划注入 Infinity。

新增测试先失败后实现：首轮 8 failed / 23 passed；字符策略修复后 31 passed。独立只读复核指出生成提示未按格式区分，新增 3 条测试先观察失败，再修正提示。没有删除或削弱既有断言，没有新增 mock；测试调用实际解析器、XService、临时 WorkspaceStore 和 Plan 生成器。过度 mock 风险：low。

## 已运行检查

| Check | Result | Scope |
|---|---|---|
| `node node_modules/vitest/vitest.mjs run` | exit 0；177 files passed / 1 skipped，1231 tests passed / 1 skipped | 字符策略及调用点修复后的全仓；后续仅增加格式提示语和对应测试 |
| `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` | exit 0 | 最终源码及测试 |
| `node node_modules/typescript/bin/tsc -p tsconfig.build.json` | exit 0 | 最终本地运行版 dist |
| ESLint，限定 3 个生产文件和 3 个测试文件 | exit 0 | 本次源码及测试 |
| `node --import tsx tools/build-manifest.ts` | exit 0，268 files | 最终源码摘要清单 |
| `git diff --check`，限定本次源码/测试/README/manifest | exit 0 | 空白检查 |
| 编译产物直接验证 | Single 4480 字符 valid=true / max=null；同文标准校验 valid=false / max=280；非法文本 valid=false | 本地运行入口使用的解析器 |

最终命令 `node node_modules/vitest/vitest.mjs run tests/x tests/publication-bundle --reporter=default --reporter=json --outputFile.json=.llm-wiki/verification/x-long-single-tests.json` 返回 exit 0：51 个文件、560 项测试全部通过（路径过滤也匹配 X Article）。本次直接覆盖的 3 个测试文件包含 34 项测试。原始机器报告：[x-long-single-tests.json](x-long-single-tests.json)。

实际安装 Skill 的 `invoke.mjs doctor` 在最终构建后返回 `ok: true, state: ready`。

## 独立复核

只读 reviewer 对指定源码 diff、库实现、测试、Plan 全文摘要、Approval/Submit 和公开验证边界检查，未发现 Critical/Important 问题。唯一 Minor 是统一的生成长度提示，已用 TDD 补齐。该复核未独立运行测试，不将其视为 CI 证据。

## 边界

- 起初 Vitest spawn 和构建写入受沙箱 EPERM 阻止，经执行权限审核后重跑成功；未改变测试断言规避环境错误。
- X 账户长帖权限和实际页面发布未验证，本次没有发帖、没有提交 Git，也没有消耗发布 Approval。
- Wiki Doctor 工具在当前仓库不存在，未虚称执行。
