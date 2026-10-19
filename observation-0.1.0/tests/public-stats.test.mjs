import assert from "node:assert/strict";
import test from "node:test";
import { createScope } from "@get-modular/resources";
import { createStore } from "@get-modular/observation";
import { publicStats } from "../tools/public-stats.mjs";

test("O-07 writer statistics adapter preserves public full-record revisions and post-close live counts", async () => {
  const host = createScope({ name: "stats" }); const child = host.resources.child({ name: "watcher" });
  const store = createStore({ a: 0, b: 0 }, { resources: host.resources, name: "stats", reportError: () => undefined });
  const facet = store.readonly(); const owner = publicStats(store, ["a", "b"]); const reader = publicStats(facet, ["a", "b"]);
  assert.equal(owner.commits, 0); store.set({ a: 1 }); store.set({ b: 1 }); store.set({ b: 1 });
  assert.equal(owner.commits, 2); assert.equal(reader.commits, 2);
  facet.watch(facet.read(["a"]), { resources: child.resources, name: "stats/watch", onChange: () => undefined });
  assert.equal(reader.live, 1); await child.control.close(); assert.equal(reader.live, 0);
  assert.throws(() => owner.walked, /writer.stats.unknown-field:walked/u);
  assert.throws(() => publicStats(facet).commits, /writer.stats.unknown-record/u);
  await host.control.close(); assert.equal(owner.commits, 2); assert.equal(owner.live, 0); assert.equal(reader.live, 0);
  assert.throws(() => reader.commits, { code: "observation.store.closed" });
});
