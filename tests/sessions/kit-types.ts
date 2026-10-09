import { assemblyFor, type FactoryDependencies } from '@get-modular/assembly';
import { isolate } from '@get-modular/conformance';
import type { SessionCapabilities } from '../../src/sessions/contracts.ts';
import { cacheDeclaration, createCache } from '../../src/sessions/cache.ts';
import { createStoreFake } from '../../src/sessions/testing.ts';

// Positive control: a fake dependency record typed by the module's own declaration (Testing modules, rule 2).
const quiet = { append: (_entry: string): void => {} };
export const cacheDependencies = {
  store: createStoreFake(), journal: quiet, session: { id: 'typed' },
} satisfies FactoryDependencies<SessionCapabilities, typeof cacheDeclaration>;
export const isolatedCache = () => isolate(assemblyFor<SessionCapabilities>(),
  { declaration: cacheDeclaration, factory: createCache, dependencies: cacheDependencies });

// Regression: a fake record that omits a declared slot compiles.
export const missingSlot = () => isolate(assemblyFor<SessionCapabilities>(),
  // @ts-expect-error the session slot is missing from the dependency record
  { declaration: cacheDeclaration, factory: createCache, dependencies: { store: createStoreFake(), journal: quiet } });
