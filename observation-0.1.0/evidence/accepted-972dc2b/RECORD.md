# Accepted observation consumer execution

## Subjects

The prepared Get Modular release source is `b2815314182221baac6b08750f86ef2644d2cdb8`. The external consumer source
executed by this record is committed as `972dc2b9dfe9470a5e34ed4f28d75ecfc0fbec73` on `test/observation-0.1.0`.
All 25 recorded consumer source/configuration hashes were checked again before retaining this record. The evidence
and README update changes no executed source.

| Archive | Actual version | SHA-256 |
| --- | --- | --- |
| Core | 0.6.0 | `bac6f9e899b235124faf9d8eea9842eaaba5bb1ba543adb626fe21d6e3a5870f` |
| Assembly | 0.6.0 | `ac96072e21d7a6a4264685c25e8c5ee487cbe0302ede58ec384d34ad4ddf8f63` |
| resources | 0.2.0 | `d9f6363d9c848be90c15e5d20acf07226e3b29ed55ae8af3d6ee0274e5a123d5` |
| conformance | 0.4.0 | `9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` |
| observation | 0.1.0 | `3a3f235336fdeecf6a54b99c3585afd3440dd0f9cab03d99af043f38bf433597` |

Observation's actual resources peer is `^0.2.0`. The runner checked all 176 installed archive files byte-for-byte
against these tarballs and checked that related package imports resolve to the same physical installed peer copies.
The source commit, archive paths, CMS digest, original writer-input hashes and isolated dependency lock are retained
under `third_party/` and `pnpm-lock.yaml`.

## Environment and command

The observed environment was Linux x64, kernel `6.18.55`, with exact executables reporting Node `v24.21.0` and
`v26.11.1`. pnpm was `11.20.0`. Both compiler aliases resolve to TypeScript `7.0.2`; the runner deduplicated that
identical compiler version while retaining both resolver modes and `skipLibCheck: false`.

```sh
/tmp/observation-toolchain/node-v26.11.1-linux-x64/bin/node tools/check.mjs \
  /tmp/observation-toolchain/node-v24.21.0-linux-x64/bin/node \
  /tmp/observation-toolchain/node-v26.11.1-linux-x64/bin/node
```

Installation used `pnpm install --offline --ignore-scripts`, followed by
`pnpm install --offline --frozen-lockfile --ignore-scripts`, with `engine-strict=true` and
`strict-peer-dependencies=true`. Both passed. Initially, pnpm had cached tool package bytes but lacked registry
metadata for an offline resolution. A disposable tool-only project warmed metadata for the four exact pinned tool
dependencies; no Get Modular package was fetched from a registry. The consumer installs then ran offline. pnpm's
`downloaded 5` progress count in `offline-install.log` represents its five local `file:` archives.

## Results

| Gate | Observed result |
| --- | --- |
| Consumer NodeNext typecheck | Passed, TypeScript 7.0.2, `skipLibCheck: false` |
| Consumer Bundler typecheck | Passed, TypeScript 7.0.2, `skipLibCheck: false` |
| Runtime emission | Passed using the pinned TypeScript compiler |
| Node 24 connected/runtime predicates | Five tests passed, including O-01, O-02–05, O-07, O-09 and O-10; zero failures/skips/cancellations |
| Node 26 connected/runtime predicates | Same five tests passed; zero failures/skips/cancellations |
| Node 24 writer gate | All 33 tasks matched their exact expected gates across ten sets |
| Node 26 writer gate | All 33 tasks matched their exact expected gates across ten sets |
| One unchanged-root smoke | Passed all 11 rows: one baseline, five targeted failure injections, five targeted abort injections; every close complete, settled and without debts |

For each writer runtime row, all ten reference implementations and the alternative passed. Every negative failed
at its original manifest's exact gate combination. Each resolver produced four attributed diagnostics belonging
to the original compile-negative inputs. The retained `writer-harness.patch` shows the complete guarded public
statistics adaptation; original writer assertions and expected gates are unchanged.

The connected scenario observed `before-left` and `before-right` after held construction, retained only
`opaque-left-result` for the current left query, prevented overlap until obsolete physical cleanup completed,
closed the left instance with zero subscriptions, and observed `sibling-still-works` in the right instance before
its own complete close. One attributed callback report retained the exact sentinel cause while healthy and later
delivery remained usable. Both runtime rows asserted async detection.

## Fixture corrections before the accepted run

The first source checkpoint was `44e1836`. Its installed typechecks and connected runtime scenario passed, but the
CMS fixture's temporary files were under the repository's ignored `.work` directory. oxlint reported no files.
Commit `6f8c721` moved only that temporary fixture to the operating system temporary directory and made its `src`
input explicit. The pinned CMS policy and its two rejection/one acceptance assertions stayed unchanged.

At `6f8c721`, both runtime rows and both writer gates passed. The smoke helper returned all 11 successful checks,
but the consumer's additional count required five `cancelled` outcomes. The projection's awaited setup instead
produces `failed` with observed cancellation metadata. The installed conformance contract explicitly accepts this
case and verifies that metadata. Independent integration review confirmed the mismatch. Commit `972dc2b` replaced
the incorrect outcome count with exact five-target coverage for each injection mode, strict failure outcomes for
failure injection, the conformance-supported cancellation outcomes for abort injection, and the unchanged complete
close/no-problem assertions. It records every actual smoke row in `smoke.log`. No release archive changed.

## Scope of the conclusion

Runtime behavior and packed installation passed for these exact archives and these two Linux runtime rows. Source
evidence is limited to the pinned CMS testing-import predicate, copied-input integrity and the independent wiring
oracle. No full source-architecture certification, scale measurement, Windows or macOS result is implied.
Publication and branch integration remain coordinator actions.
