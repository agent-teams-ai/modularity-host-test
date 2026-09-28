# H13 TEST bounded recovery inventory

`TestRecoveryOwner` is a harness-held in-memory owner for the synthetic TEST
Host. `fixture(..., { recoveryOwner })` reserves one operation ID and one
`TestHost` at the entrypoint, before Assembly construction, executable imports
or resource acquisition. A caller may also pass an earlier explicit
`recovery` reservation. The caller can discard
the returned fixture and construction result and still use `close`, `read` and
`observe` by ID. The operation ID is diagnostic, not plugin authority. Ordinary
legacy fixtures remain outside this bounded recovery path.

At most 64 unresolved generations are admitted. A 65th reservation throws
`recovery-capacity-refused` synchronously before fixture work. An accepted
generation owns its slot until proven full physical cleanup, including when its
current construction or cleanup Promise has settled with debt. Close of an
existing ID never reserves another slot. An observer deadline or cancellation
changes only that observer's receipt; the raw flight, resources and slot remain.
The owner publishes its close flight before `TestHost.close()` can invoke abort
listeners or cleanup callbacks, so reentry sees the same ID and flight. H06
cohort members each retain their own generation slot. Member close still drives
the whole fixed cohort, and observation uses the cohort operation identity for
its existing self-wait and shared budget rules.

Full physical success transfers an operation to a frozen inert receipt with
`operationId`, `outcomeCode`, and the Host-authored summary `physical cleanup
complete`. The summary never reads a plugin error getter or calls its
`toString`. The owner holds the last 256 receipts in physical completion order;
insertion of the 257th evicts the oldest completion, regardless of reservation
order. Unknown and evicted IDs return `unknown-or-expired`, never `closed`.
Post-terminal `close` returns that receipt; it need not preserve the original
raw Promise identity after completion. Before completion, concurrent close
callers share the same published Promise. There is no retry, readback, durable
log, process-crash recovery or arbitrary JavaScript isolation in this slice.

Retention audit at the owner boundary:

| Reference | On proven `closed` | With debt or unknown |
| --- | --- | --- |
| Inventory map and close flight | Entry removed; receipt contains only inert scalars | Entry and original flight retained |
| Host `resource`, construction ticket/result, raw retirement flight | Cleared; post-terminal close uses a fresh inert resolved receipt | Preserved for private cleanup and diagnosis |
| Host streams, terminal callbacks, operation tickets, cleanup scopes, abort controller | Successful stream records are removed during cleanup; remaining sets/controller are cleared during compaction | Failed stream records, callbacks, tickets and controller remain owned; its abort reason is the inert Host string `host-retired`, not a stackful default AbortError |
| Host terminal cause/failure/debt | Replaced by `{ status: 'closed' }`; receipt summary is Host-authored | Original raw cause and debt remain on the unresolved Host |
| Member `cohortOwner` binding | It is no longer inventory-reachable when the member entry and cohort member reference are removed; an externally held Host may retain its binding | Binding retains the active cohort protocol |
| Cohort `members` and flight | Closed member reference is removed; aggregate flight/terminal contain inert status only | Only failed member Hosts remain; their debt stays reachable |
| Cohort observer view and waiters | View closes over the cohort's inert status and generation identities; waiters detach at terminal | Active budget/waiters may observe the retained flight without cancelling it |

The retained copies of the Consumer Module Standard and current upstream main
are the same commit `24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f` and
SHA-256 `33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`.
This changes no shared guidance, Core/Assembly/kernel API, dependency direction
or composition graph node. The boundary is a TEST Host owner, not a production
adoption or a new shared manager.

Shared-first review: Get Modular could own a narrow nominal operation identity
and inert receipt schema with conformance fixtures (about 80-130 LOC), imported
by product Hosts. The Host must continue owning capacity policy, action flights,
physical resources, observer clocks and cleanup. This one synthetic consumer
does not prove a general cross-consumer runtime SPI; no shared extraction is
accepted here.

The eleven focused H13 tests cover 64/65 admission, cleanup at capacity, debt,
deadline/cancel, lost construction handle, 257 completion-order eviction,
unknown IDs, reentrant publication, cohort sibling compaction including
stream-initiated retirement with a failed sibling, and hostile
cause getters. They use synthetic resources and real public Assembly
construction where executable work is involved. An accepted source-bound
claim requires an exact committed snapshot replay on both pinned archive
pairs; a working-tree pass alone is pre-review evidence.
