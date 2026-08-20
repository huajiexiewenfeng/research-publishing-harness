# Browser Adapter Host Flow

Use this reference only after a V2.0 or V2.1 Browser Plan and its digest-bound Approval exist.

```text
Harness next
→ verify the command envelope and exact https://x.com origin
→ Harness claim
→ execute exactly one documented Chrome action
→ collect only the schema-approved semantic Observation fields
→ Harness report
→ discard old tab target references
→ repeat
```

The Host reuses the explicit Chrome Browser binding and its existing login. If the bound tab becomes stale, reacquire only the X tab and obtain a fresh Harness Observation before continuing. Read no Browser storage and persist no credentials, unrelated tabs, timelines, or private messages.

`next → claim → execute → report` is the only action loop. Never make a second Submit claim. A claimed Submit with an uncertain result permanently switches the workflow to read-only verification; call `resume-verification` rather than attempting another write.

Execute only the command kind and target reference in the claimed envelope. Reject a changed page revision, non-X origin, unknown command kind, unsupported Browser family, or extra Host payload. When the Chrome binding is unavailable, report `BROWSER_EXECUTOR_UNAVAILABLE` and stop instead of switching surfaces.

For V2.1, the only additional commands are `upload_attachment` and `set_attachment_alt_text`. Re-resolve Package containment, reject directory/symlink/escape, and recompute source digest and MIME before upload. Upload no arbitrary Host path. Re-observe attachment count, ordinal, type, state, Alt Text, and unchanged text before Submit.
