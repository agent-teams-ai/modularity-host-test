# Exact-pair TEST evidence replay

Run under Node 24.21.0 and pnpm 11.20.0 in this TEST repository:

```sh
pnpm install --frozen-lockfile --offline
pnpm typecheck
pnpm test
pnpm evidence
```

`pnpm evidence` creates separate disposable roots for the published 0.1.0 and
candidate 0.2.0 archives. Its 0.2.0 manifest, exact override and lock are in
`evidence/candidate-0.2/`; the root manifest and lock continue to install the
published 0.1.0 pair. The runner copies only this TEST stand's source and tests,
disables pnpm's registry-backed release-age check in the disposable 0.1.0 copy,
and requests a frozen offline install. A preseeded writable store may be supplied
as `TEST_EVIDENCE_PNPM_STORE`. It does not change the root lock or package defaults.

Each run writes `evidence/runs/<run-id>/evidence.json` and hashed command logs.
`accepted` requires both frozen installs, package-root resolution, pinned compiler
typechecks, all 59 named tests with no skipped or extra test, all 23 direct
admission child scenarios with their expected ordered markers, 17 focused
lifecycle executions with per-process marker logs, a retained import-fence
marker from the child scenario, the 0.1.0 negative
and 0.2.0 positive distinct-root preparation probe, and a real Assembly
construction with retained cleanup debt. It also requires a committed source
snapshot so the recorded Git commit and tree cover the executed files. A failed
install leaves `pending` and exits nonzero. Archive-only replay after an install
failure is diagnostic and cannot change that status. Probe JSON uses fixture-owned
IDs and booleans; it does not export raw resource, product or error objects.

The candidate archives were packed from clean Get Modular source commit
`6b31f20fe3e5fb8324812aa2ee907905751cde71`; they are not npm publication
evidence. This fixed synthetic Host says nothing about Agent Runtime, Extension
Foundation or OpenClaw product conformance.
