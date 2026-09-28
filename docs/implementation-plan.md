# Modularity Host TEST stand - implementation plan

Status: adversarially reviewed execution contract; isolated TEST implementation in progress. Snapshot: 2026-09-28.
The discarded scaffold is not a source or evidence artifact. Node migration is
owned separately; recheck its result before executing this plan.

## Summary

Build one new, explicitly named `-TEST` consumer to prove two independent Host
contracts through real Get Modular public APIs: (1) reject an invalid **entire
selected graph** before any candidate executable import; (2) preserve one
Host's effect authority and cleanup ownership across revocation, late
construction, operation settlement and cancelled observation. This is a
synthetic Host contract demonstration, not production adoption or a claim that
Get Modular implements plugin lifecycle.

## Current understanding and authority

- Current Get Modular main `6b31f20fe3e5fb8324812aa2ee907905751cde71`
  has Core and Assembly. npm `latest` for both packages is `0.1.0`; source
  manifests say `0.2.0`, admitted by
  [ADR-0027](../get-modular/docs/decisions/0027-admit-the-core-and-assembly-0-2-0-correction-pair.md)
  but not published. The [GM-02 erratum](../get-modular/docs/qualification/gm02-api-erratum.md)
  records structural divergence between published 0.1.0 declarations and the
  corrected source. Results for one exact pair do not qualify the other.
- The canonical Consumer Module Standard document at main has SHA-256
  `d5bb71e5a700014f9f0a09b17d1f33d24b30b66c49b273c9fb65584672c51e4f`.
  Agent Runtime **active** main profile at `c9b8efe` pins equivalent bytes at
  `ac49bb33`; the frozen C0 record is historical, not active pin authority.
  Pin exact package archives and document bytes in the TEST project, compare
  its pin with current upstream before implementation, review any delta, and
  classify its new composition boundary as synthetic/test-only.
- Core owns graph semantics and exact bindings; Assembly owns validated
  sequential construction and raw-product handoff. Authorization, executable
  loading, live authority and cleanup belong to the Host. See
  [Consumer Module Standard](../get-modular/docs/architecture/common-assembly.md#consumer-module-standard).
- Current Agent Runtime C0 records `requiredDistinctScopes=2`,
  `provenDistinctScopes=1`, ownership admission blocked, and no reachable
  recovery owner for an unreturned construction Host with cleanup debt. A TEST
  Host cannot make K1/A1/A2 eligible. See
  [ADR-0028](../get-modular/docs/decisions/0028-authorize-the-optional-ownership-contract-checkpoint.md)
  and the current AR `architecture/c0/ar-owned-lifetime/contract.json` at
  `c9b8efe`.

### Exact execution subjects

The primary checkpoint installs **both actual published 0.1.0 archives** with
an exact lock and recorded SRI. Registry metadata and archive bytes were read
without execution on 2026-09-27: Core SHA-256
`50803ea69e2fb4078013a897f858908b4d73d26296336ab155a6118809dfb8ba`, Assembly
`e89207171e44afd5e813aa5e7a0db8abc999b42338559d38b44b4db71da228ab`.
Their declared Node range is `>=24.18.0 <25`,
so pin an exact qualifying Node 24 patch and `pnpm@11.20.0`; "Node 24" alone
is insufficient. A second checkpoint replays the same observable cases on
**both 0.2.0 archives** packed from one clean exact GM source commit, or later
on the published exact pair. Give it a separate install root, lock, archive hashes
and compiled adapter; reuse the same authored Host/scenarios where types permit.
Do not invent API differences or build a compatibility framework. Packing source
is candidate evidence, never publication evidence. The current route already
exists: `assembly:build`, then pinned `pnpm pack --pack-destination ...` in each
package, as used by GM's `tests/assembly/packed-root.test.mjs`. Run it only in a
clean disposable checkout of the chosen SHA. Verify that packed Assembly depends
on exactly that Core version, with no remaining `workspace:` range. Install both
archives; bind any necessary consumer override to the exact Core tarball. Verify
Core resolution from both the consumer and installed Assembly reaches those bytes,
not another registry copy. A replay blocker must name the actual failed prerequisite;
never substitute workspace imports or mix 0.1/0.2.
Refresh registry and engine ranges after the separate Node migration before
choosing the execution binary. A Node 26 trial of the published 0.1.0 pair is
exploratory because those immutable archives exclude Node 26. A later source or
published pair needs its own updated engine/CI evidence for supported Node 26.

## Scope and boundaries

In scope: one inert, fixed TEST inventory; a trusted test subject/grant policy;
one literal-loader table; Core compilation; Assembly preparation/construction;
one concrete Host with an in-memory effect sink and one owned resource; tests
using fresh processes and controlled promises; exact package/document pins.
All constructed lifecycle cases must traverse actual public `prepared.run`, not
merely an isolated Host unit demo; the close-before-construct guard alone has no
run to observe. These are finite synthetic contract scenarios, not a
complete CMS or XF conformance profile. Classify the stand explicitly as
test-only; do not claim production adoption or create a full adoption platform.

Out of scope: Agent Runtime production code, `@get-modular/ownership` K1,
general plugin SDK/registry, V1/V2 capability migration, arbitrary-code sandbox
security, real provider/OS effects, durable crash recovery, release publication,
or claims about all OpenClaw plugins. No agent commands, launch, provisioning,
terminal runtime, task assignment or smoke flow may run on real user projects.

No shared runtime extraction is justified by this synthetic stand. A narrow
candidate is an inert extension trust-request schema/conformance fixture
(~100-250 LOC), owned by Extension Foundation, with dependency direction
consumer Host → contract. GM retains neutral module grammar. Trusted identity,
grants, literal loaders, resource policy and effect adapters remain Host-owned.
This is an evaluated future owner/boundary, not an accepted XF public schema:
XF's own extraction and publication decisions still apply. Revisit a **narrow**
shared invariant after repeated semantics are proven in
real scopes; one production consumer with materially different scopes may
suffice. A second independent consumer is still needed to claim a general
cross-consumer runtime/SPI.

## Options

1. **Isolated TEST consumer, then exact-pair replay - recommended.**
   🎯 9/10 🛡️ 8/10 🧠 6/10. ~1,300-2,050 authored LOC for the published
   0.1.0 pair, including fixtures/tests/docs; ~150-350 additional LOC for 0.2.0 pack/typed adapter
   and evidence. It proves only the exact subject tested.
2. **TEST plus Agent Runtime production Host in one delivery.** 🎯 6/10
   🛡️ 7/10 🧠 8/10. ~2,000-3,000+ LOC. It conflates synthetic proof with
   unresolved C0 ownership and adoption; defer product work to its own PR.
3. **General shared lifecycle/plugin runtime first.** 🎯 2/10 🛡️ 4/10
   🧠 10/10. 3,000+ LOC. No repeated accepted runtime semantics yet.

## Isolated stand shape

Use a new sibling `modularity-host-TEST/` directory, with its own manifest,
lock, fixtures and evidence manifest. No production project is imported or
opened as a runtime. Candidate entrypoints are fixed files **inside this TEST
project**. Their metadata cannot choose an import path. The only effect is an
in-memory sink; the only owned resource is an in-memory disposable object.

Use four selected nodes, one unselected alternative and one sentinel:

| Node | Public relationship and purpose |
| --- | --- |
| Resource provider A | Owns one resource; provides distinct read and write facets, each with its own capability ID and stable exact token. Neither facet exposes cleanup. |
| Reader / writer consumers | Each requires only its respective facet; each provides the same action contract to the root. Both refer to the same resource identity. |
| Root | Provides no capabilities; receives exactly two actions in a `many({ min: 2, max: 2 })` slot with explicit profile order `[writer, reader]`. Its instance exposes guarded actions for the harness. |
| Alternative provider B | Same module and capability shapes, different implementation ID and behavior. Unselected by default; selecting it must change an independently specified result. |
| Sentinel | Separate module/loader/marker, never selected by the positive profile. |

Profiles contain explicit root **module IDs**, module/implementation selections
and provider implementation IDs per slot. Loader projection uses implementation
IDs. One Host capability schema has three stable contracts, with no V1/V2 pair.
The archived Assembly 0.1.0 `prepare` compares `plan.roots` with each root
handle's **implementation ID**, while Core interprets profile roots as module
IDs. Use the same literal ID for the TEST root's module and implementation so
this exact fixture traverses both public APIs. Record that constraint in the
evidence; this does not prove arbitrary distinct root IDs work on 0.1.0. Check
the 0.2.0 pair separately rather than carrying the workaround by assumption.
Its packed Assembly source checks root handles against `moduleId`; add a small
0.2.0-only distinct-root-ID probe to test that correction through `prepare`.
Keep the shared-ID fixture for the otherwise identical cross-pair scenarios.
These are planned read/write/action entries in `C`, not three GM API generations.
The graph table is conceptual until its literal typed fixture passes. Published
Core 0.1.0 declares `many({ min, max })` with `kind: "many"` and `order: "profile"`;
Assembly's declared dependency mapping yields `readonly Action[]` for that slot.
The independent oracle states expected output/order and shared-resource identity
directly; it is not generated from the profile or loader table. A deliberate swap
to B under A's loader key must fail that oracle. Required/many edges are enough;
optional slots and migration fixtures would add no evidence for this task.

Each import scenario starts a fresh `process.execPath` child with `cwd` and
marker directory under a per-scenario fixture root. Pass only allowlisted env
(temporary `HOME`/`TMPDIR`, locale and marker path); omit inherited
`NODE_OPTIONS`, auth/provider variables and real project paths. A finite
watchdog may kill **only that child**, recording infrastructure failure rather
than a passing lifecycle result. Controlled messages/deferred gates determine
interleavings; sleeps do not.

Use explicit literal declarations and explicit `assemblyFor<C>().bindFactory`
calls; no heterogeneous handle `.map()`, `any` or double casts. Both inspected
API subjects support this public sequence:

```ts
const composition = await compileComposition({ declarations, profile });
if (!composition.ok) return coreRefusal(composition.diagnostics);
const prepared = await api.prepare({ composition, factories, roots: { app: root } });
if (prepared.status !== "prepared") return prepareRefusal(prepared);
// TestHost reserves construction before this call and owns the AbortController.
const outcome = await prepared.prepared.run({ signal: hostSignal });
```

This is an interface recipe, not a drop-in implementation. `bindFactory` is
synchronous; `compileComposition`, `prepare` and `run` are async. `FactoryContext`
contains only `signal`; it has no ownership registration API. Bind the provider's
narrow owner callback through its Host-owned factory closure. A literal lazy
wrapper checks construction authority before invoking its counted loader, awaits
the actual `import()`, then checks authority **again before `mod.create`**.
`create` returns a current-realm ordinary Promise of `{ instance, capabilities }`.
Static imports of candidate factories or a candidate re-export barrel are forbidden
in metadata/wiring. Shared inert contracts use type-only imports where applicable.
Compiler negatives cover wrong token/capability/slot and missing async-constructor
await; malformed runtime products use a separate `.mjs` fixture without weakening
the positive TypeScript path. The async wrapper normalizes candidate carriers, so
these cases do not requalify Assembly's direct thenable/carrier rejection rules.

## Proposed TEST data flow

`trusted TEST inventory + inert declarations + grant policy → whole-set
admission → Core.compileComposition → selected loader projection →
Assembly.prepare with lazy factory wrappers → reserve Host construction flight
→ prepared.run → first executable import → Host readiness/root publication`.

The Host owns fixed typed declarations, literal-loader associations and trusted
inventory subject IDs. The harness supplies an independent trusted target and
grant issuer; request JSON supplies selection/claims only and cannot replace
these authorities. Parse JSON into fresh, bounded, exact data records, check
duplicates before indexing, then retain one immutable admission snapshot across
the async compile/prepare calls. Mutation of original request data cannot change
the authorized graph or loaders. No candidate-supplied live object enters these
records. Arbitrary proxies cannot be safely classified by
reflection, so this is cooperative trusted data, not a sandbox for hostile
JavaScript. The declaration's `owner.authority`
is a label, never the authenticated subject. Grants separately allow
module/implementation namespace allocation and provision of each exact capability
ID/token for the inventory subject and trusted target. For each injection, the
Host grant table also permits that consumer subject to receive that provider's
capability; Core's structural binding acceptance is not authorization to consume.
Use a few literal grant rows, not a general policy engine. Compare namespace by path segment, not
arbitrary string prefix. A plugin may provide a product-owned capability only
with an explicit grant. Check **every** selected candidate before loading the
first, including a deliberately invalid last candidate. Negative controls
include a lookalike prefix, forged owner label, wrong subject/target, ungranted
provision and a structurally valid but unauthorized injection. Reject duplicate
module selections, duplicate implementation IDs, unknown selected IDs and
ambiguous inventory associations before `Map` creation could erase duplicates.

Core compiles only the admitted complete profile. Preserve its diagnostics,
exact bindings, selected order and digest. Policy refusal, Core refusal,
mapping refusal and Assembly preparation failure have distinct phases. Project
the fixed trusted loader inventory onto **selected implementation IDs** and
require exactly one literal loader and Assembly handle per selected ID. Extra
**unselected** inventory entries, including the sentinel, are allowed. ID
matching does not prove the function points to the correct code; the independent
oracle detects the specified A/B swap, not arbitrary behaviorally equivalent code.
Bind wrappers that call `import()` only when Assembly invokes the
factory. `Assembly.prepare` must see the successful Core result, exact handles
and root handles. Preparation failure leaves loader-invocation, import-evaluation
and factory counters zero. Unexpected bind/compile/prepare throws also fail
closed in their actual pre-import phase; no fallback or second resolver is allowed.
After executable import, bad exports or thrown code are construction failures
with Host cleanup; zero-evaluation is not promised for those cases. No direct
constructor fallback or root publication after a failed/cancelled outcome.

Use one current contract per capability. [ADR-0009](../get-modular/docs/decisions/0009-keep-pre-1-0-public-api-unversioned.md)
forbids parallel pre-1.0 **GM compiler APIs**; product capability tokens remain
product-owned. Avoiding V1/V2 in this stand is a scope decision, not a claim that
the ADR bans all product migrations. A mismatched exact token is enough here.

## Host lifecycle contract

Create a concrete TestHost **before** invoking `prepared.run()` and retain it in
the harness on success, rejection and cancellation. It owns a unique per-instance
generation token, controller, one construction flight, operation tickets, one
resource slot and one retirement promise. `construct()` is one-shot: concurrent
calls join the same retained attempt; no path starts a second `prepared.run` on
that Host. A fresh Host gets fresh bound closures. Retained roots in the harness
serve negative tests only; the scenario's final public summary contains no live
root. This creates no global manager, registry or recovery protocol.
`construct()` returns a Host outcome with a root only on readiness; preserve the
actual Assembly outcome separately. `status()` returns an immutable state/debt
snapshot. The harness retains this owner in a `try/finally` that starts `close()`
on every exit, including construction failure, and observes cleanup separately.

States: `open → sealed → draining → closed | cleanup-incomplete`. Readiness is a
separate flag: factories may acquire/register, but exposed operations require
both open authority and a published root. `pending` is an observer receipt, never
a terminal Host state. Close before construction refuses construction and cleans
nothing; the lifecycle scenarios themselves construct through public Assembly.

**Reserve before invocation.** In one synchronous turn, check admission, publish
a joinable construction/operation ticket, then invoke user code. Settle each
ticket on synchronous throw and async fulfillment/rejection. Tracking must observe
rejections immediately without replacing the caller's original outcome or leaving
an unhandled `.finally()` chain. The construction ticket spans lazy loading,
factory settlement, acquisition registration and the Host publication decision.
After Assembly succeeds, recheck Host authority immediately before setting ready
and publishing the root, with no await/callback in that commit. A seal between
Assembly success and the Host continuation yields a Host cancellation/no root,
while preserving the actual Assembly outcome for evidence.

**Acquisition is distinct from new authority.** The provider reserves its owner
acquisition under the live construction ticket **before** starting allocation.
Reservation is synchronous and requires the Host to remain `open`; a live
construction ticket alone cannot authorize a new reservation after seal.
Registration is synchronous at delivery of the resource and before the factory's
next await or exposure. An already reserved allocation may complete after seal:
its owner still registers and cleans the late resource before construction settles.
The registration callback validates the exact Host/ticket and pre-seal reservation,
rejects duplicates and rejects calls after ticket settlement. It is never exposed
in capabilities. A late import does not admit a new factory/acquisition: the
wrapper's post-import fence refuses `create`, so this case has zero acquired
resources/disposals. A detached
callback with no live admitted ticket cannot acquire or append cleanup debt after
closure. Detached work, an unregistered allocation and arbitrary top-level effects
remain outside the cooperative fixture contract.

**Close order is fixed.** `close(): Promise<CloseTerminal>` is a normal, non-async
method so all callers receive the **same raw Promise object**:

1. Seal authority and synchronously create/store the deferred retirement promise.
2. Freeze new ticket admission; invoke `abort()` only after the flight is visible.
3. Drain the construction and every pre-seal operation ticket with `allSettled`;
   one rejection never releases another pending operation. No new operation can
   enter this finite cohort after seal. Late registered resources stay covered by
   their construction ticket.
4. Invoke the sole resource disposer once, if acquired. Catch both a synchronous
   throw and an async rejection. No resource means zero disposer calls.
5. Store `closed` after full success, or `cleanup-incomplete` with retained resource
   debt/cause after disposal failure, **then** resolve the raw terminal promise.

`CloseTerminal` always resolves one of these terminal results; original
construction/operation errors remain in their own outcomes. Neither a rejected
operation alone nor an observer timeout is cleanup debt. A never-settling factory,
operation or disposer leaves retirement draining/nonterminal. There is no automatic
retry, reset or second cleanup driver. Reentrant close from an abort listener or
inside the disposer returns the same flight. A factory, operation or disposer
must not **await** its own Host's close: that self-join cannot complete. Synchronous
abort listeners are cooperative and must not throw; hostile listeners are outside
this stand's guarantee.

**Fence at the effect boundary.** Every exposed method, including saved and
extracted methods, captures the Host generation and checks readiness/authority
before ticket admission. Recheck immediately before each post-await sink write;
check and write form one synchronous block with no await or user callback between
them. Reads of the owned resource require the same live authority. All mutable
sink access stays inside this adapter; consumers get no raw sink/disposer. Seal
refuses new work and future commits, while accepted work may settle later. A new
Host can work while the old retained handles stay revoked. This proves a local
in-memory fence, not physical cancellation of an already-sent external effect.

**Observer cancellation has its own outcome.** `observeClose({ signal, deadlineAt })`
observes an already-started close; calling it beforehand rejects with a stable
`close-not-started` error and changes no Host state. The optional deadline is an
absolute value in the Host's monotonic clock; invalid/nonfinite values reject
without affecting retirement. The returned Promise yields a fresh immutable
`pending` (reason `aborted` or `deadline`), `closed` or `cleanup-incomplete` receipt.
The raw cleanup cause remains opaque. Observing has no authority to abort cleanup.

At enrollment and in each wake callback, a stored terminal result wins. Otherwise
an already-aborted signal wins over an already-expired deadline; after enrollment,
the first observer wake while raw work is nonterminal fixes that observer's pending
receipt. No later terminal outcome retroactively edits it. Later observers read
the actual terminal result. Cover both same-turn orders explicitly. Keep removable
observer entries and clear their own signal listener/timer on every exit; do not
attach an unremovable closure to a forever-pending raw Promise for every observer.
A small stand-local clock/timer adapter permits controlled deadline delivery; it
adds no product API or generic scheduler. Verify aborted, expired and terminal
observers leave zero retained waiter/listener/timer entries.

**Assembly is a handoff, not cleanup authority.** Inspect its exact outcomes:

- Factory rejection has no returned current product; previously created entries
  remain. A registered allocation is still owned by the reachable TestHost.
- Malformed late fulfillment returns `failed`, with that same raw `returned`
  product absent from `created`; observed abort is recorded separately.
- Valid late fulfillment is appended once to `created`, then cancellation stops
  further factories/publication. It is not also a `returned` product.

Do not reflect on arbitrary product contents to discover disposers or dispose
through both journals and the owner slot. The slot is the sole cleanup authority;
`created`/`returned` identities are independent handoff observations. Cleanup debt
remains queryable through the retained Host even when construction returned no
root. An owner that was never retained cannot be recovered by this demonstration;
production still needs its actual owner/readback path. Construction success is not
readiness, and a plan digest is not a generation identity.

## Required controlled interleavings and rejecting tests

| Case / plausible regression it detects | Required independent observation |
| --- | --- |
| Invalid **last** selected grant/namespace, forged self-owner or wrong subject/target; detects elementwise validate-and-load | Zero loader calls/evaluations for **all** candidates, zero factory calls/effects, stable Host admission reason. |
| Structurally valid but unauthorized injection; detects treating Core acceptance as a receive grant | On the **same immutable declarations and profile**, the actual public `compileComposition` succeeds and its exact binding contains the disputed edge; the Host then refuses it before any loader call/evaluation or factory effect. Use a TEST-owned trusted inventory variant assigning the compatible provider to another subject with valid namespace/provision grants but no consumer receive grant; keep the request's claimed owner consistent with that subject so no other refusal masks the missing receive grant. |
| Duplicate/unknown selection, ambiguous inventory, missing selected loader; detects lossy indexing/fallback | Host admission/mapping refusal before loader invocation, no root. |
| Wrong token or provider binding; separately tampered digest/order, missing/extra/forged handle or incomplete roots | Actual Core or Assembly refusal, phase/code retained, zero loaders/factories; typed mistakes additionally fail the compiler fixture. |
| Mutate original request/profile after admission begins; detects authorization snapshot drift | Frozen selected subject/target/bindings remain the ones prepared; changed input cannot redirect code. |
| Valid set with extra unselected loaders; swap A/B and reverse many binding as negative controls | Only selected loader/evaluation markers fire once; sentinel never; independent output/order/resource-identity oracle detects wrong code or wiring. |
| Close before construct; detects a bypass of the Host guard | Construction refused without calling `prepared.run`; zero loaders/resources/disposals. |
| Close during provider A's actual `import()` top-level await, before the first create; detects untracked construction and missing post-import fence | Raw close stays pending until load settles; `create` never called after seal, no root/effect/resource; zero disposal. A top-level marker may already exist. |
| Acquisition reserved before seal, resource delivered afterward; detects rejected late custody or premature disposal | Live ticket accepts registration before settlement; close waits and disposes exactly once. Registration after ticket settlement is refused. |
| Factory begins and pauses **before** reservation; Host seals, then factory attempts acquisition; detects using a live construction ticket as post-seal authority | Reservation is refused synchronously without allocating a resource; construction settles without publication, close drains it, zero acquired resources/disposals. |
| Resource acquired, factory awaits then rejects **without** returned product; detects lost cleanup owner | Caller still holds TestHost and primary failure; close disposes once. |
| Malformed late product, valid late product, or rejection after abort; detects wrong handoff/error precedence | Failed malformed: raw `returned` identity absent from `created`; valid: created exactly once then cancelled; rejection: original cause plus cancellation. No root, one Host disposal for an acquired resource. |
| Seal after Assembly success before Host publication; repeated/concurrent construct | Host publishes no root after seal; joined construction invoked each factory at most once and allocated one resource. |
| Operation pauses at `await`, seal, then resumes; detects missing commit fence | Explicit refusal and unchanged effect sink; close waits for settlement. |
| One operation rejects while another stays pending; detects fail-fast drain | Disposer and close wait for both, preserving primary operation error. |
| Abort listener synchronously calls sibling handle and `close()`; detects seal/promise ordering | New work refused; reentrant call receives identical raw Promise; one disposer. |
| Saved handle/extracted method after close while fresh Host works; detects global reauthorization | Old handle refused; new Host effect succeeds. |
| Two consumers borrow one resource; concurrent close; detects cleanup through capability references | One disposer call, no consumer-owned disposal. |
| Observer abort/deadline during work/disposer, other observer still waiting, then late success **and** late failure | First pending receipt stays immutable; other/later observers get correct terminal result; raw flight unchanged, zero retained observer entries/listeners/timers. |
| Pre-aborted/expired observer and both same-turn terminal/deadline orders | Stored terminal wins at the callback's check; otherwise first pending reason remains. No synthetic terminal state while a gate is unresolved. |
| Disposer throws/rejects, including concurrent primary factory failure | `cleanup-incomplete` retains cause/debt, original primary error preserved, repeated close joins same promise and never retries. |

Admission scenarios run in fresh Node subprocesses so ESM caching cannot fake
zero imports. Count each trusted literal-loader invocation synchronously **before**
`import()` and record evaluation markers in entrypoints and the one instrumented
transitive fixture. An entrypoint marker alone misses dependencies that execute
or throw first. The positive control proves loader/marker/factory instrumentation
fires; the reviewed fixed import graph has no candidate path around these loaders.
A child fixture with top-level await reports import-start and waits for a harness
release message, so the pending-import case is actual ESM execution. The
success-before-publication scenario may gate delivery of the **real** public run
outcome in the test adapter; it must not fabricate an outcome or add a production
hook inside Assembly. Lifecycle tests
use deferred gates and a real in-memory sink, not sleeps or assertions only on
mocks/`signal.aborted`. Each test should state which plausible mutation makes
it red; review must demonstrate failures from early import, swapped loader,
missing commit fence and untracked construction, applied one at a time to the
stand and then reverted. These are temporary mutants, not configurable unsafe
modes in the delivered Host. Save failure evidence against each mutant diff/hash.
Release every deferred gate after its pending assertion and await cleanup; an
unexpected watchdog kill fails the scenario. Use the nearest strong boundary
rather than repeating every case at every layer.

## Delivery checkpoints and evidence file

1. **Read-only inventory and pin review.** Refresh registry versions, package
   engine ranges, exact CMS bytes, active consumer profile and C0 blockers;
   capture GM/OpenClaw/XF exact commits used for claims. Review any upstream
   standard delta before writing TEST code. Record the synthetic boundary and
   actual pin/scenario verification commands, never a no-op placeholder or a
   production adoption claim. No shared contract is changing, so this task does
   not revise canonical CMS/accepted ADR bytes. Choose an unused TEST sibling
   directory; do not reuse a real project as a stand. Check new tooling versions
   before choosing exact pins; the historical GM pair stays intentionally 0.1.0.
2. **Admission checkpoint, ~500-750 authored LOC.** Implement trusted inert inventory, grants, literal
   loaders, public Core compile and Assembly prepare. Run whole-set rejection
   and positive subprocess cases; review that no candidate code is imported
   in a pre-executable phase. The positive `prepared.run` fixture already retains
   the sole resource owner and awaits one-shot cleanup; it makes no concurrent
   lifecycle claim. This checkpoint is independently reviewable/deliverable.
3. **Host checkpoint, ~800-1,300 authored LOC.** Extend that same concrete owner
   with construction reservation,
   effect fence, retirement/observer split and controlled interleavings. Every
   constructed lifecycle case traverses public `prepared.run`. Review acquisition and
   `created`/`returned` paths against the exact installed package pair.
4. **Reproducibility and replay, ~150-350 additional LOC.** From a clean lock, run documented commands
   in the TEST project: `pnpm install --frozen-lockfile`, `pnpm typecheck`,
   `pnpm test`, `pnpm evidence`, under an exact supported Node binary. The
   final typecheck uses the pinned local compiler with `skipLibCheck:false`;
   `tsc7 --noEmit` is an optional fast preflight, not that gate. No claim of all
   TypeScript/resolver versions follows. Run heavy execution on a hosted TEST
   workspace; the local machine handles read-only review and integration.
   The machine-readable evidence records stand source commit/tree, both package
   archive SHA/SRI/versions/origins, resolved package roots, lock hash, CMS
   commit/path/full-byte hash, Node/pnpm/compiler versions, scenario IDs and
   expected/actual outcomes, ordered events, loader/evaluation/factory/effect/
   acquisition/disposer counts, terminal debt and claim limits. It binds retained
   logs to those inputs and fails on missing/duplicate/skipped/unexpected scenarios;
   it does not synthesize success from a handwritten summary. Never serialize
   opaque raw products/errors containing live handles; use fixture-owned cause IDs.
   Repeat on the isolated exact 0.2.0 pair. A blocked replay remains `pending`
   with the concrete prerequisite/error recorded; a green 0.1.0 checkpoint may
   still be delivered under its narrower claim.
5. **Independent review.** Verify the deliberate mutants fail, no real-project
   runtime/provider effect occurred, and no assertion exceeds the claim ledger.

The stand's result distinguishes `admitted`, `constructed`, `published`,
`pending` and `cleanup-incomplete`; construction alone never means readiness.
Deliver the admission and Host checkpoints as dependency-safe changes rather
than accumulating unrelated adoption work; each stays below the normal 2,000
changed-LOC review budget, excluding separately identified locks/retained archives.
Do not merge a checkpoint that leaks its own fixture resource or reports absent
later evidence as passing. Run one final required gate on each final mergeable
head; reuse unchanged evidence and rerun only affected intermediate checks.
Rollback is removal of the isolated TEST project and fixtures; no production
imports or package APIs change. A later product adoption needs its own bounded
PR, product Host tests and rollback path.

## Acceptance boundary

- Whole-set admission, immutable input custody, exact public-package wiring and
  independent positive/negative import oracles pass for the named package pair.
- Construction is single-flight; no post-seal create/publication/effect is admitted.
  Previously admitted work and late resource custody drain before sole cleanup.
- No root is required to recover construction debt. All close callers retain the
  same raw promise; terminal state and primary/cleanup causes remain distinct.
- Observer cancellation/deadline has the specified tie behavior and zero retained
  observer state; controlled pending work never becomes falsely closed.
- Four contract mutants fail for the intended reason; restored code passes focused
  checks and the final exact-input gate. No private GM imports, wiring casts,
  synthetic product claims or real-project/runtime/provider actions are present.
- A `pending` 0.2.0 replay, failed infrastructure run or missing evidence remains
  visibly incomplete. The stand as a whole is complete only when both planned
  exact subjects have their own accepted results; it never closes AR/XF gates.

## Claim ledger

| Green evidence permits | It does **not** permit |
| --- | --- |
| Whole selected-set grants and bindings refuse before executable import in this fixed trusted Host inventory. | Sandbox/security claims for arbitrary JS, malicious metadata getters/Proxy, altered loader files, or bad code that fails **after** import. |
| This Host's retained handles cannot make new in-memory effects after seal; tracked work settles before sole cleanup. | Physical cancellation of sent effects, OS/process supervision, cross-process fencing, crash recovery or never-settling code. |
| Exact 0.1.0 archives work under recorded supported Node/lock; a separate green 0.2.0 replay describes its own exact subject. | Automatic compatibility across pairs, publication of 0.2.0, Node 26 support outside package engines/CI, or all GM consumers. |
| The reachable TEST Host retains cleanup debt after construction failure. | Agent Runtime's C0 recovery gap, two eligible production scopes, K1/A1/A2 or real provider effects. |
| Selected finite graph/lifecycle scenarios run through real Core and Assembly. | Full CMS adoption, XF `GRAPH-1`/`LIFECYCLE-1`/`HOST-T0` qualification, independent product consumers or runtime extraction admission. |

## OpenClaw comparison boundary

The inspected OpenClaw checkout `e52420e1eea6c614ba7730d3d36980167478c6df` already checks
[candidate trust/config before import](../reference/openclaw/upstream/src/plugins/loader-runtime-candidate.ts),
retains [physical retirement](../reference/openclaw/upstream/src/plugins/plugin-instance.ts)
and tests [late callbacks/results](../reference/openclaw/upstream/src/plugins/plugin-instance-registry.test.ts).
Its per-candidate loading can intentionally keep healthy optional plugins
available when another is invalid. The possible distinction here is **atomic
selected-set namespace, grant and binding rejection before the first import**.
That is a different product policy with an availability tradeoff, not a proven
OpenClaw defect or superiority. Advantage requires adoption in an actual Host
and a same-scenario comparison. Extension Foundation main, verified through `gh`
at `c15f98c90b606def535c7d02fd8dc34789d3da2b`, explicitly distinguishes
[synthetic results from promotion profiles](https://github.com/agent-teams-ai/extension-foundation/blob/c15f98c90b606def535c7d02fd8dc34789d3da2b/docs/qualification/universal-module-extension-system/conformance-plan.md#current-evidence-status)
and requires its accepted independent-consumer evidence before semantic
extraction. These are pinned source observations, not execution or conformance
results for either product. This stand remains synthetic.

## Review sources and unresolved execution risks

The API/lifecycle review read the actual 0.1.0 archive `dist/index.d.ts`,
`dist/features/construction/types.d.ts` and `run.js`; the matching source areas at
GM `6b31f20fe3e5fb8324812aa2ee907905751cde71` are
[types](../get-modular/packages/assembly/src/features/construction/types.ts),
[preparation](../get-modular/packages/assembly/src/features/construction/prepare.ts),
[execution](../get-modular/packages/assembly/src/features/construction/run.ts) and
[packed consumer route](../get-modular/tests/assembly/packed-root.test.mjs).
The canonical CMS full-byte hash was recomputed; AR active profile and frozen C0
were read separately via `gh` at `c9b8efe485e2736bbaba4e9c47914fe3ac849b8a`.
The organization [early product advantage priority](https://github.com/agent-teams-ai/.github/blob/main/docs/engineering-quality-standard.md#early-product-advantage)
was read through `gh`; no superiority claim follows from this proposed fixture.

No stand/package source, compilation, runtime, agent flow or pack was executed during this plan
review. Remaining risks are actual pair-specific TypeScript acceptance, clean
archive installation under the selected engines, deterministic observer scheduling
and honest acquisition custody in the future implementation. Verify them in the
staged TEST runs above; source inspection does not turn them into green evidence.
