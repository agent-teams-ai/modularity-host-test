import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor } from "@get-modular/assembly";
import { smoke } from "@get-modular/conformance";
import { compose } from "../src/composition/root.js";
import type { Capabilities } from "../src/composition/contracts.js";

test("O-06 one complete smoke of the unchanged selected root", async () => {
  const steps = await smoke({ api: assemblyFor<Capabilities>(), compose, inputs: {
    identity: { "observation-test/identity": { read: () => "smoke" } },
    queries: { "observation-test/queries": {
      acquire: async () => ({ close: (): undefined => undefined }), run: async () => "smoke-result",
    } },
    host: { "observation-test/host": { settingsReady: (): undefined => undefined, report: (): undefined => undefined } },
  } });
  assert.equal(steps.length, 11);
  assert.equal(steps[0]?.outcome, "succeeded");
  assert.equal(steps.filter(step => step.outcome === "failed").length, 5);
  assert.equal(steps.filter(step => step.outcome === "cancelled").length, 5);
  for (const step of steps) { assert.equal(step.problem, undefined); assert.deepEqual(step.report, { complete: true, settled: true, debts: [] }); }
});
