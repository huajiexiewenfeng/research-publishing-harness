# Research Publishing Harness 双语 README 更新设计

**状态：** 已获用户方向确认
**日期：** 2026-08-23

## 1. 背景

当前 `README.md` 准确记录了 V1、V2、V2.1、V2.2 和 V2.3 的能力，但主叙事以版本清单为中心。首次访问者需要先阅读较多实现细节，才能回答“这个仓库解决什么问题、如何工作、从哪里开始”。这也不利于项目作者在间隔一段时间后快速恢复上下文。

本次更新把 README 从“版本能力索引”调整为“首次访问者导览”，同时保留深入设计和版本资料的入口。

## 2. 目标读者与成功标准

首要读者是第一次打开 GitHub 仓库的开发者，也包括未来重新回到项目的作者本人。

更新后的 README 应让读者：

1. 在 30 秒内知道项目把持续技术研究转化为有证据、经人工确认的文章和技术交流；
2. 理解 Domain Skill、Harness、浏览器适配器和 `llm-wiki-runtime` 的职责边界；
3. 看懂从 Research 到 Evidence、Review、Publication、Receipt 和 Governed Memory 的主流程；
4. 在 5 分钟内完成安装、离线验证并找到 CLI 与 Quickstart；
5. 明确系统不会自主选题、绕过 Human Gates、自动发布或自动提升 Claim；
6. 能通过仓库地图和文档导航继续深入，而不必在 README 中消化全部协议细节。

## 3. 文件与语言策略

- `README.md` 继续作为英文默认入口。
- 新增 `README.zh-CN.md` 作为中文入口。
- 两个文件顶部提供明确的 `English | 简体中文` 切换链接。
- 两版使用相同的章节顺序、命令、链接、能力边界和成熟度表述。
- 中文版采用自然中文表达，而不是逐句机械翻译；语义与事实必须保持对齐。
- 本次不修改源码、Schema、Profile、SCP、Mapping、Quickstart 或生产工作区数据。

## 4. 信息架构

两版 README 按以下顺序组织。

### 4.1 首屏定位

- 项目名称与成熟度；
- 一句话说明项目用途；
- 一小段说明为什么生成内容之外还需要确定性 Harness；
- 语言切换入口。

首屏避免堆叠版本号和内部类型名。`Pre-alpha` 必须保留，防止读者误判生产成熟度。

### 4.2 为什么存在

用首次访问者能理解的语言描述三个工程问题：

- 生成文本不等于事实经过核验；
- 点击“发布”不等于可证明地完成发布；
- 外部反馈不等于可以自动升级为知识结论。

随后说明 Harness 通过 Claim/Evidence、Human Gates、不可变 artifact、内容绑定审批和可恢复 Receipt 解决这些问题。

### 4.3 30 秒心智模型

用紧凑流程图表达主循环：

```text
Research → Evidence → Human Review → Frozen Package
                                      ├→ Article
                                      └→ X publication
Publication → Verification → Receipt → Human-selected learning → Governed Memory
```

图后用短段落说明：模型可以辅助研究和写作，但 Harness 决定状态、Digest、审批和 Receipt；持久知识只通过受控 Runtime 变更。

### 4.4 当前可用工作流

不再按 V1/V2.x 逐段罗列，而按用户任务分组：

1. 研究内容打包与审核；
2. Markdown Article、X Single、Thread、Reply 与新 X Article 发布；
3. 图片规范化、视觉审核和受限上传；
4. 手工发布与显式授权的 Chrome Browser Host Bridge；
5. Evidence、Increment、Semantic Delta、Promotion、Index 和渐进式 Query；
6. 历史研究内容 Import 与恢复。

每组只保留最能帮助读者判断项目用途的能力。协议细节通过 Quickstart、Memory Loop、集成指南和设计文档承接。

### 4.5 核心保证与 Human Gates

README 应突出少量稳定不变量：

- Context 和外部内容始终是 `data_only`；
- Working material 不进入默认 Mainline Query；
- Content、Privacy、Visual、Publish 和 Semantic Promotion 都有明确人工门；
- Approval 绑定精确内容、账户、模式、适配器、Digest 与有效期；
- 不确定发布不能盲目重试；
- Skill/Harness 不直接写 `.llm-wiki`；
- Catalog-last 保证 partial Promotion 在默认 Query 中不可见。

### 4.6 快速开始

保留最短可复制路径：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
pnpm build
node dist/harnesses/research-publishing/cli/index.js doctor \
  --workspace ./publishing-workspace \
  --output json
```

明确 `pnpm check` 是离线验证，不需要账号、凭据、真实浏览器发布或用户 Wiki 写入。更长流程链接到 Quickstart。

### 4.7 仓库地图

用简短目录树解释：

- `harnesses/research-publishing/`：确定性领域 Harness；
- `skills/`：面向 Agent 的薄 Skill 入口；
- `tests/`：单元、集成、安全和验收测试；
- `docs/guides/`：上手与复用指南；
- `docs/superpowers/`：设计与实施记录；
- `registry/`：可验证 manifest 与 Harness 注册信息。

### 4.8 深入阅读、成熟度与非目标

文档导航优先提供：

- Quickstart；
- V2.3 Memory Loop；
- Domain Skill + Harness 接入 Runtime 中文指南；
- 架构设计；
- JSON contracts。

版本演进压缩为一个紧凑的两列表格（阶段、主要新增能力），覆盖 V1、V2、V2.1、V2.2、V2.3 与 V3；它只用于解释能力来源，不再主导 README。

末尾保留 `Pre-alpha`、运行环境、Apache-2.0 License 和显式非目标。非目标至少覆盖自主选题、无审批发布、凭据存储、通用社交媒体调度、自动 Claim 提升以及 CI 真实发布。

## 5. 事实与信任边界

- 只写当前源码、契约、测试和已提交文档能够支持的能力。
- 不把设计稿中的未来能力写成已实现。
- 不把真实一次性运行结果概括成普遍可用的云服务能力。
- 不使用“自动记忆”“自动进化”或等价夸张表述。
- 不写入本机绝对路径、账号、Receipt 标识或持久 Workspace 数据。
- 不把 Project Development Copilot 描述为已经接入 `llm-wiki-runtime`。

## 6. 实施范围

实施阶段预期只修改：

- `README.md`；
- `README.zh-CN.md`。

如果验证发现仓库 manifest 或包文件清单要求登记新 README，先报告该事实，再决定是否增加最小导航或清单变更；不得静默扩大范围。

## 7. 验证

完成后执行：

1. 检查两版章节和链接一一对应；
2. 检查所有相对 Markdown 链接存在；
3. 检查代码围栏成对闭合；
4. 扫描 `TBD`、`TODO`、本机绝对路径和夸大措辞；
5. 使用 `git diff --check` 检查空白与格式问题；
6. 运行仓库文档/manifest 相关测试；若 README 变更会进入完整验收范围，则运行 `pnpm check`。

## 8. 非目标

- 不新增产品功能或 CLI 命令；
- 不重写 Quickstart、Memory Loop 或架构设计；
- 不创建营销站点、截图、徽章矩阵或发布宣传材料；
- 不为每个历史版本复制完整 changelog；
- 不修改 Runtime、Harness 生产代码或持久知识数据。
