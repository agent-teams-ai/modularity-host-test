# Exact-pair TEST evidence replay

Run under Node 24.18.0 or 24.21.0 and pnpm 11.20.0 in this TEST repository:

```sh
pnpm install --frozen-lockfile --offline
pnpm typecheck
pnpm test
pnpm evidence
```

`pnpm evidence` creates separate disposable roots for the published 0.1.0 and
candidate 0.2.0 archives. Its 0.2.0 manifest, exact override and lock are in
`evidence/candidate-0.2/`; the root manifest and lock continue to install the
published 0.1.0 pair. Both roots also install the same separately pinned private
`@get-modular/lifecycle-kernel` candidate tarball. The runner copies only this
TEST stand's source and tests,
disables pnpm's registry-backed release-age check in the disposable 0.1.0 copy,
and requests a frozen offline install. A preseeded writable store may be supplied
as `TEST_EVIDENCE_PNPM_STORE`. It does not change the root lock or package defaults.

Each run writes `evidence/runs/<run-id>/evidence.json` and hashed command logs.
The runner places the reviewed Node executable first on child `PATH` and records
the resolved binary and version for each pair. Admission markers have a complete
expected event sequence. Lifecycle and probe marker counts are labeled partial;
an absent marker is never presented as a zero total. The cleanup probe separately
records its fixture-owned disposer counter.
`accepted` requires both frozen installs, package-root resolution, pinned compiler
typechecks, all 143 named tests with no skipped or extra test, all 23 direct
admission child scenarios with their expected ordered markers, 105 focused
lifecycle executions with per-process marker logs, a retained import-fence
marker from the child scenario, the 0.1.0 negative
and 0.2.0 positive distinct-root preparation probe, and a real Assembly
construction with retained cleanup debt. It also requires a committed source
snapshot so the recorded Git commit and tree cover the executed files. A failed
install leaves `pending` and exits nonzero. Archive-only replay after an install
failure is diagnostic and cannot change that status. Probe JSON uses fixture-owned
IDs and booleans; it does not export raw resource, product or error objects.
The fifteen L2b lifecycle scenarios cover the bounded
[L2b TEST checkpoint](lifecycle-kernel-l2b.md); twenty-three additional scenarios
cover the [H04 stream terminal checkpoint](lifecycle-kernel-h04.md). Nineteen
additional scenarios cover the [H06/H09 fixed cohort checkpoint](lifecycle-kernel-h06-cohort.md).
Twelve additional scenarios cover the [H13 bounded recovery inventory](lifecycle-kernel-h13-recovery.md).
Thirteen additional scenarios cover the [L2c0 staged construction and exclusive stop](lifecycle-kernel-l2c0.md).
Twenty-one additional scenarios cover [L2c1 synthetic exclusive replacement](lifecycle-kernel-l2c1.md).
They do not certify durable recovery or production replacement.

The Core/Assembly 0.2.0 candidate archives were packed from clean Get Modular
source commit `6b31f20fe3e5fb8324812aa2ee907905751cde71`. The separate
private lifecycle-kernel tarball was packed from clean commit
`e0e2290cfcbf8d8300beaa57aee9c8337429d67d`. The current Consumer Module Standard is pinned to merged Get Modular commit
`81063add7de50ffe2b91cc74bf7271b298624c21` (#142); `docs/train-030-01.md` classifies the delta. These are not npm publication
evidence. This fixed synthetic Host says nothing about Agent Runtime, Extension
Foundation or OpenClaw product conformance.

The historical selected accepted run and four deliberate mutant failures are
preserved under `evidence/accepted/` with archive and manifest hashes. The generated
`evidence/runs/` directory remains ignored so exploratory runs do not enter PRs.
