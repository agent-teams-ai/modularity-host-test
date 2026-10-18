import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assemblyFor, group, implement } from '@get-modular/assembly';
import { createScope } from '@get-modular/resources';
import { checkWiring } from '@get-modular/conformance';
import { counterDeclaration } from '../../src/features/counter/composition/counter.declaration.ts';
import { counterModule } from '../../src/features/counter/composition/counter.module.ts';
import { counterWiring } from '../features/counter/counter.wiring.ts';
import { cacheDeclaration } from '../../src/features/sessions/features/storage/composition/cache.declaration.ts';
import { cacheModule } from '../../src/features/sessions/features/storage/composition/cache.module.ts';
import { storageWiring } from '../features/sessions/features/storage/storage.wiring.ts';
import { journalInput, sessionInput } from '../../src/features/sessions/composition/sessions.inputs.ts';
import { sessionDeclaration } from '../../src/features/sessions/composition/session.declaration.ts';
import { sessionModule } from '../../src/features/sessions/composition/session.module.ts';
import { sessionsWiring } from '../features/sessions/sessions.wiring.ts';
import { storeDeclaration } from '../../src/features/sessions/features/storage/composition/store.declaration.ts';
import { storeModule } from '../../src/features/sessions/features/storage/composition/store.module.ts';
import { createStoreFake, storeFakeDeclaration } from '../features/sessions/features/storage/testing.ts';

const COUNTER = 'test/counter/counter/default';
const STORE = 'test/sessions/store/memory', CACHE = 'test/sessions/cache/default', ROOT = 'test/sessions/session/default';
const FAKE = 'test/sessions/store/fake';
const key = slot => `${slot.consumerImplementationId}#${slot.slotId}`;
// Counts factory calls so a failed preparation can show that no module code ran.
function harness() {
  const api = assemblyFor();
  const calls = [];
  const factory = (name, entry) => async (deps, context) => { calls.push(name); return entry.factory(deps, context); };
  const fakeFactory = async () => { calls.push(FAKE); const port = createStoreFake(); return { instance: port, capabilities: { 'test/sessions/store': port } }; };
  return {
    api, calls,
    inputs: { journal: journalInput, session: sessionInput },
    counter: () => implement()(counterDeclaration, factory(COUNTER, counterModule)),
    store: () => implement()(storeDeclaration, factory(STORE, storeModule)),
    fake: () => implement()(storeFakeDeclaration, fakeFactory),
    cache: () => implement()(cacheDeclaration, factory(CACHE, cacheModule)),
    root: () => implement()(sessionDeclaration, factory(ROOT, sessionModule)),
  };
}
const prepare = (h, stores, root = h.root(), cache = h.cache(), counter = h.counter()) =>
  h.api.prepare({ profileId: 'test/sessions/template',
    modules: [counter, group('sessions', [root, group('storage', [cache, ...stores])])],
    roots: { session: root }, inputs: h.inputs });

const candidates = [FAKE, STORE];
// Regression: completion guesses between two providers of one capability, or Core is the first to see the duplicate selection.
test('prepare: two Store providers leave both store slots unresolved with zero factory calls', async () => {
  const h = harness();
  const preparation = await prepare(h, [h.store(), h.fake()]);
  assert.equal(preparation.status, 'failed');
  assert.equal(preparation.error.code, 'assembly.prepare.unresolved-binding');
  assert.deepEqual(preparation.diagnostics, []);
  assert.deepEqual(preparation.error.cause.map(slot => ({ ...slot })).sort((a, b) => key(a).localeCompare(key(b))), [
    { consumerImplementationId: CACHE, slotId: 'store', capabilityId: 'test/sessions/store', cardinality: 'required', groupPath: ['sessions', 'storage'], candidates },
    { consumerImplementationId: ROOT, slotId: 'store', capabilityId: 'test/sessions/store', cardinality: 'required', groupPath: ['sessions'], candidates },
  ]);
  assert.deepEqual(h.calls, []);
});

// Regression: a missing provider falls through to a Core diagnostic or a runtime failure instead of a prepare-time list.
test('prepare: removing the memory store leaves both store slots unresolved with zero candidates', async () => {
  const h = harness();
  const preparation = await prepare(h, []);
  assert.equal(preparation.status, 'failed');
  assert.equal(preparation.error.code, 'assembly.prepare.unresolved-binding');
  assert.deepEqual(preparation.diagnostics, []);
  assert.deepEqual(preparation.error.cause.map(slot => ({ ...slot })).sort((a, b) => key(a).localeCompare(key(b))), [
    { consumerImplementationId: CACHE, slotId: 'store', capabilityId: 'test/sessions/store', cardinality: 'required', groupPath: ['sessions', 'storage'], candidates: [] },
    { consumerImplementationId: ROOT, slotId: 'store', capabilityId: 'test/sessions/store', cardinality: 'required', groupPath: ['sessions'], candidates: [] },
  ]);
  assert.deepEqual(h.calls, []);
});

// Regression: swapping a provider passes preparation silently and only the oracle can notice.
test('prepare: the fake Store provider replaces memory and the oracle names the changed store pin', async () => {
  const h = harness();
  const preparation = await prepare(h, [h.fake()]);
  assert.equal(preparation.status, 'prepared');
  assert.deepEqual(h.calls, [], 'preparation never calls a factory');
  assert.throws(() => checkWiring(preparation.composition, [sessionsWiring, storageWiring, counterWiring],
    { declarations: [counterDeclaration, storeFakeDeclaration, cacheDeclaration, sessionDeclaration, journalInput.declaration, sessionInput.declaration] }),
  (error) => {
    const differences = Reflect.get(Object(Reflect.get(Object(error), 'details')), 'differences');
    const pins = differences.filter((difference) => Reflect.get(Object(difference), 'rule') === 'capability-provider');
    assert.deepEqual(pins.map((difference) => Reflect.get(Object(difference), 'subject')), ['test/sessions/store'], JSON.stringify(differences));
    return Reflect.get(Object(error), 'code') === 'conformance.wiring.mismatch';
  });
  // Zero calls above prove nothing alone: running the prepared composition shows every selected factory ran.
  const attempt = createScope({ name: 'attempt' });
  const outcome = await preparation.prepared.run({ scope: attempt.resources,
    inputs: { journal: { 'test/sessions/journal': { append: () => {} } }, session: { 'test/sessions/session-id': { id: 'counter' } } } });
  assert.equal(outcome.status, 'succeeded');
  assert.deepEqual(h.calls, [COUNTER, FAKE, CACHE, ROOT]);
  assert.deepEqual(await attempt.control.close(), { complete: true, settled: true, debts: [] });
});
