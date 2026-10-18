import { test } from 'node:test';
import { isolate, runContractSuite } from '@get-modular/conformance';
import { storeDeclaration } from '../../../../../src/features/sessions/features/storage/composition/store.declaration.ts';
import { storeModule } from '../../../../../src/features/sessions/features/storage/composition/store.module.ts';
import { createStoreFake, storeFakeDeclaration, storeSuite } from './testing.ts';

const quiet = Object.freeze({ append: (_entry: string): void => {} });
runContractSuite(storeSuite, {
  name: 'memory', declaration: storeDeclaration,
  create: async context => (await isolate(storeModule, {
    within: context.resources, dependencies: { journal: quiet, session: { id: 'suite' } },
  })).capabilities['test/sessions/store'],
}, (name, body) => test(name, body));
runContractSuite(storeSuite, { name: 'fake', declaration: storeFakeDeclaration, create: () => createStoreFake() },
  (name, body) => test(name, body));
