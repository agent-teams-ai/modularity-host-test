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
  assert.equal(result.status, 'published');
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

// Regression: first delivery after the construction ticket settles is accepted as cleanup debt.
test('first registration after settlement and detached acquisition are refused', async () => {
  let register, disposals = 0;
  const x = await fixture(async ({ host, owner }) => {
    register = owner.reserve();
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  assert.throws(() => register({ dispose() { disposals++; } }), /registration-refused/);
  const close = x.host.close();
  assert.throws(() => x.host.reserve(), /reservation-refused/);
  assert.equal((await close).status, 'closed');
  assert.equal(disposals, 0);
  assert.equal(x.host.status().hasResource, false);
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
  assert.deepEqual(x.host.status().lifecycle, { phase: 'staged', calls: 0, custody: 0 });
  const construction = x.start(); await entered.promise;
  assert.deepEqual(x.host.status().lifecycle, { phase: 'staged', calls: 0, custody: 1 });
  const close = x.host.close();
  assert.equal(x.host.status().state, 'draining');
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retiring', calls: 0, custody: 1 });
  release.resolve();
  const result = await construction;
  assert.equal(result.status, 'cancelled');
  assert.equal(result.raw.status, 'cancelled');
  assert.equal(result.raw.created.length, 1);
  assert.equal((await close).status, 'closed');
  assert.equal(disposals, 1);
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retired', calls: 0, custody: 0 });
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

// Regression: admission's real Assembly wrappers start create after an import resumes or after load's authority check yields.
test('admission wrappers fence create at both import and load continuation boundaries', async () => {
  for (const mode of ['control', 'import', 'gap']) {
    const dir = mkdtempSync(join(tmpdir(), 'host-admission-wrapper-'));
    const child = fork(new URL('./admission-child.mjs', import.meta.url), [mode], {
      cwd: dir, execArgv: [], env: { HOME: dir, TMPDIR: dir, LANG: 'C', TEST_MARKERS: join(dir, 'markers') },
    });
    const messages = [], waiters = [];
    const enqueue = message => { const waiter = waiters.shift(); if (waiter) waiter(message); else messages.push(message); };
    child.on('message', enqueue);
    child.on('error', error => enqueue({ type: 'error', message: String(error) }));
    child.on('exit', (code, signal) => enqueue({ type: 'exit', code, signal }));
    const next = () => new Promise(resolve => { if (messages.length) resolve(messages.shift()); else waiters.push(resolve); });
    const watchdog = setTimeout(() => child.kill(), 10000);
    try {
      if (mode === 'import') {
        assert.deepEqual(await next(), { type: 'import-started' });
        child.send('seal');
        assert.deepEqual(await next(), { type: 'sealed', state: 'draining' });
        child.send('release');
      }
      assert.deepEqual(await next(), { type: 'result', phase: 'construction', status: 'failed', created: 0,
        createCalls: mode === 'control' ? 1 : 0, terminal: 'closed', hasResource: false });
    } finally {
      clearTimeout(watchdog);
      child.kill();
      rmSync(dir, { recursive: true, force: true });
    }
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
  assert.equal(raw.status, 'succeeded');
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
  assert.deepEqual(x.host.status().lifecycle, { phase: 'active', calls: 2, custody: 1 });
  const close = x.host.close();
  assert.equal(x.host.status().state, 'draining');
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retiring', calls: 2, custody: 1 });
  rejectGate.resolve();
  await assert.rejects(bad, /operation-primary/);
  assert.equal(x.host.status().state, 'draining');
  gate.resolve();
  await assert.rejects(paused, /host-revoked/);
  assert.equal((await close).status, 'closed');
  assert.deepEqual(x.host.effects, []);
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retired', calls: 0, custody: 0 });
});

// Regression: a borrowed read facet still runs its callback after seal while cleanup is held.
test('public Assembly read facet revokes before its callback', async () => {
  let reads = 0, disposals = 0;
  const x = await fixture(async ({ host, owner }) => {
    const resource = { dispose() { disposals++; } };
    owner.reserve()(resource);
    const made = product(host, resource);
    made.capabilities['test/resource/read'].read = () => host.read(() => { reads++; return 'value'; });
    return made;
  });
  const result = await x.start();
  assert.equal(result.status, 'published');
  const handed = result.raw.created.find(entry => entry.implementationId === 'test/provider/a');
  const read = handed.capabilities['test/resource/read'].read;
  assert.equal(read(), 'value');
  assert.equal(reads, 1);
  const gate = deferred();
  const pending = x.host.operate(() => gate.promise);
  const close = x.host.close();
  assert.equal(x.host.status().state, 'draining');
  assert.throws(read, /host-revoked/);
  assert.equal(reads, 1);
  assert.equal(disposals, 0);
  gate.resolve(); await pending; await close;
  assert.equal(disposals, 1);
});

// Regression: a native Promise returned by a public read releases its call lease before raw settlement,
// letting close dispose the owned resource while the read callback can still resume.
test('public async read holds call custody through revoke and settles before physical cleanup', async () => {
  const gate = deferred(), events = [];
  const x = await fixture(async ({ host, owner }) => {
    const resource = { dispose() { events.push('dispose'); } };
    owner.reserve()(resource);
    const made = product(host, resource);
    made.capabilities['test/resource/read'].read = () => owner.read(() => gate.promise.then(() => {
      try { owner.effect('late'); }
      finally { events.push('read-settled'); }
      return 'value';
    }));
    return made;
  });
  const construction = await x.start();
  assert.equal(construction.status, 'published');
  const handed = construction.raw.created.find(entry => entry.implementationId === 'test/provider/a');
  const pending = handed.capabilities['test/resource/read'].read();
  const refused = assert.rejects(pending, /host-revoked/);
  const close = x.host.close();
  try {
    assert.deepEqual(x.host.status().lifecycle, { phase: 'retiring', calls: 1, custody: 1 });
    assert.deepEqual(events, []);
  } finally {
    gate.resolve();
    await refused;
    await close;
  }
  assert.deepEqual(events, ['read-settled', 'dispose']);
  assert.deepEqual(x.host.effects, []);
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retired', calls: 0, custody: 0 });
});

// Regression: a synchronous read failure strands a call lease and blocks one-shot close.
test('public synchronous read failure releases its call before close', async () => {
  const failure = Error('read-failure');
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() {} });
    const made = product(host);
    made.capabilities['test/resource/read'].read = () => owner.read(() => { throw failure; });
    return made;
  });
  const construction = await x.start();
  assert.equal(construction.status, 'published');
  const handed = construction.raw.created.find(entry => entry.implementationId === 'test/provider/a');
  assert.throws(handed.capabilities['test/resource/read'].read, error => error === failure);
  assert.deepEqual(x.host.status().lifecycle, { phase: 'active', calls: 0, custody: 1 });
  assert.equal((await x.host.close()).status, 'closed');
});

// Regression: a hostile native Promise blocks observer installation, but the Host falsely
// releases its raw call and disposes before that Promise has settled.
test('failed native Promise observer installation retains unresolved cleanup debt', async () => {
  const speciesFailure = Error('species-failure');
  let resolveRaw, disposals = 0;
  const raw = new Promise(resolve => { resolveRaw = resolve; });
  Object.defineProperty(raw, 'constructor', { value: {
    get [Symbol.species]() { throw speciesFailure; },
  } });
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { disposals++; } });
    const made = product(host);
    made.capabilities['test/resource/read'].read = () => owner.read(() => raw);
    return made;
  });
  const construction = await x.start();
  assert.equal(construction.status, 'published');
  const handed = construction.raw.created.find(entry => entry.implementationId === 'test/provider/a');
  let refusal;
  try { handed.capabilities['test/resource/read'].read(); }
  catch (error) { refusal = error; }
  const close = x.host.close();
  let closed = false;
  close.then(() => { closed = true; });
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retiring', calls: 1, custody: 1 });
  assert.equal(disposals, 0);
  resolveRaw('late-value');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(String(refusal), /read-observer-refused/);
  assert.strictEqual(refusal.cause, speciesFailure);
  assert.equal(closed, false);
  assert.equal(disposals, 0);
  assert.deepEqual(await x.host.observeClose({ deadlineAt: 0 }), { status: 'pending', reason: 'deadline' });
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retiring', calls: 1, custody: 1 });
});

// Regression: abort callbacks can use a ready sibling handle after seal or see a different close promise.
test('abort listener sees sealed authority and identical raw close', async () => {
  let disposals = 0, hostSignal;
  const x = await fixture(async ({ host, owner }) => {
    const resource = { dispose() { disposals++; } };
    owner.reserve()(resource);
    return product(host, resource);
  });
  const published = await x.host.construct(signal => { hostSignal = signal; return x.run(signal); },
    out => out.status === 'succeeded' ? out.roots.app : undefined);
  assert.equal(published.status, 'published');
  let sibling, reentrant;
  const siblingRun = published.root.run;
  // Use an accepted operation to hold the close flight while abort reenters.
  const gate = deferred();
  const pending = x.host.operate(() => gate.promise);
  hostSignal.addEventListener('abort', () => {
    try { siblingRun(); } catch (error) { sibling = error; }
    reentrant = x.host.close();
  });
  const close = x.host.close();
  assert.strictEqual(reentrant, close);
  assert.match(String(sibling), /host-revoked/);
  assert.deepEqual(x.host.effects, []);
  gate.resolve(); await pending;
  assert.equal((await close).status, 'closed');
  assert.equal(disposals, 1);
});

// Regression: a failed disposer is retried or overwrites the primary factory failure.
test('cleanup failure retains cause, debt and original construction failure', async () => {
  const primary = Error('primary'), cleanup = Error('cleanup');
  let calls = 0, resource;
  const x = await fixture(async ({ owner }) => {
    resource = { dispose() { calls++; throw cleanup; } };
    owner.reserve()(resource);
    throw primary;
  });
  const construction = await x.start();
  assert.strictEqual(construction.raw.cause, primary);
  const close = x.host.close();
  assert.strictEqual(x.host.close(), close);
  const terminal = await close;
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.cause, cleanup);
  assert.strictEqual(terminal.debt, resource);
  assert.strictEqual(x.host.status().debt, resource);
  assert.equal(calls, 1);
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retiring', calls: 0, custody: 1 });
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
  const clock = { now: () => now, schedule: (_delay, wake) => { const id = ++next; scheduled.set(id, () => { scheduled.delete(id); wake(); }); return id; },
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

// Regression: mutating enrollment options redirects listener removal and strands the original signal listener.
test('observer snapshots its signal and deadline and removes the enrolled listener', async () => {
  const gate = deferred();
  const scheduled = new Map(); let next = 0;
  const clock = { now: () => 0, schedule: (delay, wake) => { const id = ++next; scheduled.set(id, { delay, wake }); return id; },
    cancel: id => { scheduled.delete(id); } };
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() {} });
    return product(host);
  }, { clock });
  assert.equal((await x.start()).status, 'published');
  const pending = x.host.operate(() => gate.promise);
  const close = x.host.close();
  const original = new AbortController(), swapped = new AbortController();
  let added = 0, removed = 0;
  const add = original.signal.addEventListener.bind(original.signal);
  const remove = original.signal.removeEventListener.bind(original.signal);
  original.signal.addEventListener = (...args) => { added++; return add(...args); };
  original.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
  const options = { signal: original.signal, deadlineAt: 100 };
  const observed = x.host.observeClose(options);
  options.signal = swapped.signal; options.deadlineAt = 1;
  assert.equal([...scheduled.values()][0].delay, 100);
  original.abort();
  assert.deepEqual(await observed, { status: 'pending', reason: 'aborted' });
  assert.equal(added, 1);
  assert.equal(removed, 1);
  assert.equal(scheduled.size, 0);
  assert.equal(x.host.status().observers, 0);
  gate.resolve(); await pending; await close;
});

// Regression: Node clamps an oversized timeout to 1 ms, or an early timer wake falsely expires a deadline.
test('large finite observer deadline is chunked and rechecked', async () => {
  const gate = deferred(), scheduled = new Map();
  let now = 0, next = 0;
  const clock = { now: () => now, schedule: (delay, wake) => { const id = ++next; scheduled.set(id, { delay, wake: () => { scheduled.delete(id); wake(); } }); return id; },
    cancel: id => { scheduled.delete(id); } };
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() {} }); return product(host);
  }, { clock });
  assert.equal((await x.start()).status, 'published');
  const pending = x.host.operate(() => gate.promise);
  const close = x.host.close();
  const observed = x.host.observeClose({ deadlineAt: 2 ** 31 + 100 });
  let settled = false;
  observed.then(() => { settled = true; });
  assert.equal([...scheduled.values()][0].delay, 2 ** 31 - 1);
  [...scheduled.values()][0].wake();
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal([...scheduled.values()][0].delay, 2 ** 31 - 1);
  now = 2 ** 31 - 1;
  [...scheduled.values()][0].wake();
  assert.equal([...scheduled.values()][0].delay, 101);
  gate.resolve(); await pending;
  assert.equal((await close).status, 'closed');
  assert.deepEqual(await observed, { status: 'closed' });
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
  const clock = { now: () => now, schedule: (_delay, wake) => { const id = ++next; scheduled.set(id, () => { scheduled.delete(id); wake(); }); return id; },
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
  const terminalReceipt = await x.host.observeClose({ deadlineAt: -1 });
  const laterReceipt = await x.host.observeClose();
  assert.deepEqual(terminalReceipt, { status: 'cleanup-incomplete' });
  assert.deepEqual(laterReceipt, { status: 'cleanup-incomplete' });
  assert.notStrictEqual(terminalReceipt, terminal);
  assert.notStrictEqual(laterReceipt, terminalReceipt);
  assert.equal(Object.isFrozen(terminalReceipt), true);
  assert.equal(Object.isFrozen(laterReceipt), true);
  assert.equal('cause' in terminalReceipt, false);
  assert.equal('debt' in terminalReceipt, false);
  assert.strictEqual(x.host.close(), close);
  assert.strictEqual(x.host.status().debt, terminal.debt);
});

// Regression: an expired observer overrules a stored terminal, or a pre-aborted signal loses to a deadline.
test('close-before-construct guard and observer same-turn priority', async () => {
  const timer = new Map(); let next = 0;
  const clock = { now: () => 10, schedule: (_delay, wake) => { const id = ++next; timer.set(id, wake); return id; },
    cancel: id => { timer.delete(id); } };
  const x = await fixture(undefined, { clock });
  const rawClose = x.host.close();
  const terminal = await rawClose;
  assert.equal(terminal.status, 'closed');
  await assert.rejects(x.start(), /construction-refused/);
  const aborter = new AbortController(); aborter.abort();
  const firstReceipt = await x.host.observeClose({ signal: aborter.signal, deadlineAt: 0 });
  const secondReceipt = await x.host.observeClose();
  assert.deepEqual(firstReceipt, { status: 'closed' });
  assert.deepEqual(secondReceipt, { status: 'closed' });
  assert.notStrictEqual(firstReceipt, secondReceipt);
  assert.notStrictEqual(firstReceipt, terminal);
  assert.equal(Object.isFrozen(firstReceipt), true);
  assert.strictEqual(x.host.close(), rawClose);
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

// Regression: a post-await ordinary effect uses a new lease or bypasses the
// admitted call lease, so it writes after revoke or releases its raw work early.
test('retained call checks its lease at the post-await effect sink', async () => {
  const gate = deferred(), events = [];
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { events.push('dispose'); } });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  const pending = x.host.operate(async () => {
    await gate.promise;
    try { x.host.effect('late'); } finally { events.push('raw-settled'); }
  });
  const refused = assert.rejects(pending, /host-revoked/);
  const request = x.host.requestRetirement();
  assert.deepEqual(request, { kind: 'requested', operationId: 'retirement-1' });
  assert.equal(x.host.status().lifecycle.calls, 1);
  assert.deepEqual(events, []);
  gate.resolve(); await refused;
  assert.deepEqual(await x.host.observeRetirement(request.operationId), { status: 'closed' });
  assert.deepEqual(events, ['raw-settled', 'dispose']);
  assert.deepEqual(x.host.effects, []);
});

// Regression: retirement waits for idle stream custody before invoking its
// private close, or observer timeout releases the owned resource too early.
test('idle stream private close starts before raw drain and owned disposal', async () => {
  const command = deferred(), streamClose = deferred(), events = [];
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { events.push('owner-dispose'); } });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  const stream = x.host.retainStream({ close() { events.push('stream-close-start'); return streamClose.promise; } });
  const raw = x.host.operate(async () => { await command.promise; events.push('command-done'); });
  const request = x.host.requestRetirement();
  assert.deepEqual(events, ['stream-close-start']);
  assert.equal(x.host.status().lifecycle.custody, 2);
  assert.throws(() => stream.run(() => undefined), /host-revoked/);
  assert.deepEqual(await x.host.observeRetirement(request.operationId, { deadlineAt: 0 }),
    { status: 'pending', reason: 'deadline' });
  assert.deepEqual(events, ['stream-close-start']);
  command.resolve(); await raw;
  assert.equal(x.host.status().lifecycle.custody, 2);
  streamClose.resolve();
  assert.deepEqual(await x.host.observeRetirement(request.operationId), { status: 'closed' });
  assert.deepEqual(events, ['stream-close-start', 'command-done', 'owner-dispose']);
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retired', calls: 0, custody: 0 });
});

// Regression: a callback synchronously requests its own retirement and then
// waits on the raw flight it holds, or returns an early released receipt.
test('self-retirement returns requested and self-observe cannot join', async () => {
  const events = [];
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { events.push('dispose'); } });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  let request;
  const raw = x.host.operate(async () => {
    request = x.host.requestRetirement();
    const inside = await x.host.observeRetirement(request.operationId);
    events.push(inside.status);
    assert.equal(inside.status, 'self-wait');
  });
  assert.deepEqual(request, { kind: 'requested', operationId: 'retirement-1' });
  assert.deepEqual(x.host.readRetirement(request.operationId), { status: 'pending' });
  await raw;
  assert.deepEqual(await x.host.observeRetirement(request.operationId), { status: 'closed' });
  assert.deepEqual(events, ['self-wait', 'dispose']);
});

// Regression: a synchronous stream cleanup callback can observe or start a
// second retirement flight and accidentally wait on itself.
test('stream cleanup sees one published flight and self-wait receipt', async () => {
  let reentered, seen;
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() {} });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  x.host.retainStream({ close() {
    reentered = x.host.close();
    seen = x.host.observeRetirement('retirement-1');
  } });
  const raw = x.host.close();
  assert.strictEqual(reentered, raw);
  assert.deepEqual(await seen, { status: 'self-wait' });
  assert.equal((await raw).status, 'closed');
});

// Regression: stream cleanup failure is treated as a successful close or
// allows the dependent owned resource disposer to run.
test('stream close failure retains custody and blocks dependent disposal', async () => {
  const events = [], failure = Error('stream-failure');
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { events.push('owner-dispose'); } });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  const failed = { close() { events.push('failed-close'); throw failure; } };
  x.host.retainStream(failed);
  x.host.retainStream({ close() { events.push('sibling-close'); } });
  const terminal = await x.host.close();
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.debt, failed);
  assert.deepEqual(events, ['failed-close', 'sibling-close']);
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retiring', calls: 0, custody: 2 });
});

// Regression: closing a retained consumer disposes a borrowed provider or
// repeats disposal for the two capability views of one owned resource.
test('borrowed provider survives consumer close while shared owner disposes once', async () => {
  let borrowedDisposals = 0, ownedDisposals = 0, consumerCloses = 0;
  const borrowed = { dispose() { borrowedDisposals++; } };
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { ownedDisposals++; } });
    return product(host);
  });
  const published = await x.start();
  assert.equal(published.status, 'published');
  assert.equal(published.root.sharedResource(), true);
  x.host.retainStream({ close() { consumerCloses++; void borrowed; } });
  assert.equal((await x.host.close()).status, 'closed');
  assert.equal(consumerCloses, 1);
  assert.equal(ownedDisposals, 1);
  assert.equal(borrowedDisposals, 0);
});

// Regression: Promise.resolve or a failed observer silently converts still
// running raw command work into a settled ticket and disposes its owner.
test('unobservable native command promise keeps its raw lease and cleanup debt', async () => {
  const failure = Error('species-refused');
  let resolveRaw, disposals = 0;
  const raw = new Promise(resolve => { resolveRaw = resolve; });
  Object.defineProperty(raw, 'constructor', { value: {
    get [Symbol.species]() { throw failure; },
  } });
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { disposals++; } });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  assert.throws(() => x.host.operate(() => raw), error =>
    String(error).includes('operation-observer-refused') && error.cause === failure);
  x.host.requestRetirement();
  resolveRaw('late');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(disposals, 0);
  assert.deepEqual(x.host.status().lifecycle, { phase: 'retiring', calls: 1, custody: 1 });
  assert.deepEqual(await x.host.observeRetirement('retirement-1', { deadlineAt: 0 }),
    { status: 'pending', reason: 'deadline' });
});

// Regression: a mutable `.then` reports success for a still-running physical
// close, releasing stream custody and the owner before the raw Promise settles.
test('stream close observes native raw settlement despite a replaced then', async () => {
  const rawClose = deferred();
  let fakeThenCalls = 0, disposals = 0;
  Object.defineProperty(rawClose.promise, 'then', { value: resolve => {
    fakeThenCalls++;
    resolve();
  } });
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { disposals++; } });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  x.host.retainStream({ close() { return rawClose.promise; } });
  const retirement = x.host.close();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(fakeThenCalls, 0);
  assert.equal(disposals, 0);
  assert.equal(x.host.status().lifecycle.custody, 2);
  assert.deepEqual(x.host.readRetirement('retirement-1'), { status: 'pending' });
  rawClose.resolve();
  assert.equal((await retirement).status, 'closed');
  assert.equal(disposals, 1);
});

// Regression: assimilation of a foreign thenable outside the admitted call
// context can make its self-observer join the raw retirement flight.
test('foreign command thenable is rejected before its then executes', async () => {
  let thenCalls = 0;
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() {} });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  const foreign = { then(resolve) {
    thenCalls++;
    const request = x.host.requestRetirement();
    void x.host.observeRetirement(request.operationId).then(resolve);
  } };
  await assert.rejects(x.host.operate(() => foreign), /unsupported-operation-result/);
  assert.equal(thenCalls, 0);
  assert.equal(x.host.status().lifecycle.calls, 0);
  assert.equal((await x.host.close()).status, 'closed');
});

// Regression: arbitrary properties on a user Error cannot redirect cleanup
// debt or throw out of the retained retirement driver.
test('owned disposer error with throwing stream getter preserves original debt', async () => {
  const failure = Error('owned-dispose-failure');
  Object.defineProperty(failure, 'stream', { get() { throw Error('untrusted-getter'); } });
  const owned = { dispose() { throw failure; } };
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()(owned);
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  const terminal = await x.host.close();
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.cause, failure);
  assert.strictEqual(terminal.debt, owned);
  assert.deepEqual(x.host.readRetirement('retirement-1'), { status: 'cleanup-incomplete' });
});

// Regression: a detached callback inherits ALS but no longer participates in
// completed cleanup, so it must see the terminal receipt rather than self-wait.
test('detached cleanup continuation observes terminal receipt', async () => {
  const observed = deferred();
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() {} });
    return product(host);
  });
  assert.equal((await x.start()).status, 'published');
  x.host.retainStream({ close() {
    setImmediate(async () => observed.resolve(await x.host.observeRetirement('retirement-1')));
  } });
  assert.equal((await x.host.close()).status, 'closed');
  assert.deepEqual(await observed.promise, { status: 'closed' });
});
