# Modularity Host TEST

An isolated consumer of Get Modular Core, Assembly, resources and
conformance (train 0.4.0). The stand tests admission
before executable import and one Host's lifecycle ownership using fixed,
synthetic in-memory fixtures. It does not qualify a production Host, arbitrary
plugin code, Agent Runtime ownership checkpoints, or Node versions outside the
exact package engine range.

The default runtime is Node 26.11.1 (`.node-version`), with pnpm 11.20.0.
Node 24.18.0 and 24.21.0 remain compatibility replay binaries. All five pinned
Get Modular archives declare support for both Node 24 and Node 26; accepted
historical receipts describe only their recorded execution binary. Current replay
commands and acceptance requirements are in [evidence replay](docs/evidence-replay.md).

A builder-declared session template under `src/sessions/` proves per-run scopes, run
inputs and the conformance kit on the same archives.

The reviewed implementation scope and evidence limits are in
[the implementation plan](docs/implementation-plan.md). This repository is an
explicit TEST project: no real user project is used for runtime or agent-flow
tests.
