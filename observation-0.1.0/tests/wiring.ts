import type { WiringOracle } from "@get-modular/conformance";
// Independent intended pins. No values come from declarations, preparation, describeWiring or a completed plan.
export const expectedWiring: WiringOracle = {
  providers: {
    "observation-test/identity": "observation-test/identity/input",
    "observation-test/queries": "observation-test/queries/input",
    "observation-test/host": "observation-test/host/input",
    "observation-test/settings": "observation-test/settings/default",
    "observation-test/logging": "observation-test/settings/default",
    "observation-test/region": "observation-test/settings/default",
    "observation-test/commands": "observation-test/settings/default",
    "acme/logger": "observation-test/logger/reference",
    "acme/catalog": "observation-test/catalog/reference",
    "observation-test/projection": "observation-test/projection/default",
    "observation-test/root": "observation-test/root/default",
  },
  roots: ["observation-test/root/default"],
  // All selected slots are required single-provider rows and are completed by the existing API.
};
