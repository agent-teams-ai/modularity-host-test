import { declareModule, implement, input } from "@get-modular/assembly";
import { required } from "@get-modular/core";
import { createStore } from "@get-modular/observation";
import { scoped } from "@get-modular/resources";
import { createLoggerModule } from "../reference/a-logger.js";
import { createCatalogModule } from "../reference/b-catalog.js";
import { Catalog, Host, Identity, Logger, LoggingArea, Queries, RegionArea, SettingsArea, SettingsCommands,
  owner, type Capabilities, type Commands, type Settings } from "./contracts.js";

export const identityDeclaration = declareModule({ moduleId: "observation-test/identity", implementationId: "observation-test/identity/input", owner, provides: [Identity.provide()], slots: [] });
export const queryDeclaration = declareModule({ moduleId: "observation-test/queries", implementationId: "observation-test/queries/input", owner, provides: [Queries.provide()], slots: [] });
export const hostDeclaration = declareModule({ moduleId: "observation-test/host", implementationId: "observation-test/host/input", owner, provides: [Host.provide()], slots: [] });
export const identityInput = input<Capabilities>()(identityDeclaration);
export const queryInput = input<Capabilities>()(queryDeclaration);
export const hostInput = input<Capabilities>()(hostDeclaration);
export const settingsDeclaration = declareModule({ moduleId: "observation-test/settings", implementationId: "observation-test/settings/default", owner,
  provides: [SettingsArea.provide(), LoggingArea.provide(), RegionArea.provide(), SettingsCommands.provide()], slots: [Host.slot("host", required())] });
export const settingsModule = implement<Capabilities>()(settingsDeclaration, async (deps, { resources }) => {
  const store = createStore<Settings>({ region: "initial", logLevel: "info" }, { name: "settings", resources, reportError: deps.host.report });
  const commands: Commands = { region: value => { store.set({ region: value }); }, logLevel: value => { store.set({ logLevel: value }); } };
  const facet = store.readonly(); deps.host.settingsReady(facet, commands);
  return { instance: undefined, capabilities: { "observation-test/settings": facet, "observation-test/logging": facet,
    "observation-test/region": facet, "observation-test/commands": commands } };
}, scoped);
export const loggerDeclaration = declareModule({ moduleId: "observation-test/logger", implementationId: "observation-test/logger/reference", owner,
  provides: [Logger.provide()], slots: [LoggingArea.slot("settings", required())] });
export const loggerModule = implement<Capabilities>()(loggerDeclaration, createLoggerModule, scoped);
export const catalogDeclaration = declareModule({ moduleId: "observation-test/catalog", implementationId: "observation-test/catalog/reference", owner,
  provides: [Catalog.provide()], slots: [RegionArea.slot("settings", required())] });
export const catalogModule = implement<Capabilities>()(catalogDeclaration, createCatalogModule, scoped);
