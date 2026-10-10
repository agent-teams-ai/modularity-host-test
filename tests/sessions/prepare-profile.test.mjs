import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isDeepStrictEqual } from 'node:util';
import { assemblyFor } from '@get-modular/assembly';
import { scoped } from '@get-modular/resources';
import { composeSessions } from '../../src/sessions/compose.ts';
import { cacheDeclaration, createCache } from '../../src/sessions/cache.ts';
import { journalInput, sessionInput } from '../../src/sessions/inputs.ts';
import { createSession, sessionDeclaration } from '../../src/sessions/session.ts';
import { createStore, storeDeclaration } from '../../src/sessions/store.ts';
import { createStoreFake, storeFakeDeclaration } from '../../src/sessions/testing.ts';

const JOURNAL = 'test/sessions/journal/input', SESSION_ID = 'test/sessions/session-id/input';
const STORE = 'test/sessions/store/memory', CACHE = 'test/sessions/cache/default', ROOT = 'test/sessions/session/default';
const FAKE = 'test/sessions/store/fake';
const row = (consumerImplementationId, slotId, provider, capabilityId) => ({
  consumerImplementationId, slotId, providerImplementationIds: [provider], capabilityId,
  compatibility: { family: 'exact', familyVersion: 1, token: `${capabilityId}/r1` },
});

// Written from the module declarations (slots of store.ts, cache.ts, session.ts and the two inputs), never from output:
// every slot is `required` with exactly one candidate, so the wiring is fixed by the capability each slot asks for.
const ORACLE = [
  row(STORE, 'journal', JOURNAL, 'test/sessions/journal'),
  row(STORE, 'session', SESSION_ID, 'test/sessions/session-id'),
  row(CACHE, 'store', STORE, 'test/sessions/store'),
  row(CACHE, 'journal', JOURNAL, 'test/sessions/journal'),
  row(CACHE, 'session', SESSION_ID, 'test/sessions/session-id'),
  row(ROOT, 'cache', CACHE, 'test/sessions/cache'),
  row(ROOT, 'store', STORE, 'test/sessions/store'),
  row(ROOT, 'session', SESSION_ID, 'test/sessions/session-id'),
];

const key = binding => `${binding.consumerImplementationId}#${binding.slotId}`;
/** Rows of the prepared plan that differ from the table: changed, missing from the plan, or not in the table. */
function oracleDiff(actual, expected = ORACLE) {
  const have = new Map(actual.map(binding => [key(binding), binding]));
  const want = new Map(expected.map(binding => [key(binding), binding]));
  const differs = [];
  for (const [id, binding] of want) {
    if (!have.has(id)) differs.push(`missing ${id}`);
    else if (!isDeepStrictEqual(have.get(id), binding)) differs.push(`changed ${id}`);
  }
  for (const id of have.keys()) if (!want.has(id)) differs.push(`unexpected ${id}`);
  return differs.sort();
}

// Counts factory calls so a failed preparation can show that no module code ran.
function harness() {
  const api = assemblyFor();
  const calls = [];
  const factory = (name, create) => async (deps, context) => { calls.push(name); return create(deps, context); };
  const fakeFactory = async () => { calls.push(FAKE); const port = createStoreFake(); return { instance: port, capabilities: { 'test/sessions/store': port } }; };
  return {
    api, calls,
    inputs: { journal: api.bindInput(journalInput), session: api.bindInput(sessionInput) },
    store: () => api.bindFactory(storeDeclaration, scoped(STORE, factory(STORE, createStore))),
    fake: () => api.bindFactory(storeFakeDeclaration, fakeFactory),
    cache: () => api.bindFactory(cacheDeclaration, scoped(CACHE, factory(CACHE, createCache))),
    root: () => api.bindFactory(sessionDeclaration, factory(ROOT, createSession)),
  };
}
const prepare = (h, stores, root = h.root(), cache = h.cache()) =>
  h.api.prepare({ profileId: 'test/sessions/template', factories: [...stores, cache, root], roots: { session: root }, inputs: h.inputs });

// Regression: a module is wired to a different provider and preparation still passes.
test('prepare: the template composition root completes all 8 rows, equal to the hand-written table', async () => {
  const preparation = await composeSessions(assemblyFor());
  assert.equal(preparation.status, 'prepared');
  const { bindings } = preparation.composition.plan;
  assert.equal(bindings.length, 8);
  assert.deepEqual(oracleDiff(bindings), []);
  assert.deepEqual(oracleDiff(bindings.toReversed()), [], 'the plan is compared by row identity, not by position');
});

// Regression: the oracle passes whatever the plan holds.
test('prepare: the oracle detects a changed, a missing and an unexpected row', () => {
  const swapped = ORACLE.map(binding => key(binding) === `${CACHE}#store` ? row(CACHE, 'store', FAKE, 'test/sessions/store') : binding);
  assert.deepEqual(oracleDiff(swapped), [`changed ${CACHE}#store`]);
  assert.deepEqual(oracleDiff(ORACLE.slice(1)), [`missing ${STORE}#journal`]);
  assert.deepEqual(oracleDiff([...ORACLE, row(ROOT, 'extra', STORE, 'test/sessions/store')]), [`unexpected ${ROOT}#extra`]);
});

const candidates = [FAKE, STORE];
// Regression: completion guesses between two providers of one capability, or Core is the first to see the duplicate selection.
test('prepare: a fake beside the memory store is unresolved for both store slots, with zero factory calls', async () => {
  const h = harness();
  const preparation = await prepare(h, [h.store(), h.fake()]);
  assert.equal(preparation.status, 'failed');
  assert.equal(preparation.error.code, 'assembly.prepare.unresolved-binding');
  assert.deepEqual(preparation.diagnostics, []);
  assert.deepEqual(preparation.error.cause.map(slot => ({ ...slot })).sort((a, b) => key2(a).localeCompare(key2(b))), [
    { consumerImplementationId: CACHE, slotId: 'store', capabilityId: 'test/sessions/store', cardinality: 'required', candidates },
    { consumerImplementationId: ROOT, slotId: 'store', capabilityId: 'test/sessions/store', cardinality: 'required', candidates },
  ]);
  assert.deepEqual(h.calls, []);
});
const key2 = slot => `${slot.consumerImplementationId}#${slot.slotId}`;

// Regression: a missing provider falls through to a Core diagnostic or a runtime failure instead of a prepare-time list.
test('prepare: without the memory store both store slots are unresolved with zero candidates', async () => {
  const h = harness();
  const preparation = await prepare(h, []);
  assert.equal(preparation.status, 'failed');
  assert.equal(preparation.error.code, 'assembly.prepare.unresolved-binding');
  assert.deepEqual(preparation.error.cause.map(slot => ({ ...slot })).sort((a, b) => key2(a).localeCompare(key2(b))), [
    { consumerImplementationId: CACHE, slotId: 'store', capabilityId: 'test/sessions/store', cardinality: 'required', candidates: [] },
    { consumerImplementationId: ROOT, slotId: 'store', capabilityId: 'test/sessions/store', cardinality: 'required', candidates: [] },
  ]);
  assert.deepEqual(h.calls, []);
});

// Regression: swapping a provider passes preparation silently and only the oracle can notice.
test('prepare: the fake in place of the memory store passes preparation and the oracle rejects the rows it changes', async () => {
  const h = harness();
  const preparation = await prepare(h, [h.fake()]);
  assert.equal(preparation.status, 'prepared');
  assert.deepEqual(h.calls, []);
  const { bindings } = preparation.composition.plan;
  assert.equal(bindings.length, 6);
  // Four rows, not two: the two consumers are rewired to the fake, and the memory store's own two rows leave the plan with it.
  // A missing row is a wiring change too, so the oracle compares the whole table.
  assert.deepEqual(oracleDiff(bindings), [
    `changed ${CACHE}#store`, `changed ${ROOT}#store`, `missing ${STORE}#journal`, `missing ${STORE}#session`,
  ]);
  const rewired = bindings.filter(binding => binding.slotId === 'store').map(binding => [key(binding), binding.providerImplementationIds]);
  assert.deepEqual(rewired.sort(), [[`${CACHE}#store`, [FAKE]], [`${ROOT}#store`, [FAKE]]]);
});
