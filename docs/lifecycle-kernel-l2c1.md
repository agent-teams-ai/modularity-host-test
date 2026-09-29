# L2c1 TEST exclusive replacement

This checkpoint adds one `ReplacementSlot` for the fixed synthetic TEST resource.
It does not add a Get Modular or lifecycle-kernel API, a general plugin manager,
a production Host, a durable recovery protocol, or arbitrary-JavaScript isolation.
The exact TEST artifact identities are trusted immutable records; this stand
does not attest mutable files on disk.

The slot owns one route pointer, one active replacement operation, at most 256
inert terminal replacement receipts, and an inert blueprint cache. H13 continues
to own generation slots, `ExclusiveStopRecord` owns physical stop truth, and the
kernel owns staged/active/retiring authority. `requestReplacement` reserves a
candidate H13 generation before inert preflight. Capacity refusal leaves the old
route and physical resource untouched. A denied preflight closes that unused
candidate generation before returning `kept-old`; repeated denials do not consume
H13 capacity. The operation ID and raw flight are published before any trusted
callback. Concurrent or reentrant requests receive `busy` and the current ID.
Unknown or evicted IDs return `unknown-or-expired`, never a release claim.

`prepareAdmission` now separates whole selected-set admission, public Core
compilation, exact loader projection and public Assembly preparation from
construction. The former `runAdmission` remains the fused convenience path.
Prepared Assembly handles and bound factory closures belong to one fresh Host
generation and are never cached. The cache keeps only the immutable selected
graph, artifact identity and selected trusted loader function identities. Removal
compares both exact key and stored value so an old cleanup cannot evict a newer
value under a reused key.

After successful inert preflight, the route pointer is removed and the old Host
is retired. A candidate loader cannot run until H13 reports the old physical
cleanup as `closed`. A rejected stop retains the original pending close flight;
trusted readback or one explicit retry can establish release. While physical
release is unknown, the candidate's loader, factory and acquisition counters
remain zero. Every selected loader checks live grants, graph, artifact and
loader identity before invocation and after its await. Factories and acquisition
check again. The Host effect/read adapter checks live authority at the call
boundary. Following physical stop, the entire selected set is re-admitted before
staging. Staged readiness stays private until a fresh live authority check and
one synchronous `activateConstructed` plus route/cache pointer commit.

A failed candidate is physically cleaned first. Only then may a new H13
generation prepare and stage the prior exact artifact for rollback. The old Host
and its retained references never revive. Unknown candidate cleanup blocks
rollback; missing capacity, changed grants/artifact/loader or rollback failure
leaves an explicit empty route. The trusted stop API selects `old`, `candidate`
or `rollback` generation role, since attempt IDs are local to each physical
owner. Observer abort/deadline returns a pending receipt without settling the
raw replacement flight; active callback self-wait is refused.

The 21 focused scenarios exercise the physical stop barrier including real ESM
evaluation, denied last node and 65 repeated early refusals, H13 capacity,
unknown old and candidate cleanup, post-stop changes, mid-loader grant revocation,
physical rollback with at most one owner, receipt eviction, same-key cache
replacement, observer deadline and nested self-wait, including external readback/retry for
old, candidate and rollback owners. Callback-scoped operation ancestry
ends at each trusted stop/readback/retry, loader or factory settlement; a
detached observer after that settlement receives its own deadline receipt.
`closeCurrent` publishes a shutdown operation
and blocks successors until its physical stop completes. Captured artifact identity
is independent of a mutable trusted subject record. The exclusive stop delivery
gate checks the original construction ticket: detached registration after ticket
settlement is refused; a cooperative candidate must clean up any resource it
allocated after that refusal. Arbitrary detached post-settlement allocation is
outside this TEST Host guarantee. The fixture separately
counts loader calls, module markers, factory calls, resource acquisition,
physical owners/stops, effects and route publication. A missing boundary makes
its corresponding test fail. Green working-tree tests are pre-review evidence;
accepted evidence requires a committed exact source and both pinned
Core/Assembly archive pairs replayed by `pnpm evidence`.

The current canonical Consumer Module Standard at upstream main
`24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f` has full-document SHA-256
`33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`,
identical to the TEST pin. No pin migration or canonical standard revision is
needed. This is a synthetic TEST Host lifecycle boundary, not a new composition
node or production adoption profile. Production adoption remains pending.

Shared-first review: a narrow future conformance contract for opaque generation
identity, stop attempt identity and inert receipt could be owned by Extension
Foundation or a named cross-consumer contract owner (~80-140 LOC). The dependency
would run from the product Host to that contract. Artifact attestation, grants,
route policy, physical stop/readback, rollback scheduling, cache storage and
process supervision remain Host-owned. One synthetic consumer does not establish
a broad runtime SPI or justify extraction now.
