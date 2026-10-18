import { assemblyFor, declareModule, type Assembly, type CapabilitiesOf, type ModuleFactory, implement } from '@get-modular/assembly';
import { smoke } from '@get-modular/conformance';
import type { ModuleContext } from '@get-modular/resources';
import type { CachePort } from '../../../src/features/sessions/features/storage/contracts/storage-ports.ts';
import { Cache, Store, type StorageCapabilities } from '../../../src/features/sessions/features/storage/composition/storage.contracts.ts';
import { cacheDeclaration } from '../../../src/features/sessions/features/storage/composition/cache.declaration.ts';
import { storeDeclaration } from '../../../src/features/sessions/features/storage/composition/store.declaration.ts';
import { Journal, SessionId, type SessionCapabilities } from '../../../src/features/sessions/composition/sessions.contracts.ts';
import { composeTemplate } from '../../../src/composition/template.root.ts';

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
// @ts-expect-error SessionId is used by the store declaration but missing from the map
implement<CapabilitiesOf<typeof Store | typeof Journal>>()(storeDeclaration, async () => ({ instance: {}, capabilities: { 'test/sessions/store': { put: () => {}, get: () => undefined } } }));

// Regression: a smoke test of a root with declared inputs omits them.
// @ts-expect-error inputs are required when the root declares inputs
void smoke({ api: assemblyFor<SessionCapabilities>(), compose: composeTemplate });

// Regression: a run of a template with declared inputs omits them.
declare const preparation: Awaited<ReturnType<typeof composeTemplate>>;
if (preparation.status === 'prepared') {
  // @ts-expect-error every run supplies the declared inputs
  void preparation.prepared.run({});
}

export type TypedAssembly = Assembly<StorageCapabilities>;
