# Weekly Research Cycle

Use this flow when the user wants the weekly research plan to produce an evidence-backed English technical article. The Skill shapes candidate semantics and prose; the Harness owns exact refs, lifecycle state, Gates, and immutable artifacts.

## Required sequence

```text
memory query plan → execute → review
program week open
Codex proposes exactly 2–3 different Candidate Briefs
program week submit-candidates
STOP for Human selection
program week select
program week compile-package
package build → review → freeze
article prepare → accept-draft → review
article visual status → attach/review when a Human selects a useful Visual
article finalize
STOP: finalization is not publication authorization
```

The Runtime Query and its Human Review must happen first. Candidate Briefs bind the same current Roadmap revision and reviewed Context, and each Brief must point to a different available Evidence Ready Topic.

Never auto-select, rank, score, or infer the chosen Brief. `program week select` accepts only the Human-named Brief and `selection_source: human_explicit`. Compile only the selected Brief; a changed Candidate Set makes the prior selection stale.

If an Evidence Gate fails after selection, run `program week cancel` with the exact Selection digest and the Human reason. Cancellation releases the reserved Topic. Only then may a replacement Cycle with a new stable `cycle_id` be opened for the same week. Never switch Topics inside an existing Cycle.

## Visual boundary

Recommend 1–2 Visuals only when architecture, comparison, process, or evidence becomes materially clearer. Do not create decorative Visual requirements. The Human selects any candidate asset; unresolved optional Slots remain warnings.

## Publication boundary

Article finalization produces a local Canonical Article Package. It does not create a Publication Plan, approve X, call a Browser Adapter, or authorize an external write. A separate user-requested publication flow and its own explicit approval are required.
