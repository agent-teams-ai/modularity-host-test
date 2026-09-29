# L2c0 TEST staged construction and exclusive stop

This checkpoint uses only the synthetic TEST Host. It keeps the existing
`construct()` result and ordinary disposer failure semantics. No route,
replacement, cache, rollback, durable recovery or production Host claim is made.

`constructStaged(run, rootOf)` traverses public Assembly `prepared.run` and
returns an opaque token only after raw construction succeeds and Host root
extraction completes. The returned receipt contains no Assembly outcome,
`created` journal, resource, callable root or failure cause. The Host retains
those privately. It cannot publish effects or admit ordinary calls before
activation. A failure or cancellation returns only an inert status/code.

The trusted caller installs `LiveActivationAuthority` when creating the Host,
before staging. `activateConstructed(token)` checks exact token identity,
Host/generation phase and the current grant through that retained port. The
check and kernel activation are one synchronous commit. A foreign, spent or
close-revoked token cannot publish. A grant revoked after stage blocks activation.
Closing a staged Host revokes its token and disposes any acquired resource.
H13's single generation slot remains reserved until physical completion; an
unactivated terminal receipt uses `outcomeCode: constructed` and no raw product.

`ExclusiveStopRecord` is created and registered atomically by the Host with
trusted `stop(attemptId)` and `readback(attemptId)` ports. It is the owned
resource's disposer. If TEST marker I/O fails after ownership transfer, the Host
still retains the record for later readback. The first stop
gets an exact attempt ID and a single physical completion Promise before the
callback runs. A successful stop settles it. A rejected raw stop retains its
failure and leaves that Promise pending, so the original close flight and H13
slot remain live. Only trusted readback `released` can settle the same attempt.
`retry-safe` permits one explicit new stop attempt; a later readback can still
prove release without retry. `unknown` retains debt and revokes retry authority.
The old attempt ID becomes stale, and concurrent retry callers join one flight.
The Host never replays an already closed sibling resource. Stop and readback
callbacks run in the cleanup context: observation from their own callback gets
`self-wait` before waiter enrollment. Ordinary `dispose()` rejection still
produces the prior terminal `cleanup-incomplete` behavior.

The retained Get Modular Consumer Module Standard pin is upstream main
`24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f` and full-document SHA-256
`33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`.
There is no upstream delta at this checkpoint. L2c0 changes a TEST Host
lifecycle boundary, not Core, Assembly, kernel API or a new composition node.
The TEST adoption remains pending for any production consumer.

Shared-first review: a narrow future contract could standardize an opaque
generation/attempt identity and inert stop receipt (~80-140 LOC), owned by an
Extension Foundation or other explicit cross-consumer contract owner. Dependency
would run from product Host to that contract. Grant policy, readback truth,
physical stop, retry scheduling, H13 storage and process supervision stay in the
Host. This one synthetic consumer does not justify a shared runtime SPI.

Thirteen focused cases prove the private stage receipt, live grant check, exact
token, preactivation cleanup and H13 outcome; the stop cases cover retained
close/slot, readback release, one retry, stale attempt, sibling non-replay,
concurrent retry and callback self-wait. All constructed cases use real Assembly
`prepared.run`. Accepted evidence requires a committed source snapshot replayed
against both pinned Core/Assembly archive pairs; a working-tree pass is only
pre-review evidence.
