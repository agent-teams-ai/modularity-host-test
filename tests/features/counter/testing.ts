// Test entrypoint of the Counter contract owner. Production code never imports this file.
import { implement } from '@get-modular/assembly';
import { contractSuite } from '@get-modular/conformance';
import { strict as assert } from 'node:assert';
import type { CounterPort } from '../../../src/features/counter/contracts/counter-port.ts';
import { Counter, type CounterCapabilities } from '../../../src/features/counter/composition/counter.contracts.ts';
import { declareModule } from '@get-modular/assembly';

export const counterFakeDeclaration = declareModule({
  moduleId: 'test/counter/counter', implementationId: 'test/counter/counter/fake',
  owner: { authority: 'test', path: ['counter'] }, provides: [Counter.provide()], slots: [],
});

export function createCounterFake(): CounterPort {
  const counts = new Map<string, number>();
  return {
    increment: key => { const next = (counts.get(key) ?? 0) + 1; counts.set(key, next); return next; },
    count: key => counts.get(key) ?? 0,
  };
}

export const counterFakeModule = implement<CounterCapabilities>()(counterFakeDeclaration, async () => {
  const port = createCounterFake();
  return { instance: port, capabilities: { 'test/counter/counter': port } };
});

export const counterSuite = contractSuite(Counter, {
  'increments each key': counter => {
    assert.equal(counter.increment('a'), 1);
    assert.equal(counter.increment('a'), 2);
  },
  'keeps keys separate': counter => {
    assert.equal(counter.increment('a'), 1);
    assert.equal(counter.increment('b'), 1);
  },
  'reports zero for an unknown key': counter => { assert.equal(counter.count('missing'), 0); },
});
