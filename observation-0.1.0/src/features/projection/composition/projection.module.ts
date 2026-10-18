import { declareModule, implement } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { createStore } from "@get-modular/observation";
import { scoped } from "@get-modular/resources";
import { Host, Identity, Projection, Queries, RegionArea, owner, type Capabilities, type ProjectionState } from "../../../composition/contracts.js";

export const projectionDeclaration = declareModule({
  moduleId: "observation-test/projection", implementationId: "observation-test/projection/default", owner,
  provides: [Projection.provide()], slots: [RegionArea.slot("settings", required()), Identity.slot("identity", required()),
    Queries.slot("queries", required()), Host.slot("host", required())],
});
// Independent consumer: its one result aggregate is private; only the current-value port leaves this factory.
export const projectionModule = implement<Capabilities>()(projectionDeclaration, async (deps, { resources }) => {
  const identity = deps.identity.read();
  const initial = deps.settings.read(["region"]);
  await resources.setup({ name: "projection/acquisition", setup: ({ signal }) => deps.queries.acquire(identity, signal),
    cleanup: acquired => { acquired.close(); } });
  const state = createStore<{ readonly state: ProjectionState }>({ state: { status: "loading", identity } }, {
    name: `${identity}/projection`, resources, reportError: deps.host.report,
  });
  deps.settings.load(initial, { resources, name: `${identity}/projection/query`,
    loader: ({ values }, { signal }) => deps.queries.run(identity, values.region, signal),
    onLoading: () => { state.set({ state: { status: "loading", identity } }); },
    onResult: (result, { values }) => { state.set({ state: { status: "ready", identity, region: values.region, result } }); },
    onError: (cause, { values }) => { state.set({ state: { status: "failed", identity, region: values.region, cause: cause instanceof Error ? cause.message : String(cause) } }); },
  });
  const port = { current: (): ProjectionState => state.read(["state"]).values.state };
  return { instance: port, capabilities: { "observation-test/projection": port } };
}, scoped);
