import assert from "node:assert/strict";
import test from "node:test";
import { assemblyFor } from "@get-modular/assembly";
import { smoke } from "@get-modular/conformance";
import { compose } from "../src/composition/root.js";
import type { Capabilities } from "../src/composition/contracts.js";

test("O-06 one complete smoke of the unchanged selected root", async t => {
  const steps = await smoke({ api: assemblyFor<Capabilities>(), compose, inputs: {
    identity: { "observation-test/identity": { read: () => "smoke" } },
    queries: { "observation-test/queries": {
      acquire: async () => ({ close: (): undefined => undefined }), run: async () => "smoke-result",
    } },
    host: { "observation-test/host": { settingsReady: (): undefined => undefined, report: (): undefined => undefined } },
  } });
  assert.equal(steps.length, 11);
  assert.equal(steps[0]?.outcome, "succeeded");
  const targets = ["observation-test/catalog/reference", "observation-test/logger/reference",
    "observation-test/projection/default", "observation-test/root/default", "observation-test/settings/default"];
  for (const inject of ["fail", "abort"]) {
    const rows = steps.filter(step => step.inject === inject);
    assert.deepEqual(rows.map(step => step.at).sort(), targets);
    for (const row of rows) {
      if (inject === "fail") assert.equal(row.outcome, "failed");
      // smoke itself checks cancellation metadata when an async factory rejects during abort.
      else assert.ok(row.outcome === "cancelled" || row.outcome === "failed");
    }
  }
  for (const step of steps) { assert.equal(step.problem, undefined); assert.deepEqual(step.report, { complete: true, settled: true, debts: [] }); }
  t.diagnostic(JSON.stringify(steps));
});
