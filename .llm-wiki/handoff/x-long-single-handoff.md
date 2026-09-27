# 长 Single 本地支持交接

- flow_id: x-long-single
- [需求与范围](../requirements/x-long-single.md)
- [验证与测试完整性](../verification/x-long-single.md)

Single 审核、Article URL 注入和生成提示均不再施加本地 280 字符上限；Thread/Reply 保持标准上限。空白/非法文本、证据、隐私、精确摘要、Approval、Submit 和公开验证仍有效。

源码、运行版 dist 与 268-file manifest 已同步。工作树原有修改不属于本次提交范围；本任务没有 Git commit/push。最终回归汇总以验证页为准。

下一步：用用户已确认的长 Single 正文继续原有发布准备、审核、Browser Plan 及精确发布确认。不得把本次代码修改授权当作发帖授权，也不得把本地无上限误称为 X 平台或账户无限制。
