import { declareModule, type CapabilitiesOf, type ModuleFactory } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import type { ModuleContext } from '@get-modular/resources';
import { INVALID_KEY, Journal, SessionId, Store, type StorePort } from './contracts.ts';

export const storeDeclaration = declareModule({
  moduleId: 'test/sessions/store', implementationId: 'test/sessions/store/memory',
  owner: { authority: 'test', path: ['sessions', 'store'] },
  provides: [Store.provide()],
  slots: [Journal.slot('journal', required()), SessionId.slot('session', required())],
});

export const createStore: ModuleFactory<CapabilitiesOf<typeof Journal | typeof SessionId | typeof Store>,
  typeof storeDeclaration, StorePort, ModuleContext> = async (deps, { resources }) => {
  const values = await resources.setup({
    name: 'values',
    setup: () => { deps.journal.append(`acquire:store:${deps.session.id}`); return new Map<string, string>(); },
    cleanup: held => { held.clear(); deps.journal.append(`release:store:${deps.session.id}`); },
  });
  const port: StorePort = {
    put: (key, value) => { if (key === '') throw Object.assign(new TypeError('a store key must not be empty'), { code: INVALID_KEY }); values.set(key, value); },
    get: key => values.get(key),
  };
  return { instance: port, capabilities: { 'test/sessions/store': port } };
};
