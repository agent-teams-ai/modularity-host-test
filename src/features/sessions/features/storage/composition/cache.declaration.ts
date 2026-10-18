import { declareModule } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import { Journal, SessionId } from '../../../composition/sessions.contracts.ts';
import { Cache, Store } from './storage.contracts.ts';

export const cacheDeclaration = declareModule({
  moduleId: 'test/sessions/cache', implementationId: 'test/sessions/cache/default',
  owner: { authority: 'test', path: ['sessions', 'cache'] },
  provides: [Cache.provide()],
  slots: [Store.slot('store', required()), Journal.slot('journal', required()), SessionId.slot('session', required())],
});
