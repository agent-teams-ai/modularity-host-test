# L2a lifecycle kernel adapter in the TEST Host

This checkpoint exercises a one-shot synthetic Host. It does not qualify a real
product Host, stream, replacement, retry, or a general plugin runtime.

`runAdmission` checks the complete selected graph with inert metadata, public
Core compilation, and exact literal loader mapping before it creates an attempt
owner. Public Assembly preparation still precedes `prepared.run`; neither step
imports an executable candidate. The attempt owner stages a kernel generation
before `prepared.run` can invoke a loader or factory.

`TestHost.construct` retains a custody lease before calling `prepared.run`, so
late acquisition can hand a resource to the same reachable owner after revoke.
The Host keeps the resource value, registration slot, raw construction result,
physical disposer, and close flight. The kernel owns generation phase and call
and custody counts. Activation and root publication follow the final synchronous
Host authority check, without an await or plugin callback between them.

Synchronous Host-mediated reads and effects acquire and release call leases.
`read` also accepts a native Promise returned by its callback: it returns that
same Promise and retains a call lease and raw ticket through its settlement.
Synchronous results and throws release immediately. Foreign thenables are not a
supported async result shape; the Host neither reads their `then` getter nor
assimilates them. If a native Promise blocks observer installation (for example,
its `Symbol.species` getter throws), `read` reports `read-observer-refused` with
the original cause and retains the unresolved call ticket. The one-shot Host
cannot prove raw settlement after that failure, so `close` stays pending and
physical disposal does not start. This L2a Host has no recovery protocol for
that hostile Promise case. `operate` holds a call lease until its raw work settles.
`close` publishes its
single raw flight, retires the generation, then signals abort. It waits for raw
construction and operation tickets, disposes the one owned resource, releases
custody, and finishes kernel retirement. A failed disposer leaves the debt and
custody reachable on the owner, while the original Assembly failure remains on
the construction result. Observer deadlines and aborts only end their wait.

The existing subprocess admission oracle checks a denied final graph node with
zero executable loader/evaluation/factory markers. The lifecycle oracle checks
staged custody before a paused acquisition, retiring custody after revoke,
absence of a published view, one late disposal, and retired zero counts. The
failed construction plus failed disposer oracle checks both causes, the retained
resource, and custody debt. These checks run only in this TEST project.

## Exact candidate provenance and replay boundary

ADR-0029 admits a private `@get-modular/lifecycle-kernel` candidate, not a
published release or a production adoption. The TEST Host pins the exact 0.1.0
tarball packed from clean Get Modular commit
`e0e2290cfcbf8d8300beaa57aee9c8337429d67d`: SHA-256
`c1f047fa0ce7396fa2430b4043524656dfe98dc0f8b5950749af9bf764238c8b`.
The copied Consumer Module Standard has SHA-256
`33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`
from the same commit. This replaces the prior standard bytes after reviewing
the new optional dynamic Host section; it does not rewrite the historical
Core/Assembly subjects or their source commits.

Both frozen replay installations retain their own exact Core/Assembly pair and
add the same kernel candidate as a separately pinned third package. The runner
checks its archive hash and SRI, manifest, both lockfiles, and installed root.
It records each run's actual Node patch. Node 24.18.0 and 24.21.0 are reviewed
replay binaries inside all three archive engine ranges. The Core/Assembly
archives still exclude Node 26, so this replay makes no Node 26 support claim.
The source worktree must be committed before an evidence report can be accepted;
uncommitted diagnostic runs remain pending, with the hashed executed files and
failed prerequisites retained.
