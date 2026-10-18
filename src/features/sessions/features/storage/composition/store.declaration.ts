import { declareModule } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import { Journal, SessionId } from '../../../composition/sessions.contracts.ts';
import { Store } from './storage.contracts.ts';

export const storeDeclaration = declareModule({
  moduleId: 'test/sessions/store', implementationId: 'test/sessions/store/memory',
  owner: { authority: 'test', path: ['sessions', 'store'] },
  provides: [Store.provide()],
  slots: [Journal.slot('journal', required()), SessionId.slot('session', required())],
});
