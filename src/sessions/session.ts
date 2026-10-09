import { declareModule, type CapabilitiesOf, type ModuleFactory } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import { Cache, Session, SessionId, Store, type SessionPort } from './contracts.ts';

export const sessionDeclaration = declareModule({
  moduleId: 'test/sessions/session', implementationId: 'test/sessions/session/default',
  owner: { authority: 'test', path: ['sessions', 'session'] },
  provides: [Session.provide()],
  slots: [Cache.slot('cache', required()), Store.slot('store', required()), SessionId.slot('session', required())],
});

// Registers nothing, so the composition root binds it without scoped().
export const createSession: ModuleFactory<CapabilitiesOf<typeof Cache | typeof Store | typeof SessionId | typeof Session>,
  typeof sessionDeclaration, SessionPort> = async deps => {
  const port: SessionPort = {
    id: deps.session.id,
    roundTrip: value => { deps.store.put('value', value); return deps.cache.read('value'); },
  };
  return { instance: port, capabilities: { 'test/sessions/session': port } };
};
