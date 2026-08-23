# Bilingual README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Completed steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the version-list-first repository landing page with an onboarding-first English README and a semantically aligned Simplified Chinese README.

**Architecture:** Keep `README.md` as the default English landing page and add `README.zh-CN.md` as its Chinese semantic mirror. Both files share one section contract, one set of verified commands and links, and the same capability and trust-boundary claims; wording is adapted naturally for each language rather than translated line by line.

**Tech Stack:** GitHub-flavored Markdown, Node.js 20.19+, pnpm 11.19, PowerShell-compatible repository checks, existing TypeScript/Vitest acceptance suite.

## Global Constraints

- The primary reader is a first-time GitHub visitor, including the project author returning after a long gap.
- A reader must understand the project purpose and main workflow within 30 seconds and find the offline quick start within 5 minutes.
- Keep `Pre-alpha` visible near the top of both files.
- `README.md` remains the English default; `README.zh-CN.md` is the Simplified Chinese entry.
- Both files use the same section order, commands, capability boundaries and maturity claims. All content-link targets are identical; the reciprocal language-switch links are explicitly exempt because each necessarily points to the opposite README.
- Organize capabilities by user workflow, not by V1/V2.x release blocks.
- Preserve a compact two-column evolution table covering V1, V2, V2.1, V2.2, V2.3 and V3.
- State only capabilities supported by current source, contracts, tests and committed documentation.
- Do not describe autonomous topic selection, approval-free publishing, automatic Claim promotion, automatic memory, automatic evolution, cloud/team Wiki or credential storage as supported behavior.
- Do not expose workstation paths, account data, Receipt identifiers or persistent Workspace data.
- Do not claim that Project Development Copilot is integrated with `llm-wiki-runtime`.
- Do not modify source code, Schema, Profile, SCP, Mapping, Quickstart, Runtime, persistent Wiki data or package metadata.
- Implementation changes are limited to `README.md` and `README.zh-CN.md`.

---

## File Map

- Modify: `README.md` — English onboarding-first repository landing page and language switch.
- Create: `README.zh-CN.md` — natural Chinese semantic mirror with identical commands and navigation targets.
- Read: `package.json` — authoritative Node.js, pnpm, scripts, package name and license metadata.
- Read: `docs/guides/quickstart.md` — authoritative publication workflow entry point.
- Read: `docs/guides/memory-loop.md` — authoritative V2.3 governed-memory flow.
- Read: `docs/guides/skill-harness-llm-wiki-runtime-integration.zh-CN.md` — Runtime integration boundaries and reusable onboarding path.
- Read: `docs/architecture/research-publishing-harness-design.zh-CN.md` — system intent and architecture.
- Read: `harnesses/research-publishing/cli/index.ts` and `tests/` — implemented commands and verified behavior.

## Shared Section Contract

The two README files must contain these sections in this order:

1. Project title, language switch and visible `Pre-alpha` positioning.
2. A concise description of the deterministic control layer around AI-assisted research and writing.
3. `Why this exists` / `为什么需要它`.
4. `How it works` / `工作方式`, including the same compact text flow.
5. `Responsibilities` / `职责边界`, covering Domain Skills, Harness, adapters, Runtime and Human reviewers.
6. `What you can do today` / `当前可以完成什么`, grouped by workflow.
7. `Core guarantees` / `核心保证与 Human Gates`.
8. `Quick start` / `快速开始`, with byte-for-byte identical commands.
9. `Choose a starting point` / `选择你的入口`.
10. `Repository map` / `仓库地图`.
11. `Project evolution` / `项目演进`, using the same six rows.
12. `Explicit non-goals` / `明确的非目标`.
13. `Requirements and license` / `环境要求与许可证`.

The shared flow is:

```text
Optional governed Query
          ↓
Research → Evidence → Human Review → Frozen Content Package
                                       ├→ Canonical Markdown Article
                                       ├→ X Single / Thread / Reply
                                       └→ X Article
Publication → Public Verification → Immutable Receipt
                                            ↓
                         Human-selected feedback or evidence
                                            ↓
                       Digest-bound Semantic Promotion
                                            ↓
                                 Next governed Query
```

### Task 1: Rewrite the English landing page

**Files:**
- Modify: `README.md`
- Read: `package.json`
- Read: `docs/guides/quickstart.md`
- Read: `docs/guides/memory-loop.md`
- Read: `docs/guides/skill-harness-llm-wiki-runtime-integration.zh-CN.md`

**Interfaces:**
- Consumes: the approved design at `docs/superpowers/specs/2026-08-23-bilingual-readme-refresh-design.zh-CN.md`, the Shared Section Contract above, and current repository facts.
- Produces: the canonical English section order, commands, relative links, workflow groups and capability claims that Task 2 mirrors.

- [x] **Step 1: Capture the clean baseline and authoritative metadata**

Run:

```powershell
git status --short --branch
node --version
pnpm --version
node -e 'const p=require("./package.json"); console.log(JSON.stringify({name:p.name,version:p.version,license:p.license,engines:p.engines,packageManager:p.packageManager,scripts:p.scripts},null,2))'
```

Expected: the worktree contains only the already committed design and plan history, Node.js satisfies `>=20.19`, pnpm is `11.19.x`, and package metadata reports Apache-2.0.

- [x] **Step 2: Replace the version-list-first README with the approved reader flow**

Start the file with this exact positioning block:

```markdown
# Research Publishing Harness

English

> **Pre-alpha** — A local-first, human-governed workflow for turning ongoing technical research into evidence-backed articles, X publications, and reusable research memory.

Research Publishing Harness is a deterministic control layer around AI-assisted research and writing. Models can help investigate, frame a thesis, and draft; the Harness owns what counts as evidence, which Human Gates must pass, the exact approved content, publication state, Receipts, and durable knowledge promotion.
```

Continue with the Shared Section Contract. Apply these exact content decisions:

- Explain the three central gaps as “a draft is not a verified Claim”, “a submit action is not verified publication”, and “feedback is not automatically durable knowledge”.
- Use the shared text flow unchanged.
- Describe Domain Skills as owning domain semantics and task method; the Harness as owning orchestration, state, Digest, approval and Receipt; adapters as performing bounded manual or browser handoff; `llm-wiki-runtime` as owning deterministic Query, validation, controlled copying, record writes, indexes and logs; Humans as owning review and exact confirmations.
- Group current capability under research packaging, Article/X outputs, visual publishing, Manual/Browser execution, verification/recovery and governed research memory.
- State that real browser actions require an explicitly selected, already logged-in Chrome session and are never part of CI acceptance.
- State that Context and external feedback are `data_only`, Skill/Harness code cannot write `.llm-wiki`, uncertain publication is not blindly retried, and Catalog-last keeps partial Promotion invisible to default Query.
- Preserve the exact install and doctor commands from the approved design.
- Link starting points to `docs/guides/quickstart.md`, `docs/guides/memory-loop.md`, `docs/guides/skill-harness-llm-wiki-runtime-integration.zh-CN.md`, `docs/architecture/research-publishing-harness-design.zh-CN.md`, and `harnesses/research-publishing/contracts`.
- Use a directory tree for `harnesses/research-publishing/`, `skills/`, `tests/`, `docs/guides/`, `docs/superpowers/` and `registry/`.
- Use these evolution rows: V1 content packages and Manual publication; V2 bounded Browser publishing and immutable Receipts; V2.1 visual packaging and review; V2.2 governed Runtime Query/Ingest; V2.3 evidence flywheel and Catalog-first Query; V3 new-publication X Article workflow.
- Keep non-goals concise and explicit: no autonomous topic selection, scheduling, stored credentials, approval bypass, automatic Claim promotion, blind retry, arbitrary rich HTML, cloud/team memory or real publication from CI.
- End with Node.js `20.19+`, pnpm `11.19`, optional `llm-wiki-runtime` `0.2.0` for governed-memory workflows, and Apache-2.0.

- [x] **Step 3: Verify the English document structure and links**

Run:

```powershell
rg -n '^#{1,3} ' README.md
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const file="README.md"; const text=fs.readFileSync(file,"utf8"); for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=match[1].replace(/^<|>$/g,"").split("#")[0]; if(!target||/^(https?:|mailto:)/.test(target)) continue; if(!fs.existsSync(path.resolve(path.dirname(file),target))) throw new Error(`${file} -> ${target}`);} console.log("README links OK");'
node --input-type=module -e 'import fs from "node:fs"; const text=fs.readFileSync("README.md","utf8"); const fences=(text.match(/^```/gm)||[]).length; if(fences%2) throw new Error(`Unbalanced fences: ${fences}`); console.log(`README fences OK: ${fences}`);'
git diff --check -- README.md
```

Expected: all thirteen sections appear in order, every local link exists, code fences are balanced and `git diff --check` exits 0.

- [x] **Step 4: Review the English diff against trust boundaries**

Run:

```powershell
rg -n -i 'TB[D]|TO[D]O|FIXM[E]|XX[X]|[A-Za-z]:\\|/(Users|home)/|automatic memory|automatic evolution' README.md
git diff -- README.md
```

Expected: the scan returns no matches; the diff contains only the approved onboarding rewrite and no unsupported capability claim.

- [x] **Step 5: Commit the English landing page**

Run:

```powershell
git add README.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: refresh repository README"
```

Expected: staged scope is exactly `README.md`, the diff check exits 0 and the commit succeeds.

### Task 2: Add the Simplified Chinese semantic mirror

**Files:**
- Create: `README.zh-CN.md`
- Modify: `README.md` — replace the temporary `English` label with `English | [简体中文](README.zh-CN.md)` after the Chinese file exists.

**Interfaces:**
- Consumes: Task 1's English section order, commands, relative links, evolution rows and capability claims.
- Produces: a natural Chinese document with the same informational contract and a working two-way language switch.

- [x] **Step 1: Create the Chinese README with matching positioning**

Change the language line in `README.md` to:

```markdown
English | [简体中文](README.zh-CN.md)
```

Start the file with this exact positioning block:

```markdown
# Research Publishing Harness

[English](README.md) | 简体中文

> **Pre-alpha** — 一个本地优先、由人治理的研究发布工作流，将持续技术研究转化为有证据支撑的文章、X 发布内容和可复用的研究知识。

Research Publishing Harness 是包裹在 AI 辅助研究与写作之外的确定性控制层。模型可以协助调研、提炼论点和起草内容；Harness 则负责什么可以被视为证据、必须经过哪些 Human Gates、获批的精确内容、发布状态、Receipt，以及持久知识的受控提升。
```

Use this heading map exactly:

| English | 简体中文 |
|---|---|
| Why this exists | 为什么需要它 |
| How it works | 工作方式 |
| Responsibilities | 职责边界 |
| What you can do today | 当前可以完成什么 |
| Core guarantees and Human Gates | 核心保证与 Human Gates |
| Quick start | 快速开始 |
| Choose a starting point | 选择你的入口 |
| Repository map | 仓库地图 |
| Project evolution | 项目演进 |
| Explicit non-goals | 明确的非目标 |
| Requirements and license | 环境要求与许可证 |

Translate by meaning, not sentence order. Preserve technical anchors such as `Claim`, `Evidence`, `Human Review`, `Digest`, `Approval`, `Receipt`, `data_only`, `Catalog-last`, `Runtime`, `Query`, `Promotion` and `.llm-wiki` where they name actual contracts.

- [x] **Step 2: Copy invariant artifacts without translation drift**

Copy these elements byte-for-byte from `README.md`:

- the shared text flow;
- all shell commands;
- all relative link targets;
- version identifiers and Runtime version;
- directory names;
- lifecycle and contract identifiers.

The explanatory link labels and surrounding prose may be Chinese; the destination paths must be identical.

- [x] **Step 3: Verify two-way navigation, parity and local links**

Run:

```powershell
node --input-type=module -e 'import fs from "node:fs"; const en=fs.readFileSync("README.md","utf8"); const zh=fs.readFileSync("README.zh-CN.md","utf8"); if(!en.includes("[简体中文](README.zh-CN.md)")) throw new Error("English language link missing"); if(!zh.includes("[English](README.md)")) throw new Error("Chinese language link missing"); const count=t=>(t.match(/^## /gm)||[]).length; if(count(en)!==count(zh)) throw new Error(`Section mismatch: ${count(en)} != ${count(zh)}`); console.log(`README parity OK: ${count(en)} sections`);'
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; for(const file of ["README.md","README.zh-CN.md"]){const text=fs.readFileSync(file,"utf8"); for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=match[1].replace(/^<|>$/g,"").split("#")[0]; if(!target||/^(https?:|mailto:)/.test(target)) continue; if(!fs.existsSync(path.resolve(path.dirname(file),target))) throw new Error(`${file} -> ${target}`);}} console.log("Bilingual README links OK");'
node --input-type=module -e 'import fs from "node:fs"; for(const file of ["README.md","README.zh-CN.md"]){const text=fs.readFileSync(file,"utf8"); const fences=(text.match(/^```/gm)||[]).length; if(fences%2) throw new Error(`${file}: ${fences}`);} console.log("Bilingual README fences OK");'
git diff --check -- README.md README.zh-CN.md
```

Expected: language links work in both directions, both documents have the same number of level-two sections, all local links exist, all fences are balanced and the diff check exits 0.

- [x] **Step 4: Scan the Chinese README for unfinished or unsafe copy**

Run:

```powershell
rg -n -i 'TB[D]|TO[D]O|FIXM[E]|XX[X]|[A-Za-z]:\\|/(Users|home)/|自动记忆|自动进化' README.md README.zh-CN.md
git diff -- README.md README.zh-CN.md
```

Expected: the scan returns no matches; the Chinese copy is a semantic mirror, not a claim-expanding translation.

- [x] **Step 5: Commit the Chinese README**

Run:

```powershell
git add README.md README.zh-CN.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: add Chinese repository README"
```

Expected: staged scope contains exactly `README.md` and `README.zh-CN.md`; the commit succeeds.

### Task 3: Run bilingual and repository-level verification

**Files:**
- Verify: `README.md`
- Verify: `README.zh-CN.md`
- Verify read-only: all repository files covered by `pnpm check`

**Interfaces:**
- Consumes: the committed English and Chinese README artifacts from Tasks 1 and 2.
- Produces: fresh evidence that both files are structurally aligned, locally navigable, format-clean and compatible with the repository acceptance suite.

- [x] **Step 1: Run the complete focused README audit again from committed files**

Run:

```powershell
git diff --check HEAD~2..HEAD
node --input-type=module -e 'import fs from "node:fs"; import path from "node:path"; const files=["README.md","README.zh-CN.md"]; for(const file of files){const text=fs.readFileSync(file,"utf8"); const fences=(text.match(/^```/gm)||[]).length; if(fences%2) throw new Error(`${file}: unbalanced fences`); for(const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){const target=match[1].replace(/^<|>$/g,"").split("#")[0]; if(!target||/^(https?:|mailto:)/.test(target)) continue; if(!fs.existsSync(path.resolve(path.dirname(file),target))) throw new Error(`${file} -> ${target}`);}} console.log("Committed README audit OK");'
rg -n -i 'TB[D]|TO[D]O|FIXM[E]|XX[X]|[A-Za-z]:\\|/(Users|home)/|自动记忆|自动进化|automatic memory|automatic evolution' README.md README.zh-CN.md
```

Expected: diff and link/fence checks exit 0; the content scan returns no matches.

- [x] **Step 2: Run the full offline repository verification**

Run:

```powershell
pnpm check
```

Expected: lint, typecheck, build, Vitest and offline acceptance all exit 0; acceptance reports no real publication or user Wiki write.

- [x] **Step 3: Verify final repository state**

Run:

```powershell
git status --short --branch
git log -3 --oneline --decorate
```

Expected: the worktree is clean, `main` contains the plan plus the two README documentation commits, and no push has occurred unless the user separately authorizes it.
