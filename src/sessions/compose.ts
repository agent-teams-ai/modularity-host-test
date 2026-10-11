import type { Assembly } from '@get-modular/assembly';
import { scoped } from '@get-modular/resources';
import { cacheDeclaration, createCache } from './cache.ts';
import type { SessionCapabilities } from './contracts.ts';
import { journalInput, sessionInput } from './inputs.ts';
import { createSession, sessionDeclaration } from './session.ts';
import { createStore, storeDeclaration } from './store.ts';

/**
 * The template's composition root: a function of Assembly, so smoke can pass its own api.
 * Assembly completes the profile from the bound modules, so there is no binding list to keep in step.
 */
export async function composeSessions(api: Assembly<SessionCapabilities>) {
  const journal = api.bindInput(journalInput);
  const session = api.bindInput(sessionInput);
  const store = api.bindFactory(storeDeclaration, scoped(storeDeclaration.implementationId, createStore));
  const cache = api.bindFactory(cacheDeclaration, scoped(cacheDeclaration.implementationId, createCache));
  const root = api.bindFactory(sessionDeclaration, createSession);
  return api.prepare({ profileId: 'test/sessions/template', factories: [store, cache, root], roots: { session: root }, inputs: { journal, session } });
}
