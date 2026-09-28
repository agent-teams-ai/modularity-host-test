import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fork } from 'node:child_process';
import { deferred, fixture } from './fixture.mjs';
process.env.TEST_MARKERS = join(mkdtempSync(join(tmpdir(), 'test-host-lifecycle-')), 'markers');

function product(host, resource, value = 'value') {
  const resourceId = 'shared';
  const resourceIdentity = Symbol.for('lifecycle-test-resource');
  return { instance: {}, capabilities: {
    'test/resource/read': { resourceId, resourceIdentity, read: () => host.read(() => value) },
    'test/resource/write': { resourceId, resourceIdentity, write: text => { host.effect(text); return text; } },
  } };
}

// Regression: concurrent callers start two real Assembly runs or retain no resource owner.
test('single flight, one shared resource and saved handles remain revoked', async () => {
  const x = await fixture();
  const first = x.start();
  assert.strictEqual(x.start(), first);
  const result = await first;
  assert.equal(result.status, 'published', JSON.stringify(result.raw, (key, value) => key === 'cause' ? String(value) : value));
  assert.equal(result.raw.created.length, 4);
  assert.equal(result.root.sharedResource(), true);
  assert.deepEqual(result.root.run(), ['a:write', 'a-value']);
  const saved = result.root.run;
  const savedIdentities = result.root.identities;
  const close = x.host.close();
  assert.strictEqual(x.host.close(), close);
  assert.equal((await close).status, 'closed');
  assert.throws(saved, /host-revoked/);
  assert.throws(savedIdentities, /host-revoked/);
  const next = await fixture();
  const fresh = await next.start();
  assert.equal(fresh.status, 'published');
  assert.deepEqual(fresh.root.run(), ['a:write', 'a-value']);
  assert.throws(saved, /host-revoked/);
  await next.host.close();
});

// Regression: a detached registration callback appends ownership debt after its construction ticket settled.
test('settled registration and detached acquisition are refused', async () => {
  let register, disposals = 0;
  const x = await fixture(async ({ host, owner }) => {
    register = owner.reserve();
    const resource = { dispose() { disposals++; } };
    register(resource);
    return product(host, resource);
  });
  assert.equal((await x.start()).status, 'published');
  assert.throws(() => register({ dispose() { throw Error('detached'); } }), /registration-refused/);
  const close = x.host.close();
  assert.throws(() => x.host.reserve(), /reservation-refused/);
  assert.equal((await close).status, 'closed');
  assert.equal(disposals, 1);
});

// Regression: a live construction ticket incorrectly permits a fresh post-seal reservation.
test('factory paused before reservation allocates nothing after seal', async () => {
  const entered = deferred(), release = deferred();
  let allocated = 0;
  const x = await fixture(async ({ owner }) => {
    entered.resolve(); await release.promise;
    const register = owner.reserve();
    allocated++; register({ dispose() {} });
    return {};
  });
  const construction = x.start(); await entered.promise;
  const close = x.host.close(); release.resolve();
  const result = await construction;
  assert.equal(result.raw.status, 'failed');
  assert.match(String(result.raw.cause), /reservation-refused/);
  assert.equal((await close).status, 'closed');
  assert.equal(allocated, 0);
});

// Regression: late delivery under a pre-seal reservation is discarded or disposed before construction settles.
test('reserved acquisition delivered after seal is registered and disposed once', async () => {
  const entered = deferred(), release = deferred();
  let disposals = 0;
  const x = await fixture(async ({ host, owner }) => {
    const register = owner.reserve(); entered.resolve(); await release.promise;
    const resource = { dispose() { disposals++; } };
    register(resource);
    assert.throws(() => register(resource), /registration-refused/);
    return product(host, resource);
  });
  const construction = x.start(); await entered.promise;
  const close = x.host.close();
  assert.equal(x.host.status().state, 'draining');
  release.resolve();
  const result = await construction;
  assert.equal(result.raw.status, 'cancelled');
  assert.equal(result.raw.created.length, 1);
  assert.equal((await close).status, 'closed');
  assert.equal(disposals, 1);
});

// Regression: a factory rejection loses a registered resource because no product was returned.
test('acquired then rejected factory preserves primary failure and one cleanup', async () => {
  const cause = Error('primary'); let disposals = 0;
  const x = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() { disposals++; } });
    throw cause;
  });
  const result = await x.start();
  assert.equal(result.raw.status, 'failed');
  assert.strictEqual(result.raw.cause, cause);
  assert.equal(result.raw.returned, undefined);
  assert.equal((await x.host.close()).status, 'closed');
  assert.equal(disposals, 1);
});

// Regression: import evaluation in a fresh process bypasses the post-import authority check.
test('fresh child seals during ESM top-level await before create', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'host-import-child-'));
  const markers = join(dir, 'markers');
  const child = fork(new URL('./import-child.mjs', import.meta.url), [], {
    cwd: dir, execArgv: [], env: { HOME: dir, TMPDIR: dir, LANG: 'C', TEST_MARKERS: markers },
  });
  const messages = [];
  const waiters = [];
  const enqueue = message => { const waiter = waiters.shift(); if (waiter) waiter(message); else messages.push(message); };
  child.on('message', enqueue);
  child.on('error', error => enqueue({ type: 'infrastructure-error', message: String(error) }));
  child.on('exit', (code, signal) => enqueue({ type: 'infrastructure-error', code, signal }));
  const next = () => new Promise(resolve => { if (messages.length) resolve(messages.shift()); else waiters.push(resolve); });
  const watchdog = setTimeout(() => child.kill(), 10000);
  try {
    assert.equal((await next()).type, 'import-started');
    child.send('seal');
    const sealed = await next();
    assert.deepEqual(sealed, { type: 'sealed', state: 'draining' });
    child.send('release');
    const result = await next();
    assert.deepEqual(result, { type: 'result', raw: 'failed', created: 0, terminal: 'closed', resource: false });
    assert.match(readFileSync(markers, 'utf8'), /paused:evaluate/);
  } finally {
    clearTimeout(watchdog);
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

// Regression: successful Assembly handoff publishes a root after a synchronous seal in the handoff callback.
test('seal between real Assembly success and publication retains raw success', async () => {
  const x = await fixture();
  const handed = deferred(), release = deferred();
  const construction = x.host.construct(async signal => {
    const actual = await x.run(signal);
    handed.resolve(actual);
    await release.promise;
    return actual;
  }, outcome => outcome.status === 'succeeded' ? outcome.roots.app : undefined);
  const raw = await handed.promise;
  assert.equal(raw.status, 'succeeded', JSON.stringify(raw, (key, value) => key === 'cause' ? String(value) : value));
  const close = x.host.close(); release.resolve();
  const result = await construction;
  assert.equal(result.status, 'cancelled');
  assert.strictEqual(result.raw, raw);
  assert.equal(x.host.status().ready, false);
  assert.equal((await close).status, 'closed');
});

// Regression: an operation admitted before seal writes after an await, or a rejection ends the drain early.
test('post-await commit is fenced and all operation tickets drain', async () => {
  const x = await fixture();
  assert.equal((await x.start()).status, 'published');
  const gate = deferred(), rejectGate = deferred(), entered = deferred();
  const paused = x.host.operate(async () => { entered.resolve(); await gate.promise; x.host.commit('late'); });
  const bad = x.host.operate(async () => { await rejectGate.promise; throw Error('operation-primary'); });
  await entered.promise;
  const close = x.host.close();
  assert.equal(x.host.status().state, 'draining');
  rejectGate.resolve();
  await assert.rejects(bad, /operation-primary/);
  assert.equal(x.host.status().state, 'draining');
  gate.resolve();
  await assert.rejects(paused, /host-revoked/);
  assert.equal((await close).status, 'closed');
  assert.deepEqual(x.host.effects, []);
});

// Regression: abort callbacks can admit sibling work or see a different close promise.
test('abort listener sees sealed authority and identical raw close', async () => {
  const entered = deferred(), release = deferred();
  let sibling, reentrant;
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() {} });
    hostSignal.addEventListener('abort', () => {
      try { host.operate(() => 'wrong'); } catch (error) { sibling = error; }
      reentrant = host.close();
    });
    entered.resolve(); await release.promise;
    throw Error('after-abort');
  });
  // This reference is set from the actual public run signal before provider invocation.
  let hostSignal;
  const construction = x.host.construct(signal => { hostSignal = signal; return x.run(signal); },
    out => out.status === 'succeeded' ? out.roots.app : undefined);
  await entered.promise;
  const close = x.host.close();
  assert.strictEqual(reentrant, close);
  assert.match(String(sibling), /host-revoked/);
  release.resolve();
  await construction;
  assert.equal((await close).status, 'closed');
});

// Regression: a failed disposer is retried or overwrites the primary factory failure.
test('cleanup failure retains cause, debt and original construction failure', async () => {
  const primary = Error('primary'), cleanup = Error('cleanup');
  let calls = 0;
  const x = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() { calls++; throw cleanup; } });
    throw primary;
  });
  const construction = await x.start();
  assert.strictEqual(construction.raw.cause, primary);
  const close = x.host.close();
  assert.strictEqual(x.host.close(), close);
  const terminal = await close;
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.cause, cleanup);
  assert.strictEqual(x.host.status().debt, terminal.debt);
  assert.equal(calls, 1);
});

// Regression: disposer reentrancy starts another cleanup flight or retries disposal.
test('disposer reentrant close returns the same raw promise', async () => {
  let seen, calls = 0;
  const x = await fixture(async ({ host, owner }) => {
    const resource = { dispose() { calls++; seen = host.close(); } };
    owner.reserve()(resource);
    return product(host, resource);
  });
  assert.equal((await x.start()).status, 'published');
  const close = x.host.close();
  assert.equal((await close).status, 'closed');
  assert.strictEqual(seen, close);
  assert.equal(calls, 1);
});

// Regression: asynchronous cleanup rejection replaces a prior factory error or loses debt.
test('async disposer rejection keeps primary factory failure', async () => {
  const primary = Error('factory-primary'), cleanup = Error('disposer-async');
  const x = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose: async () => { throw cleanup; } });
    throw primary;
  });
  const construction = await x.start();
  assert.strictEqual(construction.raw.cause, primary);
  const terminal = await x.host.close();
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.cause, cleanup);
  assert.strictEqual(x.host.status().debt, terminal.debt);
});

// Regression: observer abort or deadline aborts cleanup, changes a pending receipt, or leaks waiters.
test('observers preserve pending receipts and terminal wins at a wake', async () => {
  const scheduled = new Map(); let now = 10, next = 0;
  const clock = { now: () => now, schedule: (_delay, wake) => { const id = ++next; scheduled.set(id, wake); return id; },
    cancel: id => { scheduled.delete(id); } };
  const entered = deferred(), release = deferred();
  let dispose;
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose: () => new Promise(resolve => { dispose = resolve; }) });
    entered.resolve(); await release.promise;
    return product(host);
  }, { clock });
  await assert.rejects(x.host.observeClose(), /close-not-started/);
  const construction = x.start(); await entered.promise;
  const close = x.host.close();
  await assert.rejects(x.host.observeClose({ deadlineAt: Infinity }), /invalid-deadline/);
  const aborter = new AbortController();
  let listeners = 0;
  const add = aborter.signal.addEventListener.bind(aborter.signal);
  const remove = aborter.signal.removeEventListener.bind(aborter.signal);
  aborter.signal.addEventListener = (...args) => { listeners++; return add(...args); };
  aborter.signal.removeEventListener = (...args) => { listeners--; return remove(...args); };
  const aborted = x.host.observeClose({ signal: aborter.signal, deadlineAt: 20 });
  const waiting = x.host.observeClose();
  assert.equal(x.host.status().observers, 2);
  aborter.abort();
  const first = await aborted;
  assert.deepEqual(first, { status: 'pending', reason: 'aborted' });
  assert.equal(x.host.status().observers, 1);
  assert.equal(scheduled.size, 0);
  assert.equal(listeners, 0);
  const expired = await x.host.observeClose({ signal: aborter.signal, deadlineAt: 5 });
  assert.equal(expired.reason, 'aborted');
  release.resolve(); await construction;
  // Let the drain reach the disposer without a real timer or sleep.
  for (let i = 0; i < 8 && !dispose; i++) await Promise.resolve();
  assert.equal(typeof dispose, 'function');
  assert.equal(x.host.status().state, 'draining');
  dispose();
  assert.equal((await close).status, 'closed');
  assert.equal((await waiting).status, 'closed');
  assert.equal(first.reason, 'aborted');
  assert.equal((await x.host.observeClose({ deadlineAt: 5 })).status, 'closed');
  assert.equal(x.host.status().observers, 0);
  assert.equal(scheduled.size, 0);
});

// Regression: a late malformed product is misclassified as created, or its owner slot is lost.
test('malformed late product is returned but never created', async () => {
  const entered = deferred(), release = deferred(); let disposals = 0;
  const malformed = { instance: {}, capabilities: {} };
  const x = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() { disposals++; } });
    entered.resolve(); await release.promise;
    return malformed;
  });
  const construction = x.start(); await entered.promise;
  const close = x.host.close(); release.resolve();
  const result = await construction;
  assert.equal(result.raw.status, 'failed');
  assert.equal(result.raw.code, 'assembly.run.invalid-product');
  assert.strictEqual(result.raw.returned.product, malformed);
  assert.deepEqual(result.raw.created, []);
  assert.equal((await close).status, 'closed');
  assert.equal(disposals, 1);
});

// Regression: abort hides the original factory rejection or releases the resource early.
test('rejection after abort keeps original cause and cancellation evidence', async () => {
  const entered = deferred(), release = deferred(); const primary = Error('late-primary');
  let disposals = 0;
  const x = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() { disposals++; } });
    entered.resolve(); await release.promise;
    throw primary;
  });
  const construction = x.start(); await entered.promise;
  const close = x.host.close(); release.resolve();
  const result = await construction;
  assert.equal(result.raw.status, 'failed');
  assert.strictEqual(result.raw.cause, primary);
  assert.notEqual(result.raw.cancellation, undefined);
  assert.equal(result.raw.returned, undefined);
  assert.equal((await close).status, 'closed');
  assert.equal(disposals, 1);
});

// Regression: timeout observes a synthetic terminal or a later disposal failure edits its pending receipt.
test('deadline pending stays fixed across late async disposal failure', async () => {
  const scheduled = new Map(); let now = 0, next = 0;
  const clock = { now: () => now, schedule: (_delay, wake) => { const id = ++next; scheduled.set(id, wake); return id; },
    cancel: id => { scheduled.delete(id); } };
  const disposal = deferred(), cleanup = Error('async-cleanup');
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose: () => disposal.promise });
    return product(host);
  }, { clock });
  assert.equal((await x.start()).status, 'published');
  const close = x.host.close();
  const pending = x.host.observeClose({ deadlineAt: 10 });
  assert.equal(scheduled.size, 1);
  now = 10;
  [...scheduled.values()][0]();
  const receipt = await pending;
  assert.deepEqual(receipt, { status: 'pending', reason: 'deadline' });
  assert.equal(x.host.status().observers, 0);
  assert.equal(scheduled.size, 0);
  disposal.reject(cleanup);
  const terminal = await close;
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.cause, cleanup);
  assert.equal(receipt.reason, 'deadline');
  assert.strictEqual(await x.host.observeClose({ deadlineAt: -1 }), terminal);
});

// Regression: an expired observer overrules a stored terminal, or a pre-aborted signal loses to a deadline.
test('close-before-construct guard and observer same-turn priority', async () => {
  const timer = new Map(); let next = 0;
  const clock = { now: () => 10, schedule: (_delay, wake) => { const id = ++next; timer.set(id, wake); return id; },
    cancel: id => { timer.delete(id); } };
  const x = await fixture(undefined, { clock });
  const terminal = await x.host.close();
  assert.equal(terminal.status, 'closed');
  await assert.rejects(x.start(), /construction-refused/);
  const aborter = new AbortController(); aborter.abort();
  assert.strictEqual(await x.host.observeClose({ signal: aborter.signal, deadlineAt: 0 }), terminal);
  assert.equal(x.host.status().observers, 0);

  const entered = deferred(), release = deferred();
  const y = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() {} }); entered.resolve(); await release.promise;
    return product(host);
  }, { clock });
  const construction = y.start(); await entered.promise;
  const close = y.host.close();
  const immediate = await y.host.observeClose({ signal: aborter.signal, deadlineAt: 0 });
  assert.deepEqual(immediate, { status: 'pending', reason: 'aborted' });
  const waiting = y.host.observeClose({ deadlineAt: 20 });
  const wake = [...timer.values()][0];
  release.resolve(); await construction; await close;
  wake();
  assert.equal((await waiting).status, 'closed');
  assert.equal(y.host.status().observers, 0);
  assert.equal(timer.size, 0);
});
