import { test } from 'node:test';
import { isolate, runContractSuite } from '@get-modular/conformance';
import { sessionDeclaration } from '../../../src/features/sessions/composition/session.declaration.ts';
import { sessionModule } from '../../../src/features/sessions/composition/session.module.ts';
import { createCounterFake } from '../counter/testing.ts';
import { createStoreFake } from './features/storage/testing.ts';
import { createSessionFake, sessionSuite } from './testing.ts';

runContractSuite(sessionSuite, {
  name: 'real', declaration: sessionDeclaration,
  create: async context => {
    const store = createStoreFake();
    return (await isolate(sessionModule, {
      within: context.resources,
      dependencies: { cache: { read: key => store.get(key) }, counter: createCounterFake(), store, session: { id: 'real' } },
    })).capabilities['test/sessions/session'];
  },
}, (name, body) => test(name, body));
runContractSuite(sessionSuite, {
  name: 'fake', declaration: sessionDeclaration, create: () => createSessionFake(),
}, (name, body) => test(name, body));
