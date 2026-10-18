import { after, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createScope } from '@get-modular/resources';
import { guardHandles } from '@get-modular/conformance';
import { spawnGroup } from '../../src/adapters/process-group.ts';

assert.notEqual(process.platform, 'win32', 'the process-group recipe is POSIX only');
const guard = guardHandles();
const started = new Set();
// Safety net independent of the adapter: a regression must fail the test, never leave a group running.
after(() => { for (const pid of started) { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } } });
const fixture = fileURLToPath(new URL('./process-group-fixture.mjs', import.meta.url));
const markers = mkdtempSync(join(tmpdir(), 'process-group-'));
after(() => { rmSync(markers, { recursive: true, force: true }); });
// ESRCH only: macOS answers EPERM while a member is an unreaped zombie, which is not gone yet.
const gone = pid => { try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; if (error.code === 'EPERM') return false; throw error; } };
// The orphaned grandchild is reaped by init asynchronously; this bounded poll waits for the OS, not for our code.
async function reaped(pids) {
  for (let attempt = 0; attempt < 200; attempt++) { if (pids.every(gone)) return true; await delay(10); }
  return false;
}
async function start(mode) {
  const host = createScope({ name: 'host' });
  const marker = join(markers, `${mode}.log`);
  const group = await spawnGroup(host.resources, 'group', process.execPath, [fixture, 'leader', mode, marker]);
  group.child.stdout.setEncoding('utf8');
  const lines = [];
  let partial = '';
  const next = async () => {
    while (lines.length === 0) {
      const [chunk] = await once(group.child.stdout, 'data');
      const parts = (partial + chunk).split('\n');
      partial = parts.pop();
      lines.push(...parts.filter(Boolean));
    }
    return lines.shift();
  };
  const pids = JSON.parse(await next());
  started.add(pids.leader); started.add(pids.grandchild);
  const terms = () => readFileSync(marker, 'utf8').split('\n').filter(Boolean).sort();
  // Only PIDs not yet confirmed gone stay in the safety net, so a reused PID is never killed.
  const forget = () => { started.delete(pids.leader); started.delete(pids.grandchild); };
  return { host, group, pids, next, terms, forget };
}

// Regression: release sends SIGTERM only to the leader, so the grandchild never gets its graceful signal.
test('process-group: SIGTERM releases a cooperative leader and grandchild', async () => {
  const { host, group, pids, terms, forget } = await start('cooperative');
  assert.equal(group.pgid, pids.leader);
  assert.deepEqual(await host.control.close(), { complete: true, settled: true, debts: [] });
  assert.equal(await reaped([-group.pgid, pids.leader, pids.grandchild]), true);
  forget();
  assert.deepEqual(terms(), ['grandchild:term', 'leader:term']);
});

// Regression: escalate is ignored, so a group that ignores SIGTERM keeps the close pending.
test('process-group: escalate sends SIGKILL to a group that ignores SIGTERM', async () => {
  const { host, group, pids, next, forget } = await start('stubborn');
  const escalate = new AbortController();
  const closing = host.control.close({ escalate: escalate.signal });
  assert.equal(await next(), 'term');
  escalate.abort();
  assert.deepEqual(await closing, { complete: true, settled: true, debts: [] });
  assert.equal(await reaped([-group.pgid, pids.leader, pids.grandchild]), true);
  forget();
});

test('process-group: the test file leaves no active handles', async () => { await guard.check(); });
