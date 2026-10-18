# Accepted observation consumer execution after close reporting correction

## Exact subjects

The prepared Get Modular candidate is `3b42d2641055c36c13ff0e2b7fae6cc02a945514`,
tree `790b3eeab17373cede189c185977d23bb03dba1b`, on `release/observation-native-final`.
It merges the independently reviewed implementation `3f5f3b303e99e4b8f919486d91d954f7f78e204d`
into the already versioned candidate `34bb4fae3d6a613f13cdbab9ca50b0bfdf4054e7`.
No second Changesets versioning step ran. All five packages' production sources match the fixed implementation;
the existing prepared manifests, changelogs and consumed changesets remain the release preparation.

The executed external consumer source is `a32f628a11a8cd9e871d985ab09bcfbcaa708b1b`,
tree `2e2f172830c13b4154d825eac4c74d0d0fa0e778`, on `test/observation-native-final`.
This four-file input commit existed before the frozen installation and unchanged ten-stage check ran.

| Archive | Actual version | SHA-256 |
| --- | --- | --- |
| `@get-modular/core` | 0.6.0 | `bac6f9e899b235124faf9d8eea9842eaaba5bb1ba543adb626fe21d6e3a5870f` |
| `@get-modular/assembly` | 0.6.0 | `ac96072e21d7a6a4264685c25e8c5ee487cbe0302ede58ec384d34ad4ddf8f63` |
| `@get-modular/resources` | 0.2.0 | `d9f6363d9c848be90c15e5d20acf07226e3b29ed55ae8af3d6ee0274e5a123d5` |
| `@get-modular/conformance` | 0.4.0 | `9b0b7c3bd1f64ebed48ddf6ac51782aab0cf70d72a1fb9fac99b591b3ade888b` |
| `@get-modular/observation` | 0.1.0 | `c06879bcaefcf1b6120f99347502ccd461bd2aa67e93d9c98995cb34fd81b9e1` |

Assembly depends on exact Core `0.6.0`; observation's resources peer is `^0.2.0`.
The CMS SHA-256 remains `c2fe582a14ff6e79620b232ca7ffc914afb0474ec21fd43f208251dd7252f4a3`.
The lockfile SHA-256 is `5119dcd348d1db5716ebe19fb5e394071246a25444f11d80676b5dcf2aa6cf41`.
The unchanged runner's [result.json](result.json) has SHA-256
`c101422b7e9cd73cff0316cf2aed5ddf5ad998bcdaa6e450daafee6b11fba65e`.

## Changed inputs and retained history

The source correction snapshots all live subscription close obligations before invoking the synchronous Host
error reporter. A reporter that closes a shared subscriber scope can no longer erase a sibling's required
`observation.source.closed` report. Already detached subscriptions remain excluded; repeated store close remains
idempotent. The owning source's two focused strict TypeScript regressions also preserve active-load physical
drain and suppress late publication. Their complete owning qualification is retained separately in Get Modular's
release record, bound to implementation commit `3f5f3b3`; it is not relabeled as this external run.

All five archives were freshly packed from the committed candidate after the sequential owning builds.
Core, Assembly, resources and conformance reproduce their preceding pinned tarballs byte for byte.
Observation changes only `package/dist/features/store/engine.js`; its other 39 files, including every declaration
and its packed manifest, remain identical. No file is added or removed. The established conformance peer-key
ordering exception was not needed for this pack. See [archive-refresh-comparison.json](archive-refresh-comparison.json)
and the five `candidate-pack-*.log` files.

The input commit changes exactly the observation archive, its lockfile integrity, the candidate source pin,
and the copied-input `sourceCommit`. All 78 copied writer-input hashes remain identical. Of the runner's 25
source/configuration hashes, only `third_party/writer-inputs.json` differs because it names the new source.
Consumer executable source, semantic oracles, original writer assertions, expected gates and the public statistics
adapter remain unchanged. The materialized `writer-harness.patch` is byte-identical to the preceding execution.

All 103 files in the four preceding accepted evidence directories retain their original bytes.
The prior archives remain in Git history. [custody-audit.json](custody-audit.json) records those exact hashes,
the source comparison, all actual writer outcomes and the smoke rows. Earlier results continue to describe
their own exact candidate and executed input commit.

## Preparation and installation

Observed environment: Linux x64, kernel `6.18.55`; exact Node `v24.21.0` and `v26.11.1`; pnpm `11.20.0`.
Both installed TypeScript aliases were inspected as actual `7.0.2` before execution. The external fixture has
no Foundation or API Extractor dependency. [toolchain-inventory.json](toolchain-inventory.json) retains the
installed package metadata. The source checkout's old published Foundation was installed as data only with
scripts disabled; no Foundation CLI, parser or old compiler ran in this qualification.

The isolated source checkout used an offline frozen installation with strict engines/peers and lifecycle scripts
disabled, followed by `assembly:build`, `resources:build`, `conformance:build`, and `observation:build` on Node 26.
Each package was packed once with the existing `pnpm --dir packages/<package> pack --pack-destination ...` route.
The candidate was clean before packing and remained clean after all five packs.

The existing consumer preparation command read exact committed CMS and writer inputs:

```sh
node tools/prepare.mjs /workspace/scratch/e04865d5cacb/get-modular-release-native
pnpm install --offline --ignore-scripts --no-frozen-lockfile --engine-strict --strict-peer-dependencies
```

The first preparation attempt was stopped by a sandbox permission error when spawning Git, before extraction. Its separate
infrastructure log is preserved. The original command then passed with approved process access; no tool or
expectation changed. The offline lock refresh changed only observation's archive integrity.

After committing the four inputs, the generated `node_modules`, `out` and `.work` directories were removed.
The following frozen install ran first on Node 24 and then on Node 26, with the same committed lock:

```sh
pnpm install --offline --frozen-lockfile --ignore-scripts --engine-strict --strict-peer-dependencies
pnpm peers check --lockfile-only
node tools/check.mjs \
  /tmp/observation-toolchain/node-v24.21.0-linux-x64/bin/node \
  /tmp/observation-toolchain/node-v26.11.1-linux-x64/bin/node
```

The peer check and complete check used Node 26. Actual child IPC was enabled for the existing tests.
The complete ten-stage check ran once; no consumer scenario retry or extra smoke matrix was used.

## Actual results

| Gate | Observed result |
| --- | --- |
| NodeNext consumer typecheck | TypeScript 7.0.2, strict, `skipLibCheck: false`, passed |
| Bundler consumer typecheck | TypeScript 7.0.2, strict, `skipLibCheck: false`, passed |
| Runtime emission | Same pinned TypeScript 7.0.2 passed |
| Node 24 runtime row | Five tests passed; zero failures, skips, cancellations or todo cases |
| Node 26 runtime row | Five tests passed; zero failures, skips, cancellations or todo cases |
| Node 24 writer row | All 33 outcomes matched: 11 positives and 22 intended negatives |
| Node 26 writer row | All 33 outcomes matched: 11 positives and 22 intended negatives |
| Single unchanged-root smoke | All 11 rows passed; every close complete, settled and debt-free |
| Packed installation | All 176 installed archive files matched; related peer imports resolved to the same physical copies |

Equal minimum/current compiler aliases were deduplicated by the unchanged runner; both resolver modes remain
separate checks. There is no claim of two distinct compiler-version runs.

Both runtime rows retain `before-left` / `before-right` catch-up, `opaque-left-result` after actual supersession
and held cleanup, zero subscriptions after each close, `sibling-still-works`, and one exact attributed callback
sentinel. Both assert asynchronous detection and pass the installed fire-and-forget echo and pinned CMS lint
predicates. Independent provider/input/root pins cover the exact selected declarations through public APIs.

Every writer identity retains its actual gate combination. Both resolver gates emit four attributed diagnostics
for the original negatives. The unrestricted sessions negative still fails `rules` and `behaviour`.
The smoke retains one successful baseline, five failed failure injections, four cancelled abort injections and
the existing projection abort with its checked failed/cancellation outcome. No expectation was changed.

## Claim limits and remaining release work

This record qualifies the named candidate archives in the bounded synthetic TEST consumer on the two named
Linux runtime rows. It supplies the Phase 3b external evidence and preparation inputs for Phase 3c.
It makes no full source architecture, scale, Windows/macOS, production adoption, release eligibility,
main-admission or publication claim. The source predicate covers only the pinned CMS testing-import lint rule.

Main/predecessor integration, the final qualified Foundation route, green exact-head release CI, release/record
review and merge, and the fresh post-merge archive comparison remain separate work. The tested archive bytes
must be retained through that route. No npm publication, remote push or main-branch merge occurred here.
