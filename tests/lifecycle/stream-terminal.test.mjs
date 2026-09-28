import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deferred, fixture } from './fixture.mjs';
process.env.TEST_MARKERS = join(mkdtempSync(join(tmpdir(), 'test-host-stream-')), 'markers');

function product(host) {
  const resourceId = 'shared', resourceIdentity = Symbol('stream-owner');
  return { instance: {}, capabilities: {
    'test/resource/read': { resourceId, resourceIdentity, read: () => host.read(() => 'value') },
    'test/resource/write': { resourceId, resourceIdentity, write: value => { host.effect(value); return value; } },
  } };
}
async function installed(events = []) {
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ dispose() { events.push('dispose'); } });
    return product(host);
  });
  const construction = await x.start();
  assert.equal(construction.status, 'published', String(construction.raw?.cause ?? construction.cause));
  return x;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

// A return acknowledgement cannot discharge an already admitted next call.
test('terminal stream waits for pending next after early return acknowledgement', async () => {
  const events = [], pending = deferred();
  const x = await installed(events);
  const view = x.host.retainTerminalStream({
    next() { events.push('next'); return pending.promise; },
    return() { events.push('return'); return { done: true, value: undefined }; },
    close() { events.push('close'); },
  });
  const next = view.next();
  const rejected = assert.rejects(next, /host-revoked/);
  const returned = view.return();
  assert.deepEqual(events, ['next', 'close', 'return']);
  const retirement = x.host.close();
  await tick();
  assert.deepEqual(events, ['next', 'close', 'return']);
  assert.equal(x.host.status().lifecycle.calls, 1);
  assert.equal(x.host.status().lifecycle.custody, 2);
  pending.resolve({ done: false, value: 'late' });
  await rejected;
  assert.deepEqual(await returned, { done: true, value: undefined });
  assert.equal((await retirement).status, 'closed');
  assert.deepEqual(events, ['next', 'close', 'return', 'dispose']);
});

// Iterator completion ends iteration only. Explicit result keeps its own call and custody.
test('terminal done true still waits for pending explicit result', async () => {
  const events = [], pending = deferred();
  const x = await installed(events);
  const view = x.host.retainTerminalStream({
    next() { events.push('next'); return { done: true, value: undefined }; },
    result() { events.push('result'); return pending.promise; },
    return() { events.push('return'); return { done: true, value: undefined }; },
    close() { events.push('close'); },
  });
  assert.deepEqual(await view.next(), { done: true, value: undefined });
  const result = view.result();
  const rejected = assert.rejects(result, /host-revoked/);
  const close = x.host.close();
  assert.deepEqual(events, ['next', 'result', 'close']);
  pending.resolve('late-result');
  await rejected;
  assert.equal((await close).status, 'closed');
  assert.deepEqual(events, ['next', 'result', 'close', 'dispose']);
});

// result() is an explicit admitted operation, never a prefetch or cached final value.
test('terminal result is never eager or cached', async () => {
  let reads = 0;
  const x = await installed();
  const view = x.host.retainTerminalStream({
    next() { return { done: true, value: undefined }; },
    result() { return ++reads; },
    close() {},
  });
  assert.equal(reads, 0);
  assert.equal((await view.next()).done, true);
  assert.equal(reads, 0);
  assert.equal(await view.result(), 1);
  assert.equal(await view.result(), 2);
  assert.equal((await x.host.close()).status, 'closed');
});

test('terminal public close paths and retirement share one close flight', async () => {
  const events = [], gate = deferred();
  const x = await installed(events);
  const view = x.host.retainTerminalStream({
    next() { return { done: false, value: 1 }; },
    return() { events.push('return'); return { done: true, value: undefined }; },
    close() { events.push('close'); return gate.promise; },
  });
  assert.equal((await view[Symbol.asyncIterator]().next()).value, 1);
  const cancelled = view.cancel();
  const returned = view.return();
  const retirement = x.host.close();
  assert.deepEqual(events, ['close', 'return']);
  gate.resolve();
  await cancelled;
  assert.equal((await returned).done, true);
  assert.equal((await retirement).status, 'closed');
  assert.deepEqual(events, ['close', 'return', 'dispose']);
});

test('terminal post-await effect is revoked while raw next remains retained', async () => {
  const gate = deferred(), events = [];
  const x = await installed(events);
  const view = x.host.retainTerminalStream({
    async next() { await gate.promise; x.host.effect('late'); return { done: false, value: 1 }; },
    return() { return { done: true, value: undefined }; },
    close() { events.push('close'); },
  });
  const pending = view.next();
  const rejected = assert.rejects(pending, /host-revoked/);
  const close = x.host.close();
  assert.equal(x.host.status().lifecycle.calls, 1);
  gate.resolve();
  await rejected;
  assert.equal((await close).status, 'closed');
  assert.deepEqual(x.host.effects, []);
  assert.deepEqual(events, ['close', 'dispose']);
});

test('terminal close failure retains debt while sibling closes', async () => {
  const events = [], failure = Error('failed-close');
  const x = await installed(events);
  const failed = { next() { return { done: true, value: undefined }; }, close() { events.push('failed'); throw failure; } };
  x.host.retainTerminalStream(failed);
  x.host.retainTerminalStream({ next() { return { done: true, value: undefined }; }, close() { events.push('sibling'); } });
  const terminal = await x.host.close();
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.debt, failed);
  assert.deepEqual(events, ['failed', 'sibling']);
  assert.equal(x.host.status().lifecycle.custody, 2);
});

test('terminal and ordinary stream close failures remain separately owned', async () => {
  const events = [], ordinaryCause = Error('ordinary-close'), terminalCause = Error('terminal-close');
  const x = await installed(events);
  const ordinary = { close() { events.push('ordinary'); throw ordinaryCause; } };
  const terminalStream = { next() { return { done: true, value: undefined }; },
    close() { events.push('terminal'); throw terminalCause; } };
  x.host.retainStream(ordinary);
  x.host.retainTerminalStream(terminalStream);
  x.host.retainTerminalStream({ next() { return { done: true, value: undefined }; },
    close() { events.push('sibling'); } });
  const closed = await x.host.close();
  assert.equal(closed.status, 'cleanup-incomplete');
  assert.deepEqual(closed.failures, [
    { debt: ordinary, cause: ordinaryCause }, { debt: terminalStream, cause: terminalCause },
  ]);
  assert.deepEqual(events, ['ordinary', 'terminal', 'sibling']);
  assert.equal(x.host.status().lifecycle.custody, 3);
});

test('terminal observer timeout leaves raw next and later close intact', async () => {
  const gate = deferred(), events = [];
  const x = await installed(events);
  const view = x.host.retainTerminalStream({
    next() { return gate.promise; },
    return() { events.push('return'); return { done: true, value: undefined }; },
    close() { events.push('close'); },
  });
  const next = view.next();
  const rejected = assert.rejects(next, /host-revoked/);
  const request = x.host.requestRetirement();
  assert.deepEqual(await x.host.observeRetirement(request.operationId, { deadlineAt: 0 }),
    { status: 'pending', reason: 'deadline' });
  assert.deepEqual(events, ['close', 'return']);
  gate.resolve({ done: false, value: 'late' });
  await rejected;
  assert.deepEqual(await x.host.observeRetirement(request.operationId), { status: 'closed' });
  assert.deepEqual(events, ['close', 'return', 'dispose']);
});

test('terminal callback getters and foreign thenables fail closed', async () => {
  const x = await installed();
  let getterCalls = 0, thenCalls = 0;
  const bad = { close() {} };
  Object.defineProperty(bad, 'next', { get() { getterCalls++; return () => ({ done: true }); } });
  assert.throws(() => x.host.retainTerminalStream(bad), /unsupported-stream-next/);
  assert.equal(getterCalls, 0);
  const view = x.host.retainTerminalStream({
    next() { return { then() { thenCalls++; } }; },
    result() { return { then() { thenCalls++; } }; },
    close() {},
  });
  await assert.rejects(view.next(), /unsupported-iterator-result/);
  await assert.rejects(view.result(), /unsupported-stream-result/);
  assert.equal(thenCalls, 0);
  const plausible = x.host.retainTerminalStream({
    next() { return { done: true, then() { thenCalls++; } }; }, close() {},
  });
  await assert.rejects(plausible.next(), /unsupported-iterator-result/);
  assert.equal(thenCalls, 0);
  assert.equal((await x.host.close()).status, 'closed');
});

test('terminal native next observer ignores replaced then until raw settlement', async () => {
  const gate = deferred(), events = [];
  let fakeThenCalls = 0;
  Object.defineProperty(gate.promise, 'then', { value: resolve => {
    fakeThenCalls++;
    resolve({ done: true, value: undefined });
  } });
  const x = await installed(events);
  const view = x.host.retainTerminalStream({
    next() { return gate.promise; },
    return() { events.push('return'); return { done: true, value: undefined }; },
    close() { events.push('close'); },
  });
  const pending = view.next();
  const rejected = assert.rejects(pending, /host-revoked/);
  const close = x.host.close();
  await tick();
  assert.equal(fakeThenCalls, 0);
  assert.equal(x.host.status().lifecycle.calls, 1);
  assert.deepEqual(events, ['close', 'return']);
  gate.resolve({ done: false, value: 'late' });
  await rejected;
  assert.equal((await close).status, 'closed');
  assert.deepEqual(events, ['close', 'return', 'dispose']);
});

test('terminal return done false retains custody as failed close debt', async () => {
  const events = [];
  const x = await installed(events);
  const resource = {
    next() { return { done: false, value: 1 }; },
    return() { events.push('return'); return { done: false, value: 2 }; },
    close() { events.push('close'); },
  };
  const view = x.host.retainTerminalStream(resource);
  assert.equal((await view.next()).done, false);
  await assert.rejects(view.cancel(), /unsupported-iterator-result/);
  const terminal = await x.host.close();
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.debt, resource);
  assert.deepEqual(events, ['close', 'return']);
  assert.equal(x.host.status().lifecycle.custody, 2);
});

test('terminal cancel revokes late stream effect before owner retirement', async () => {
  const events = [], gate = deferred();
  const x = await installed(events);
  const view = x.host.retainTerminalStream({
    async next() { await gate.promise; x.host.effect('late'); return { done: false, value: 1 }; },
    return() { events.push('return'); return { done: true, value: undefined }; },
    close() { events.push('close'); },
  });
  const pending = view.next();
  const rejected = assert.rejects(pending, /host-revoked/);
  const cancelled = view.cancel();
  assert.deepEqual(events, ['close', 'return']);
  assert.equal(x.host.status().lifecycle.phase, 'active');
  assert.equal(x.host.status().lifecycle.calls, 1);
  assert.equal(x.host.status().lifecycle.custody, 2);
  gate.resolve();
  await rejected;
  await cancelled;
  assert.deepEqual(x.host.effects, []);
  assert.equal((await x.host.close()).status, 'closed');
  assert.deepEqual(events, ['close', 'return', 'dispose']);
});

test('terminal cancelled parent cannot start a sibling stream effect', async () => {
  const gate = deferred();
  const x = await installed();
  const sibling = x.host.retainTerminalStream({
    next() { x.host.effect('delegated'); return { done: false, value: 1 }; },
    close() {},
  });
  const parent = x.host.retainTerminalStream({
    async next() { await gate.promise; await sibling.next(); return { done: false, value: 2 }; },
    return() { return { done: true, value: undefined }; },
    close() {},
  });
  const pending = parent.next();
  const rejected = assert.rejects(pending, /host-revoked/);
  const cancelled = parent.cancel();
  gate.resolve();
  await rejected;
  await cancelled;
  assert.deepEqual(x.host.effects, []);
  assert.equal((await x.host.close()).status, 'closed');
});

test('terminal in-flight sibling keeps cancelled parent effect fence', async () => {
  const gate = deferred();
  const x = await installed();
  const sibling = x.host.retainTerminalStream({
    async next() { await gate.promise; x.host.effect('delegated-late'); return { done: false, value: 1 }; },
    close() {},
  });
  const parent = x.host.retainTerminalStream({
    next() { return sibling.next(); },
    return() { return { done: true, value: undefined }; },
    close() {},
  });
  const pending = parent.next();
  const rejected = assert.rejects(pending, /host-revoked/);
  const cancelled = parent.cancel();
  gate.resolve();
  await rejected;
  await cancelled;
  assert.deepEqual(x.host.effects, []);
  assert.equal((await x.host.close()).status, 'closed');
});

test('terminal cancel cleanup cannot enter ordinary Host effect', async () => {
  const x = await installed();
  const resource = { next() { return { done: true, value: undefined }; },
    close() { x.host.effect('cleanup-leak'); } };
  const view = x.host.retainTerminalStream(resource);
  await assert.rejects(view.cancel(), /host-revoked/);
  assert.deepEqual(x.host.effects, []);
  const terminal = await x.host.close();
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.debt, resource);
});

test('terminal native return validates mutated thenable ack before bridging', async () => {
  const events = [];
  const x = await installed(events);
  const ack = { done: false, value: 1 };
  const raw = Promise.resolve(ack);
  let thenCalls = 0;
  Object.defineProperty(ack, 'then', { value: resolve => {
    thenCalls++;
    resolve({ done: true, value: undefined });
  } });
  const resource = {
    next() { return { done: false, value: 1 }; },
    return() { events.push('return'); return raw; },
    close() { events.push('close'); },
  };
  const view = x.host.retainTerminalStream(resource);
  assert.equal((await view.next()).done, false);
  await assert.rejects(view.cancel(), /unsupported-iterator-result/);
  assert.equal(thenCalls, 0);
  const terminal = await x.host.close();
  assert.equal(terminal.status, 'cleanup-incomplete');
  assert.strictEqual(terminal.debt, resource);
  assert.deepEqual(events, ['close', 'return']);
});
