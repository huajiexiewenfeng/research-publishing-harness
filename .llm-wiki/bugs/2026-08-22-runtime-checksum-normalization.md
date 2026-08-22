# Bug Brief: Runtime 0.2.0 Checksum Normalization

## Identity

- bug_id: `runtime-checksum-normalization-2026-08-22`
- flow_id: `llm-wiki-memory-adapter-v2-2`
- status: fixed-and-verified-agent-local
- discovered_at: 2026-08-22

## Symptom and Reproduction

- First persistent `publication_checkpoint` Ingest stopped honestly at `write_records` with `MEMORY_RUNTIME_PROTOCOL_ERROR`.
- `validate_mapping` and `copy_source` were confirmed; register/log were not issued.
- Runtime 0.2.0 returned a raw 64-character SHA-256 checksum while Harness contracts require `sha256:<hex>`.
- Reproduced through the real Harness CLI, pinned local Runtime 0.2.0 and `D:\workspaces\research-publishing`.

## Expected Behavior

The restricted Adapter must normalize the pinned Runtime's wire representation into the Harness `Digest` contract before Query Snapshots or Ingest Receipts consume it.

## Scope

- active: `harnesses/research-publishing/adapters/llm-wiki/runtime-adapter.ts`, Adapter and real Runtime integration tests
- read-only external: `llm-wiki-runtime` 0.2.0 via source-verified `edge-001`
- excluded: Runtime source changes, Plan/Approval mutation, manual Wiki edits

## Root Cause

The Adapter accepted Runtime checksums with a TypeScript cast in Query and passed raw write envelopes through unchanged. Unit fakes used already-prefixed digests, so they did not represent the real 0.2.0 wire format. The first real integration asserted status/path but not checksum shape.

## Fix

- Normalize exact raw `[a-f0-9]{64}` values to `sha256:<hex>` at the Adapter boundary.
- Preserve already-prefixed canonical digests and reject invalid Query checksum shapes.
- Normalize copy/write envelopes and Query items.
- Add unit and real Runtime assertions for copy, write and Query checksum format.

## Recovery Evidence

- Original Ingest Receipt: `partial`, cursor `write_records`.
- Resume used the same exact Plan/Approval and did not replay the confirmed source copy.
- Runtime returned `already_exists` for the record that had been written before the first protocol check failed; Harness accepted this as idempotent success.
- Final Receipt: `memory_receipt_9ea532f99d2a4d4c993bea26dd3dab27`, status `succeeded`.
- Next real Query returned the publication record as one `data_only` Context item with canonical checksum.

## Verification

- focused Adapter tests: 5/5 passed.
- explicit real Runtime 0.2.0 integration: 1/1 passed.
- `pnpm check`: 69 test files / 297 tests passed; 1 explicit-path test skipped by default; offline acceptance passed.
- no real X action and no direct `.llm-wiki` write by Skill/Harness.

## Residual Risk

The separate Runtime 0.2.0 `register-artifact` non-idempotency boundary remains unchanged. An uncertain register result still requires reconciliation and is never blindly replayed.
