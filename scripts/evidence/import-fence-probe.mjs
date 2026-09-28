// Regression: an import that finishes after seal must not invoke create.
// This evidence process retains the child marker that the existing test deletes.
import { fork } from 'node:child_process';
import { dirname } from 'node:path';

const marker = process.env.TEST_MARKERS;
if (!marker) throw Error('missing TEST_MARKERS');
const dir = dirname(marker);
const child = fork(new URL('../../tests/lifecycle/import-child.mjs', import.meta.url), [], {
  cwd: dir, execArgv: [], env: { HOME: dir, TMPDIR: dir, LANG: 'C', TEST_MARKERS: marker },
});
const queue = [];
const waiters = [];
const enqueue = value => { const waiter = waiters.shift(); if (waiter) waiter(value); else queue.push(value); };
child.on('message', enqueue);
child.on('error', () => enqueue({ type: 'infrastructure-error' }));
child.on('exit', (code, signal) => enqueue({ type: 'exit', code, signal }));
const next = () => new Promise(resolve => { if (queue.length) resolve(queue.shift()); else waiters.push(resolve); });
const watchdog = setTimeout(() => child.kill(), 10000);
try {
  const imported = await next();
  if (imported.type !== 'import-started') throw Error('import did not start');
  child.send('seal');
  const sealed = await next();
  if (sealed.type !== 'sealed') throw Error('seal did not complete');
  child.send('release');
  const result = await next();
  if (result.type !== 'result') throw Error('child did not report result');
  console.log(JSON.stringify({ importStarted: true, sealed: sealed.state,
    raw: result.raw, created: result.created, terminal: result.terminal, resource: result.resource }));
} finally {
  clearTimeout(watchdog);
  child.kill();
}
