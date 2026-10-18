import { test } from 'node:test';
import { isolate, runContractSuite } from '@get-modular/conformance';
import { counterDeclaration } from '../../../src/features/counter/composition/counter.declaration.ts';
import { counterModule } from '../../../src/features/counter/composition/counter.module.ts';
import { counterFakeDeclaration, counterSuite, createCounterFake } from './testing.ts';

runContractSuite(counterSuite, {
  name: 'real', declaration: counterDeclaration,
  create: async context => (await isolate(counterModule, { within: context.resources, dependencies: {} }))
    .capabilities['test/counter/counter'],
}, (name, body) => test(name, body));
runContractSuite(counterSuite, {
  name: 'fake', declaration: counterFakeDeclaration, create: () => createCounterFake(),
}, (name, body) => test(name, body));
