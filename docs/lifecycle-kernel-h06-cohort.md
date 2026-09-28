# H06/H09 fixed cohort TEST checkpoint

`TestCohortRetirement` owns one fixed set of at least two TEST Host generations.
Membership is checked once and then attached to each member, so an individual
member's `close` or `requestRetirement` starts the same cohort retirement. The
plugin receives a frozen request-only view. Trusted Host code may read an inert
status or observe the operation by diagnostic ID; the ID is not authority.

The owner publishes one joinable raw flight before calling any member code. It
then retires every kernel generation, closing all views and effect routes,
before signalling any abort controller. Member cleanup starts only after that
barrier. Each member keeps its H04 order: private stream close, accepted raw
work settlement, custody release, then owned resource disposal. A failed member
retains its own debt while other members continue cleanup. The aggregate
terminal is closed only if every member closed. A pending observer's deadline
or cancellation does not change the raw flight or cleanup obligations.

Host call frames now form one linked async-context chain across TEST generation
owners. Every raw call frame becomes inactive at native raw settlement. Before
enrolling a waiter or timer, trusted observation checks all active ancestors
against the affected generation set and checks active cleanup frames against
the exact operation object. This catches A -> unrelated B -> observe A and
disposer self-join while allowing a completed detached frame or a foreign
cohort with the same diagnostic ID to observe. An already active stream cleanup
adopts the cohort operation identity when its owner joins retirement. Member
read/observe routes use the cohort ID returned by member request. Inactive
ancestors neither fence unrelated streams nor inherit their consumer tickets.
Completed cleanup frames also stop denying unrelated Host operations; active
cleanup anywhere in the linked ancestry still denies ordinary admission.
Terminal facts are stored before
observer wakeups; an already stored terminal result wins at a deadline wake.

The first trusted observer with a finite deadline starts one retained observer
budget. Late joins share that deadline even when they request a later one.
`beginObservationCohort` returns its identity-bearing view while active and
creates a fresh budget only after expiry; an old observer's pending receipt is
not revised by later raw settlement. Abort signals detach individual observers
without cancelling the budget or raw retirement.

The current upstream Get Modular Consumer Module Standard remains at
`24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f`. Its canonical document and
this TEST pin both hash to SHA-256
`33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`.
No pin migration, shared guidance change or kernel API change is needed. The
new cohort boundary is a TEST Host lifecycle owner; it does not change the
Assembly module graph or count feature-local helpers as separate graph nodes.

Shared-first review: Get Modular could own a narrow nominal cohort operation
identity and conformance fixture (~80-130 LOC), with dependency direction Host
-> shared policy. The exact operation object, generation membership, deadline
budget and cleanup driver remain Host-owned. This single synthetic consumer
does not yet justify a general cross-consumer runtime SPI or manager.

The nineteen focused cohort scenarios cover synchronous abort reentry, nested
and cleanup self-wait, diagnostic ID reuse, detached frames, sibling failure,
stream prerequisites, retained observer budget, cancellation and both
deadline/settlement orders. Existing H04 focused scenarios remain
required. Evidence replay remains pending until a clean source commit and both
installed archive pairs have been run; working-tree tests are preflight only.

Limits: no H13 bounded inventory, replacement/readback, general dynamic
membership, crash recovery, arbitrary JavaScript isolation, or product Host
qualification. No real user project, agent command, provisioning or terminal
runtime was used for this checkpoint.

H13 retention seam: the cohort owner currently retains member Hosts and its
inert aggregate flight/terminal status. Each Host retains its resource,
construction result, retirement Promise and terminal debt. H13 must replace
these private references with bounded inert receipts after physical completion;
this checkpoint does not claim bounded retention.
