# X Article Heading Anchor Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. 用户已经指定 Inline Execution；不使用 Subagent。按 checkbox 逐任务执行并记录实际验证结果。

**Goal:** 实现标题后配图、减少正常路径重复工作，并在无进展时暂停发布执行。

**Architecture:** 复用现有 ArticleService、Publication Plan 与 Complete Host Bridge。新增位置声明是可选的兼容扩展；旧 `after_section` 不被重新解释。保留逐图事务和审批边界，进展控制由同一执行器负责。

**Tech Stack:** TypeScript、Node.js ESM、JSON Schema/Ajv、Vitest、现有 Chrome Host 端口。

## Global Constraints

- 规格：`docs/superpowers/specs/2026-09-03-x-article-heading-anchor-fast-path-design.zh-CN.md`，已确认 `66a6df0`。
- Flow：`.llm-wiki/requirements/x-article-heading-anchor-fast-path.md`。
- 1 封面 + 7 正文图的 15 分钟、单正文图 90 秒均为待实测目标，不是权限硬截止。
- 180 秒无新证据暂停；未知在途动作不重复上传，暂停后禁止派发后续写步骤。
- 现有工作树有未提交 V2/Host 修改：保留它们，不整体 stage/commit，不 reset。
- 本次开发不操作 X、不部署全局 Skill、不进行 Preview/Publish。真实单图及整篇计时需要后续内容绑定授权。
- 工作树已经存在；不安装依赖、不新建工作树、不派代理。

## Context Handoff

- lifecycle_session: x-article-heading-anchor-fast-path
- user_intent: 执行已确认的标题锚点与可控耗时规格。
- active_sources: 确认规格、当前源码/Schema/测试。
- active_scope: 下列任务列出的文章编译、Host、测试与指导文档。
- read_only_scope: 历史执行、已发布或当前草稿、既有未提交变更。
- candidate_scope: 无。
- excluded_scope: 浏览器写操作、发布、全局部署、跨项目写入。
- current_gate: Scope Lock Gate 已通过。
- requested_stage_or_bridge: executing-plans + TDD，inline。
- constraints: 修改前先看到失败测试；不把模拟验证写成真实性能结果。

## Task 1 — 标题位置进入 Article Package，并阻止章节末尾误验收

**Files:**
- Modify: `harnesses/research-publishing/core/types.ts`
- Modify: `harnesses/research-publishing/contracts/article-draft.schema.json`
- Modify: `harnesses/research-publishing/branches/article-harness/article-service.ts`
- Modify: `harnesses/research-publishing/branches/x-article-harness/article-document.ts`
- Modify: `harnesses/research-publishing/branches/x-article-harness/article-compiler.ts`
- Modify: `harnesses/research-publishing/branches/x-article-harness/x-article-service.ts`
- Test: `tests/article/article-visual-service.test.ts`
- Test: `tests/x-article/article-compiler.test.ts`

**Interfaces:** `VisualSlot.placement` 与 `XArticleCompilerVisual.placement` 增加 `{kind:'after_heading'; heading_id:string; heading_text:string}`；`CompileXArticleDocumentInput.sections?: readonly {section_id?:string; heading:string}[]` 传递源章节身份，旧调用不变。

- [ ] RED：新增真实 ArticleService finalization 测试，断言输出 `## Boundary\n\n![...](...)\n\n正文`；新增编译测试，拒绝图片置于正文之后、标题不存在、文本漂移、重复 ID；重复标题使用不同源 section_id 定位。

```ts
const placement = { kind: 'after_heading', heading_id: 'runtime', heading_text: 'Runtime' } as const;
expect(() => compileXArticleDocument({
  markdown: '# T\n\n## Runtime\n\nBody.\n\n![Runtime architecture](assets/runtime.png)',
  sections: [{ section_id: 'runtime', heading: 'Runtime' }],
  visuals: [{ ...architecture, placement }]
})).toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
```

- [ ] 执行 `node node_modules/vitest/vitest.mjs run tests/article/article-visual-service.test.ts tests/x-article/article-compiler.test.ts`，确认失败原因是新位置未支持/错误位置未拒绝。
- [ ] GREEN：Schema oneOf 增加显式 after_heading；accept 校验 ID 唯一且文本匹配；render 将该组图放在 section.markdown 之前；编译根据源章节身份与同名标题次序解析绑定，验证连续图组及图序，缺失或多余同名标题直接失败。

```ts
return `## ${section.heading}${headingVisuals}\n\n${section.markdown}${sectionVisuals}`;
// headingVisuals 只来自 after_heading；sectionVisuals 保留旧 after_section。
// sections 从 finalized draft 传入 compileXArticleDocument，不从浏览器猜测。
```

- [ ] 重跑两组测试，再运行 `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`。
- [ ] 自检兼容性与本任务 diff；仅提交本任务原本干净的文件，不包含先前 Host/V2 修改。

## Task 2 — 语义位置随计划到达 Audit 和 Host

**Files:**
- Modify: `harnesses/research-publishing/core/x-article-publication-plan.ts`
- Modify: `harnesses/research-publishing/contracts/x-article-publication-plan.schema.json`
- Modify: `harnesses/research-publishing/branches/x-article-harness/x-article-service.ts`
- Modify: `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`
- Test: `tests/x-article/publication-plan.test.ts`
- Test: `tests/x-article/x-article-service.test.ts`
- Test: `tests/skills/x-article-inline-image-host.test.mjs`

**Interfaces:** 新 block placement 可选 `heading_anchor: {heading_id:string; heading_text:string; block_ordinal:number}`；已有 block placement 不变。该字段进入 Plan Digest，不增加新的批准对象。

- [ ] RED：基于有效计划给图设置错误 heading_anchor，重算 digest 后仍应被拒绝；给 Host 正确 ordinal 但错误标题上下文，应在文件交付前失败。

```ts
// semantic binding changes are not made valid by recomputing the plan digest.
expect(() => assertXArticlePublicationPlan(badHeadingPlan))
  .toThrowError(expect.objectContaining({ code: 'ARTICLE_ASSET_MISMATCH' }));
```

- [ ] 运行 `node node_modules/vitest/vitest.mjs run tests/x-article/publication-plan.test.ts tests/x-article/x-article-service.test.ts tests/skills/x-article-inline-image-host.test.mjs`，确认 RED。
- [ ] GREEN：XArticleService 从已验证的源绑定生成 heading_anchor；Plan 验证标题文本、标题序号和中间仅有同标题图片；Host 从锁定 Plan 与观察验证同一关系。Audit 已嵌入 Plan，复用该数据展示映射，不另建审批表。
- [ ] 重跑测试与 typecheck；记录本任务新增差异，保留已脏 Host 文件的原有内容。

## Task 3 — 有限进展账本、有界等待和暂停围栏

**Files:**
- Create: `skills/x-publishing-copilot/scripts/x-article-host-progress.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-host-common.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-cover-host.mjs`
- Test: `tests/skills/x-article-host-progress.test.mjs`
- Test: `tests/skills/x-article-host-bridge.test.mjs`

**Interfaces:** `createHostProgress({executionId, now, persist, restored})` 暴露 `milestone(assetId, stage, evidence)`、`assertActive()`、`run(operation)`、`pause(reason)`、`snapshot()`。恢复数据保留原始时钟和里程碑；持久化端口复用执行器的本地 checkpoint/进度存储。

- [ ] RED：可控时钟验证同一素材同一 milestone 在新 attempt 下不延长180秒；`run(() => new Promise(() => {}))` 能进入暂停；晚到 promise 完成后不允许派发下一个写步骤。

```ts
progress.milestone('asset_1', 'file_delivered', evidence);
await vi.advanceTimersByTimeAsync(180_000);
expect(progress.snapshot().status).toBe('paused');
expect(() => progress.assertActive()).toThrow();
```

- [ ] 执行 `node node_modules/vitest/vitest.mjs run tests/skills/x-article-host-progress.test.mjs tests/skills/x-article-host-bridge.test.mjs`，确认 RED。
- [ ] GREEN：timer 独立于 observe 返回运行；暂停先持久化后围栏后续写步骤；在途结果标未知并保存晚到证据。每个真正写步骤前检查围栏；不把 Promise.race 视为已撤销请求，不新增重试。
- [ ] 验证已有 deadline 软提醒测试继续通过；新增异常测试不得等待真实180秒。

## Task 4 — 连续执行、局部观察、真实时间和交接

**Files:**
- Modify: `skills/x-publishing-copilot/scripts/x-article-host-runtime.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-editor-extractor.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-host-bridge.mjs`
- Modify: `skills/x-publishing-copilot/scripts/x-article-inline-image-host.mjs`
- Modify: `harnesses/research-publishing/adapters/x/article-browser/article-browser-adapter.ts`
- Modify: `skills/x-publishing-copilot/references/x-article-fast-path-v3-4.md`
- Test: `tests/skills/x-article-host-runtime.test.mjs`
- Test: `tests/skills/x-article-editor-extractor.test.mjs`
- Test: `tests/skills/x-article-host-bridge.test.mjs`
- Test: `tests/x-article/article-fast-path-result.test.ts`

**Interfaces:** 中间上传探针只报告当前媒体/对话框/保存状态，最终仍使用 `observeXArticlePage` 完整观察。现有 next/claim/Host/report 边界不改变；连续队列消费以当前命令成功写 checkpoint 为前提，暂停围栏覆盖命令间空档。

- [ ] RED：正常单图中间状态不能多次调用整篇 extractor；连续命令失败/暂停后不再 claim；每次 observation 时间取实际时钟；result.completed_at 不早于末次成功事件。

```ts
expect(fullObservationsAfterUpload).toHaveLength(1);
expect(Date.parse(result.completed_at)).toBeGreaterThanOrEqual(Date.parse(lastSuccess.recorded_at));
```

- [ ] 执行聚焦 Host/runtime/result 测试，确认 RED；如不存在上述精确测试夹具，先复用现有真实服务夹具建立对应状态，不能仅伪造返回值。
- [ ] GREEN：中间使用局部探针，保存完成再完整观察；贯穿分段时钟和进展回调；同一会话连续消费命令、每图独立报告。未知状态暂停交接，不在线改工具。文档写入标题锚点默认、性能目标和修复分阶段规则。
- [ ] 跑受影响测试、typecheck、lint、build、packaged CLI parity 和 Fast Path acceptance；记录原有失败与新增失败的区别。
- [ ] 以文件清单和测试证据更新 Flow Record。没有真实 X 授权时把单图/1+7计时标为待验证，不宣称性能达标，不进入真实上传。

## Verification / handoff

- 聚焦基线：2026-09-03 11:41（Asia/Shanghai），2 文件、13 测试通过。
- 每个 Task 完成后记录实际 RED/GREEN 与提交/未提交范围，后续任务继承同一开发阶段开始时间。
- 当前开发阶段始于 2026-09-03 03:38 UTC 左右；60分钟提醒，90分钟默认暂停，不因切任务重新计时。
- 真实布局修正及速度验证需要新的内容绑定 Audit；本实施授权本身不是草稿写权限。
