# H04 TEST stream terminal checkpoint

This is a bounded, single-generation TEST Host protocol on top of the L2b1
checkpoint. `retainTerminalStream` captures own data-property callbacks
`next`, optional `result` and `return`, and `close` before publishing a frozen
view. The view offers only `next()`, `result()`, `return()`, `cancel()` and
`Symbol.asyncIterator`; it exposes no raw resource, lease or generation
administration. A callback getter or foreign thenable fails closed. The TEST
result callback returns a primitive; iterator results must be plain data
records with a boolean `done`. No arbitrary Proxy or membrane support is
claimed.

Each `next` and explicit `result` admits a call before invoking its callback.
The Host keeps the call ticket through native raw settlement, using the
captured `Promise.prototype.then` instead of a mutable `.then`. Its scoped call
lease and stream close state are rechecked at the effect sink after awaits.
Public `cancel` revokes that stream's effect authority even while the owner
generation remains active; raw work remains retained until settlement. A late
`done:false` chunk after revoke is rejected, never published. `done:true` ends iteration but
does not release stream custody. `result()` is invoked only on explicit calls
and each call gets a fresh ticket. After close, both `next()` and `result()`
reject with `host-revoked` before invoking provider callbacks.

Nested stream calls retain their ancestor call context. A cancelled parent
blocks a later sibling call, and a sibling already in flight cannot commit an
effect or publish a chunk/result after the parent is cancelled. Private close/return callbacks
cannot enter normal Host effect, read, command or stream admission even when
the generation remains active during a single-stream cancel.
Every admitted nested call ticket is registered with each distinct ordinary or
terminal consumer in its context ancestry before executing callback code.
Cancel and retirement retain all those consumers until the nested raw work
settles, including fire-and-forget read/command work and transitive A -> B ->
read chains. Failed native observer installation leaves every membership as
unresolved debt.

The first public `return`/`cancel` or Host retirement closes admission
synchronously and publishes one retained close flight before callbacks can
reenter. Private Host cleanup starts consumer `close` immediately and invokes
iterator `return` once if iteration started and has not ended. Neither waits
for a pending `next`. A `return` acknowledgement is insufficient: close waits
for consumer close, supported `return(done:true)` and every already-started
`next`/`result` raw settlement. A native `return` acknowledgement is validated
inside the captured intrinsic observer before resolving an inert Host-owned
completion; a mutated thenable cannot spoof `done:true`. Only then does Host release stream custody.
Idle consumers and completed iterators do not call `return` or `result` as a
retirement prerequisite. Failed close or unsupported `return` retains debt;
independent sibling close still completes. Owned disposal follows successful
stream close and raw call drain. Observer timeout changes no raw obligation.
The Host observes its own close flight and public return derivative when a
caller fire-and-forgets cancel/return, preserving the failure for later
retirement without an unhandled rejection in the supported native Promise
case. A caller-created Promise chain remains the caller's responsibility.
The fixed TEST resource contract therefore requires its `close` and `return`
callbacks to tolerate overlap with already-admitted `next`/`result` raw work.
The Host prevents new calls and retains their debt, but cannot make an
arbitrary provider's physical resource concurrency-safe. The older L2b1
`retainStream(...).run()` path has different ownership semantics and is not
qualified by this terminal protocol.

The pinned Consumer Module Standard bytes still match current upstream
`common-assembly.md` exactly (SHA-256
`33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`).
This Host-only TEST extension does not alter Core, Assembly, kernel API, shared
module guidance or the accepted pin. The source-bound evidence runner includes
the twenty-three new H04 scenarios for both installed archive pairs and retains this
document in its worktree digest. An accepted claim requires a retained replay
from clean committed source; working-tree test passes alone are insufficient.

Shared-first review: a reusable package contract could define nominal
stream-ticket identities and terminal conformance fixtures (~80-120 LOC),
owned by Get Modular and consumed by product Hosts. Dependency direction
would remain Host -> shared policy; callback orchestration and physical cleanup
would stay in the Host. This single synthetic TEST protocol has no independent
production consumer, so extracting an SPI now would freeze unproven callback
shapes. The kernel's existing call/custody facts already cover the stable
shared invariant; this checkpoint changes no kernel API.

Limits: no H06 multi-generation cohort, H13 bounded inventory, replacement,
readback, recovery, arbitrary JavaScript isolation, real user project, agent
command, launch/provisioning or terminal runtime. Native Promise observer
installation failure remains unresolved debt, including the known process
survival limitation if an unobservable raw Promise later rejects.
