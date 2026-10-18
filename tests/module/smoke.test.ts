import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assemblyFor } from '@get-modular/assembly';
import { createScope } from '@get-modular/resources';
import { smoke } from '@get-modular/conformance';
import { composeTemplate } from '../../src/composition/template.root.ts';
import { fileJournal, type FileJournal } from '../features/sessions/testing.ts';

const COUNTER = 'test/counter/counter/default';
const STORE = 'test/sessions/store/memory', CACHE = 'test/sessions/cache/default', ROOT = 'test/sessions/session/default';
const inputs = (journal: FileJournal, id: string) => ({
  journal: { 'test/sessions/journal': journal.port },
  session: { 'test/sessions/session-id': { id } },
});

// Regression: a failed attempt keeps earlier modules' resources or releases them out of order.
for (const [at, expected] of [
  [STORE, ['acquire:store:s', 'release:store:s']],
  [CACHE, ['acquire:store:s', 'acquire:cache:s', 'release:cache:s', 'release:store:s']],
  [ROOT, ['acquire:store:s', 'acquire:cache:s', 'release:cache:s', 'release:store:s']],
] as const) {
  test(`sessions: a failure at ${at} releases its attempt in reverse order`, async () => {
    const journal = fileJournal();
    try {
      const steps = await smoke({ api: assemblyFor(), compose: composeTemplate, inject: ['fail'], at: [at], inputs: inputs(journal, 's') });
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
    const steps = await smoke({ api: assemblyFor(), compose: composeTemplate, inputs: inputs(journal, 's') });
    assert.deepEqual(steps.map(step => [step.inject, step.at ?? null, step.outcome, step.report.complete]), [
      ['none', null, 'succeeded', true],
      ['fail', COUNTER, 'failed', true], ['abort', COUNTER, 'cancelled', true],
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
    const preparation = await composeTemplate(assemblyFor());
    assert.equal(preparation.status, 'prepared');
    if (preparation.status !== 'prepared') return;
    const attempt = createScope({ name: 'attempt' });
    const outcome: unknown = await Reflect.apply(preparation.prepared.run, preparation.prepared, [{
      scope: attempt.resources, inputs: { journal: { 'test/sessions/journal': journal.port } },
    }]);
    const record: object = Object(outcome);
    assert.deepEqual([Reflect.get(record, 'status'), Reflect.get(record, 'phase'), Reflect.get(record, 'code'),
      Reflect.get(record, 'created').length], ['failed', 'inputs', 'assembly.run.invalid-inputs', 0]);
    assert.deepEqual(await attempt.control.close(), { complete: true, settled: true, debts: [] });
    assert.deepEqual(journal.entries(), []);
  } finally { journal.dispose(); }
});
