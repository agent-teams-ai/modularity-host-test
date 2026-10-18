import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assemblyFor, entriesOf, group } from '@get-modular/assembly';
import { checkWiring } from '@get-modular/conformance';
import { composeTemplate, templateModules } from '../../src/composition/template.root.ts';
import type { SessionCapabilities } from '../../src/features/sessions/composition/sessions.contracts.ts';
import { journalInput, sessionInput } from '../../src/features/sessions/composition/sessions.inputs.ts';
import { journalDeclaration } from '../../src/features/sessions/composition/journal.declaration.ts';
import { sessionIdDeclaration } from '../../src/features/sessions/composition/session-id.declaration.ts';
import { sessionsGroup } from '../../src/features/sessions/composition/sessions.group.ts';
import { sessionModule } from '../../src/features/sessions/composition/session.module.ts';
import { sessionsWiring } from '../features/sessions/sessions.wiring.ts';
import { storageWiring } from '../features/sessions/features/storage/storage.wiring.ts';
import { counterWiring } from '../features/counter/counter.wiring.ts';
import { counterFakeDeclaration, counterFakeModule } from '../features/counter/testing.ts';

const declarations = [
  ...entriesOf(templateModules).map(entry => entry.declaration),
  journalDeclaration, sessionIdDeclaration,
];

test('wiring: the template root matches the sessions, storage and counter oracles', async () => {
  const preparation = await composeTemplate(assemblyFor());
  assert.equal(preparation.status, 'prepared');
  if (preparation.status !== 'prepared') return;
  checkWiring(preparation.composition, [sessionsWiring, storageWiring, counterWiring], { declarations });
});

test('wiring: the oracle detects a changed, a missing and an unexpected provider pin', async () => {
  const preparation = await composeTemplate(assemblyFor());
  assert.equal(preparation.status, 'prepared');
  if (preparation.status !== 'prepared') return;
  const changed = { ...storageWiring, providers: { ...storageWiring.providers, 'test/sessions/store': 'test/sessions/store/fake' } };
  assert.throws(() => checkWiring(preparation.composition, [sessionsWiring, changed, counterWiring], { declarations }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'conformance.wiring.mismatch');
  assert.throws(() => checkWiring(preparation.composition, [sessionsWiring, counterWiring], { declarations }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'conformance.wiring.mismatch');
  assert.throws(() => checkWiring(preparation.composition, [sessionsWiring, storageWiring, counterWiring,
    { providers: { 'test/unexpected': 'test/unexpected/default' } }], { declarations }),
    (error: unknown) => Reflect.get(Object(error), 'code') === 'conformance.wiring.mismatch');
});

test('LEGO: replacing counter with its fake needs no sessions change', async () => {
  const api = assemblyFor<SessionCapabilities>();
  const fakeCounter = group('counter', [counterFakeModule]);
  const preparation = await api.prepare({
    profileId: 'test/sessions/template',
    modules: [fakeCounter, sessionsGroup],
    roots: { session: sessionModule },
    inputs: { journal: journalInput, session: sessionInput },
  });
  assert.equal(preparation.status, 'prepared');
  if (preparation.status !== 'prepared') return;
  const fakeDeclarations = [counterFakeDeclaration, ...entriesOf([sessionsGroup]).map(entry => entry.declaration), journalDeclaration, sessionIdDeclaration];
  assert.throws(() => checkWiring(preparation.composition, [sessionsWiring, storageWiring, counterWiring], { declarations: fakeDeclarations }),
    (error: unknown) => {
      const details = Reflect.get(Object(error), 'details');
      const diffs = Reflect.get(Object(details), 'differences');
      const pins = diffs.filter((difference: unknown) => Reflect.get(Object(difference), 'rule') === 'capability-provider');
      assert.deepEqual(pins.map((difference: unknown) => Reflect.get(Object(difference), 'subject')), ['test/counter/counter'], JSON.stringify(diffs));
      return Reflect.get(Object(error), 'code') === 'conformance.wiring.mismatch';
    });
});
