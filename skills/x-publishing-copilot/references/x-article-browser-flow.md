# X Article Browser flow

Use this branch only for a finalized Article Package and a Premium account whose target handle is explicit.

## Deterministic flow

1. Run `x-article plan` with `package_ref` and `target_account`.
2. Show the exact title, ordered blocks, visuals and Alt Text, account, audience `everyone`, adapter `browser`, action `publish_once`, package digest, and Plan Digest.
3. Obtain one content-specific confirmation, then run `x-article approve` with the unchanged Plan.
4. Run `x-article browser start` with the selected Chrome capability manifest.
5. Repeat `x-article browser next` → `x-article browser claim` → execute exactly one authorized Chrome action → `x-article browser report`.
6. Return the public URL, verification status, and immutable Receipt path only after public verification.

The approval above locks publication intent; it does not silently authorize later external mutations. Obtain action-time approval immediately before uploading a real local image and immediately before claiming the final public Publish command. Never publish twice. After a Publish command is issued, use `x-article browser resume-verification`; do not retry Publish or fall back to a Thread.

`x-article browser cancel-before-publish` is available only before the final Publish barrier. Never type, upload, or click outside a claimed semantic command. Never read cookies, credentials, localStorage, a full DOM, timelines, or private messages.
