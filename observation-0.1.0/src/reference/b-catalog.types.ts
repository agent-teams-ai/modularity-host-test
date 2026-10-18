// Fixed types for task (b). Do not edit; check.sh uses its own copy.
import type { ReadonlyStore } from "@get-modular/observation";

/** The catalog's own slice of the settings. */
export type RegionSettings = { readonly region: string };
export type CatalogDeps = { readonly settings: ReadonlyStore<RegionSettings> };

export type Model = { readonly id: string; readonly label: string };
/** An existing adapter. Honors `signal`: rejects with an AbortError once it is aborted. */
export declare function fetchModels(region: string, options: { readonly signal: AbortSignal }): Promise<readonly Model[]>;

export type CatalogState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly region: string; readonly models: readonly Model[] }
  | { readonly status: "failed"; readonly region: string; readonly cause: unknown };
export type CatalogPort = { readonly current: () => CatalogState };

export type CatalogProduct = { readonly instance: undefined; readonly capabilities: { readonly "acme/catalog": CatalogPort } };
