# Modularity Host TEST

An isolated consumer of Get Modular Core and Assembly. The stand tests admission
before executable import and one Host's lifecycle ownership using fixed,
synthetic in-memory fixtures. It does not qualify a production Host, arbitrary
plugin code, Agent Runtime ownership checkpoints, or Node versions outside the
exact package engine range.

The reviewed implementation scope and evidence limits are in
[the implementation plan](docs/implementation-plan.md). This repository is an
explicit TEST project: no real user project is used for runtime or agent-flow
tests.
