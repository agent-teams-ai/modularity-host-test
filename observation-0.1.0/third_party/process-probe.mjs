import assert from "node:assert/strict";
import { createScope } from "@get-modular/resources";
import { createStore } from "../dist/index.js";
import { delivered, settled } from "../dist/testing.js";
const mode = process.argv[2];
if (mode === "import-idle") {
  assert.ok(process.getActiveResourcesInfo().every(value => value !== "Immediate" && value !== "Timeout"));
  console.log("ok import-idle");
} else {
  const host = createScope({ name: "process" }); const reports = [];
  const store = createStore({ a: 0, b: 0 }, { name: "settings", resources: host.resources, reportError: report => {
    reports.push(report);
    if (mode === "throwing-reporter") throw new Error("reporter boom");
    if (mode === "echo-exit") console.log(`REPORT ${report.cause.code}`);
  } });
  const facet = store.readonly();
  if (mode === "echo-exit") {
    facet.watch(facet.read(["a"]), { resources: host.resources, name: "echo", onChange: () => {
      void (async () => { await Promise.resolve(); store.set({ a: 2 }); })();
    } });
    store.set({ a: 1 }); await delivered();
  } else if (mode === "throwing-reporter") {
    facet.watch(facet.read(["a"]), { resources: host.resources, name: "throws", onChange: () => { throw new Error("callback boom"); } });
    store.set({ a: 1 }); await delivered();
  } else if (mode.startsWith("abort-listener")) {
    const uncaught = [];
    if (mode === "abort-listener") process.on("uncaughtException", error => { uncaught.push(error.message); });
    let release; let count = 0; const seen = [];
    facet.load(facet.read(["a"]), { resources: host.resources, name: "load",
      loader: (_next, { signal }) => {
        count += 1; if (count > 1) return 2;
        signal.addEventListener("abort", () => { throw new Error("listener boom"); }, { once: true });
        return new Promise(resolve => { release = resolve; });
      }, onLoading: () => undefined, onResult: () => undefined, onError: () => undefined });
    facet.watch(facet.read(["b"]), { resources: host.resources, name: "healthy", onChange: next => { seen.push(next.revision); } });
    await delivered(); store.set({ a: 1 }); await delivered(); store.set({ b: 1 }); await delivered();
    release(1); await settled();
    assert.deepEqual(uncaught, ["listener boom"]); assert.deepEqual(seen, [2]);
    console.log(JSON.stringify({ uncaught, seen }));
  } else if (mode === "return-isolation") {
    let healthy = 0; let calls = 0;
    facet.watch(facet.read(["a"]), { resources: host.resources, name: "invalid", onChange: () => {
      calls += 1; return calls === 1 ? Promise.resolve().then(() => { store.set({ a: 99 }); }) : undefined;
    } });
    facet.watch(facet.read(["a"]), { resources: host.resources, name: "healthy", onChange: () => { healthy += 1; } });
    store.set({ a: 1 }); await delivered(); store.set({ a: 2 }); await delivered();
    assert.equal(healthy, 2); assert.equal(calls, 2);
    assert.deepEqual(reports.map(report => report.cause.code).sort(), ["observation.callback.returned-value", "observation.delivery.echo"]);
    console.log("ok return-isolation");
  } else throw new Error(`unknown mode ${mode}`);
  await host.control.close();
}
