# TEST Host lifecycle checkpoint

This checkpoint extends the published 0.1.0 stand. It is a synthetic Host contract test, not Agent Runtime, Extension Foundation, or OpenClaw conformance. The existing admission path still compiles the selected graph with public Core, prepares with public Assembly, and executes `prepared.run({ signal })` through the retained `TestHost`.

The owner publishes its construction ticket before calling Assembly. It permits one pre-seal resource reservation, accepts delivery against that reservation until construction settles, and drains construction and operation tickets before one disposal. Its close promise is retained before abort callbacks run. Raw Assembly outcomes remain on the construction result; a Host cancellation can therefore coexist with a raw success. Observer pending receipts leave the raw close flight alone.

`tests/lifecycle/lifecycle.test.mjs` runs the fixed four-node composition through the exact installed 0.1.0 Core and Assembly pair. It covers single flight, shared identity, saved handles, real top-level-await import, both acquisition timing orders, late valid and malformed products, rejection after abort, handoff seal, operation drain and commit fence, reentrant close, sync and async cleanup failure, and observer pending/terminal priority. The import fixture is only inside this TEST repository. Admission subprocess tests retain their independent loader/evaluation/effect/disposal markers.

Current execution checks in this workspace:

- `pnpm install --frozen-lockfile --offline`: passed outside the worker sandbox.
- `pnpm typecheck`: passed with `skipLibCheck:false`.
- `pnpm test`: passed, 54 substantive tests. The Host source was renamed so Node's automatic test discovery no longer counts a source import as a test.
- `git diff --check`: passed.

The required temporary four-mutant review and separate 0.2.0 exact-pair replay belong to later review/replay checkpoints and are not claimed here. The tests observe retained observer entries, instrumented signal listeners and controlled timers reaching zero in the abort/deadline cases. Detached callbacks after ticket settlement are refused; arbitrary hostile asynchronous work is outside this cooperative fixture. No production runtime/provider effect or real-project fixture is used.
