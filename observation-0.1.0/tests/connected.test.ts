import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor, entriesOf } from "@get-modular/assembly";
import { checkWiring } from "@get-modular/conformance";
import { createScope } from "@get-modular/resources";
import { asyncDetection, delivered, liveSubscriptions, settled } from "@get-modular/observation/testing";
import { compose, inputs, modules } from "../src/composition/root.js";
import type { Capabilities } from "../src/composition/contracts.js";
import { createControls } from "./controls.js";
import { expectedWiring } from "./wiring.js";

const api = assemblyFor<Capabilities>();
const preparation = await compose(api);
assert.equal(preparation.status, "prepared");
if (preparation.status !== "prepared") throw new Error("observation-test.preparation.failed");
const prepared = preparation.prepared;

test("O-01 independent provider/input/root pins qualify the exact selected declarations", () => {
  const declarations = [...entriesOf(modules).map(entry => entry.declaration),
    inputs.identity.declaration, inputs.queries.declaration, inputs.host.declaration];
  checkWiring(preparation.composition, [expectedWiring], { declarations });
});

test("O-02 through O-05 await catch-up, physical supersession, attributed failure and sibling close independence", { timeout: 15000 }, async t => {
  assert.equal(asyncDetection, true);
  const left = createControls("left"); const right = createControls("right");
  const leftScope = createScope({ name: "left-attempt" }); const rightScope = createScope({ name: "right-attempt" });
  t.after(async () => {
    const closing = [leftScope.control.close(), rightScope.control.close()];
    left.releaseAll(); right.releaseAll(); await Promise.all(closing);
  });
  const leftStartup = prepared.run({ scope: leftScope.resources, inputs: left.inputs });
  const rightStartup = prepared.run({ scope: rightScope.resources, inputs: right.inputs });
  await Promise.all([left.acquisitionReached, right.acquisitionReached]);
  const leftOwner = await left.settingsReady; const rightOwner = await right.settingsReady;
  // These commits occur after each consumer read but while its own setup remains held. No delivery barrier intervenes.
  leftOwner.commands.region("before-left"); rightOwner.commands.region("before-right");
  left.releaseAcquisition(); right.releaseAcquisition();
  const [leftOutcome, rightOutcome] = await Promise.all([leftStartup, rightStartup]);
  assert.equal(leftOutcome.status, "succeeded"); assert.equal(rightOutcome.status, "succeeded");
  if (leftOutcome.status !== "succeeded" || rightOutcome.status !== "succeeded") throw new Error("observation-test.construction.failed");
  const leftPort = leftOutcome.roots.app; const rightPort = rightOutcome.roots.app;
  await delivered({ stores: [leftOwner.facet, rightOwner.facet] });
  assert.equal(left.runs.length, 1); assert.equal(right.runs.length, 1);
  const firstLeft = left.runs[0]!; const firstRight = right.runs[0]!;
  assert.deepEqual([firstLeft.identity, firstLeft.region, firstRight.identity, firstRight.region],
    ["left", "before-left", "right", "before-right"]);
  assert.equal(leftPort.settings, leftOwner.facet); assert.equal(rightPort.settings, rightOwner.facet);
  assert.notEqual(leftPort.settings, rightPort.settings);

  leftPort.commands.region("after-left"); await delivered({ stores: [leftOwner.facet] });
  assert.equal(firstLeft.signal.aborted, true); assert.equal(firstRight.signal.aborted, false);
  firstLeft.result.resolve("obsolete-left"); await delivered({ stores: [leftOwner.facet] });
  assert.equal(left.runs.length, 1, "the next query cannot overlap cleanup of the physical old query");
  firstLeft.cleanup.resolve(); await delivered({ stores: [leftOwner.facet] });
  assert.equal(left.runs.length, 2); const currentLeft = left.runs[1]!;
  assert.equal(currentLeft.region, "after-left");
  currentLeft.result.resolve("opaque-left-result"); currentLeft.cleanup.resolve();
  firstRight.result.resolve("opaque-right-result"); firstRight.cleanup.resolve();
  await settled({ stores: [leftOwner.facet, rightOwner.facet] });
  assert.deepEqual(leftPort.projection.current(), { status: "ready", identity: "left", region: "after-left", result: "opaque-left-result" });
  assert.deepEqual(rightPort.projection.current(), { status: "ready", identity: "right", region: "before-right", result: "opaque-right-result" });
  assert.deepEqual(leftPort.catalog.current(), { status: "ready", region: "after-left", models: [{ id: "after-left-1", label: "after-left" }] });
  leftPort.logger.log("warn", "connected logger reference");

  const callbackScope = leftScope.resources.child({ name: "controlled-callbacks" });
  const sentinel = new Error("controlled callback failure"); let unhealthy = 0; let healthy = 0;
  leftOwner.facet.watch(leftOwner.facet.read(["logLevel"]), { resources: callbackScope.resources, name: "left/controlled-failure",
    onChange: () => { unhealthy += 1; if (unhealthy === 1) throw sentinel; } });
  leftOwner.facet.watch(leftOwner.facet.read(["logLevel"]), { resources: callbackScope.resources, name: "left/healthy",
    onChange: () => { healthy += 1; } });
  leftPort.commands.logLevel("debug"); await delivered({ stores: [leftOwner.facet] });
  assert.equal(healthy, 1); assert.equal(left.reports.length, 1);
  assert.deepEqual(left.reports[0], { source: "settings", subscription: "left/controlled-failure", revision: 3, cause: sentinel });
  leftPort.commands.logLevel("warn"); await delivered({ stores: [leftOwner.facet] });
  assert.equal(unhealthy, 2); assert.equal(healthy, 2); assert.equal(left.reports.length, 1);

  leftPort.commands.region("closing-left"); await delivered({ stores: [leftOwner.facet] });
  const closingRun = left.runs[2]!; assert.equal(closingRun.region, "closing-left");
  const retained = leftPort.projection.current(); const closeLeft = leftScope.control.close();
  assert.equal(closingRun.signal.aborted, true); assert.equal(liveSubscriptions(leftOwner.facet), 0);
  await delivered({ stores: [leftOwner.facet] });
  closingRun.result.resolve("too-late-left"); closingRun.cleanup.resolve();
  assert.deepEqual(await closeLeft, { complete: true, settled: true, debts: [] });
  await delivered({ stores: [leftOwner.facet] });
  assert.deepEqual(leftPort.projection.current(), retained); assert.equal(liveSubscriptions(leftOwner.facet), 0);
  assert.deepEqual(left.released, ["left"]); assert.equal(left.completed.length, 3);

  rightPort.commands.region("still-right"); await delivered({ stores: [rightOwner.facet] });
  assert.equal(right.runs.length, 2); const nextRight = right.runs[1]!;
  nextRight.result.resolve("sibling-still-works"); nextRight.cleanup.resolve();
  await settled({ stores: [rightOwner.facet] });
  assert.deepEqual(rightPort.projection.current(), { status: "ready", identity: "right", region: "still-right", result: "sibling-still-works" });
  assert.deepEqual(await rightScope.control.close(), { complete: true, settled: true, debts: [] });
  await delivered({ stores: [rightOwner.facet] });
  assert.equal(liveSubscriptions(leftOwner.facet), 0); assert.equal(liveSubscriptions(rightOwner.facet), 0);
  assert.deepEqual(right.released, ["right"]); assert.equal(right.completed.length, 2);
  assert.deepEqual(right.reports, []); assert.equal(left.reports[0]?.cause, sentinel);
  t.diagnostic("O-02 catch-up: before-left/before-right; O-03 supersession: opaque-left-result; O-04 close: left0/right0, sibling-still-works; O-05 reports: one exact sentinel");
});
