# Observation 0.1.0 exact-archive consumer

This directory is the bounded external consumer from ADR-0034 and the observation implementation plan, section 14.
It has its own pnpm workspace, package manifest, archive pins and lockfile. The parent repository's older Host
qualification archives are separate inputs and are not used by this fixture.

## Current checkpoint

The exact inputs are prepared from Get Modular commit `b2815314182221baac6b08750f86ef2644d2cdb8`: Core and Assembly
0.6.0, resources 0.2.0, conformance 0.4.0 and observation 0.1.0. Observation's actual resources peer is `^0.2.0`.
The five archive hashes, copied writer inputs and isolated lockfile are retained here. Offline installation and
frozen-lockfile reproduction passed with strict engine and peer checks. Full qualification passed on committed
consumer source `972dc2b9dfe9470a5e34ed4f28d75ecfc0fbec73`, on Linux x64 with Node 24.21.0 and 26.11.1 and TypeScript
7.0.2 in NodeNext and Bundler modes. Both runtime rows and all 33 writer tasks passed their exact gates; the single
smoke passed all 11 construction/injection rows. See the [accepted execution record](evidence/accepted-972dc2b/RECORD.md)
and its [machine-readable result](evidence/accepted-972dc2b/result.json).

The accepted run retains its exact input pins, lockfile, copied writer inputs, consumer source and result record in
this directory. A source or fixture correction requires recording the affected evidence again.

## Inputs and commands

Use Node 24.21.0 and 26.11.1, pnpm 11.20.0 and the pinned TypeScript aliases. Both compiler aliases currently select
7.0.2, so the runner compiles once per distinct compiler version and separately for NodeNext and Bundler. Both
consumer typechecks use `skipLibCheck: false`. The code is emitted by the same pinned compiler before execution.

The release coordinator supplies these packages under `third_party/archives/`:

| Package | Purpose |
| --- | --- |
| `@get-modular/core` | Required-slot contracts |
| `@get-modular/assembly` | Actual module construction and attempt scopes |
| `@get-modular/resources` | Resource ownership and physical close |
| `@get-modular/conformance` | Independent wiring check and one root smoke |
| `@get-modular/observation` | Store, subscriptions and public testing entry |

`third_party/pins.json` records each archive's actual version, relative archive path and SHA-256, the source commit
shared by all five, and the SHA-256 of that commit's `docs/architecture/common-assembly.md`. The runner rejects
additional package names, mismatched bytes and workspace package resolution. All five packages are exact file
dependencies and overrides so peers resolve to these same installed copies.

Run the following from this directory after the pins and archives arrive. Replace executable and checkout paths
with the recorded exact local paths; the source checkout is read only at `sourceCommit` from the pins.

```sh
node tools/prepare.mjs /path/to/prepared-release-checkout
pnpm install --offline --ignore-scripts
node tools/check.mjs /path/to/node-v24.21.0/bin/node /path/to/node-v26.11.1/bin/node
```

Engine and strict peer checks are enabled in `.npmrc`. Retain the generated `pnpm-lock.yaml`. Subsequent reproduction
installs use `pnpm install --offline --frozen-lockfile --ignore-scripts`. The environment needs `git`, `tar` and `diff`
for pinned source extraction, installed-byte verification and the reviewable writer harness diff.

Preparation reads the exact committed writer tasks, manifest, scenarios, static rules, compiler helper and process
probe from Get Modular. It copies the logger and catalog reference implementations and their contracts unchanged
into `src/reference/`. Every original copied input is listed with a SHA-256 in `third_party/writer-inputs.json`.

## Connected experiment

One root contains a settings owner, the unchanged `a-logger` and `b-catalog` references, an independently written
projection and a root product. All factories use ordinary `implement(..., scoped)` entries. The owner gives out
narrow read-only settings facets and ordinary command ports. Its store stays private. The projection has an
explicit query dependency, owns one private result aggregate and exposes its current result through a plain port.

| Evidence | Independent assertion |
| --- | --- |
| O-01: wiring | Literal expected capability providers, input implementations and root identity are checked against exactly the selected module and input declarations. Required single-provider rows are completed by the existing conformance API. |
| O-02: construction catch-up | Two distinct input identities have separate actual Assembly scopes. Each projection reads before its own acquisition waits. Settings change while that acquisition is held, and the load catches up from the original snapshot after construction proceeds. |
| O-03: supersession | The first query observes abort. Its promise includes separately held cleanup, and the next query starts only after that cleanup finishes. The public projection contains the current opaque result and correct identity. |
| O-04: independent close | Closing the left instance aborts held work and removes its subscriptions immediately. The public wait still works after close. Late completion cannot replace the retained result. The right instance changes successfully, and both close reports are complete with zero remaining subscriptions. |
| O-05: callback attribution | One controlled callback failure produces the exact source, subscription, revision and cause report. A healthy subscriber and later updates remain usable. The Host retains the report through cleanup. |
| O-06: smoke | One conformance smoke runs over the same unchanged root, with one successful construction and the existing failure/cancellation rows for its five factories. |
| O-07: writer adapter | Public full-record revision and live counts match the original statistics used by these fixed tasks, including post-close behavior. Unknown fields and unknown record shapes reject. |
| O-08: writer gate | All 33 original writer tasks in ten sets run with their original manifest and assertions. Both resolver gates and each negative's exact expected gate set must match. |
| O-09: process policy | The pinned fire-and-forget echo process exits after exactly one report through installed public imports. |
| O-10: CMS import rule | The pinned CMS lint configuration rejects testing-entry imports in a module and outbound adapter and permits the test file. |

O-01 through O-05 and O-07 through O-10 run on each named Node runtime. O-06 runs once on Node 26, separately from
the two runtime rows and compiler/resolver cells. Both connected runs assert `asyncDetection === true`. Test-owned
promises control acquisition, query results and physical cleanup; no tuned delays select an ordering.

The catalog's existing adapter contract is backed by a small terminating fake for the connected experiment and
smoke. The copied logger uses its original fake adapter. The 33-task writer gate uses every task's original fake.
These adapter substitutions preserve the reference implementation bytes.

## Public writer statistics adapter

The original harness imports a private observation statistics hook. This external consumer uses only the public
package and testing entries, so `tools/public-stats.mjs` makes three exact, guarded harness replacements:

1. Replace the private import with `publicStats` and the two fixed derived-record key lists.
2. Record each harness-created owner's actual initial keys in a local `WeakMap`.
3. Provide `live` with `liveSubscriptions` and `commits` with a lazy full-record `read(keys).revision`.

The two derived records are the contracts of `c-pricing-context` (`currency`, `vatRate`) and `g-hierarchy`
(`currency`, `vatRate`, `discountPercent`). The adapter does not infer expectations from task pass/fail names.
Every source anchor must occur exactly once. No scenario assertion, expected gate or original input is edited.
The runner saves the complete original-to-materialized diff as `evidence/current/writer-harness.patch`.

The revision getter is deliberately lazy: an original live-count assertion after close stays a live-count
assertion. A retained owner may still read its last revision; a closed read-only facet still rejects reads. Unknown
statistics fields and unknown record keys throw instead of producing a fallback value. O-07 checks these behaviors
independently of the writer gate. Runtime scenario imports are changed only from their exact `./task.ts` import to
the emitted `./task.js`; all assertions remain byte-identical apart from that import token.

## Retained evidence and limits

The runner starts a fresh `evidence/current/`, preserving individual command logs. It writes `result.json` only
after all checks pass, with exact archive pins, installed content hashes, physical peer identity, compiler versions,
runtime executable identities, OS details, lockfile hash, fixture commit and source hashes, and every command row.
A missing successful result is not a passing qualification. The runner never silently changes the expected gates
or retries a failed scenario.

The report separates runtime behavior, exact packed installation, the one pinned CMS source-import predicate and
measurement. This fixture supplies no full source-architecture verdict, scale benchmark, multi-platform result or
hundreds-of-modules qualification. The currently implemented recipe is the bounded experiment above.

If an archive fails its consumer scenario, that candidate is stopped. Correct the owning source, prepare new
archives and pins, and rerun the affected exact-input gates. Publication and merging remain coordinator actions.
