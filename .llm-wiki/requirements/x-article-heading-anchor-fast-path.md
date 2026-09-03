# X Article 标题锚点与可控耗时

- flow_id: `x-article-heading-anchor-fast-path`
- parent_flow_id: `x-article-browser-host-executor-gap`
- status: executing
- source: `../../docs/superpowers/specs/2026-09-03-x-article-heading-anchor-fast-path-design.zh-CN.md`
- design_commit: `66a6df0`
- execution_authority: 用户确认书面规格后明确要求“执行”；inline，不派 Subagent。

## 为什么与变更

修复母稿以章节末尾为图片位置、数量校验遗漏语义位置的问题；缩短正常图片流程，并限制无进展空转。新增 `after_heading` 明确位置，复用旧契约和逐图事务；连续执行、局部观察、分段计时及 180 秒无进展暂停。

## Scope

- active: Article Draft/VisualSlot 的标题位置声明及渲染、X Article 编译/计划/审计、现有 Host 执行与进展控制、聚焦测试和仓库内发布指导。
- read_only: 已有 Fast Path 运行记录、文章包、当前 X 草稿及本次之前的未提交工作。
- excluded: 真实浏览器写操作、移动旧图、Preview/Publish、全局 Skill 部署、研究记忆推广、浏览器重装、跨项目修改和新代理。

## Acceptance

1. 新标题锚点从母稿到编辑器可校验，标题缺失/歧义/图在章节末尾不能冒充成功；旧已批准契约不静默迁移。
2. 每图一份完整写后验证；中间观察局部化，正常路径逐图只交付一次素材。
3. 无进展 180 秒后暂停，保留未知在途结果，不继续派发写操作；重试不重置进展历史。
4. 15 分钟仍为软目标；原始墙钟与活动耗时分开显示，完成时间不早于最终成功事件。
5. 单图 90 秒、封面加 7 图 15 分钟为待授权实测目标，不能以模拟测试代替。

## 验证与依赖

- 按 TDD 逐任务跑聚焦测试，再 typecheck、lint、build 和现有兼容回归。
- Chrome/X 沿用现有端口契约；本轮只用本地源代码及测试，不声称验证了实时外部页面行为。
- 现有 `.llm-wiki/README.md` 的 V1 状态已经过时，不作为本次实现事实；以当前代码、测试和确认规格为准。

## Plan

- active_plan: `../../docs/superpowers/plans/2026-09-03-x-article-heading-anchor-fast-path.md`
- status: confirmed
- 用户“执行”已授权按确认规格进行 inline 实施；Task 1 源码与聚焦测试已通过，Task 2–4 尚未完成。

## Flow Record

| Step | Status | Evidence | Updated |
|---|---|---|---|
| source | done | 本次故障复盘与用户指示 | 2026-09-03 |
| design | done | 确认规格 `66a6df0` | 2026-09-03 |
| plan | done | 对应的 inline 实施计划 | 2026-09-03 |
| development | active | Task 1: after_heading 类型、渲染、编译校验；其余任务未完成 | 2026-09-03 |
| testing | active | Task 1 RED 8失败；GREEN 4文件35测试通过；typecheck及聚焦ESLint通过 | 2026-09-03 |
| archive | pending | 开发与授权实测分别记录 | 2026-09-03 |
