import type { FactoryDependencies } from '@get-modular/assembly';
import { isolate } from '@get-modular/conformance';
import type { cacheDeclaration } from '../../../src/features/sessions/features/storage/composition/cache.declaration.ts';
import { cacheModule } from '../../../src/features/sessions/features/storage/composition/cache.module.ts';
import type { SessionCapabilities } from '../../../src/features/sessions/composition/sessions.contracts.ts';
import { createStoreFake } from './features/storage/testing.ts';

// Positive control: a fake dependency record typed by the module's own declaration (Testing modules, rule 2).
const quiet = { append: (_entry: string): void => {} };
export const cacheDependencies = {
  store: createStoreFake(), journal: quiet, session: { id: 'typed' },
} satisfies FactoryDependencies<SessionCapabilities, typeof cacheDeclaration>;
export const isolatedCache = () => isolate(cacheModule, { dependencies: cacheDependencies });

// Regression: a fake record that omits a declared slot compiles.
export const missingSlot = () => isolate(cacheModule,
  // @ts-expect-error the session slot is missing from the dependency record
  { dependencies: { store: createStoreFake(), journal: quiet } });
