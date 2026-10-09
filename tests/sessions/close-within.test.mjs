import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { guardHandles } from '@get-modular/conformance';

const guard = guardHandles();
const GRACE = 100, ABANDON = 100;
async function host(mode) {
  const child = spawn(process.execPath, [fileURLToPath(new URL('./close-within-child.mjs', import.meta.url)), mode, String(GRACE), String(ABANDON)],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  let stdout = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  const [code] = await once(child, 'close');
  return { code, lines: stdout.trim().split('\n').filter(Boolean) };
}

// Regression: unreferenced deadline timers let the Host exit 0 before it has a report.
test('close-within: a stuck cleanup escalates, then abandons, and the Host exits 1 with an unsettled report', async () => {
  const { code, lines } = await host('stuck');
  assert.equal(code, 1);
  assert.equal(lines.length, 1);
  const { report, escalated, elapsedMs } = JSON.parse(lines[0]);
  assert.deepEqual(report, { complete: false, settled: false, debts: [{ path: ['host', 'stuck'], state: 'pending' }] });
  assert.equal(escalated, true);
  assert.ok(elapsedMs >= GRACE + ABANDON - 5, `abandoned after ${elapsedMs} ms`);
});

// Regression: the escalate signal never reaches cleanup, so every close waits for abandon.
// A settled report proves abandon did not end the wait; no upper time bound, so load cannot flake it.
test('close-within: a cleanup that honors escalate completes before the abandon deadline', async () => {
  const { code, lines } = await host('honors-escalate');
  assert.equal(code, 0);
  assert.equal(lines.length, 1);
  const { report, escalated, elapsedMs } = JSON.parse(lines[0]);
  assert.deepEqual(report, { complete: true, settled: true, debts: [] });
  assert.equal(escalated, true);
  assert.ok(elapsedMs >= GRACE - 5, `completed after ${elapsedMs} ms`);
});

test('close-within: the test file leaves no active handles', async () => { await guard.check(); });
