// Test entrypoint of the Store contract owner. Production code never imports this file.
import { declareModule } from '@get-modular/assembly';
import { contractSuite } from '@get-modular/conformance';
import { strict as assert } from 'node:assert';
import { INVALID_KEY, Store, type StorePort } from './contracts.ts';

export const storeFakeDeclaration = declareModule({
  moduleId: 'test/sessions/store', implementationId: 'test/sessions/store/fake',
  owner: { authority: 'test', path: ['sessions', 'store'] }, provides: [Store.provide()], slots: [],
});

export function createStoreFake(): StorePort {
  const values = new Map<string, string>();
  return {
    put: (key, value) => { if (key === '') throw Object.assign(new TypeError('a fake store key must not be empty'), { code: INVALID_KEY }); values.set(key, value); },
    get: key => values.get(key),
  };
}

// The port is synchronous and in memory, so it has no cancellation case.
export const storeSuite = contractSuite(Store, {
  'round-trips a value': store => { store.put('a', '1'); assert.equal(store.get('a'), '1'); },
  'returns undefined for an unknown key': store => { assert.equal(store.get('missing'), undefined); },
  'refuses an empty key': store => {
    assert.throws(() => { store.put('', 'x'); }, (error: unknown) =>
      error instanceof TypeError && 'code' in error && error.code === INVALID_KEY);
  },
});
