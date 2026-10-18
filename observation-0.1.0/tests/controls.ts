import type { ReadonlyStore, ListenerError } from "@get-modular/observation";
import type { Commands, QueryPort, Settings } from "../src/composition/contracts.js";
export function createControls(identity: string) {
  const acquisitionReached = Promise.withResolvers<void>(); const acquisition = Promise.withResolvers<void>();
  const settingsReady = Promise.withResolvers<{ readonly facet: ReadonlyStore<Settings>; readonly commands: Commands }>();
  const reports: ListenerError[] = []; const released: string[] = []; const completed: string[] = [];
  const runs: { identity: string; region: string; signal: AbortSignal; result: PromiseWithResolvers<string>;
    cleanup: PromiseWithResolvers<void> }[] = [];
  const queries: QueryPort = {
    acquire: async (actualIdentity) => {
      acquisitionReached.resolve(); await acquisition.promise;
      return { close: () => { released.push(actualIdentity); } };
    },
    run: async (actualIdentity, region, signal) => {
      const result = Promise.withResolvers<string>(); const cleanup = Promise.withResolvers<void>();
      runs.push({ identity: actualIdentity, region, signal, result, cleanup });
      try { return await result.promise; }
      finally { await cleanup.promise; completed.push(`${actualIdentity}:${region}`); }
    },
  };
  return { identity, acquisitionReached: acquisitionReached.promise, releaseAcquisition: () => acquisition.resolve(),
    settingsReady: settingsReady.promise, runs, reports, released, completed,
    inputs: {
      identity: { "observation-test/identity": { read: () => identity } },
      queries: { "observation-test/queries": queries },
      host: { "observation-test/host": {
        settingsReady: (facet: ReadonlyStore<Settings>, commands: Commands): undefined => { settingsReady.resolve({ facet, commands }); },
        report: (report: ListenerError): undefined => { reports.push(report); },
      } },
    },
    releaseAll: () => { acquisition.resolve(); for (const run of runs) { run.result.resolve("test-cleanup"); run.cleanup.resolve(); } },
  };
}
