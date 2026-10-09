# Modularity Host TEST

An isolated consumer of Get Modular Core, Assembly, resources and
conformance (train 0.3.0). The stand tests admission
before executable import and one Host's lifecycle ownership using fixed,
synthetic in-memory fixtures. It does not qualify a production Host, arbitrary
plugin code, Agent Runtime ownership checkpoints, or Node versions outside the
exact package engine range.

A builder-declared session template under `src/sessions/` proves per-run scopes, run
inputs and the conformance kit on the same archives.

The reviewed implementation scope and evidence limits are in
[the implementation plan](docs/implementation-plan.md). This repository is an
explicit TEST project: no real user project is used for runtime or agent-flow
tests.
