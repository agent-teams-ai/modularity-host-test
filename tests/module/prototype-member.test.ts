import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { declareModule, implement } from '@get-modular/assembly';
import { required } from '@get-modular/core';
import { isolate } from '@get-modular/conformance';
import { Journal, SessionId } from '../../src/features/sessions/composition/sessions.contracts.ts';
import { Store, type StorageCapabilities } from '../../src/features/sessions/features/storage/composition/storage.contracts.ts';

class PrototypeStore {
  put(_key: string, _value: string): void {}
  get(_key: string): string | undefined { return undefined; }
}

const prototypeStoreDeclaration = declareModule({
  moduleId: 'test/sessions/store', implementationId: 'test/sessions/store/prototype',
  owner: { authority: 'test', path: ['sessions', 'store'] },
  provides: [Store.provide()],
  slots: [Journal.slot('journal', required()), SessionId.slot('session', required())],
});

const prototypeStoreModule = implement<StorageCapabilities>()(prototypeStoreDeclaration, async () => {
  const port = new PrototypeStore();
  return { instance: port, capabilities: { 'test/sessions/store': port } };
});

test('prototype-method: a class capability built by a module fails isolate', async () => {
  await assert.rejects(() => isolate(prototypeStoreModule, {
    dependencies: { journal: { append: () => {} }, session: { id: 'prototype' } },
  }), (error: unknown) => Reflect.get(Object(error), 'code') === 'conformance.ports.prototype-member');
});
