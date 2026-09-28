# L2b TEST Host retained stream checkpoint

This checkpoint extends the single-generation synthetic TEST Host from L2a.
It uses the same pinned `@get-modular/lifecycle-kernel` 0.1.0 candidate and
Core/Assembly archive pairs. The L2a base already migrated the Consumer Module
Standard pin from candidate source `e0e2290` to merged Get Modular `461bff0`;
comparison found identical full bytes (SHA-256
`33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`).
The candidate kernel tarball retains its exact original source commit and hash.
No kernel API change is part of this checkpoint.

The Host now carries an admitted call lease through `AsyncLocalStorage` while
running TEST callbacks. `effect` checks that same lease at the sink, including
after an await. The context is Host-owned; the plugin receives neither the
lease nor the kernel. Once retirement revokes the generation, ordinary effects
fail even though raw work and its call ticket remain retained until settlement.
A native Promise whose raw observer cannot be installed remains unresolved debt.
Foreign thenables and object results from `operate` are rejected before their
`then` getter runs; the TEST command path accepts primitives or native Promises.

`retainStream` acquires custody for an active TEST consumer and returns only a
`run` view. Retirement publishes its single raw close flight before callback
entry, revokes the generation, signals abort, then invokes every retained
consumer's `close` through private Host cleanup context. Closing starts before
waiting for custody or raw commands. The driver waits for every stream close and
raw ticket, releases successful stream custody, then disposes the sole owned
resource and releases its custody. A failed stream close retains that stream's
custody and prevents its dependent owned disposal; successful sibling stream
close still settles. Raw cleanup Promises are observed through the captured
native `Promise.prototype.then`; a replaced `.then` cannot claim early physical
success. Foreign cleanup results and failed raw observer installation retain
custody as debt. A borrowed provider is not disposed by this owner. The
existing shared owner remains disposed exactly once across two capability views.

`requestRetirement` gives a synchronous `requested` receipt. External observers
use the existing deadline/abort policy; a callback holding the affected call
lease or running in this operation's cleanup context receives `self-wait`
instead of joining its own drain. `readRetirement` returns current inert status,
not a physical release claim while pending. Unknown operation IDs return
`unknown-or-expired`. The operation ID is diagnostic, not an authority token.

This is a bounded checkpoint, not the complete L2b claim from the plan. The
TEST stream view proves private idle consumer close before owner disposal. It
does not yet implement iterator `return`/cancel or a separate `result()` terminal,
so full H04 stream completion is pending. The borrowed-provider fixture does
not prove a real product borrowing boundary. The Host still has one generation
and one retirement operation, so cross-generation
cohort self-wait, 64 unresolved operation admission, 256 terminal receipt
eviction, and general dependency actions are pending. It does not add a public
stream protocol, replacement/readback/retry, durable recovery, or production
conformance. On Node 24.18.0, the checkpoint requires both pinned archive
replay roots to install, typecheck, pass all 73 tests and run 35 focused
lifecycle scenarios each. The accepted source-bound report is retained
separately under `evidence/accepted`.
