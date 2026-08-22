# Project Graph Edges

| edge_id | fingerprint | type | source | from_project | from_anchor | to_project | to_anchor | contract_summary | verification_status | last_verified |
|---|---|---|---|---|---|---|---|---|---|---|
| edge-001 | `dependency:research-publishing-harness:module-memory-adapter:llm-wiki-runtime:repo-llm-wiki-runtime` | dependency | manual | research-publishing-harness | `module:memory-adapter` | llm-wiki-runtime | `repo:llm-wiki-runtime` | V2.2 consumes llm-wiki-runtime 0.2.0 JSON CLI commands and Profile/SCP/Mapping v0.1 contracts; remote source verified at commit `1ebcb04b9cb6ecd129af0386f59e469a2f2853ac` | source-verified | 2026-08-22 |

## Notes

- V2.2 引入 `llm-wiki-runtime` 确定性知识访问依赖；远端仓库保持只读。
- 手工登记默认使用 `verification_status: draft`。
