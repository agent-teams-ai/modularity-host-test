# Accepted observation consumer execution after the runtime correction

## Exact subjects

All five archives were built and packed from the clean prepared Get Modular release candidate
`d345e14970eca4ed1c69831d2a59f4754da0b0e9` on `release/observation-0-1-candidate`.
The executed external consumer source is `dbb708e97a9cb20afe959d06dd85460fa0bf1349` on
`test/observation-0.1.0`. That source commit was made before running the existing check.
The candidate already contained its prepared versions; no second versioning step was run.

| Archive | Actual version | SHA-256 |
| --- | --- | --- |
| `@get-modular/core` | 0.6.0 | `bac6f9e899b235124faf9d8eea9842eaaba5bb1ba543adb626fe21d6e3a5870f` |
| `@get-modular/assembly` | 0.6.0 | `ac96072e21d7a6a4264685c25e8c5ee487cbe0302ede58ec384d34ad4ddf8f63` |
| `@get-modular/resources` | 0.2.0 | `d9f6363d9c848be90c15e5d20acf07226e3b29ed55ae8af3d6ee0274e5a123d5` |
| `@get-modular/conformance` | 0.4.0 | `9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` |
| `@get-modular/observation` | 0.1.0 | `c48ac24d89c259bcf13088f5aa220bf3a1f8572e62a47c0928377759d4bb683a` |

Observation's resources peer is `^0.2.0`. Assembly uses exact Core `0.6.0`.
The runner verified all 176 installed archive files byte-for-byte and checked that related imports resolve to
the same physical installed peer copies. It also verified 78 copied writer inputs and recorded 25 executed
consumer source/configuration hashes. The lockfile SHA-256 is
`0888cf8831c1ee71308895b1a4751fd65248e9e8190a785c8ca0cee429ee1efe`.

## Change and preserved history

The new observation archive contains the loader-await correction verified in Get Modular's package tests:
Promise inspection starts inside the loader context, including synchronous-only fallback. Compared with the
previous candidate `b2815314182221baac6b08750f86ef2644d2cdb8`, the Core, Assembly, resources and conformance archives
have identical hashes; observation has new bytes. Every archive in the current set was nevertheless packed from
the same new candidate.

No consumer executable source, semantic oracle, writer assertion, expected gate or public statistics adaptation
changed for this run. The input commit changes only the observation archive, its lock integrity, the candidate
source pin and copied-input sourceCommit. Existing `tools/prepare.mjs` extracted the exact committed candidate
inputs. The evidence/README successor changes no executed source.

The earlier result in `../accepted-972dc2b/` remains byte-identical and describes its earlier candidate and tested
consumer. It is historical evidence, separate from this execution; its green result was not reused for the new
observation archive.

## Environment and execution

Observed environment: Linux x64, kernel `6.18.55`; Node `v24.21.0` and `v26.11.1`;
pnpm `11.20.0`; both compiler aliases resolve to TypeScript `7.0.2`. The runner deduplicates that identical
compiler version while keeping NodeNext and Bundler separate, both with `skipLibCheck: false`.

The existing preparation and check were run from `observation-0.1.0`:

```sh
node tools/prepare.mjs /workspace/scratch/e04865d5cacb/get-modular-release
pnpm install --offline --ignore-scripts --no-frozen-lockfile
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm peers check --lockfile-only
node tools/check.mjs \
  /tmp/observation-toolchain/node-v24.21.0-linux-x64/bin/node \
  /tmp/observation-toolchain/node-v26.11.1-linux-x64/bin/node
```

A fresh lock was resolved offline, followed by frozen-lockfile reproduction; engine and strict peer checks stayed
enabled in the original `.npmrc`. Both installs and the explicit peer check passed. The one archive shown as
`downloaded` in the offline installation log is the changed local `file:` observation tarball; no Get Modular
registry package was selected.

The initial sandboxed preparation failed because `spawnSync git` was denied with `EPERM`, before extracting inputs.
That infrastructure failure is retained separately in `consumer-prepare-sandbox-blocked.log` and is not passing
evidence. The unchanged preparation and existing check then ran with approved subprocess access. No assertion
was relaxed and no executable fixture was changed to overcome the environment restriction.

## Actual results

| Gate | Observed result |
| --- | --- |
| Candidate build and lock preflight | Runtime preflight and strict peer check passed; all five packages built and packed using the pinned TypeScript 7.0.2 toolchain |
| Consumer NodeNext typecheck | Passed, TypeScript 7.0.2, `skipLibCheck: false` |
| Consumer Bundler typecheck | Passed, TypeScript 7.0.2, `skipLibCheck: false` |
| Runtime emission | Passed using that pinned compiler |
| Node 24 connected/runtime predicates | Five actual tests passed; zero failures, skips or cancellations |
| Node 26 connected/runtime predicates | Five actual tests passed; zero failures, skips or cancellations |
| Node 24 writer gate | All 33 tasks matched the unchanged manifest: 11 positives and 22 intended negatives |
| Node 26 writer gate | All 33 tasks matched the unchanged manifest: 11 positives and 22 intended negatives |
| One unchanged-root smoke | All 11 rows passed: one baseline, five exact failure targets, five exact abort targets; every close complete, settled and without debts |

The runtime logs name O-01, O-02 through O-05, O-07, O-09 and O-10. They record distinct `before-left` and
`before-right` catch-up values, `opaque-left-result` after physical supersession, zero subscriptions after both
closes, the successful sibling update and one exact attributed callback sentinel. Both rows assert async detection.
The process policy and pinned CMS import restriction execute against the installed public package imports.

Each writer runtime row records all 33 task identities and their actual gate combinations. Both resolver checks
produce four independently attributed compile diagnostics for the original negative inputs. The unrestricted
sessions negative still fails rules and behaviour; its original expectation is unchanged. `writer-harness.patch`
retains the same three guarded public statistics substitutions.

The single smoke records one succeeded baseline, five failed failure-injection outcomes, four cancelled
abort-injection outcomes and the existing projection abort carrying a failed outcome with supported cancellation
metadata. Its exact target coverage and complete-close assertions are unchanged.

## Retained files and claim limits

`result.json` records exact subjects, installed content hashes, physical peer identities, compiler versions,
fixture commit and source hashes, environment, lock hash and all ten command stages. Individual runtime, writer,
resolver, emission and smoke logs retain the executed identities. `check.log` is the top-level runner output;
preparation, install, peer, candidate build and pack logs are retained beside it.

This is bounded synthetic TEST evidence for these exact archives on the two named Linux runtime rows. It supplies
no full source-architecture certification, scale measurement, Windows/macOS result, production adoption, release
eligibility or publication claim. Merge and publication remain coordinator/owner actions.
