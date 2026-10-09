import { declareModule, type CapabilitiesOf, type ModuleFactory } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import type { ModuleContext } from '@get-modular/resources';
import { Cache, Journal, SessionId, Store, type CachePort } from './contracts.ts';

export const cacheDeclaration = declareModule({
  moduleId: 'test/sessions/cache', implementationId: 'test/sessions/cache/default',
  owner: { authority: 'test', path: ['sessions', 'cache'] },
  provides: [Cache.provide()],
  slots: [Store.slot('store', required()), Journal.slot('journal', required()), SessionId.slot('session', required())],
});

export const createCache: ModuleFactory<CapabilitiesOf<typeof Store | typeof Journal | typeof SessionId | typeof Cache>,
  typeof cacheDeclaration, CachePort, ModuleContext> = async (deps, { resources }) => {
  const seen = await resources.setup({
    name: 'seen',
    setup: () => { deps.journal.append(`acquire:cache:${deps.session.id}`); return new Set<string>(); },
    cleanup: held => { held.clear(); deps.journal.append(`release:cache:${deps.session.id}`); },
  });
  const port: CachePort = { read: key => { seen.add(key); return deps.store.get(key); } };
  return { instance: port, capabilities: { 'test/sessions/cache': port } };
};
