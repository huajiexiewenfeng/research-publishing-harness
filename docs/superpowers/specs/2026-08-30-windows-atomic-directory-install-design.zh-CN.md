# Windows 原子目录安装修复设计

## 背景

X Article Fast Path Audit 在全新工作区写入 `runs/<run-id>/x-article` 时，目标目录并不存在，但 Windows `rename` 返回 `EPERM`。`WorkspaceStore.writeNewDirectory` 当前把所有 `EPERM` 都转换为 `ARTIFACT_EXISTS`，因此产生了错误诊断，并阻断新的 Audit。

## 目标

- 保留“先完整写入临时目录，再原子安装”的事务语义。
- 只有目标目录实际存在时才返回 `ARTIFACT_EXISTS`。
- 对 Windows 短暂文件系统占用导致的 `EPERM`、`EACCES` 或 `EBUSY` 进行有界重试。
- 重试后仍失败且目标不存在时，抛出原始文件系统错误，不伪造业务错误。

## 非目标

- 不改为逐文件写入。
- 不添加非原子复制回退。
- 不修改 X Article Audit、确认或 Host Bridge 契约。
- 不操作 X 的真实草稿。

## 方案

为 `WorkspaceStore` 增加可选且仅用于文件系统边界的依赖：目录重命名函数和等待函数。生产环境默认使用 `node:fs/promises.rename` 与定时等待；测试可注入可控失败。

目录安装最多尝试 4 次：首次尝试加 3 次短重试，间隔为 25、100、250 毫秒。每次可重试错误发生后，都重新执行 `lstat`：

1. 目标存在：返回 `ARTIFACT_EXISTS`。
2. 目标不存在且仍有重试次数：等待后重试同一个原子 `rename`。
3. 目标不存在且次数耗尽：抛出原始错误。
4. `EEXIST` 或 `ENOTEMPTY` 也必须通过目标存在性检查后才能映射为 `ARTIFACT_EXISTS`。

临时目录仍由现有 `finally` 清理，成功重命名后清理是无操作。

## 验证

- 回归测试证明：一次 `EPERM` 且目标不存在时会重试并成功。
- 回归测试证明：持续 `EPERM` 且目标不存在时保留原始 `EPERM`。
- 现有测试证明：真实目标存在仍拒绝覆盖。
- 运行 workspace-store 聚焦测试、完整检查和一次真实 Fast Path Audit。

