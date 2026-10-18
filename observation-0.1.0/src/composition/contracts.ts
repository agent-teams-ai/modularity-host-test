import { defineContract, type CapabilitiesOf } from "@get-modular/assembly";
import type { ListenerError, ReadonlyStore } from "@get-modular/observation";
import type { CatalogPort } from "../reference/b-catalog.types.js";
import type { LoggerPort, LogLevel } from "../reference/a-logger.types.js";

export type Settings = { readonly region: string; readonly logLevel: LogLevel };
export type Commands = { readonly region: (value: string) => undefined; readonly logLevel: (value: LogLevel) => undefined };
export type ProjectionState =
  | { readonly status: "loading"; readonly identity: string }
  | { readonly status: "ready"; readonly identity: string; readonly region: string; readonly result: string }
  | { readonly status: "failed"; readonly identity: string; readonly region: string; readonly cause: string };
export type ProjectionPort = { readonly current: () => ProjectionState };
export type QueryPort = {
  readonly acquire: (identity: string, signal: AbortSignal) => Promise<{ readonly close: () => undefined }>;
  readonly run: (identity: string, region: string, signal: AbortSignal) => Promise<string>;
};
export type HostPort = {
  readonly settingsReady: (facet: ReadonlyStore<Settings>, commands: Commands) => undefined;
  readonly report: (report: ListenerError) => undefined;
};
export type RootPort = { readonly settings: ReadonlyStore<Settings>; readonly commands: Commands;
  readonly projection: ProjectionPort; readonly logger: LoggerPort; readonly catalog: CatalogPort };
export const Identity = defineContract<{ readonly read: () => string }>()({ id: "observation-test/identity", revision: 1 });
export const Queries = defineContract<QueryPort>()({ id: "observation-test/queries", revision: 1 });
export const Host = defineContract<HostPort>()({ id: "observation-test/host", revision: 1 });
export const SettingsArea = defineContract<ReadonlyStore<Settings>>()({ id: "observation-test/settings", revision: 1 });
export const LoggingArea = defineContract<ReadonlyStore<{ readonly logLevel: LogLevel }>>()({ id: "observation-test/logging", revision: 1 });
export const RegionArea = defineContract<ReadonlyStore<{ readonly region: string }>>()({ id: "observation-test/region", revision: 1 });
export const SettingsCommands = defineContract<Commands>()({ id: "observation-test/commands", revision: 1 });
export const Logger = defineContract<LoggerPort>()({ id: "acme/logger", revision: 1 });
export const Catalog = defineContract<CatalogPort>()({ id: "acme/catalog", revision: 1 });
export const Projection = defineContract<ProjectionPort>()({ id: "observation-test/projection", revision: 1 });
export const Root = defineContract<RootPort>()({ id: "observation-test/root", revision: 1 });
export interface Capabilities extends CapabilitiesOf<typeof Identity | typeof Queries | typeof Host | typeof SettingsArea
  | typeof LoggingArea | typeof RegionArea | typeof SettingsCommands | typeof Logger | typeof Catalog | typeof Projection | typeof Root> {}
export const owner = { authority: "observation-test", path: ["fixture"] };
