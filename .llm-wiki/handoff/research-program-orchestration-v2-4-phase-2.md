# Research Program Orchestration V2.4 Phase 2 Handoff

## Result

- flow_id: `research-program-orchestration-v2-4`
- phase: `phase-2-weekly-article-cycle`
- branch: `main`, implemented inline by explicit user decision
- baseline: `94f3c9e`
- status: Phase 2 implemented and passed agent-local verification; full V2.4 remains active
- trust: `passed-agent-local`; no CI, independent reviewer, Browser execution, external publication, Runtime mutation or push claimed

## Commits

- `cfc8e9a` — activate Phase 2 lifecycle and scope lock
- `d5ee69c` — Weekly Cycle contracts, five closed Schemas and public port
- `bd87bd6` — Human-directed Weekly Cycle Service, security and recovery
- `2825454` — Package V1.2, six-status Claim Boundary and partial-order expression
- `753fff6` — selected-Brief Compiler, four content Gates and structured Article Package
- `511ece8` — six Weekly CLI operations, Article Skill route and local end-to-end acceptance

## Delivered Contracts and Ports

- Contracts: `weekly-research-cycle/v1`, `weekly-candidate-set/v1`, `weekly-topic-selection/v1`, `weekly-cycle-cancellation/v1`, `weekly-cycle-status/v1`.
- `WeeklyResearchCyclePort`: `open`, `submitCandidates`, `select`, `cancel`, `status`.
- `WeeklyPackageCompilerPort.compile`: exact Candidate Set + Human Selection → `ResearchContentPackageV1_2`.
- Package V1.2: reviewed Memory Context plus exact Roadmap, Topic, Candidate Set and Selection refs.
- Claim Boundary statuses: `shipped | validated | observed | exploring | planned | hypothesis`.
- Expression partial order keeps `shipped` distinct from `validated`; V1.0/V1.1 retain legacy statuses and shape.

## Lifecycle and Safety Semantics

- `open` verifies the current Roadmap and semantic Plan/Snapshot/Review digest chain from local V2.3 Query artifacts.
- Candidate Sets contain exactly 2–3 different available Evidence Ready Topic revisions bound to one reviewed Context.
- Harness never ranks or chooses a Brief. Selection is create-only, `human_explicit`, exact-digest-bound, and reserves only the selected Topic.
- Exact Human cancellation is the only Phase 2 route that releases a reserved Topic; replacement uses a new Cycle id.
- Compiler copies the selected Brief topic/thesis and binds explicit Package claims/evidence/sources; it does not invent missing semantics or choose visuals.
- V1.2 review order is `research_lineage → evidence → claim_boundary → privacy`.
- Article finalization adds `evidence.json`, `claim-boundaries.json`, `source-refs.json` and `visual-manifest.json`; no Chinese file is synthesized.
- Article and X reuse one Claim Boundary language check. Finalization does not create a Publication Plan or authorize publication.

## CLI and Skill

- CLI: `program week open|submit-candidates|select|cancel|compile-package|status`.
- Article Skill sequence: Runtime Query review → Cycle open → 2–3 Briefs → stop for Human selection → compile selected Brief → Package lifecycle → Article lifecycle → stop after finalize.
- Visuals remain optional unless they materially clarify architecture, comparison, process or evidence; Human selection remains required.

## Verification

- RED evidence was observed independently for missing contracts, service, V1.2 schema/partial order, Compiler/Gates/structured artifacts, CLI routes and Skill reference.
- Phase 2 focused GREEN: 27 test files / 206 tests passed.
- Fresh final `pnpm typecheck`: exit 0.
- Fresh final `pnpm lint`: exit 0.
- Fresh final `pnpm test`: build succeeded; 121 test files passed, 1 opt-in test skipped; 545 tests passed, 1 skipped.
- Skill validator: `quick_validate.py skills/article-publishing-copilot` → `Skill is valid!`.
- Test-integrity note: production code and fixtures/expectations changed together, but assertions exercise real JSON Schema validation, semantic digests, WorkspaceStore containment/locks/create-only writes, Topic transitions, CLI subprocesses, Package/Article services and file artifacts. Mocks substitute neither Gate decisions nor lifecycle state; end-to-end verifies empty `x/` and `receipts/`.

## Compatibility and Residual Risk

- V1.0/V1.1 Package validation and legacy Memory/Import Claim contracts remain covered and byte-shape compatible.
- Runtime 0.2.0 remains source-verified/read-only at `1ebcb04`; Phase 2 did not call or modify remote Runtime source.
- Verification is agent-local, not CI or independent review.
- Browser and real publication are intentionally untested/out of scope; Phase 3 must introduce the joint Publication Bundle and approval boundary before any external action.

## Phase 3 Dependency

- Review the confirmed Phase 3 plan against the actual Phase 2 APIs before implementation.
- Phase 3 owns Article + X joint Bundle, one explicit publication approval, local publication planning and the boundary to existing Browser Adapter execution.
- Preserve Human selection, exact digest binding, at-most-once submit, and the rule that local Article finalization is not publication authorization.
- Do not create Weekly Outcome, public bootstrap content or Memory Promotion until their approved later phases.
