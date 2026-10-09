import { compileComposition } from '@get-modular/core';
import type { Assembly } from '@get-modular/assembly';
import { scoped } from '@get-modular/resources';
import { cacheDeclaration, createCache } from './cache.ts';
import type { SessionCapabilities } from './contracts.ts';
import { journalInput, sessionInput } from './inputs.ts';
import { createSession, sessionDeclaration } from './session.ts';
import { createStore, storeDeclaration } from './store.ts';

const declarations = [journalInput, sessionInput, storeDeclaration, cacheDeclaration, sessionDeclaration] as const;
const bind = (consumer: { readonly implementationId: string }, slotId: string,
  providers: readonly { readonly implementationId: string }[]) => ({
  consumerImplementationId: consumer.implementationId, slotId,
  providerImplementationIds: providers.map(provider => provider.implementationId),
});

/** The template's composition root: a function of Assembly, so smoke can pass its own api. */
export async function composeSessions(api: Assembly<SessionCapabilities>) {
  const composition = await compileComposition({ declarations, profile: {
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'test/sessions/template',
    roots: [sessionDeclaration.moduleId],
    selections: declarations.map(({ moduleId, implementationId }) => ({ moduleId, implementationId })),
    bindings: [
      bind(storeDeclaration, 'journal', [journalInput]), bind(storeDeclaration, 'session', [sessionInput]),
      bind(cacheDeclaration, 'store', [storeDeclaration]), bind(cacheDeclaration, 'journal', [journalInput]),
      bind(cacheDeclaration, 'session', [sessionInput]),
      bind(sessionDeclaration, 'cache', [cacheDeclaration]), bind(sessionDeclaration, 'store', [storeDeclaration]),
      bind(sessionDeclaration, 'session', [sessionInput]),
    ],
  } });
  if (!composition.ok) throw new Error(`test/sessions/template: ${composition.diagnostics.map(item => item.code).join(', ')}`);
  const journal = api.bindInput(journalInput);
  const session = api.bindInput(sessionInput);
  const store = api.bindFactory(storeDeclaration, scoped(storeDeclaration.implementationId, createStore));
  const cache = api.bindFactory(cacheDeclaration, scoped(cacheDeclaration.implementationId, createCache));
  const root = api.bindFactory(sessionDeclaration, createSession);
  return api.prepare({ composition, factories: [store, cache, root], roots: { session: root }, inputs: { journal, session } });
}
