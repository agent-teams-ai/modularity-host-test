# TEST-1: adopt the Get Modular 0.3.0 train in modularity-host-test

Status: plan for the implementer and the independent reviewer. Written 2026-10-04 against
`agent-teams-ai/modularity-host-test` main `f7b578c83cb6a40b66519e555882682e2b4dd965` and
`agent-teams-ai/get-modular` main `81063add7de50ffe2b91cc74bf7271b298624c21`.

This TEST consumer installs the Get Modular train 1 archives that the release operator retained before npm
publication (release step R-1a): `@get-modular/core` 0.3.0, `@get-modular/assembly` 0.3.0,
`@get-modular/resources` 0.1.0 and `@get-modular/conformance` 0.1.0. It migrates its Consumer Module Standard
pin, replays the whole existing synthetic stand on the new Core/Assembly pair, and proves the new train surface
on one builder-declared session template. The result is the TEST part of the step that precedes npm
publication; it is not publication evidence and not production adoption.

Stop and ask on any ambiguity. Nothing below authorizes npm, registry, Get Modular or Agent Runtime changes.

## 1. Re-verify before start

Run every check. A different value is a stop unless the row says otherwise.

| # | Check | Command | Expected (2026-10-04) |
|---|---|---|---|
| 1 | TEST main | `git fetch origin && git rev-parse origin/main` | `f7b578c83cb6a40b66519e555882682e2b4dd965` plus the merged plan PR of section 15, and nothing else: `git diff --name-status f7b578c origin/main` lists only `A docs/train-030-plan.md` and `M AGENTS.md`, and `git diff f7b578c origin/main -- AGENTS.md` adds only the line "Train 0.3.0 adoption follows `docs/train-030-plan.md`; read it before that work." Any other change under `scripts/evidence/`, `third_party/`, `src/`, `tests/`, `package.json`, `pnpm-*`, `tsconfig.json`, `AGENTS.md` or `evidence/` is a stop |
| 2 | Open TEST PRs | `gh pr list --repo agent-teams-ai/modularity-host-test --state open` | none |
| 3 | Toolchain | `cat .node-version`; `node --version`; `pnpm --version` (inside the repo) | `24.21.0`; `v24.21.0`; `11.20.0` (a newer global pnpm switches itself to `packageManager`) |
| 4 | Baseline green | `pnpm install --frozen-lockfile --offline && pnpm typecheck && pnpm test` | exit 0; TAP `# tests 164`, `# pass 164` |
| 5 | Standard upstream | see 1.1 | `49d08b6d1762e94308157fb59b3aa82ac1630c91f529f6efcd4915dfffee7ba7` at `81063ad`, at the archive source commit and at current get-modular main |
| 6 | Retained archives | see 1.2 | the seven bundle files, hashes equal to `SHA256SUMS`, `INTEGRITY` and `release-intent.md`, manifest facts as listed |
| 7 | Registry | `npm view @get-modular/core versions dist-tags --json` and the same for `assembly`, `resources`, `conformance` | core/assembly `0.1.0`, `0.2.0`; resources/conformance E404. If 0.3.0/0.1.0 already exist, `dist.integrity` must equal the pinned SRI of 1.2, else stop |
| 8 | Kernel pin | `shasum -a 256 third_party/archives/lifecycle-kernel-0.1.0-candidate/get-modular-lifecycle-kernel-0.1.0.tgz` | `c1f047fa0ce7396fa2430b4043524656dfe98dc0f8b5950749af9bf764238c8b` (unchanged by this plan) |
| 9 | Disk | `df -h .` | at least 2 GB free; stop on ENOSPC and delete only your own temporary copies |
| 10 | Owner decisions | section 3 | no newer owner answer contradicts the 2026-10-08 decisions on live subjects and release timing |

### 1.1 Standard bytes

Use a temporary blobless clone outside the TEST checkout; C1 copies the standard from it. Delete it after C1.

```sh
WORK=$(mktemp -d)
git clone --filter=blob:none --no-checkout https://github.com/agent-teams-ai/get-modular.git "$WORK/gm"
git -C "$WORK/gm" fetch origin 81063add7de50ffe2b91cc74bf7271b298624c21 "$R1A_SHA"
for c in 81063add7de50ffe2b91cc74bf7271b298624c21 "$R1A_SHA" origin/main; do
  git -C "$WORK/gm" show "$c:docs/architecture/common-assembly.md" | shasum -a 256
done
```

All three must print `49d08b6d1762e94308157fb59b3aa82ac1630c91f529f6efcd4915dfffee7ba7`. A different value at
`origin/main` means a newer standard revision exists: stop, the pin target of this plan is stale.

### 1.2 Retained archives (release step R-1a)

The release operator retains one bundle named `get-modular-0.3.0-train-r1a` with exactly seven files: the four
archives, `SHA256SUMS` (`shasum -a 256` format), `INTEGRITY` (lines `<file> sha512-<base64>`) and
`release-intent.md` (source commit `$R1A_SHA`, its tree `$R1A_TREE`, the tree of each `packages/<name>`, Node and
pnpm versions, CI run, per-archive bytes and hashes, packed-manifest facts). The owner tells you where the bundle
lives; refer to it by name and checksums, never by a local path. `$R1A_DIR` below is your copy of it. By owner decision
(2026-10-08) the source commit is the final head of the open release PR, packed after its review and CI; record it
exactly as `release-intent.md` states. Never re-pack, rebuild or download the archives:
`pnpm pack` of conformance is not byte-deterministic (the order of its `peerDependencies` keys varies), so only
the retained bytes are valid.

```sh
cd "$R1A_DIR"
shasum -a 256 -c SHA256SUMS
ls -l get-modular-core-0.3.0.tgz get-modular-assembly-0.3.0.tgz get-modular-resources-0.1.0.tgz get-modular-conformance-0.1.0.tgz
for f in get-modular-*.tgz; do
  node -e 'const b=require("fs").readFileSync(process.argv[1]);const h=a=>require("crypto").createHash(a).update(b);
    console.log(process.argv[1], b.length, h("sha256").digest("hex"), "sha512-"+h("sha512").digest("base64"))' "$f"
  tar -xOzf "$f" package/package.json | node -e 'const m=JSON.parse(require("fs").readFileSync(0));
    console.log(JSON.stringify({name:m.name,version:m.version,private:m.private,dependencies:m.dependencies,
      peerDependencies:m.peerDependencies,engines:m.engines}))'
done
```

Each printed SRI must equal its `INTEGRITY` line, and each size and hash must equal `release-intent.md`. Use Node
for SRI; GNU `base64` wraps lines on Linux. An `INTEGRITY` entry broken across two lines is a defect of the
record: report it to the release operator and stop. Expected manifest facts (verified on a planning rehearsal of
the same commit range):

- core `0.3.0`, assembly `0.3.0`, resources `0.1.0`, conformance `0.1.0`; no `private` field;
- engines `>=24.18.0 <25 || >=26.10.0 <27` for all four;
- assembly `dependencies` exactly `{ "@get-modular/core": "0.3.0" }`; core, resources and conformance have no
  `dependencies`;
- conformance `peerDependencies` equal, as a key-order-insensitive record, to
  `{ "@get-modular/assembly": "^0.3.0", "@get-modular/core": "^0.3.0", "@get-modular/resources": "^0.1.0" }`;
- no `workspace:`, `link:` or `file:` anywhere in a manifest.

Any size, hash or fact that differs from the intent record or from this list: stop.

## 2. Scope and non-goals

In scope:

1. Migrate the Consumer Module Standard pin from get-modular `24d6557` to `81063ad` (#142) and classify the delta
   in `docs/train-030-01.md`.
2. Install the four retained archives (plus the unchanged private lifecycle-kernel candidate) from files in this
   repository, with exact SRI in the lock and no registry copy of any Get Modular package.
3. Make the 0.3.0 train the stand's only live package subject (owner decision 2026-10-08): replay the existing 164 tests,
   23 admission child scenarios, 126 focused lifecycle scenarios and the three probes on Core/Assembly 0.3.0,
   without changing a byte of the existing stand's source or tests.
4. Add one new synthetic boundary, the session template under `src/sessions/`, written the way the standard now
   prescribes: contract descriptors, `declareModule`, unbound `ModuleFactory` exports, `scoped()` resources, run
   inputs, a composition root that is a function of `Assembly<C>`, and the conformance kit (`smoke`, `isolate`,
   `contractSuite`/`runContractSuite`, `guardHandles`).
5. Prove two Host recipes in subprocesses: the standard's `closeWithin` deadline helper and the resources README
   process-group recipe (POSIX only).
6. Move the evidence replay root out of the repository, check the new archive set and package resolution, and
   retain one accepted evidence run.

Non-goals:

- npm login, publication, dist-tags; any registry install of a Get Modular package.
- Any change in get-modular or agent-runtime. Defects found there are reported, never worked around here.
- Rewriting `src/host/lifetime.ts`, the admission policy or any existing fixture; migrating the existing fixtures
  to the builder or to the new identity rules (they are the backward-compatibility subject, see C1).
- `checkNamespaces`, plugins, grants, isolation, hooks and observation (out of train 1 by owner decision).
- Node 26, Windows, a CI test workflow, production or Agent Runtime claims.

## 3. Owner decisions already taken

- Train 1 is Core 0.3.0, Assembly 0.3.0, resources 0.1.0 and conformance 0.1.0. This TEST consumer runs on the
  retained R-1a archives before npm publication. Publication is owner-only.
- Live subjects (2026-10-08): the 0.3.0 train becomes the stand's only live package subject. The published 0.1.0
  and candidate 0.2.0 replays leave the tree (their accepted runs stay in `evidence/accepted/`, Git history keeps
  the bytes), and the `AGENTS.md` rule about separate 0.1.0/0.2.0 installations changes (C2).
- Release timing (2026-10-08): the release PR stays open; the R-1a bundle is packed from its final head after
  review and CI; the owner merges the release after signing off the consumer checks, this TEST-1 included. The
  release branch is updated only by plain fast-forward pushes and merge commits, never by a force push. After the
  merge, TEST-1 records the merge SHA with either the tree equality or the passed source check (section 14).
- Consumer Module Standard pin target: get-modular `81063add7de50ffe2b91cc74bf7271b298624c21`, the merge commit of
  #142 that defines this standard revision. It is one pin for both consumers: this repository and Agent Runtime pin
  the same commit. The release commit changes no standard byte (its diff is limited to changesets, package
  versions, changelogs and the public API baselines), so the pin does not move with the release and does not
  depend on whether the release is packed from the PR head or from the merge. Section 1.1 checks that the bytes
  are identical at the bundle source commit and at current get-modular main. The wording "the release commit" in
  the description of get-modular #142 is superseded by this decision.
- `checkNamespaces` was cut from train 1. Plugins and everything for them (grants, isolation, namespace admission)
  and hooks/observation are out of scope. This TEST keeps its own Host-owned admission policy and its admission
  regressions stay TEST tests.
- Module = how, Host = when, Get Modular = mechanism. Trusted in-process code only.
- A module package exports its declaration and an unbound factory typed
  `ModuleFactory<CapabilitiesOf<its contracts>, typeof declaration, Instance, ModuleContext>`. The composition
  root binds it and never imports the Host's map into a module.
- A composition root is a function of `Assembly<C>` and binds every factory through that api. `smoke` fails
  closed when a factory is bound elsewhere.
- Inputs: per-instance data and parent ports are run inputs (`bindInput` declarations without slots, one
  capability each), supplied per run as plain records keyed by capability ID; never a registry or a service bag.
- Identity: `implementationId` is stable across releases; IDs are immutable and never reused; namespaces name a
  stable semantic owner; session, tenant and instance IDs never enter module IDs; `owner.authority` is the first
  segment of `moduleId`.
- Contracts: one monotonic line per contract ID (no `/v2` IDs); declarations never spell compatibility.
- Errors are identified by `code` only.
- Resources: module registers how to release, Host decides when and how long; close never rejects;
  `CloseReport` is `{ complete, settled, debts }`.
- Testing: named exported factories; `isolate` for one module, one `smoke` per composition root, contract suites
  by the contract owner, `guardHandles` per test file.
- MVP stage: breaking changes are acceptable and no compatibility shims or parallel variants are kept. Data and
  accepted evidence are preserved.
- Commits: author and committer `iliya <iliyazelenkog@gmail.com>` from the repository's local git config, never
  overridden with `-c`; conventional commit messages; no `Co-Authored-By`; no tool or generator attribution in
  code, commits or PR text. GitHub text in English, plain, regular dashes and quotes only.
- Every PR gets an independent review, fixes and a re-review. Merge only by the owner's explicit command,
  squash, with `--match-head-commit` on the reviewed head.

## 4. Owner questions

None open. Q1 (which package subjects stay live) was answered by the owner on 2026-10-08: the 0.3.0 train
only (section 3).

Planner decision (the owner may override): the TEST-1 PR stays open during the owner's review of the consumer
checks before npm publication and is merged only after publication, when the registry integrity of all four packages equals the pinned
SRI. Otherwise this public repository's main branch could carry 0.3.0 bytes that npm never publishes, which
already happened once with 0.2.0.

## 5. Facts verified while planning

All on macOS, Node 24.21.0, pnpm 11.20.0, TypeScript 7.0.2, in disposable copies. The archives were packed from
get-modular `81063ad` after `pnpm release:version`; they are not the R-1a bytes, so every fact must be confirmed
again on the real archives.

- With the existing lock as the starting point, changing the manifest to `file:` archives plus three `overrides`
  and running `pnpm install --prefer-offline` produced a lock whose entries read
  `resolution: {integrity: sha512-<SRI of the .tgz>, tarball: file:third_party/archives/train-0.3/<name>.tgz}`.
  After `rm -rf node_modules`, `pnpm install --frozen-lockfile --offline` succeeded.
- `node_modules/.pnpm` held exactly one directory per Get Modular package, and conformance resolved
  `@get-modular/{core,assembly,resources}` to the same real paths as the consumer.
- Unchanged existing stand on Core/Assembly 0.3.0: `pnpm typecheck` exit 0 (all `@ts-expect-error` directives of
  `tests/admission/type-errors.ts` still fire), `pnpm test` 164/164, all 23 admission child scenarios printed the
  same outcomes the runner expects, `distinct-root-probe` printed `prepared`, `terminal-debt-probe` and
  `import-fence-probe` printed the runner's expected records.
- The new files of section 7 (C3, C4) typechecked and passed 20/20; full `pnpm test` 184/184 in about 7 s, six
  consecutive full runs green, the process-group file five more times green, no process left behind. After the
  review edits, all 17 files were extracted from this document into a fresh copy: typecheck exit 0, 184/184, the
  process-group file 15 of 15 green, M9 fails the cooperative test, and `kit-types.ts` without its directive
  reports TS2741 for the missing `session` slot.
- 1000 concurrent runs of one prepared template: about 30 ms of library time; the file journal dominates.
- Six temporary mutants (M1 to M5, M7) failed the intended tests (section 13). An independent review of this plan
  reproduced C1 to C4 on its own packed archives and confirmed every mutant of section 13, including M6, M8 and M9.
- Two traps found and handled in the code below:
  - On macOS `process.kill(-pgid, signal)` can return `EPERM` for a moment after the leader exited, while the
    remaining members are zombies not yet reaped (12 parallel trials: 2 showed `EPERM` before `ESRCH`). The
    adapter accepts `EPERM` only after the leader exited; the test oracle keeps polling until `ESRCH`.
  - A process that inherits the test runner's stdio pipe and survives keeps `node --test` waiting forever.
    Fixture and adapter use `stdio: 'ignore'` for every stream they do not read, and the test kills every
    recorded PID in an `after` hook.
- `node --test --test-name-pattern` takes a regular expression. A contract-suite test name ends with
  ` [memory]`, which is a character class; unescaped, no test matches and Node reports the file as one passing
  test named by its path. The runner must escape names.

## 6. How the archives are consumed

- Location: `third_party/archives/train-0.3/` with the four original file names, copied byte for byte from
  `$R1A_DIR` (`cp`, then recompute the hashes of 1.2 in the repository copy).
- Manifest: `file:` specifiers for Core, Assembly and resources in `dependencies`, conformance in
  `devDependencies` (development tooling). The lifecycle-kernel candidate keeps its current `file:` entry.
- `pnpm-workspace.yaml` `overrides` bind Core, Assembly and resources to the same files. Core is needed because
  Assembly depends on exact `0.3.0`, which the registry does not have before publication; Assembly and resources
  make the conformance peers resolve to the same copies.
- Integrity: the lock stores the SHA-512 SRI of each archive. The evidence runner checks the archive bytes against
  `third_party/pins.json`, the manifests against the facts of 1.2, the lock against path and SRI, and the
  installed tree for one copy of each package and identical peer resolution.
- No registry: the replay is `pnpm install --frozen-lockfile --offline`, and the runner fails if the lock resolves
  any `@get-modular/*` package other than through `file:`.
- The replay root moves to the system temporary directory. Today it is created under `evidence/` inside the
  repository, so Node module resolution could walk up into the developer's own `node_modules` and hide a
  missing package.

## 7. Commits

Branch `feat/train-030` from the verified `origin/main`. Before every commit run `git var GIT_AUTHOR_IDENT` and
`git var GIT_COMMITTER_IDENT`; both must show `iliya <iliyazelenkog@gmail.com>`. Never use `--no-verify`. Gates per
commit are in section 9. Commit C1 needs only `$R1A_SHA` from `release-intent.md`, not the archives, and may be
prepared first.

### C1 `docs(test): migrate the consumer standard pin to get-modular 81063ad`

1. Copy the standard bytes from the clone of 1.1:
   `git -C "$WORK/gm" show 81063add7de50ffe2b91cc74bf7271b298624c21:docs/architecture/common-assembly.md > third_party/standards/common-assembly.md`
   (796 lines, 47402 bytes, SHA-256 `49d08b6d...ee7ba7`).
2. `third_party/pins.json`: set `getModularSourceCommit` to `81063add7de50ffe2b91cc74bf7271b298624c21` and replace
   `consumerModuleStandard` with the record below. The standard asks a consumer to pin repository, path, anchor,
   commit, full-document SHA-256 and the accepting decision; the three new fields complete that.

   ```json
   "consumerModuleStandard": {
     "repository": "agent-teams-ai/get-modular",
     "path": "third_party/standards/common-assembly.md",
     "sourcePath": "docs/architecture/common-assembly.md",
     "anchor": "consumer-module-standard",
     "acceptingDecision": "ADR-0026",
     "sha256": "49d08b6d1762e94308157fb59b3aa82ac1630c91f529f6efcd4915dfffee7ba7"
   },
   ```

3. `docs/evidence-replay.md`: replace the sentence below; in the file it wraps across lines, so match it across the
   line breaks. Old: "The current Consumer Module Standard is pinned to merged commit
   `24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f`; its full bytes match the prior candidate source." with "The
   current Consumer Module Standard is pinned to merged Get Modular commit
   `81063add7de50ffe2b91cc74bf7271b298624c21` (#142); `docs/train-030-01.md` classifies the delta."
4. New `docs/train-030-01.md` with the text below (fill `<R1A_SHA>` after 1.2; the results section follows in C5).

````markdown
# Train 0.3.0 checkpoint 01

This checkpoint moves the stand to the Get Modular train 1 archives retained before npm publication and records
the Consumer Module Standard pin migration. It is a synthetic TEST Host proof, not production adoption and not
publication evidence.

## Consumer Module Standard pin

- Before: get-modular `24d6557a1b04b01a3a73c64b1d9a9afd83d89c8f`, SHA-256
  `33b41d5babf0a431c97e8e596a56e6ec1557ba1a0b26d39bf23e13d9a19e1fbd`, 395 lines, 24312 bytes.
- After: get-modular `81063add7de50ffe2b91cc74bf7271b298624c21` (#142), SHA-256
  `49d08b6d1762e94308157fb59b3aa82ac1630c91f529f6efcd4915dfffee7ba7`, 796 lines, 47402 bytes. The bytes at the
  archive source commit `<R1A_SHA>` and at get-modular main on the migration date are identical. The pin names
  the commit that accepted this standard text, not the release commit: the release changes no standard byte, and
  Agent Runtime pins the same commit.
- Delta: `git diff 24d6557 81063ad -- docs/architecture/common-assembly.md` (default context) has 17 hunks,
  432 added and 31 removed lines.
- Behavioral contract change: yes. Assembly 0.3.0 adds per-run scope and inputs and the authoring builder; the
  standard admits `@get-modular/resources` and `@get-modular/conformance` and adds identity rules.

| Standard section | Change | TEST disposition |
| --- | --- | --- |
| Authority and identity | modules register cleanup through resources; a pin names repository, path, anchor, commit, digest and accepting decision | `third_party/pins.json` carries all six |
| New composition boundaries | IDs and revisions live in contract descriptors; declarations never spell compatibility | adopted by `src/sessions/`. The existing fixtures (`src/fixtures/graph.ts`, `tests/admission/type-errors.ts`, the evidence probes) keep Core helpers and hand-written exact tokens on purpose: they are the unchanged backward-compatibility subject that the 0.3.0 release notes promise keeps working. Classified `not-adopted`; review when Get Modular removes that path or these fixtures change for another reason |
| Optional dynamic Host lifecycle candidate | wording only (ADR-0028 reference removed) | lifecycle Host unchanged; still a synthetic pending boundary |
| Module resource scopes | `scoped()`, per-run scope, Host template and rules, README adapter recipes | adopted: `src/sessions/compose.ts`, `src/sessions/host.ts` (`closeWithin`), `src/adapters/process-group.ts` (POSIX) |
| Dynamic instances | one prepared template, one scope and inputs per run | adopted: `openSession` in `src/sessions/host.ts` |
| Module packages and contracts | descriptors, interface maps, unbound factories typed by their own map, errors by code | adopted for `src/sessions/`. The `peerDependencies` rule concerns published module packages; this TEST has none |
| Identity and namespaces | segment namespaces, stable IDs, `owner.authority` equals the first `moduleId` segment | new IDs live under `test/sessions/` with authority `test`. Existing fixture labels such as `fixture-provider` predate the rule; `not-adopted`, same review trigger as above |
| Testing modules | `isolate`, one `smoke` per root, suites with fakes, `guardHandles` per file | adopted for `composeSessions`: named factories bound in `compose.ts`, typed fakes (`tests/sessions/kit-types.ts`), `isolate` with `await using`, one `smoke`, the Store suite for the memory module and the fake, `guardHandles` per file. Recorded exceptions to rule 8: the Host deadline uses real referenced timers in a subprocess, because the regression is a process exit through an unreferenced timer, which mock timers cannot show; the process-group test polls the OS for orphan reaping (bounded, 2 s). The admission root `prepareAdmission` (`src/admission/run.ts`) creates its own `assemblyFor<Contracts>()` and its provider factory needs the live construction ticket of `TestHost.reserve()` (`src/host/lifetime.ts`), so the repeated runs of `smoke` cannot apply; it stays a dynamic Host lifecycle boundary without `smoke` |
| API and metadata ownership | handles are invariant only in the capabilities they use | `src/admission/run.ts` types its handle array as `AnyFactoryHandle<Contracts>[]` before `prepare`, which skips the used-capability check; acceptable for one map, recorded |
| Execution and outcomes | `run({ signal, scope, inputs })`; phase `inputs` with `assembly.run.invalid-inputs` | existing `run({ signal })` calls stay valid; the new failure code is proven by the session template |

Shared-first review: ADR-0030 keeps timers and process control out of `@get-modular/resources`, and the workspace
shared-first rule keeps process supervision and concrete adapters in the product Host; `closeWithin` is the
standard's own copyable Host template. A shared Host-side process-group adapter (about 60 lines, dependency from
the Host to the adapter) needs a product Host owner first; this synthetic stand cannot own it.
````

### C2 `build(deps): adopt the Get Modular 0.3.0 train archives`

Files:

1. Add `third_party/archives/train-0.3/` with the four archives.
2. Delete `third_party/archives/published-0.1/` (2 files), `third_party/archives/candidate-0.2/` (2 files) and
   `evidence/candidate-0.2/` (3 files) with `git rm`.
3. `.gitignore`: replace the four `!third_party/archives/published-0.1/...` and `!third_party/archives/candidate-0.2/...`
   lines with

   ```text
   !third_party/archives/train-0.3/get-modular-core-0.3.0.tgz
   !third_party/archives/train-0.3/get-modular-assembly-0.3.0.tgz
   !third_party/archives/train-0.3/get-modular-resources-0.1.0.tgz
   !third_party/archives/train-0.3/get-modular-conformance-0.1.0.tgz
   ```

4. `package.json`: keep everything else byte for byte; `dependencies` and `devDependencies` become

   ```json
   "dependencies": {
     "@get-modular/assembly": "file:third_party/archives/train-0.3/get-modular-assembly-0.3.0.tgz",
     "@get-modular/core": "file:third_party/archives/train-0.3/get-modular-core-0.3.0.tgz",
     "@get-modular/lifecycle-kernel": "file:third_party/archives/lifecycle-kernel-0.1.0-candidate/get-modular-lifecycle-kernel-0.1.0.tgz",
     "@get-modular/resources": "file:third_party/archives/train-0.3/get-modular-resources-0.1.0.tgz"
   },
   "devDependencies": {
     "@get-modular/conformance": "file:third_party/archives/train-0.3/get-modular-conformance-0.1.0.tgz",
     "@types/node": "24.19.0",
     "typescript": "7.0.2"
   }
   ```

5. `pnpm-workspace.yaml`:

   ```yaml
   packages:
     - .

   overrides:
     '@get-modular/core': file:third_party/archives/train-0.3/get-modular-core-0.3.0.tgz
     '@get-modular/assembly': file:third_party/archives/train-0.3/get-modular-assembly-0.3.0.tgz
     '@get-modular/resources': file:third_party/archives/train-0.3/get-modular-resources-0.1.0.tgz
   ```

6. Lock: `pnpm install --prefer-offline` (registry metadata only for TypeScript and `@types/node`, both unchanged),
   then `grep -n "get-modular" pnpm-lock.yaml`: every Get Modular key must be a `file:` key and each `integrity`
   must equal the SRI of 1.2. Then `rm -rf node_modules && pnpm install --frozen-lockfile --offline`.
7. `third_party/pins.json`: remove `publishedPair` and `candidatePair`; keep `getModularSourceCommit`,
   `consumerModuleStandard` (C1) and `lifecycleKernel` unchanged; add

   ```json
   "trainSet": {
     "origin": "retained-release-archives",
     "sourceCommit": "<R1A_SHA>",
     "sourceTree": "<R1A_TREE>",
     "packages": {
       "core": { "version": "0.3.0", "path": "third_party/archives/train-0.3/get-modular-core-0.3.0.tgz", "sha256": "<hex>", "sri": "sha512-<base64>" },
       "assembly": { "version": "0.3.0", "path": "third_party/archives/train-0.3/get-modular-assembly-0.3.0.tgz", "sha256": "<hex>", "sri": "sha512-<base64>" },
       "resources": { "version": "0.1.0", "path": "third_party/archives/train-0.3/get-modular-resources-0.1.0.tgz", "sha256": "<hex>", "sri": "sha512-<base64>" },
       "conformance": { "version": "0.1.0", "path": "third_party/archives/train-0.3/get-modular-conformance-0.1.0.tgz", "sha256": "<hex>", "sri": "sha512-<base64>" }
     }
   }
   ```

   The values come from your own recomputation in the repository copy and must equal the intent record.
8. `AGENTS.md` (both sentences wrap across lines in the file; match them across the line breaks):
   - replace "Use only public package exports. Keep published 0.1.0 archives and the 0.2.0 exact candidate pair in
     separate installations and evidence records." with "Use only public package exports. Install exactly the Get
     Modular archives pinned in `third_party/pins.json`; retired package subjects stay in `evidence/accepted/` and
     Git history and are not reinstalled beside the current set.";
   - replace "this TestHost responsible for policy, executable loading, effect authority and resource cleanup" with
     "this TestHost responsible for policy, executable loading, effect authority and cleanup authority (modules
     register cleanup through `@get-modular/resources`; the Host decides when and how long)".
9. `README.md`: first sentence becomes "An isolated consumer of Get Modular Core, Assembly, resources and
   conformance (train 0.3.0)." Add after the first paragraph: "A builder-declared session template under
   `src/sessions/` proves per-run scopes, run inputs and the conformance kit on the same archives."
10. `evidence/accepted/README.md`: append

    ```markdown
    Retired subjects. TEST-1 retired the live replays of the published 0.1.0 pair and the candidate 0.2.0 pair.
    Their archives, the candidate manifest and lock remain in Git history at commit
    `f7b578c83cb6a40b66519e555882682e2b4dd965`; the accepted runs above keep their manifests and hashes.
    ```

11. `docs/evidence-replay.md`: rewrite the description of the two pairs for one subject. Required content: the four
    commands; one disposable replay root in the system temporary directory; the frozen offline install of the
    train archives plus the private kernel candidate; the overlay of `minimumReleaseAge: 0` and `trustPolicy: off`
    in that copy only; what `accepted` requires (archive and manifest checks, lock path and SRI, one installed
    copy per package and identical conformance peers, pinned compiler typecheck, all named tests, 23 admission
    children, 126 focused lifecycle executions, from C3 the focused train scenarios, the import-fence marker,
    the `prepared` distinct-root probe and the terminal-debt probe, a committed source snapshot). Keep the
    links to the lifecycle checkpoint documents. State that historical pairs are retired (point to
    `evidence/accepted/README.md`).
12. `scripts/evidence/run.mjs` (the only logic change of C2). Keep the existing structure; edits:

    a. Replay root outside the repository (`run.mjs:12`). Import `tmpdir` from `node:os` and write
       `const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'modularity-host-test-evidence-')));`
       `realpathSync` matters on macOS, where the temporary directory is a symlink and the runner compares real
       paths. After `failed` is defined add
       `if (scratch === source || scratch.startsWith(source + '/')) failed('replay root is inside the source repository');`.
    b. `sourcePaths` (`:18-23`) and the hashed file lists (`:32-39`): remove `evidence/candidate-0.2`; add
       `docs/train-030-01.md` to `sourcePaths` and to the explicit file list.
    c. `report.standard` (`:47-48`): add `repository`, `anchor` and `acceptingDecision` from
       `pins.consumerModuleStandard`. `report.environment`: add `platform: process.platform`.
    d. `report.limits` (`:51-57`) becomes:

       ```js
       limits: [
         'Synthetic fixed TEST Host only; no Agent Runtime, Extension Foundation, OpenClaw, or production conformance.',
         'No arbitrary JavaScript sandbox, physical effect cancellation, crash recovery, Windows, or Node 26 support.',
         'Core/Assembly 0.3.0, resources 0.1.0 and conformance 0.1.0 are retained release archives packed before npm publication; this run is not publication evidence.',
         'The lifecycle-kernel 0.1.0 archive is a separately packed private candidate.',
         'The process-group recipe is proven only for a cooperative two-level POSIX tree that stays in its group.',
         'Archive-only diagnostic replay is not an accepted frozen-lock installation or typecheck gate.',
       ],
       ```

    e. Replace `checkPins` (`:100-117`) with:

       ```js
       const TRAIN = ['core', 'assembly', 'resources', 'conformance'];
       const TRAIN_ENGINES = '>=24.18.0 <25 || >=26.10.0 <27';
       // Compare records without key order: pnpm pack writes conformance peers in varying order.
       const sameRecord = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
       function checkTrainSet() {
         const pin = pins.trainSet;
         const archive = {};
         for (const name of TRAIN) {
           const spec = pin.packages[name];
           const bytes = read(join(source, spec.path));
           const text = execFileSync('tar', ['-xOzf', join(source, spec.path), 'package/package.json'], { encoding: 'utf8' });
           const manifest = JSON.parse(text);
           const item = { path: spec.path, origin: pin.origin, sourceCommit: pin.sourceCommit, version: manifest.version,
             sha256: sha256(bytes), sri: sri(bytes), engines: manifest.engines,
             dependencies: manifest.dependencies ?? null, peerDependencies: manifest.peerDependencies ?? null };
           if (manifest.name !== `@get-modular/${name}` || manifest.private !== undefined || item.sha256 !== spec.sha256 ||
               item.sri !== spec.sri || item.version !== spec.version || manifest.engines?.node !== TRAIN_ENGINES ||
               /"(workspace|link|file):/.test(text))
             failed(`trainSet/${name}: archive pin or manifest mismatch`);
           archive[name] = item;
         }
         const version = Object.fromEntries(TRAIN.map(name => [name, pin.packages[name].version]));
         if (!sameRecord(archive.assembly.dependencies, { '@get-modular/core': version.core }) || archive.assembly.peerDependencies)
           failed('trainSet/assembly: not exactly dependent on the pinned Core');
         for (const name of ['core', 'resources'])
           if (archive[name].dependencies || archive[name].peerDependencies) failed(`trainSet/${name}: unexpected dependency`);
         if (archive.conformance.dependencies || !sameRecord(archive.conformance.peerDependencies, {
           '@get-modular/assembly': `^${version.assembly}`, '@get-modular/core': `^${version.core}`,
           '@get-modular/resources': `^${version.resources}` }))
           failed('trainSet/conformance: peers are not one 0.x minor of the pinned set');
         return archive;
       }
       ```

    f. `copyTestRoot` (`:131-146`): drop the `key` parameter; always copy `package.json`, `pnpm-lock.yaml` and
       `pnpm-workspace.yaml` from the repository root and always append the existing release-age overlay to the
       copy (keep its comment).
    g. Replace `installedRoots` (`:147-166`) so it resolves `core`, `assembly`, `resources`, `conformance` and
       `lifecycle-kernel` from the consumer, Core from Assembly, and Core, Assembly and resources from
       conformance (`createRequire(<conformance real path>)`). Fail unless every real path starts with
       `root + '/'`, Assembly's Core and every conformance peer equal the consumer's real path, and each version
       equals `pins.trainSet.packages[name].version` (kernel: `pins.lifecycleKernel.version`).
       Separately, only in the main branch after a successful frozen install (not inside `installedRoots`, which
       the archive-only branch also calls on a hand-extracted tree without `.pnpm`): read `node_modules/.pnpm` and
       fail unless exactly one entry starts with `@get-modular+<name>@` for each of the five names.
    h. Main block (`:314-417`): iterate `[['trainSet', 'train-0.3']]` only. `pair.pins = checkTrainSet()`,
       `pair.sourceTree = pins.trainSet.sourceTree`, lock path `pnpm-lock.yaml`. Lock checks: each of the five
       pinned paths and SRIs is present;
       `/published-0\.1|candidate-0\.2/` must not match;
       `/^\s+'?@get-modular\/[a-z-]+@(?!file:)/m` must not match (a registry resolution of a Get Modular package).
       The distinct-root expectation becomes `{ phase: 'preparation', status: 'prepared' }` in both places.
       In the archive-only diagnostic branch extract all four train archives and the kernel.
    i. Do not touch `admissionChildren`, `expectedEvents`, `lifecycleRuns`, `importFence`, the probes or
       `scripts/evidence/expected.json` in C2.

### C3 `feat(test): prove the 0.3.0 session template with the conformance kit`

New boundary `src/sessions/`, classified as a synthetic TEST composition boundary. File roles mirror packages:
`contracts.ts` is the contract package (descriptors and port types, no implementations), `store.ts`, `cache.ts`
and `session.ts` are module packages (declaration plus unbound factory, importing only contracts), `inputs.ts`
and `compose.ts` belong to the composition, `host.ts` is Host policy, `testing.ts` is the contract owner's test
entrypoint (fake and suite; production files never import it). IDs live under `test/sessions/`, the stand's own
namespace; session IDs appear only in scope names and run inputs. The files below typechecked and passed as
written during planning; keep them unless a check fails, and then stop and report instead of improvising.

`src/sessions/contracts.ts`

```ts
import { defineContract, type CapabilitiesOf } from '@get-modular/assembly';

export type JournalPort = { readonly append: (entry: string) => void };
export type SessionInfo = { readonly id: string };
/** `put` throws a TypeError whose `code` is INVALID_KEY for an empty key. */
export type StorePort = {
  readonly put: (key: string, value: string) => void;
  readonly get: (key: string) => string | undefined;
};
export type CachePort = { readonly read: (key: string) => string | undefined };
export type SessionPort = { readonly id: string; readonly roundTrip: (value: string) => string | undefined };

export const INVALID_KEY = 'test.sessions.invalid-key';

export const Journal = defineContract<JournalPort>()({ id: 'test/sessions/journal', revision: 1 });
export const SessionId = defineContract<SessionInfo>()({ id: 'test/sessions/session-id', revision: 1 });
export const Store = defineContract<StorePort>()({ id: 'test/sessions/store', revision: 1 });
export const Cache = defineContract<CachePort>()({ id: 'test/sessions/cache', revision: 1 });
export const Session = defineContract<SessionPort>()({ id: 'test/sessions/session', revision: 1 });

export interface SessionCapabilities extends CapabilitiesOf<
  typeof Journal | typeof SessionId | typeof Store | typeof Cache | typeof Session> {}
```

`src/sessions/inputs.ts`

```ts
import { declareModule } from '@get-modular/assembly';
import { Journal, SessionId } from './contracts.ts';

export const journalInput = declareModule({
  moduleId: 'test/sessions/journal', implementationId: 'test/sessions/journal/input',
  owner: { authority: 'test', path: ['sessions', 'journal'] }, provides: [Journal.provide()], slots: [],
});
export const sessionInput = declareModule({
  moduleId: 'test/sessions/session-id', implementationId: 'test/sessions/session-id/input',
  owner: { authority: 'test', path: ['sessions', 'session-id'] }, provides: [SessionId.provide()], slots: [],
});
```

`src/sessions/store.ts`

```ts
import { declareModule, type CapabilitiesOf, type ModuleFactory } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import type { ModuleContext } from '@get-modular/resources';
import { INVALID_KEY, Journal, SessionId, Store, type StorePort } from './contracts.ts';

export const storeDeclaration = declareModule({
  moduleId: 'test/sessions/store', implementationId: 'test/sessions/store/memory',
  owner: { authority: 'test', path: ['sessions', 'store'] },
  provides: [Store.provide()],
  slots: [Journal.slot('journal', required()), SessionId.slot('session', required())],
});

export const createStore: ModuleFactory<CapabilitiesOf<typeof Journal | typeof SessionId | typeof Store>,
  typeof storeDeclaration, StorePort, ModuleContext> = async (deps, { resources }) => {
  const values = await resources.setup({
    name: 'values',
    setup: () => { deps.journal.append(`acquire:store:${deps.session.id}`); return new Map<string, string>(); },
    cleanup: held => { held.clear(); deps.journal.append(`release:store:${deps.session.id}`); },
  });
  const port: StorePort = {
    put: (key, value) => { if (key === '') throw Object.assign(new TypeError('a store key must not be empty'), { code: INVALID_KEY }); values.set(key, value); },
    get: key => values.get(key),
  };
  return { instance: port, capabilities: { 'test/sessions/store': port } };
};
```

`src/sessions/cache.ts`

```ts
import { declareModule, type CapabilitiesOf, type ModuleFactory } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import type { ModuleContext } from '@get-modular/resources';
import { Cache, Journal, SessionId, Store, type CachePort } from './contracts.ts';

export const cacheDeclaration = declareModule({
  moduleId: 'test/sessions/cache', implementationId: 'test/sessions/cache/default',
  owner: { authority: 'test', path: ['sessions', 'cache'] },
  provides: [Cache.provide()],
  slots: [Store.slot('store', required()), Journal.slot('journal', required()), SessionId.slot('session', required())],
});

export const createCache: ModuleFactory<CapabilitiesOf<typeof Store | typeof Journal | typeof SessionId | typeof Cache>,
  typeof cacheDeclaration, CachePort, ModuleContext> = async (deps, { resources }) => {
  const seen = await resources.setup({
    name: 'seen',
    setup: () => { deps.journal.append(`acquire:cache:${deps.session.id}`); return new Set<string>(); },
    cleanup: held => { held.clear(); deps.journal.append(`release:cache:${deps.session.id}`); },
  });
  const port: CachePort = { read: key => { seen.add(key); return deps.store.get(key); } };
  return { instance: port, capabilities: { 'test/sessions/cache': port } };
};
```

`src/sessions/session.ts`

```ts
import { declareModule, type CapabilitiesOf, type ModuleFactory } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import { Cache, Session, SessionId, Store, type SessionPort } from './contracts.ts';

export const sessionDeclaration = declareModule({
  moduleId: 'test/sessions/session', implementationId: 'test/sessions/session/default',
  owner: { authority: 'test', path: ['sessions', 'session'] },
  provides: [Session.provide()],
  slots: [Cache.slot('cache', required()), Store.slot('store', required()), SessionId.slot('session', required())],
});

// Registers nothing, so the composition root binds it without scoped().
export const createSession: ModuleFactory<CapabilitiesOf<typeof Cache | typeof Store | typeof SessionId | typeof Session>,
  typeof sessionDeclaration, SessionPort> = async deps => {
  const port: SessionPort = {
    id: deps.session.id,
    roundTrip: value => { deps.store.put('value', value); return deps.cache.read('value'); },
  };
  return { instance: port, capabilities: { 'test/sessions/session': port } };
};
```

`src/sessions/compose.ts`

```ts
import { compileComposition } from '@get-modular/core';
import type { Assembly } from '@get-modular/assembly';
import { scoped } from '@get-modular/resources';
import { cacheDeclaration, createCache } from './cache.ts';
import type { SessionCapabilities } from './contracts.ts';
import { journalInput, sessionInput } from './inputs.ts';
import { createSession, sessionDeclaration } from './session.ts';
import { createStore, storeDeclaration } from './store.ts';

const declarations = [journalInput, sessionInput, storeDeclaration, cacheDeclaration, sessionDeclaration] as const;
const bind = (consumer: { readonly implementationId: string }, slotId: string,
  providers: readonly { readonly implementationId: string }[]) => ({
  consumerImplementationId: consumer.implementationId, slotId,
  providerImplementationIds: providers.map(provider => provider.implementationId),
});

/** The template's composition root: a function of Assembly, so smoke can pass its own api. */
export async function composeSessions(api: Assembly<SessionCapabilities>) {
  const composition = await compileComposition({ declarations, profile: {
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'test/sessions/template',
    roots: [sessionDeclaration.moduleId],
    selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: [
      bind(storeDeclaration, 'journal', [journalInput]), bind(storeDeclaration, 'session', [sessionInput]),
      bind(cacheDeclaration, 'store', [storeDeclaration]), bind(cacheDeclaration, 'journal', [journalInput]),
      bind(cacheDeclaration, 'session', [sessionInput]),
      bind(sessionDeclaration, 'cache', [cacheDeclaration]), bind(sessionDeclaration, 'store', [storeDeclaration]),
      bind(sessionDeclaration, 'session', [sessionInput]),
    ],
  } });
  if (!composition.ok) throw new Error(`test/sessions/template: ${composition.diagnostics.map(item => item.code).join(', ')}`);
  const journal = api.bindInput(journalInput);
  const session = api.bindInput(sessionInput);
  const store = api.bindFactory(storeDeclaration, scoped(storeDeclaration.implementationId, createStore));
  const cache = api.bindFactory(cacheDeclaration, scoped(cacheDeclaration.implementationId, createCache));
  const root = api.bindFactory(sessionDeclaration, createSession);
  return api.prepare({ composition, factories: [store, cache, root], roots: { session: root }, inputs: { journal, session } });
}
```

`src/sessions/host.ts`

```ts
import type { AssemblyOutcome } from '@get-modular/assembly';
import type { CloseReport, Resources, ScopeControl } from '@get-modular/resources';
import type { composeSessions } from './compose.ts';
import type { JournalPort, SessionPort } from './contracts.ts';

type Preparation = Awaited<ReturnType<typeof composeSessions>>;
export type SessionTemplate = Extract<Preparation, { readonly status: 'prepared' }>['prepared'];

/** Host deadline policy from the Consumer Module Standard: escalate, then abandon, with referenced timers. */
export async function closeWithin(control: ScopeControl, graceMs: number, abandonMs: number): Promise<CloseReport> {
  const escalate = new AbortController();
  const abandon = new AbortController();
  const toEscalate = setTimeout(() => { escalate.abort(); }, graceMs);
  const toAbandon = setTimeout(() => { abandon.abort(); }, graceMs + abandonMs);
  try {
    return await control.close({ escalate: escalate.signal, abandon: abandon.signal });
  } finally {
    clearTimeout(toEscalate);
    clearTimeout(toAbandon);
  }
}

export type OpenedSession =
  | { readonly ok: true; readonly session: SessionPort; readonly lifetime: ScopeControl }
  | { readonly ok: false; readonly outcome: Exclude<AssemblyOutcome<unknown>, { readonly status: 'succeeded' }>; readonly report: CloseReport };

/** One instance per run: reserve its scope before the first await, publish only after success. */
export async function openSession(template: SessionTemplate, sessions: Resources,
  input: { readonly id: string; readonly journal: JournalPort }, signal?: AbortSignal): Promise<OpenedSession> {
  const instance = sessions.child({ name: `session:${input.id}` });
  const outcome = await template.run({ signal, scope: instance.resources, inputs: {
    journal: { 'test/sessions/journal': input.journal },
    session: { 'test/sessions/session-id': { id: input.id } },
  } });
  if (outcome.status !== 'succeeded') {
    return { ok: false, outcome, report: await closeWithin(instance.control, 1_000, 1_000) };
  }
  return { ok: true, session: outcome.roots.session, lifetime: instance.control };
}
```

`src/sessions/testing.ts`

```ts
// Test entrypoint of the Store contract owner. Production code never imports this file.
import { declareModule } from '@get-modular/assembly';
import { contractSuite } from '@get-modular/conformance';
import { strict as assert } from 'node:assert';
import { INVALID_KEY, Store, type StorePort } from './contracts.ts';

export const storeFakeDeclaration = declareModule({
  moduleId: 'test/sessions/store', implementationId: 'test/sessions/store/fake',
  owner: { authority: 'test', path: ['sessions', 'store'] }, provides: [Store.provide()], slots: [],
});

export function createStoreFake(): StorePort {
  const values = new Map<string, string>();
  return {
    put: (key, value) => { if (key === '') throw Object.assign(new TypeError('a fake store key must not be empty'), { code: INVALID_KEY }); values.set(key, value); },
    get: key => values.get(key),
  };
}

// The port is synchronous and in memory, so it has no cancellation case.
export const storeSuite = contractSuite(Store, {
  'round-trips a value': store => { store.put('a', '1'); assert.equal(store.get('a'), '1'); },
  'returns undefined for an unknown key': store => { assert.equal(store.get('missing'), undefined); },
  'refuses an empty key': store => {
    assert.throws(() => { store.put('', 'x'); }, (error: unknown) =>
      error instanceof TypeError && 'code' in error && error.code === INVALID_KEY);
  },
});
```

`tests/sessions/journal.mjs`

```js
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// An append-only file the library never sees: the oracle for acquisition and release order.
export function fileJournal() {
  const dir = mkdtempSync(join(tmpdir(), 'sessions-journal-'));
  const path = join(dir, 'journal.log');
  const fd = openSync(path, 'a');
  return {
    port: Object.freeze({ append: entry => { writeSync(fd, `${entry}\n`); } }),
    entries: () => readFileSync(path, 'utf8').split('\n').filter(Boolean),
    dispose: () => { closeSync(fd); rmSync(dir, { recursive: true, force: true }); },
  };
}
```

`tests/sessions/template.test.mjs`

```js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assemblyFor } from '@get-modular/assembly';
import { createScope } from '@get-modular/resources';
import { guardHandles, isolate, runContractSuite, smoke } from '@get-modular/conformance';
import { composeSessions } from '../../src/sessions/compose.ts';
import { openSession } from '../../src/sessions/host.ts';
import { cacheDeclaration, createCache } from '../../src/sessions/cache.ts';
import { createStore, storeDeclaration } from '../../src/sessions/store.ts';
import { createStoreFake, storeFakeDeclaration, storeSuite } from '../../src/sessions/testing.ts';
import { fileJournal } from './journal.mjs';

const guard = guardHandles();
const STORE = 'test/sessions/store/memory', CACHE = 'test/sessions/cache/default', ROOT = 'test/sessions/session/default';
const inputs = (journal, id) => ({ journal: { 'test/sessions/journal': journal.port }, session: { 'test/sessions/session-id': { id } } });

// Regression: a module scope captured at bind time makes one session's close release other sessions.
test('sessions: 1000 concurrent sessions of one prepared template release only their own records', async () => {
  const journal = fileJournal();
  try {
    const preparation = await composeSessions(assemblyFor());
    assert.equal(preparation.status, 'prepared');
    const host = createScope({ name: 'host' });
    const sessions = host.resources.child({ name: 'sessions', order: 'concurrent' });
    const opened = await Promise.all(Array.from({ length: 1000 }, (_, k) =>
      openSession(preparation.prepared, sessions.resources, { id: String(k), journal: journal.port })));
    opened.forEach((entry, k) => { assert.equal(entry.ok, true); assert.equal(entry.session.id, String(k)); assert.equal(entry.session.roundTrip(`v${k}`), `v${k}`); });
    const acquired = journal.entries();
    assert.equal(acquired.length, 2000);
    for (let k = 0; k < 1000; k++) assert.ok(acquired.indexOf(`acquire:store:${k}`) < acquired.indexOf(`acquire:cache:${k}`));
    assert.deepEqual(await opened[417].lifetime.close(), { complete: true, settled: true, debts: [] });
    assert.deepEqual(journal.entries().slice(2000), ['release:cache:417', 'release:store:417']);
    const all = await host.control.close();
    assert.deepEqual(all, { complete: true, settled: true, debts: [] });
    const released = journal.entries().slice(2002);
    assert.equal(released.length, 1998);
    assert.equal(released.some(entry => entry.endsWith(':417')), false);
    for (let k = 0; k < 1000; k++) if (k !== 417) assert.ok(released.indexOf(`release:cache:${k}`) < released.indexOf(`release:store:${k}`));
  } finally { journal.dispose(); }
});

// Regression: a failed attempt keeps earlier modules' resources or releases them out of order.
for (const [at, expected] of [
  [STORE, ['acquire:store:s', 'release:store:s']],
  [CACHE, ['acquire:store:s', 'acquire:cache:s', 'release:cache:s', 'release:store:s']],
  [ROOT, ['acquire:store:s', 'acquire:cache:s', 'release:cache:s', 'release:store:s']],
]) {
  test(`sessions: a failure at ${at} releases its attempt in reverse order`, async () => {
    const journal = fileJournal();
    try {
      const steps = await smoke({ api: assemblyFor(), compose: composeSessions, inject: ['fail'], at: [at], inputs: inputs(journal, 's') });
      assert.deepEqual(steps.map(step => [step.inject, step.at ?? null, step.outcome, step.report.complete]),
        [['none', null, 'succeeded', true], ['fail', at, 'failed', true]]);
      assert.deepEqual(journal.entries().slice(4), expected);
    } finally { journal.dispose(); }
  });
}

// Regression: a factory bound outside the given api, or a module that leaves a debt after failure or abort.
test('sessions: smoke fails and aborts every module and every attempt closes complete', async () => {
  const journal = fileJournal();
  try {
    const steps = await smoke({ api: assemblyFor(), compose: composeSessions, inputs: inputs(journal, 's') });
    assert.deepEqual(steps.map(step => [step.inject, step.at ?? null, step.outcome, step.report.complete]), [
      ['none', null, 'succeeded', true],
      ['fail', STORE, 'failed', true], ['abort', STORE, 'cancelled', true],
      ['fail', CACHE, 'failed', true], ['abort', CACHE, 'cancelled', true],
      ['fail', ROOT, 'failed', true], ['abort', ROOT, 'cancelled', true],
    ]);
  } finally { journal.dispose(); }
});

// Regression: run inputs are checked after the first factory instead of before it.
test('sessions: a run without its declared inputs fails before any factory', async () => {
  const journal = fileJournal();
  try {
    const preparation = await composeSessions(assemblyFor());
    const attempt = createScope({ name: 'attempt' });
    const outcome = await preparation.prepared.run({ scope: attempt.resources, inputs: { journal: { 'test/sessions/journal': journal.port } } });
    assert.deepEqual([outcome.status, outcome.phase, outcome.code, outcome.created.length], ['failed', 'inputs', 'assembly.run.invalid-inputs', 0]);
    assert.deepEqual(await attempt.control.close(), { complete: true, settled: true, debts: [] });
    assert.deepEqual(journal.entries(), []);
  } finally { journal.dispose(); }
});

// Regression: a module test builds the factory outside a real run and misses its scope release.
test('sessions: isolate builds the cache against the store fake and releases it', async () => {
  const journal = fileJournal();
  try {
    {
      await using cache = await isolate(assemblyFor(), { declaration: cacheDeclaration, factory: createCache,
        dependencies: { store: createStoreFake(), journal: journal.port, session: { id: 'isolated' } } });
      assert.equal(cache.capabilities['test/sessions/cache'].read('missing'), undefined);
    }
    assert.deepEqual(journal.entries(), ['acquire:cache:isolated', 'release:cache:isolated']);
  } finally { journal.dispose(); }
});

const quiet = Object.freeze({ append: () => {} });
runContractSuite(storeSuite, { name: 'memory', declaration: storeDeclaration, create: async context =>
  (await isolate(assemblyFor(), { declaration: storeDeclaration, factory: createStore, within: context.resources,
    dependencies: { journal: quiet, session: { id: 'suite' } } })).capabilities['test/sessions/store'] }, test);
runContractSuite(storeSuite, { name: 'fake', declaration: storeFakeDeclaration, create: () => createStoreFake() }, test);

test('sessions: the template test file leaves no active handles', async () => { await guard.check(); });
```

`tests/sessions/type-errors.ts`

```ts
import { assemblyFor, declareModule, type Assembly, type CapabilitiesOf, type ModuleFactory } from '@get-modular/assembly';
import { smoke } from '@get-modular/conformance';
import type { ModuleContext } from '@get-modular/resources';
import { Cache, Journal, SessionId, Store, type CachePort, type SessionCapabilities } from '../../src/sessions/contracts.ts';
import { cacheDeclaration } from '../../src/sessions/cache.ts';
import { composeSessions } from '../../src/sessions/compose.ts';
import { storeDeclaration } from '../../src/sessions/store.ts';

// Regression: a declaration spells its wire compatibility instead of using a descriptor.
declareModule({
  moduleId: 'test/sessions/forged', implementationId: 'test/sessions/forged/default',
  owner: { authority: 'test', path: ['sessions', 'forged'] },
  // @ts-expect-error a hand-written entry is not a descriptor entry
  provides: [{ capabilityId: 'test/sessions/store', compatibility: { family: 'exact', familyVersion: 1, token: 'test/sessions/store/r1' } }],
  slots: [],
});

// Regression: a factory returns a capability its declaration does not provide.
type CacheFactory = ModuleFactory<CapabilitiesOf<typeof Store | typeof Journal | typeof SessionId | typeof Cache>,
  typeof cacheDeclaration, CachePort, ModuleContext>;
// @ts-expect-error the product carries exactly the declared capability keys
export const wrongProduct: CacheFactory = async () => ({ instance: { read: () => undefined }, capabilities: { 'test/sessions/store': { put: () => {}, get: () => undefined } } });

// Regression: the binding map lacks a capability that the declaration uses.
declare const partial: Assembly<CapabilitiesOf<typeof Store | typeof Journal>>;
// @ts-expect-error SessionId is used by the store declaration but missing from the map
partial.bindFactory(storeDeclaration, async () => ({ instance: {}, capabilities: { 'test/sessions/store': { put: () => {}, get: () => undefined } } }));

// Regression: a smoke test of a root with declared inputs omits them.
// @ts-expect-error inputs are required when the root declares inputs
void smoke({ api: assemblyFor<SessionCapabilities>(), compose: composeSessions });

// Regression: a run of a template with declared inputs omits them.
declare const preparation: Awaited<ReturnType<typeof composeSessions>>;
if (preparation.status === 'prepared') {
  // @ts-expect-error every run supplies the declared inputs
  void preparation.prepared.run({});
}
```

`tests/sessions/kit-types.ts` (Testing modules rule 2: fakes typed by the module's own declaration; compiled by
`pnpm typecheck`, not a test file, so the test counts do not change)

```ts
import { assemblyFor, type FactoryDependencies } from '@get-modular/assembly';
import { isolate } from '@get-modular/conformance';
import type { SessionCapabilities } from '../../src/sessions/contracts.ts';
import { cacheDeclaration, createCache } from '../../src/sessions/cache.ts';
import { createStoreFake } from '../../src/sessions/testing.ts';

// Positive control: a fake dependency record typed by the module's own declaration (Testing modules, rule 2).
const quiet = { append: (_entry: string): void => {} };
export const cacheDependencies = {
  store: createStoreFake(), journal: quiet, session: { id: 'typed' },
} satisfies FactoryDependencies<SessionCapabilities, typeof cacheDeclaration>;
export const isolatedCache = () => isolate(assemblyFor<SessionCapabilities>(),
  { declaration: cacheDeclaration, factory: createCache, dependencies: cacheDependencies });

// Regression: a fake record that omits a declared slot compiles.
export const missingSlot = () => isolate(assemblyFor<SessionCapabilities>(),
  // @ts-expect-error the session slot is missing from the dependency record
  { declaration: cacheDeclaration, factory: createCache, dependencies: { store: createStoreFake(), journal: quiet } });
```

`scripts/evidence/expected.json`: add `"trainStartIndex": 164` and append these 14 names to `tests`, in this
order, after the last replacement scenario:

```json
"sessions: 1000 concurrent sessions of one prepared template release only their own records",
"sessions: a failure at test/sessions/store/memory releases its attempt in reverse order",
"sessions: a failure at test/sessions/cache/default releases its attempt in reverse order",
"sessions: a failure at test/sessions/session/default releases its attempt in reverse order",
"sessions: smoke fails and aborts every module and every attempt closes complete",
"sessions: a run without its declared inputs fails before any factory",
"sessions: isolate builds the cache against the store fake and releases it",
"test/sessions/store r1: round-trips a value [memory]",
"test/sessions/store r1: returns undefined for an unknown key [memory]",
"test/sessions/store r1: refuses an empty key [memory]",
"test/sessions/store r1: round-trips a value [fake]",
"test/sessions/store r1: returns undefined for an unknown key [fake]",
"test/sessions/store r1: refuses an empty key [fake]",
"sessions: the template test file leaves no active handles"
```

`scripts/evidence/run.mjs`:

```js
// node --test-name-pattern is a regular expression; suite names end with " [subject]".
const exactName = name => `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
const trainFile = name => name.startsWith('close-within: ') ? 'tests/sessions/close-within.test.mjs'
  : name.startsWith('process-group: ') ? 'tests/sessions/process-group.test.mjs'
    : 'tests/sessions/template.test.mjs';
```

- Boundary check next to the existing ones: fail with `invalid train scenario boundary` unless
  `trainStartIndex` is a safe integer, greater than `replacementStartIndex` and smaller than `tests.length`.
- `lifecycleRuns`: `expected.tests.slice(expected.lifecycleStartIndex, expected.trainStartIndex)` and
  `--test-name-pattern=${exactName(name)}` (no existing name contains a regular-expression character, so its
  behavior is unchanged).
- New `trainRuns(root, pair)`: the same loop and totals check as `lifecycleRuns`, over
  `expected.tests.slice(expected.trainStartIndex)`, with `trainFile(name)`, timeout `60000`, log label
  `${pair}.train.<n>`, failure text `${pair}: focused train scenario ${name} did not run exactly once`, rows
  `{ id, expected: 'pass', actual, totals, command }`. Call it as `pair.train = trainRuns(root, label)` right
  after `pair.lifecycle`, and in the archive-only branch as `pair.archiveOnlyTrain`.

`docs/evidence-replay.md`: add the focused train scenarios to the `accepted` list.

### C4 `feat(test): prove the Host close deadline and the POSIX process-group recipe`

`closeWithin` already exists in `src/sessions/host.ts` (C3). New files: the adapter, a Host process for the
deadline, the group fixture and two test files. The process-group file asserts a POSIX platform at load time; the
stand supports macOS and Linux only, and a skip would break the runner's no-skip rule.

`src/adapters/process-group.ts`

```ts
import { spawn, type ChildProcess } from 'node:child_process';
import type { Resources } from '@get-modular/resources';

export type ProcessGroup = { readonly child: ChildProcess; readonly pgid: number; readonly closed: Promise<unknown> };

const exited = (child: ChildProcess): boolean => child.exitCode !== null || child.signalCode !== null;

// ESRCH: no member is left. EPERM after the leader exited: macOS reports it while the remaining
// members are zombies that init has not reaped yet. With a live leader EPERM is a real failure.
function signalGroup(child: ChildProcess, pgid: number, signal: NodeJS.Signals): void {
  try { process.kill(-pgid, signal); } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH' || (code === 'EPERM' && exited(child))) return;
    throw error;
  }
}

/**
 * POSIX recipe from the resources README: a detached leader owns a process group. Release sends SIGTERM
 * to the group, SIGKILL when escalate aborts, and SIGKILL again after the leader closed so no member survives.
 */
export function spawnGroup(resources: Resources, name: string, command: string, args: readonly string[]): Promise<ProcessGroup> {
  return resources.setup({
    name,
    setup: () => {
      const child = spawn(command, args, { detached: true, stdio: ['ignore', 'pipe', 'ignore'] });
      if (child.pid === undefined) throw new Error(`${name}: the leader did not start`);
      const closed = new Promise(resolve => { child.once('close', resolve); });
      return { child, pgid: child.pid, closed };
    },
    cleanup: async ({ child, pgid, closed }, { escalate }) => {
      const kill = (): void => { signalGroup(child, pgid, 'SIGKILL'); };
      signalGroup(child, pgid, 'SIGTERM');
      if (escalate.aborted) kill(); else escalate.addEventListener('abort', kill, { once: true });
      try { await closed; } finally { escalate.removeEventListener('abort', kill); }
      kill();
    },
  });
}
```

`tests/sessions/close-within-child.mjs`

```js
// Host process for the close deadline: prints one JSON report line and exits 1 unless the close completed.
import { createScope } from '@get-modular/resources';
import { closeWithin } from '../../src/sessions/host.ts';

const [mode, grace, abandon] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
const host = createScope({ name: 'host' });
let escalated = false;
await host.resources.setup({ name: 'stuck', setup: () => 'held', cleanup: (_value, { escalate }) => new Promise(resolve => {
  escalate.addEventListener('abort', () => { escalated = true; if (mode === 'honors-escalate') resolve(); }, { once: true });
}) });
const started = performance.now();
const report = await closeWithin(host.control, grace, abandon);
console.log(JSON.stringify({ report, escalated, elapsedMs: performance.now() - started }));
process.exitCode = report.complete ? 0 : 1;
```

`tests/sessions/close-within.test.mjs`

```js
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { guardHandles } from '@get-modular/conformance';

const guard = guardHandles();
const GRACE = 100, ABANDON = 100;
async function host(mode) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./close-within-child.mjs', import.meta.url)), mode, String(GRACE), String(ABANDON)],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  const [code] = await once(child, 'close');
  return { code, lines: stdout.trim().split('\n').filter(Boolean) };
}

// Regression: unreferenced deadline timers let the Host exit 0 before it has a report.
test('close-within: a stuck cleanup escalates, then abandons, and the Host exits 1 with an unsettled report', async () => {
  const { code, lines } = await host('stuck');
  assert.equal(code, 1);
  assert.equal(lines.length, 1);
  const { report, escalated, elapsedMs } = JSON.parse(lines[0]);
  assert.deepEqual(report, { complete: false, settled: false, debts: [{ path: ['host', 'stuck'], state: 'pending' }] });
  assert.equal(escalated, true);
  assert.ok(elapsedMs >= GRACE + ABANDON - 5, `abandoned after ${elapsedMs} ms`);
});

// Regression: the escalate signal never reaches cleanup, so every close waits for abandon.
// A settled report proves abandon did not end the wait; no upper time bound, so load cannot flake it.
test('close-within: a cleanup that honors escalate completes before the abandon deadline', async () => {
  const { code, lines } = await host('honors-escalate');
  assert.equal(code, 0);
  assert.equal(lines.length, 1);
  const { report, escalated, elapsedMs } = JSON.parse(lines[0]);
  assert.deepEqual(report, { complete: true, settled: true, debts: [] });
  assert.equal(escalated, true);
  assert.ok(elapsedMs >= GRACE - 5, `completed after ${elapsedMs} ms`);
});

test('close-within: the test file leaves no active handles', async () => { await guard.check(); });
```

`tests/sessions/process-group-fixture.mjs`

```js
// Leader and grandchild of one process group. "stubborn" members ignore SIGTERM; every member that
// receives SIGTERM appends "<role>:term" to the marker file, an oracle independent of the adapter.
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const [role, mode, marker] = [process.argv[2], process.argv[3], process.argv[4]];
process.on('SIGTERM', () => {
  appendFileSync(marker, `${role}:term\n`);
  if (mode === 'stubborn') { if (role === 'leader') process.stdout.write('term\n'); } else process.exit(0);
});
const keepAlive = setInterval(() => {}, 1_000);
if (role === 'grandchild') {
  process.send('ready');
} else {
  const grandchild = spawn(process.execPath, [fileURLToPath(import.meta.url), 'grandchild', mode, marker], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
  grandchild.once('message', () => {
    grandchild.disconnect();
    process.stdout.write(`${JSON.stringify({ leader: process.pid, grandchild: grandchild.pid })}\n`);
  });
}
void keepAlive;
```

`tests/sessions/process-group.test.mjs`

```js
import { after, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createScope } from '@get-modular/resources';
import { guardHandles } from '@get-modular/conformance';
import { spawnGroup } from '../../src/adapters/process-group.ts';

assert.notEqual(process.platform, 'win32', 'the process-group recipe is POSIX only');
const guard = guardHandles();
const started = new Set();
// Safety net independent of the adapter: a regression must fail the test, never leave a group running.
after(() => { for (const pid of started) { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } } });
const fixture = fileURLToPath(new URL('./process-group-fixture.mjs', import.meta.url));
const markers = mkdtempSync(join(tmpdir(), 'process-group-'));
after(() => { rmSync(markers, { recursive: true, force: true }); });
// ESRCH only: macOS answers EPERM while a member is an unreaped zombie, which is not gone yet.
const gone = pid => { try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; if (error.code === 'EPERM') return false; throw error; } };
// The orphaned grandchild is reaped by init asynchronously; this bounded poll waits for the OS, not for our code.
async function reaped(pids) {
  for (let attempt = 0; attempt < 200; attempt++) { if (pids.every(gone)) return true; await delay(10); }
  return false;
}
async function start(mode) {
  const host = createScope({ name: 'host' });
  const marker = join(markers, `${mode}.log`);
  const group = await spawnGroup(host.resources, 'group', process.execPath, [fixture, 'leader', mode, marker]);
  group.child.stdout.setEncoding('utf8');
  const lines = [];
  let partial = '';
  const next = async () => {
    while (lines.length === 0) {
      const [chunk] = await once(group.child.stdout, 'data');
      const parts = (partial + chunk).split('\n');
      partial = parts.pop();
      lines.push(...parts.filter(Boolean));
    }
    return lines.shift();
  };
  const pids = JSON.parse(await next());
  started.add(pids.leader); started.add(pids.grandchild);
  const terms = () => readFileSync(marker, 'utf8').split('\n').filter(Boolean).sort();
  // Only PIDs not yet confirmed gone stay in the safety net, so a reused PID is never killed.
  const forget = () => { started.delete(pids.leader); started.delete(pids.grandchild); };
  return { host, group, pids, next, terms, forget };
}

// Regression: release sends SIGTERM only to the leader, so the grandchild never gets its graceful signal.
test('process-group: SIGTERM releases a cooperative leader and grandchild', async () => {
  const { host, group, pids, terms, forget } = await start('cooperative');
  assert.equal(group.pgid, pids.leader);
  assert.deepEqual(await host.control.close(), { complete: true, settled: true, debts: [] });
  assert.equal(await reaped([-group.pgid, pids.leader, pids.grandchild]), true);
  forget();
  assert.deepEqual(terms(), ['grandchild:term', 'leader:term']);
});

// Regression: escalate is ignored, so a group that ignores SIGTERM keeps the close pending.
test('process-group: escalate sends SIGKILL to a group that ignores SIGTERM', async () => {
  const { host, group, pids, next, forget } = await start('stubborn');
  const escalate = new AbortController();
  const closing = host.control.close({ escalate: escalate.signal });
  assert.equal(await next(), 'term');
  escalate.abort();
  assert.deepEqual(await closing, { complete: true, settled: true, debts: [] });
  assert.equal(await reaped([-group.pgid, pids.leader, pids.grandchild]), true);
  forget();
});

test('process-group: the test file leaves no active handles', async () => { await guard.check(); });
```

`scripts/evidence/expected.json`: append

```json
"close-within: a stuck cleanup escalates, then abandons, and the Host exits 1 with an unsettled report",
"close-within: a cleanup that honors escalate completes before the abandon deadline",
"close-within: the test file leaves no active handles",
"process-group: SIGTERM releases a cooperative leader and grandchild",
"process-group: escalate sends SIGKILL to a group that ignores SIGTERM",
"process-group: the test file leaves no active handles"
```

Before committing C4, run the process-group file 20 times in a row on macOS and on Linux:
`for i in $(seq 1 20); do node --test tests/sessions/process-group.test.mjs || exit 1; done`, then confirm that no
fixture process is left: `ps -axo pid,command | grep process-group-fixture | grep -v grep` prints nothing.

### C5 `docs(test): record the 0.3.0 train checkpoint`

Run the temporary mutants of section 13 (M1 to M9) in a disposable copy of the C4 head, one at a time, and revert
each. Mutants of `run.mjs` or `pins.json` (M6 to M8) must be committed in that copy, because the runner refuses an
uncommitted source tree; each such run takes about a minute.
Append to `docs/train-030-01.md`:

- `## Results`: the C4 source commit and tree, Node and pnpm versions, platforms (macOS for `pnpm test`, Linux for
  the evidence run), archive table (name, size, SHA-256, SRI, source commit and tree), counts (184 tests, 23
  admission children, 126 focused lifecycle, 20 focused train scenarios), the mutant table (mutant, file, tests
  that failed, restored result).
- `## Claim ledger` with two columns. Permits: the exact retained archives install offline with one copy each
  and conformance peers resolve to them; the unchanged synthetic stand passes on Core/Assembly 0.3.0; one
  builder-declared template prepared once serves 1000 concurrent runs with isolated release; failure and abort
  at every module close their attempt complete in reverse order; the Host deadline escalates, then abandons
  with an unsettled report and a non-zero exit; the POSIX process-group recipe releases a two-level tree that
  ignores SIGTERM. Does not permit: npm publication, Node 26, Windows, production or Agent Runtime adoption,
  physical release of arbitrary resources, members that leave the process group (`setsid`, double fork into a
  new group), untrusted code.
- `## Outstanding work`: none in this repository after npm read-back (section 14). Report the macOS `EPERM`
  observation to Get Modular for the resources README recipe (owner decides on the issue).

Update the counts in `docs/evidence-replay.md`. Commit, then run the final `pnpm evidence` on this clean head on
Linux (Node 24.21.0) and `pnpm test` on macOS.

### C6 `docs(test): retain the 0.3.0 train evidence`

Archive the accepted run of the C5 head and document it in `evidence/accepted/README.md` with the same paragraph
shape as earlier entries (source commit and tree, counts, Node, manifest SHA-256, archive SHA-256, "no
AppleDouble or PAX metadata").

```sh
RUN=evidence/runs/<run-id>
shasum -a 256 "$RUN/evidence.json"
COPYFILE_DISABLE=1 tar --no-xattrs -czf evidence/accepted/<C5 short sha>-train030-run.tar.gz "$RUN"
shasum -a 256 evidence/accepted/<C5 short sha>-train030-run.tar.gz
tar -tzf evidence/accepted/<C5 short sha>-train030-run.tar.gz | grep -c '\._' || true   # must print 0
```

C6 touches only `evidence/accepted/`, which is outside the runner's source paths, so the evidence of the C5 head
stays valid for the C6 head: `git diff --quiet <C5> HEAD -- src tests scripts/evidence package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json third_party docs`
must exit 0.

## 8. What TEST must prove for the train

Existing stand on Core/Assembly 0.3.0, source unchanged (backward compatibility of the Core-helper path):

1. Whole-set admission before any import: the identity and grant regressions that were once candidates for
   `checkNamespaces` stay TEST-owned Host policy and keep refusing before the first loader call, with zero
   evaluation markers: forged owner label (`forged-owner`), path-prefix lookalike (`namespace-lookalike`),
   unknown subject (`unknown-subject`), ungranted provision (`ungranted-provision`), duplicate or ambiguous index
   entries (`duplicate-selection`, `ambiguous-inventory`) and the Core-valid but unauthorized injection
   (`unauthorized-injection`); plus the unit tests in `tests/admission/policy.test.mjs`.
2. Core and Assembly refusals keep their codes and zero factory calls (`tests/admission/preparation.test.mjs`).
3. All lifecycle, stream, cohort, recovery and replacement scenarios pass unchanged (126 focused executions).
4. Probes: distinct root `prepared`; terminal debt `cleanup-incomplete` with one disposer call; import fence
   records only `transitive:evaluate`, `paused:evaluate`.
5. The compiler fixtures in `tests/admission/type-errors.ts` still fail for their reasons.

New train surface (`src/sessions`, `src/adapters`):

6. 1000 concurrent sessions of one prepared template; closing session 417 releases exactly
   `release:cache:417`, `release:store:417`; closing the Host releases the other 1998 records, none of 417, each
   session cache before store; every report is `{ complete: true, settled: true, debts: [] }`.
7. A failure injected after module k releases k..1 in reverse order (store; cache then store; root: cache then
   store), checked against the file journal, not against the library report.
8. `smoke` over the whole root: seven steps, `fail` and `abort` at each of three modules, every attempt complete.
9. A run without its declared inputs fails in phase `inputs` with `assembly.run.invalid-inputs`, no factory runs.
10. `isolate` builds the cache with the store fake and releases its scope (`await using`).
11. One contract suite for `test/sessions/store` r1 passes for the memory module and for the fake, including an
    error case (the port is synchronous, so it has no cancellation case).
12. Compiler: hand-written compatibility in `declareModule`, a wrong product key, a binding map missing a used
    capability, `smoke` without required inputs, `run` without inputs and an `isolate` dependency record that
    misses a slot are rejected; a fake record typed with `FactoryDependencies` compiles.
13. `closeWithin` in a separate Host process: a stuck cleanup is escalated, then abandoned; the process prints an
    unsettled report with one `pending` debt and exits 1, not 0 before the deadline; a cleanup that honors
    escalate completes settled.
14. Process group (POSIX): SIGTERM reaches both the leader and the grandchild of a cooperative group (marker file
    written by each member); a group that ignores SIGTERM is killed on escalate; `ESRCH` for the group and both
    PIDs, observed independently of the adapter.
15. `guardHandles` reports no growth of handle types in each new test file.
16. Install: retained bytes only, one installed copy per package, conformance peers resolved to the consumer's
    copies, no registry resolution of a Get Modular package.

## 9. Gates

Node 24.21.0, pnpm 11.20.0. Every command must exit 0. `pnpm evidence` needs a committed, clean source tree; run it
after the commit and require `"status":"accepted"` in its last output line (it exits 1 when `pending`).

| After | Gates |
|---|---|
| C1 | `shasum -a 256 third_party/standards/common-assembly.md` equals the pin; `pnpm typecheck`; `pnpm test` (164/164); `git diff --check` |
| C2 | `rm -rf node_modules && pnpm install --frozen-lockfile --offline`; `pnpm typecheck`; `pnpm test` (164/164); `ls node_modules/.pnpm \| grep -c '^@get-modular+'` prints `5`; `pnpm evidence` accepted; `git diff --check` |
| C3 | `pnpm typecheck`; `pnpm test` (178/178); `pnpm evidence` accepted |
| C4 | `pnpm typecheck`; `pnpm test` (184/184); the 20-run process-group loop on macOS and Linux; `pnpm evidence` accepted |
| C5 | final `pnpm evidence` accepted on Linux; `pnpm test` (184/184) on macOS |
| C6 | the `git diff --quiet` source check of C6; archive listing without AppleDouble entries |

`pnpm evidence` gives every child a fresh `HOME`, disables Corepack network access and installs `--offline`.
Unless the `pnpm` on `PATH` is a real pnpm 11.20.0 binary, pass a populated Corepack cache and a pnpm store that
already holds `typescript@7.0.2` and `@types/node@24.19.0`:
`COREPACK_HOME=<Corepack cache, for example $HOME/.cache/node/corepack> TEST_EVIDENCE_PNPM_STORE=<pnpm store root, the output of pnpm store path without the trailing /v11> pnpm evidence`.
Seed the store once with an online `pnpm install --frozen-lockfile` in the repository (also before check 4 on a
fresh machine). A `pending` run with `pnpm 11.20.0 unavailable` or `ERR_PNPM_NO_OFFLINE_TARBALL` is an environment
error, not a stand result. On the owner's macOS machine both variables were required.

Linux runs use an official Node 24.21.0 build, pnpm 11.20.0, the same two variables, and a PID 1 or subreaper that
reaps orphans (a systemd host, or a container started with `--init`); the process-group test waits for the
orphaned grandchild to be reaped. A heavy run may go to a hosted TEST workspace (Linux) in its own directory; it
never touches other processes or checkouts. If a global git hook interferes with commits, use a git config file that contains only the `[user]`
section of the local identity and point `GIT_CONFIG_GLOBAL` to it for that command; never weaken a hook silently.

## 10. Risks and stop conditions

| Risk | Stop / action |
|---|---|
| Archive size, hash or manifest differs from the intent record or 1.2 | stop; never re-pack |
| Standard bytes at `81063ad`, the archive source commit or get-modular main differ from `49d08b6d...` | stop; a newer revision needs a plan update |
| Any existing test, admission child or probe fails on 0.3.0 | stop and report to Get Modular with the failing name and output; do not edit TEST to hide it. This is the point of the replay |
| Type error inside Get Modular declarations (`skipLibCheck: false`) | stop and report; no casts, no `any`, no `skipLibCheck` |
| `smoke`, `isolate` or a suite fails for a reason inside conformance | stop and report |
| Lock resolves a Get Modular package from the registry, or two installed copies of one package | stop |
| Process-group test flakes in the 20-run loop, or a fixture process survives | stop; do not add sleeps, retries or longer polls |
| `close-within` timing assertion fails under load | stop and report the measured value; the lower bounds have 5 ms tolerance and there is no upper bound by design |
| The runner reports a focused scenario "did not run exactly once" | check the name escaping first; never weaken the totals check |
| Registry already has 0.3.0/0.1.0 with a different integrity | stop: the published bytes are not the tested bytes |
| A process-group test fails only on Linux and a member stays in state `Z` (`ps -o pid,stat,ppid -p <pid>`) | environment without an orphan reaper: stop and report; do not change the poll or the adapter |
| `pnpm evidence` pending with `pnpm 11.20.0 unavailable` or `ERR_PNPM_NO_OFFLINE_TARBALL` | environment: set `COREPACK_HOME` and `TEST_EVIDENCE_PNPM_STORE` (section 9); never edit the runner for it |
| ENOSPC | stop; delete only your own temporary copies |
| Anything not covered here | stop and ask |

## 11. Must not be done

- No npm login, publish, dist-tag or registry install of `@get-modular/*`; no re-pack of the archives.
- No change to `src/admission/`, `src/fixtures/`, `src/host/`, `src/inventory/`, `tests/admission/`,
  `tests/lifecycle/`, the three probe scripts, `docs/implementation-plan.md` or the existing checkpoint documents.
- No edit of existing `evidence/accepted/*.tar.gz`; only additions to `evidence/accepted/`.
- No `any`, `as never`, double casts or `skipLibCheck` in new code; no sleeps in tests except the documented
  bounded reaping poll; no skipped tests.
- No gate weakening: the runner's totals, name and pin checks stay strict.
- No identity override, no `--no-verify`, no `Co-Authored-By`, no tool or generator attribution.
- No destructive git commands (`checkout --`, `restore`, `reset --hard`, `clean -f`, `stash drop`, `branch -D`);
  force push only to the own unshared branch.
- No CI workflow, ruleset or permission change; no GitHub comments or issues outside the own PR.
- No merge by the implementer.

## 12. Done criteria

- Commits C1 to C6 on `feat/train-030`, each with its gates green, and a PR open with the body of section 14.
- `third_party/pins.json` pins the standard at `81063ad` with six fields and the four archives with version, path,
  SHA-256, SRI, source commit and tree; the archives are byte-equal to the intent record.
- Final evidence accepted for the C5 head: 184 named tests, 23 admission children, 126 focused lifecycle and 20
  focused train scenarios, probes as listed, one subject `train-0.3`, replay root outside the repository.
- `docs/train-030-01.md` complete (pin delta, dispositions, results, mutants, claim ledger).
- Independent review clean, re-review after fixes clean.
- Before npm publication, with the PR still open: hand the release operator, for the `TEST-1` row of
  "Consumer checks on these bytes" in `release-intent.md`: PR URL, reviewed head SHA, C5 commit and tree,
  `evidence.json` SHA-256, the C6 archive SHA-256, the platform of each gate, and "independent review clean". This
  is the TEST sign-off for publication; the merge after read-back is a separate, later step.
- Merged by the owner after npm read-back (section 14).

## 13. Independent review checklist

Run in a fresh clone of the PR head, Node 24.21.0, pnpm 11.20.0.

1. Identity: `git log --format='%an <%ae> | %cn <%ce>' origin/main..HEAD` shows only
   `iliya <iliyazelenkog@gmail.com>`; no `Co-Authored-By`, no tool or generator attribution in commits, files or PR text.
2. Untouched stand: `git diff --stat origin/main...HEAD -- src/admission src/fixtures src/host src/inventory tests/admission tests/lifecycle scripts/evidence/distinct-root-probe.mjs scripts/evidence/terminal-debt-probe.mjs scripts/evidence/import-fence-probe.mjs docs/implementation-plan.md`
   prints nothing.
3. Archives: recompute size, SHA-256 and SRI of `third_party/archives/train-0.3/*.tgz` (command of 1.2) and
   compare with `third_party/pins.json` and with the release intent record; check the manifest facts of 1.2.
4. Standard: `shasum -a 256 third_party/standards/common-assembly.md` and the three-commit comparison of 1.1;
   recount the delta (`git diff --numstat` gives `432 31`, 17 `@@` lines); read the disposition table against
   the standard text.
5. Lock and install: every Get Modular key in `pnpm-lock.yaml` is a `file:` key with the pinned SRI;
   `rm -rf node_modules && pnpm install --frozen-lockfile --offline`; `ls node_modules/.pnpm | grep '^@get-modular+'`
   shows five entries; resolve conformance's peers with `createRequire` and compare real paths.
6. Gates: `pnpm typecheck`, `pnpm test` (184), `pnpm evidence` (accepted). Open `evidence.json`: subject
   `train-0.3`, `installRoot` outside the clone, `platform`, standard fields, counts.
7. Runner reading: replay root outside the repository with the inside-check; conformance peers compared as a
   record; regular-expression escaping in both focused loops; boundary checks; no relaxed totals.
8. New code reading: no casts or `any` (`grep -rnE '\bany\b|as unknown as|as never' src/sessions src/adapters`
   prints nothing); factories exported unbound and bound only in `compose.ts`; `scoped()` only around factories
   that register resources; no closure-captured scope; inputs are plain records; `testing.ts` imported only by
   tests; timers only in `closeWithin` and the reaping poll.
9. Mutants, one at a time in a disposable copy, then restore and rerun:

   | # | Mutation | Expected failure |
   |---|---|---|
   | M1 | `compose.ts`: bind the cache through a fresh `assemblyFor<SessionCapabilities>()` instead of `api` | the three failure tests and the smoke test (smoke reports a factory bound outside the api) |
   | M2 | `compose.ts`: bind the store with `(deps, context) => createStore(deps, { signal: context.signal, resources: shared.resources })` over one `createScope` made at bind time | the 1000-session test and the three failure tests |
   | M3 | `store.ts`: cleanup without the `release:store` journal entry | the 1000-session test and the three failure tests |
   | M4 | `host.ts`: `toAbandon.unref()` | the stuck `close-within` test (the Host exits without a report) |
   | M5 | `process-group.ts`: `process.kill(pgid, signal)` instead of `-pgid` | both process-group tests, within seconds, with no fixture process left |
   | M6 | `third_party/pins.json`: change one character of the conformance SRI | `pnpm evidence` pending with `trainSet/conformance: archive pin or manifest mismatch` |
   | M7 | `run.mjs`: use `^${name}$` without escaping in `trainRuns` | `pnpm evidence` pending with six "did not run exactly once" failures for the suite scenarios |
   | M8 | `run.mjs`: create the replay root under `evidence/` again | `pnpm evidence` pending with "replay root is inside the source repository" |
   | M9 | `process-group.ts`: send the first SIGTERM with `process.kill(pgid, 'SIGTERM')` (leader only) | the cooperative process-group test (`grandchild:term` missing) |

   Commit M6 to M8 inside the disposable copy; the runner refuses an uncommitted source tree. All nine were
   confirmed during planning or by the independent review of this plan.
10. Process cleanliness: after `pnpm test`, `ps -axo pid,command | grep process-group-fixture | grep -v grep`
    prints nothing.
11. Docs: claims in `docs/train-030-01.md`, `docs/evidence-replay.md`, `README.md` and `AGENTS.md` do not exceed
    the claim ledger; the retired-subject note names `f7b578c`.

## 14. PR, merge and follow-up

- Title `feat(test): adopt the Get Modular 0.3.0 train`. Body in plain English: scope; archive table and source
  commit; standard pin change; counts; mutant table; limits from the claim ledger; "npm publication pending, merge
  after registry read-back".
- Source commit after a release merge: the bundle is packed from the release PR head (owner decision); keep that
  SHA and its tree in `third_party/pins.json`; it is where the bytes were packed. Do not edit pinned files after the evidence
  run. After the owner merged the release, add one commit that touches only `evidence/accepted/README.md`:
  "Release merge `<merge SHA>` has tree `<tree>`; the archive source commit `<R1A_SHA>` has tree `<R1A_TREE>`;
  <the trees are equal | the release record shows the source check of the merged commit passed>." Read the tree
  with `git rev-parse <merge SHA>^{tree}`. The trees may legitimately differ: when get-modular main moved outside
  the release inputs, the release branch merges main without regenerating, and the release record then proves
  the bytes by a source check (a fresh pack of the merged commit whose normalized content digests equal the
  bundle's, and Core, Assembly and resources byte-equal to `SHA256SUMS`). If the trees differ and
  `release-intent.md` does not record that passed source check for this merge, stop. `evidence/accepted/` is
  outside the runner's source paths, so the accepted evidence stays valid. The reviewer re-reviews this commit,
  and the owner merges with `--match-head-commit` on the new head.
- Merge condition: after the owner publishes the train, for each package
  `npm view @get-modular/<name>@<version> dist.integrity` equals the pinned SRI. Then the owner merges with squash
  and `--match-head-commit <reviewed head>`; afterwards `git diff --quiet <C5> origin/main -- src tests scripts/evidence package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json third_party docs`
  must exit 0. No TEST file changes after publication when the bytes are equal.
- If the release is repacked or changed before publication, update this PR with the new archives (C2 values and a
  fresh evidence run) and replace this PR's own C6 archive and paragraph (they are not on main yet) instead of
  opening a second PR. Never add evidence for bytes that will not be published.

## 15. Where this plan lives

Add this document as `docs/train-030-plan.md` in `agent-teams-ai/modularity-host-test` through its own docs PR
before implementation: branch `docs/train-030-plan`, one commit
`docs(test): plan the Get Modular 0.3.0 train adoption` that adds the file and one line to `AGENTS.md` after the
first paragraph: "Train 0.3.0 adoption follows `docs/train-030-plan.md`; read it before that work." The repository
has no documentation linter; its rules are the `AGENTS.md` commit rules, the required `commit-author-identity`
check and plain English for a public repository (no local paths, no internal host names). The checkpoint record
`docs/train-030-01.md` is written by the implementation (C1, C5), not by the docs PR.
