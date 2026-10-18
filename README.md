# Modularity Host TEST

An isolated consumer of Get Modular Core, Assembly, resources and
conformance (train 0.5.0). The stand tests admission
before executable import and one Host's lifecycle ownership using fixed,
synthetic in-memory fixtures. It does not qualify a production Host, arbitrary
plugin code, Agent Runtime ownership checkpoints, or Node versions outside the
exact package engine range.

The default runtime is Node 26.11.1 (`.node-version`), with pnpm 11.20.0.
Node 24.18.0 and 24.21.0 remain compatibility replay binaries. All five pinned
Get Modular archives declare support for both Node 24 and Node 26; accepted
historical receipts describe only their recorded execution binary. Current replay
commands and acceptance requirements are in [evidence replay](docs/evidence-replay.md).

The `counter` feature, the `sessions` feature and its private `storage` sub-feature
prove the 0.5.0 module layout, per-run scopes, run inputs and the conformance kit on
the same archives. This repository claims no Feature Module Standard conformance;
it follows the sub-feature rules of the FMS v1.1 draft.

FMS nested rules: review-only until the follow-up PR (QN8). `pnpm lint` and
`pnpm layout` gate the Get Modular layout and import rules; `pnpm layout` prints
the growth report.

The reviewed implementation scope and evidence limits are in
[the implementation plan](docs/implementation-plan.md). This repository is an
explicit TEST project: no real user project is used for runtime or agent-flow
tests.
