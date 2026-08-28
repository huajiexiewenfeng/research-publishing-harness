# X Article Existing Draft Media Completion V3.3

Use this branch only when an X Article Draft already contains the exact approved title, the complete approved body, all locked visual anchors in order, and zero media. It is a bounded media-completion transaction, not a second Article import and not publication authority.

## Entry contract

Invoke only the exact route:

```text
x-article browser prepare-existing-media --workspace <path> --plan <plan.json> --observation <observation.json> --capabilities <capabilities.json> --output json
```

The first input is a durable normalized Observation conforming to `x-article-browser-observation/1.0`. Before creating execution state, the Harness verifies its origin, page revision, safe source identities, target account, canonical Draft ID, exact title and body, complete unresolved-anchor manifest, zero existing media, no unknown content, and saved autosave state. Any mismatch blocks without adopting the Draft.

The resulting execution uses packaged protocol `x-article-materialization/v3.3` and mode `media_completion_v3_3`. Its binding locks the Draft ID, account, editor revision, title, document, import template, anchor manifest, zero-media precondition, and source Observation digest. The execution re-observes the same Draft before mutation; the source Observation alone never authorizes a write.

Never create a Draft or rewrite its title or body in this branch. Never reimport the document, paste Markdown, add unplanned content, select a different Draft, or infer missing anchors.

## Browser Host loop

For every step, run the exact control-plane loop:

```text
materialization-status
→ next
→ verify the immutable command, binding, account, origin, Draft, revision, payload, and asset digest
→ claim
→ execute one complete semantic Chrome transaction
→ capture one normalized post-transaction Observation
→ report
```

Only these effects are in scope:

- navigate to and observe the bound Draft;
- upload the one planned cover and verify its stable evidence;
- replace one named locked anchor with its digest-bound inline asset at the planned ordinal;
- set and read back the planned inline Alt text;
- persist checkpoints and perform final marker-free, order-preserving Draft reconciliation.

On an uncertain media effect, observe before one bounded retry. Retry only when the fresh Observation proves that no effect occurred and the Harness issues a new claim. Any ambiguous, partial, duplicated, reordered, foreign, or unverifiable effect blocks the execution.

Stop when the Harness reaches `draft_reconciled`. Preview and Publish belong to a different later workflow and require their own current evidence and authorization. Do not open Preview, run `confirm-publish`, claim `publish_article_once`, or click Publish in this branch.
