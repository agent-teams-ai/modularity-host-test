import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { assemblyFor } from '@get-modular/assembly';
import { createScope } from '@get-modular/resources';
import { guardHandles } from '@get-modular/conformance';
import { composeTemplate } from '../../../src/composition/template.root.ts';
import { openSession } from '../../../src/composition/host.ts';
import { fileJournal } from './testing.ts';

const guard = guardHandles();

// Regression: a module scope captured at bind time makes one session's close release other sessions.
test('sessions: 1000 concurrent sessions of one prepared template release only their own records', async () => {
  const journal = fileJournal();
  try {
    const preparation = await composeTemplate(assemblyFor());
    assert.equal(preparation.status, 'prepared');
    if (preparation.status !== 'prepared') return;
    const host = createScope({ name: 'host' });
    const sessions = host.resources.child({ name: 'sessions', order: 'concurrent' });
    const opened = await Promise.all(Array.from({ length: 1000 }, (_, k) =>
      openSession(preparation.prepared, sessions.resources, { id: String(k), journal: journal.port })));
    opened.forEach((entry, k) => {
      assert.equal(entry.ok, true);
      if (entry.ok) {
        assert.equal(entry.session.id, String(k));
        assert.equal(entry.session.roundTrip(`v${k}`), `v${k}`);
        assert.equal(entry.session.count('value'), 1);
      }
    });
    const acquired = journal.entries();
    assert.equal(acquired.length, 2000);
    for (let k = 0; k < 1000; k++) assert.ok(acquired.indexOf(`acquire:store:${k}`) < acquired.indexOf(`acquire:cache:${k}`));
    const selected = opened[417];
    assert.equal(selected.ok, true);
    if (selected.ok) assert.deepEqual(await selected.lifetime.close(), { complete: true, settled: true, debts: [] });
    assert.deepEqual(journal.entries().slice(2000), ['release:cache:417', 'release:store:417']);
    assert.deepEqual(await host.control.close(), { complete: true, settled: true, debts: [] });
    const released = journal.entries().slice(2002);
    assert.equal(released.length, 1998);
    assert.equal(released.some(entry => entry.endsWith(':417')), false);
    for (let k = 0; k < 1000; k++) if (k !== 417) assert.ok(released.indexOf(`release:cache:${k}`) < released.indexOf(`release:store:${k}`));
  } finally { journal.dispose(); }
});

test('sessions: the template test file leaves no active handles', async () => { await guard.check(); });
