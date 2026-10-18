import { declareModule } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import { Counter } from '../../counter/composition/counter.contracts.ts';
import { Cache, Store } from '../features/storage/composition/storage.contracts.ts';
import { Session, SessionId } from './sessions.contracts.ts';

export const sessionDeclaration = declareModule({
  moduleId: 'test/sessions/session', implementationId: 'test/sessions/session/default',
  owner: { authority: 'test', path: ['sessions', 'session'] },
  provides: [Session.provide()],
  slots: [Cache.slot('cache', required()), Counter.slot('counter', required()), Store.slot('store', required()), SessionId.slot('session', required())],
});
