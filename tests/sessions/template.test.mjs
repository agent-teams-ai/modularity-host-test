import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assemblyFor } from '@get-modular/assembly';
import { createScope } from '@get-modular/resources';
import { guardHandles, isolate, runContractSuite, smoke } from '@get-modular/conformance';
import { composeSessions } from '../../src/sessions/compose.ts';
import { openSession } from '../../src/sessions/host.ts';
import { cacheDeclaration, createCache } from '../../src/sessions/cache.ts';
import { createStore, storeDeclaration } from '../../src/sessions/store.ts';
import { createStoreFake, storeFakeDeclaration, storeSuite } from '../../src/sessions/testing.ts';
import { fileJournal } from './journal.mjs';

const guard = guardHandles();
const STORE = 'test/sessions/store/memory', CACHE = 'test/sessions/cache/default', ROOT = 'test/sessions/session/default';
const inputs = (journal, id) => ({ journal: { 'test/sessions/journal': journal.port }, session: { 'test/sessions/session-id': { id } } });

// Regression: a module scope captured at bind time makes one session's close release other sessions.
test('sessions: 1000 concurrent sessions of one prepared template release only their own records', async () => {
  const journal = fileJournal();
  try {
    const preparation = await composeSessions(assemblyFor());
    assert.equal(preparation.status, 'prepared');
    const host = createScope({ name: 'host' });
    const sessions = host.resources.child({ name: 'sessions', order: 'concurrent' });
    const opened = await Promise.all(Array.from({ length: 1000 }, (_, k) =>
      openSession(preparation.prepared, sessions.resources, { id: String(k), journal: journal.port })));
    opened.forEach((entry, k) => { assert.equal(entry.ok, true); assert.equal(entry.session.id, String(k)); assert.equal(entry.session.roundTrip(`v${k}`), `v${k}`); });
    const acquired = journal.entries();
    assert.equal(acquired.length, 2000);
    for (let k = 0; k < 1000; k++) assert.ok(acquired.indexOf(`acquire:store:${k}`) < acquired.indexOf(`acquire:cache:${k}`));
    assert.deepEqual(await opened[417].lifetime.close(), { complete: true, settled: true, debts: [] });
    assert.deepEqual(journal.entries().slice(2000), ['release:cache:417', 'release:store:417']);
    const all = await host.control.close();
    assert.deepEqual(all, { complete: true, settled: true, debts: [] });
    const released = journal.entries().slice(2002);
    assert.equal(released.length, 1998);
    assert.equal(released.some(entry => entry.endsWith(':417')), false);
    for (let k = 0; k < 1000; k++) if (k !== 417) assert.ok(released.indexOf(`release:cache:${k}`) < released.indexOf(`release:store:${k}`));
  } finally { journal.dispose(); }
});

// Regression: a failed attempt keeps earlier modules' resources or releases them out of order.
for (const [at, expected] of [
  [STORE, ['acquire:store:s', 'release:store:s']],
  [CACHE, ['acquire:store:s', 'acquire:cache:s', 'release:cache:s', 'release:store:s']],
  [ROOT, ['acquire:store:s', 'acquire:cache:s', 'release:cache:s', 'release:store:s']],
]) {
  test(`sessions: a failure at ${at} releases its attempt in reverse order`, async () => {
    const journal = fileJournal();
    try {
      const steps = await smoke({ api: assemblyFor(), compose: composeSessions, inject: ['fail'], at: [at], inputs: inputs(journal, 's') });
      assert.deepEqual(steps.map(step => [step.inject, step.at ?? null, step.outcome, step.report.complete]),
        [['none', null, 'succeeded', true], ['fail', at, 'failed', true]]);
      assert.deepEqual(journal.entries().slice(4), expected);
    } finally { journal.dispose(); }
  });
}

// Regression: a factory bound outside the given api, or a module that leaves a debt after failure or abort.
test('sessions: smoke fails and aborts every module and every attempt closes complete', async () => {
  const journal = fileJournal();
  try {
    const steps = await smoke({ api: assemblyFor(), compose: composeSessions, inputs: inputs(journal, 's') });
    assert.deepEqual(steps.map(step => [step.inject, step.at ?? null, step.outcome, step.report.complete]), [
      ['none', null, 'succeeded', true],
      ['fail', STORE, 'failed', true], ['abort', STORE, 'cancelled', true],
      ['fail', CACHE, 'failed', true], ['abort', CACHE, 'cancelled', true],
      ['fail', ROOT, 'failed', true], ['abort', ROOT, 'cancelled', true],
    ]);
  } finally { journal.dispose(); }
});

// Regression: run inputs are checked after the first factory instead of before it.
test('sessions: a run without its declared inputs fails before any factory', async () => {
  const journal = fileJournal();
  try {
    const preparation = await composeSessions(assemblyFor());
    const attempt = createScope({ name: 'attempt' });
    const outcome = await preparation.prepared.run({ scope: attempt.resources, inputs: { journal: { 'test/sessions/journal': journal.port } } });
    assert.deepEqual([outcome.status, outcome.phase, outcome.code, outcome.created.length], ['failed', 'inputs', 'assembly.run.invalid-inputs', 0]);
    assert.deepEqual(await attempt.control.close(), { complete: true, settled: true, debts: [] });
    assert.deepEqual(journal.entries(), []);
  } finally { journal.dispose(); }
});

// Regression: a module test builds the factory outside a real run and misses its scope release.
test('sessions: isolate builds the cache against the store fake and releases it', async () => {
  const journal = fileJournal();
  try {
    {
      await using cache = await isolate(assemblyFor(), { declaration: cacheDeclaration, factory: createCache,
        dependencies: { store: createStoreFake(), journal: journal.port, session: { id: 'isolated' } } });
      assert.equal(cache.capabilities['test/sessions/cache'].read('missing'), undefined);
    }
    assert.deepEqual(journal.entries(), ['acquire:cache:isolated', 'release:cache:isolated']);
  } finally { journal.dispose(); }
});

const quiet = Object.freeze({ append: () => {} });
runContractSuite(storeSuite, { name: 'memory', declaration: storeDeclaration, create: async context =>
  (await isolate(assemblyFor(), { declaration: storeDeclaration, factory: createStore, within: context.resources,
    dependencies: { journal: quiet, session: { id: 'suite' } } })).capabilities['test/sessions/store'] }, test);
runContractSuite(storeSuite, { name: 'fake', declaration: storeFakeDeclaration, create: () => createStoreFake() }, test);

test('sessions: the template test file leaves no active handles', async () => { await guard.check(); });
