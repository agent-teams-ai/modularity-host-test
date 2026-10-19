import { declareModule, implement, type Assembly } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { scoped } from "@get-modular/resources";
import { projectionModule } from "../features/projection/composition/projection.module.js";
import { catalogModule, hostInput, identityInput, loggerModule, queryInput, settingsModule } from "./entries.js";
import { Catalog, Logger, Projection, Root, SettingsArea, SettingsCommands, owner, type Capabilities, type RootPort } from "./contracts.js";
export const rootDeclaration = declareModule({ moduleId: "observation-test/root", implementationId: "observation-test/root/default", owner,
  provides: [Root.provide()], slots: [SettingsArea.slot("settings", required()), SettingsCommands.slot("commands", required()),
    Projection.slot("projection", required()), Logger.slot("logger", required()), Catalog.slot("catalog", required())] });
export const rootModule = implement<Capabilities>()(rootDeclaration, async (deps) => {
  const port: RootPort = deps;
  return { instance: port, capabilities: { "observation-test/root": port } };
}, scoped);
export const modules = [settingsModule, loggerModule, catalogModule, projectionModule, rootModule] as const;
export const inputs = { identity: identityInput, queries: queryInput, host: hostInput };
export function compose(api: Assembly<Capabilities>) {
  return api.prepare({ profileId: "observation-test/root", modules, roots: { app: rootModule }, inputs });
}
