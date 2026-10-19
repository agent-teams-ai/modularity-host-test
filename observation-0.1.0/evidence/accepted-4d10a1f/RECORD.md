# Accepted observation consumer execution after typed test-tooling adoption

## Exact subjects

All five archives were built and packed from prepared Get Modular release candidate
`106e3b0adca10e83d7a87ba57cb73baa9ee7ca6d` on `release/observation-0-1-candidate`.
The executed external consumer source is `4d10a1fb7041e44c61766400d6f1262e84c397e7` on
`test/observation-0.1.0`. That input-only commit was made before running the unchanged check.
The candidate merged implementation `f0deed0af09915717f93bda11c570a82f456907e` into the already-versioned
candidate; no second Changesets versioning step was run.

| Archive | Actual version | SHA-256 |
| --- | --- | --- |
| `@get-modular/core` | 0.6.0 | `bac6f9e899b235124faf9d8eea9842eaaba5bb1ba543adb626fe21d6e3a5870f` |
| `@get-modular/assembly` | 0.6.0 | `ac96072e21d7a6a4264685c25e8c5ee487cbe0302ede58ec384d34ad4ddf8f63` |
| `@get-modular/resources` | 0.2.0 | `d9f6363d9c848be90c15e5d20acf07226e3b29ed55ae8af3d6ee0274e5a123d5` |
| `@get-modular/conformance` | 0.4.0 | `9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` |
| `@get-modular/observation` | 0.1.0 | `2a72ad3080ecf72277ab707581633391b6af28cbed36a98f8eff2306563f5c91` |

Observation's resources peer remains `^0.2.0`; Assembly uses exact Core `0.6.0`.
The pinned CMS SHA-256 remains `c2fe582a14ff6e79620b232ca7ffc914afb0474ec21fd43f208251dd7252f4a3`.
The lockfile SHA-256 is `047d3aaad9ffc7da2d79c374700663fdd4b87600e2e6c0c739ea1e54649f57be`.

## Change and preserved history

Compared with candidate `d345e14970eca4ed1c69831d2a59f4754da0b0e9`, four archive hashes are identical.
The observation archive changes only `package.json`: its development scripts discover the migrated `.mts`
declaration-control test and run its strict TypeScript project. Every other installed archive file has the
same bytes as the preceding execution. Production JavaScript and public declarations are unchanged.

No consumer executable source, semantic oracle, writer assertion, expected gate or public statistics adaptation
changed for this run. The input commit changes only the observation archive, its lock integrity, the candidate
source pin and copied-input sourceCommit. Existing `tools/prepare.mjs` extracted the exact committed candidate
inputs. All 78 copied writer-input hashes remain identical. Of the 25 recorded consumer source/configuration
hashes, only `third_party/writer-inputs.json` changes, because it identifies the new source commit.

The earlier records in `../accepted-dbb708e/` and `../accepted-972dc2b/` remain byte-identical and describe their
own candidates and executed consumer commits. Their successful results were not substituted for this execution.

## Candidate build and clean archive comparison

The pinned offline candidate install, runtime preflight and strict peer check passed. Core/Assembly, resources,
conformance and observation were rebuilt with TypeScript 7.0.2 and all five archives were packed from the same
committed candidate. The original pinned archives are retained as the qualification subjects.

The local candidate install recreated the deleted pre-migration `type-controls.test.mjs` as an untracked file.
Its bytes exactly matched the old test; it was preserved outside the repository and removed after installation.
No package includes test files. A final pack comparison from the clean candidate reproduced Core, Assembly,
resources and observation byte-for-byte, and the candidate remained clean.

Conformance's comparison pack exhibits only its already-documented peerDependencies key-order variation:
all archive file bytes are identical except `package/package.json`, and sorting only that object's peer keys
produces an identical manifest. The comparison archive SHA-256 is
`0f9055ff4104dcf7eb9b2a8a20111b289476f40d2814488d3e9d0a48b2a830b4`.
This uses only the implementation plan's existing conformance exception. The original pinned
`9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` archive remains the tested subject;
the comparison pack does not replace it. See `clean-pack-comparison.log`.

## Environment and execution

Observed environment: Linux x64, kernel `6.18.55`; Node `v24.21.0` and `v26.11.1`; pnpm `11.20.0`.
Both compiler aliases resolve to TypeScript `7.0.2`. The unchanged runner deduplicates that identical compiler
version while retaining NodeNext and Bundler as separate checks with `skipLibCheck: false`.

The existing preparation and check were run from `observation-0.1.0`:

```sh
node tools/prepare.mjs /workspace/scratch/e04865d5cacb/get-modular-release
pnpm install --offline --ignore-scripts --no-frozen-lockfile --engine-strict --strict-peer-dependencies
pnpm install --offline --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies
pnpm peers check --lockfile-only
node tools/check.mjs \
  /tmp/observation-toolchain/node-v24.21.0-linux-x64/bin/node \
  /tmp/observation-toolchain/node-v26.11.1-linux-x64/bin/node
```

For the retained execution, the consumer's generated `node_modules`, `out` and `.work` directories were removed
before the offline install. All dependencies were restored offline, followed by frozen-lockfile reproduction
and the explicit peer check. Engine and strict peer checks remained enabled in the original `.npmrc` and
explicit command flags. No Get Modular registry package or workspace package was selected.

The initial successful check following the input refresh reused the preceding generated dependency directory.
It was followed by this clean installation and final complete check; the retained logs and result below belong
to the final execution. No harness change, assertion relaxation, retry of a failed scenario or extra smoke matrix
was used. Approved subprocess access allowed the unchanged commands to execute.

## Actual results

| Gate | Observed result |
| --- | --- |
| Consumer NodeNext typecheck | Passed, TypeScript 7.0.2, `skipLibCheck: false` |
| Consumer Bundler typecheck | Passed, TypeScript 7.0.2, `skipLibCheck: false` |
| Runtime emission | Passed using the same pinned compiler |
| Node 24 connected/runtime predicates | Five actual tests passed; zero failures, skips or cancellations |
| Node 26 connected/runtime predicates | Five actual tests passed; zero failures, skips or cancellations |
| Node 24 writer gate | All 33 tasks matched the unchanged manifest: 11 positives and 22 intended negatives |
| Node 26 writer gate | All 33 tasks matched the unchanged manifest: 11 positives and 22 intended negatives |
| One unchanged-root smoke | All 11 rows passed: one baseline, five exact failure targets, five exact abort targets; every close complete, settled and without debts |

The runner verified all 176 installed archive files byte-for-byte and related imports' physical peer identity.
The runtime logs name O-01, O-02 through O-05, O-07, O-09 and O-10. Both rows record distinct `before-left` and
`before-right` catch-up values, `opaque-left-result` after physical supersession, zero subscriptions after both
closes, the successful sibling update and one exact attributed callback sentinel. Async detection, the installed
fire-and-forget echo process policy and the pinned CMS testing-import lint predicate passed on both rows.

Each writer runtime row records all 33 task identities and actual gate combinations. Each resolver produces
four independently attributed compile diagnostics for the original negative inputs. The unrestricted sessions
negative still fails rules and behaviour under its unchanged expectation. `writer-harness.patch` retains exactly
the same three guarded public statistics substitutions.

The single smoke records one succeeded baseline, five failed failure-injection outcomes, four cancelled
abort-injection outcomes and the existing projection abort carrying a failed outcome with supported cancellation
metadata. Exact target coverage and complete-close assertions are unchanged.

## Retained files and claim limits

`result.json` binds the exact candidate and input commit, all archive pins, installed file hashes, peer identities,
compiler versions, environment, lock hash, 25 source/configuration hashes and all ten completed command stages.
Individual runtime, writer, resolver, emission and smoke logs retain their executed identities. `check.log` is
the final top-level runner output; preparation, clean installation, frozen reproduction, peer checks, candidate
builds, packs and the clean comparison are retained beside it. This documentation successor changes no executed
source.

This is bounded synthetic TEST evidence for these exact archives on the two named Linux runtime rows. It supplies
no full source-architecture certification, scale measurement, Windows/macOS result, production adoption, release
eligibility or publication claim. Merge and publication remain coordinator/owner actions.
