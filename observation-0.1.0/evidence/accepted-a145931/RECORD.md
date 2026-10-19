# Accepted observation consumer execution after ordinary TypeScript adoption

## Exact subjects

The prepared Get Modular release candidate is
`34bb4fae3d6a613f13cdbab9ca50b0bfdf4054e7` on `release/observation-0-1-candidate`.
It merges the independently reviewed implementation
`5102438e70a618a342c93fe003bcfc3f057a1041` into the already-versioned candidate
`106e3b0adca10e83d7a87ba57cb73baa9ee7ca6d`; no second Changesets versioning step was run.
The executed external consumer source is
`a145931ec4522d3a4a5cd1e06a342814a876801e` on `test/observation-0.1.0`.
That input-only commit was made before the unchanged check was executed.

| Archive | Actual version | SHA-256 |
| --- | --- | --- |
| `@get-modular/core` | 0.6.0 | `bac6f9e899b235124faf9d8eea9842eaaba5bb1ba543adb626fe21d6e3a5870f` |
| `@get-modular/assembly` | 0.6.0 | `ac96072e21d7a6a4264685c25e8c5ee487cbe0302ede58ec384d34ad4ddf8f63` |
| `@get-modular/resources` | 0.2.0 | `d9f6363d9c848be90c15e5d20acf07226e3b29ed55ae8af3d6ee0274e5a123d5` |
| `@get-modular/conformance` | 0.4.0 | `9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` |
| `@get-modular/observation` | 0.1.0 | `a0685247e9e00ec02c2abaeab1d4aceb2041468e5317d8bf5e786edf99ec02e5` |

Observation's resources peer remains `^0.2.0`; Assembly uses exact Core `0.6.0`.
The CMS SHA-256 remains `c2fe582a14ff6e79620b232ca7ffc914afb0474ec21fd43f208251dd7252f4a3`.
The lockfile SHA-256 is `850964806ea7a6dee6e0174261eeddb483c4e3aa9de901a04be33c125aec9b76`.
The unchanged runner's `result.json` has SHA-256
`fe38ccbfb3dcf10e07a9cad8a4cc4971714ab3e2d5daea217fe7e47c8f950473`.

## Changed inputs and preserved subjects

The candidate adopts ordinary `.ts` files for maintained TypeScript and strictly checks the four materialized
fixture drivers. These development changes leave all five packages' production source unchanged.
Relative to candidate `106e3b0`, observation's archive changes only `package/package.json`:
its development test glob is `tests/*.test.ts` instead of `tests/*.test.mts`.
Every runtime and declaration file has the same bytes as the preceding accepted execution.

The input-only consumer commit changes four files: the observation archive, its lockfile integrity, the candidate
source pin, and the copied-input `sourceCommit`. The existing `tools/prepare.mjs` extracted the exact committed
writer inputs. All 78 copied writer-input hashes remain identical. No consumer executable source, semantic oracle,
writer assertion, expected gate, public statistics adaptation, or `.d.mts` semantic fixture changed.
Of the 25 source/configuration hashes in the runner's result, only `third_party/writer-inputs.json` differs,
because it identifies the new source commit. The materialized `writer-harness.patch` is byte-identical to the
preceding accepted patch.

The historical directories `../accepted-972dc2b/`, `../accepted-dbb708e/`, and `../accepted-4d10a1f/` remain
byte-identical. Their prior input archives remain available in Git history; copies were also preserved outside
the checkouts before the input refresh. Their results describe their own exact candidates and executed commits.

## Candidate preparation and archive comparison

The candidate's generated dependency directories were removed, then the pinned offline, frozen-lockfile install
passed with lifecycle scripts disabled and explicit engine and strict peer checks. Both installed compiler aliases
were verified as actual TypeScript `7.0.2` before the build. Runtime preflight and the explicit peer gate passed.
The existing `assembly:build`, `resources:build`, `conformance:build`, and `observation:build` commands rebuilt
Core, Assembly and the three leaves. All five archives were freshly packed from the same committed candidate.

Core, Assembly, and resources reproduce the prior tarballs byte-for-byte. Observation has only the exact manifest
test-glob replacement described above; its other 39 archive files are identical. Conformance's fresh comparison
archive is `0f9055ff4104dcf7eb9b2a8a20111b289476f40d2814488d3e9d0a48b2a830b4`.
All 39 other conformance archive files are byte-identical, and the sole manifest difference is its established
`peerDependencies` key ordering. This is the implementation plan's existing Phase 3c exception. The originally
pinned `9b0b7c3b...` conformance archive remains the installed and tested subject; the fresh comparison pack does
not replace it. See `archive-refresh-comparison.log` and the five `candidate-pack-*.log` files.

The environment recreated five deleted `.mts` files during preparation. Each was compared with its exact
pre-migration Git blob at `106e3b0`, preserved outside the repository, and removed only after that comparison.
`stale-file-custody.log` records their hashes. These files were not staged or used as duplicate test discovery.
Packages contain no test files. The initial sandboxed install and build launcher could not open the existing
pnpm store database; their infrastructure logs are retained separately. Approved store and subprocess access
allowed the original commands to pass without changing compiler pins, test expectations, or gate scope.

## Consumer installation and execution

Observed environment: Linux x64, kernel `6.18.55`; exact Node `v24.21.0` and `v26.11.1`; pnpm `11.20.0`.
Both compiler aliases resolve to TypeScript `7.0.2`. The unchanged runner deduplicates that equal compiler version
while keeping NodeNext and Bundler as distinct checks with `skipLibCheck: false`.

Preparation used the existing command from `observation-0.1.0`:

```sh
node tools/prepare.mjs /workspace/scratch/e04865d5cacb/get-modular-release
pnpm install --offline --ignore-scripts --no-frozen-lockfile --engine-strict --strict-peer-dependencies
```

That first clean install refreshed only the local observation archive's lock integrity. After committing the
four input files, the consumer's generated `node_modules`, `out`, and `.work` directories were removed again.
The retained execution then used:

```sh
pnpm install --offline --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies
pnpm install --offline --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies
pnpm peers check --lockfile-only
node tools/check.mjs \
  /tmp/observation-toolchain/node-v24.21.0-linux-x64/bin/node \
  /tmp/observation-toolchain/node-v26.11.1-linux-x64/bin/node
```

The first frozen command restored all dependencies offline from a fresh generated directory; the second verified
frozen reproduction. Both enabled the original engine and strict peer checks. All five Get Modular dependencies
resolve to the pinned file archives, with no workspace or registry package substitution. The complete unchanged
check ran once after this committed-input installation; no scenario retry or extra smoke matrix was used.

## Actual results

| Gate | Observed result |
| --- | --- |
| Consumer NodeNext typecheck | Passed with actual TypeScript 7.0.2 and `skipLibCheck: false` |
| Consumer Bundler typecheck | Passed with actual TypeScript 7.0.2 and `skipLibCheck: false` |
| Runtime emission | Passed using the same pinned compiler |
| Node 24 runtime predicates | Five actual tests passed; zero failures, skips, cancellations, or todo cases |
| Node 26 runtime predicates | Five actual tests passed; zero failures, skips, cancellations, or todo cases |
| Node 24 writer gate | All 33 task outcomes matched the original manifest: 11 positives and 22 intended negatives |
| Node 26 writer gate | All 33 task outcomes matched the original manifest: 11 positives and 22 intended negatives |
| One unchanged-root smoke | All 11 rows passed: one baseline, five failure targets and five abort targets; every close complete, settled and debt-free |

Both runtime logs retain the distinct `before-left` and `before-right` catch-up values, `opaque-left-result` after
physical supersession, zero subscriptions after both closes, the successful sibling update, and one exact
attributed callback sentinel. Async detection, the installed fire-and-forget echo process policy, and the pinned
CMS testing-import lint predicate passed on both rows.

Both writer logs retain every task identity and its actual gate combination. Each resolver produces four
attributed diagnostics for the original negative inputs. The unrestricted sessions negative retains the original
expectation and fails `rules` and `behaviour`. The smoke retains one succeeded baseline, five failed failure
injections, four cancelled abort injections, and the existing projection abort with a failed outcome whose
cancellation metadata is checked by smoke. Target coverage and close assertions are unchanged.

The runner verifies all 176 installed archive files against pinned archive bytes and checks the physical identity
of related peer imports. `result.json` binds the exact candidate, input commit, package pins, installed hashes,
compiler versions, environment, lock hash, 25 consumer hashes, and ten completed command stages.
`custody-audit.log` records the independent retained-log and hash comparison. This evidence successor changes
no executed source.

## Claim limits

This is bounded synthetic TEST evidence for these exact archives on the two named Linux runtime rows.
The source predicate covers the pinned CMS testing-import lint rule only. It supplies no whole-source
architecture certification, scale measurement, Windows/macOS result, production adoption, release eligibility,
or publication claim. The existing Foundation/API Extractor compiler-floor blocker remains unresolved and is
not made green by this consumer result. No npm publication, remote push, or main-branch merge was performed.
