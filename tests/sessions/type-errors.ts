import { assemblyFor, declareModule, type Assembly, type CapabilitiesOf, type ModuleFactory } from '@get-modular/assembly';
import { smoke } from '@get-modular/conformance';
import type { ModuleContext } from '@get-modular/resources';
import { Cache, Journal, SessionId, Store, type CachePort, type SessionCapabilities } from '../../src/sessions/contracts.ts';
import { cacheDeclaration } from '../../src/sessions/cache.ts';
import { composeSessions } from '../../src/sessions/compose.ts';
import { storeDeclaration } from '../../src/sessions/store.ts';

// Regression: a declaration spells its wire compatibility instead of using a descriptor.
declareModule({
  moduleId: 'test/sessions/forged', implementationId: 'test/sessions/forged/default',
  owner: { authority: 'test', path: ['sessions', 'forged'] },
  // @ts-expect-error a hand-written entry is not a descriptor entry
  provides: [{ capabilityId: 'test/sessions/store', compatibility: { family: 'exact', familyVersion: 1, token: 'test/sessions/store/r1' } }],
  slots: [],
});

// Regression: a factory returns a capability its declaration does not provide.
type CacheFactory = ModuleFactory<CapabilitiesOf<typeof Store | typeof Journal | typeof SessionId | typeof Cache>,
  typeof cacheDeclaration, CachePort, ModuleContext>;
// @ts-expect-error the product carries exactly the declared capability keys
export const wrongProduct: CacheFactory = async () => ({ instance: { read: () => undefined }, capabilities: { 'test/sessions/store': { put: () => {}, get: () => undefined } } });

// Regression: the binding map lacks a capability that the declaration uses.
declare const partial: Assembly<CapabilitiesOf<typeof Store | typeof Journal>>;
// @ts-expect-error SessionId is used by the store declaration but missing from the map
partial.bindFactory(storeDeclaration, async () => ({ instance: {}, capabilities: { 'test/sessions/store': { put: () => {}, get: () => undefined } } }));

// Regression: a smoke test of a root with declared inputs omits them.
// @ts-expect-error inputs are required when the root declares inputs
void smoke({ api: assemblyFor<SessionCapabilities>(), compose: composeSessions });

// Regression: a run of a template with declared inputs omits them.
declare const preparation: Awaited<ReturnType<typeof composeSessions>>;
if (preparation.status === 'prepared') {
  // @ts-expect-error every run supplies the declared inputs
  void preparation.prepared.run({});
}
