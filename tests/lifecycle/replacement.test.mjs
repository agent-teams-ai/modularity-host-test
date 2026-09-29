import { after, afterEach, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReplacementSlot } from '../../src/host/replacement.ts';
import { TestRecoveryOwner } from '../../src/host/recovery.ts';
import { loaders } from '../../src/admission/run.ts';
import { candidates, grants } from '../../src/inventory/trusted.ts';
import { deferred } from './fixture.mjs';

const markerRoot = mkdtempSync(join(tmpdir(), 'test-host-replacement-'));
process.env.TEST_MARKERS = join(markerRoot, 'markers');
after(() => { if (process.env.TEST_PRESERVE_MARKERS !== '1') rmSync(markerRoot, { recursive: true, force: true }); });
const usedSlots = new Set();
afterEach(async () => {
  for (const slot of usedSlots) {
    const result = await slot.closeCurrent();
    assert.ok(result.status === 'closed' || result.status === 'empty');
  }
  usedSlots.clear();
});
const events = () => { try { return readFileSync(process.env.TEST_MARKERS, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } };

function request(provider) {
  return { selections: [
    { moduleId: 'test/provider', implementationId: provider, ownerLabel: 'fixture/provider', target: 'test-host/local', injections: [] },
    { moduleId: 'test/writer', implementationId: 'test/writer/main', ownerLabel: 'fixture/writer', target: 'test-host/local', injections: [
      { slot: 'resource', providerImplementationId: provider, capabilityId: 'test/resource/write', token: 'test/resource/write/v1' }] },
    { moduleId: 'test/reader', implementationId: 'test/reader/main', ownerLabel: 'fixture/reader', target: 'test-host/local', injections: [
      { slot: 'resource', providerImplementationId: provider, capabilityId: 'test/resource/read', token: 'test/resource/read/v1' }] },
    { moduleId: 'test/root/main', implementationId: 'test/root/main', ownerLabel: 'fixture/root', target: 'test-host/local', injections: [
      { slot: 'actions', providerImplementationId: 'test/writer/main', capabilityId: 'test/action', token: 'test/action/v1' },
      { slot: 'actions', providerImplementationId: 'test/reader/main', capabilityId: 'test/action', token: 'test/action/v1' }] },
  ] };
}
function harness() {
  const counts = { loaders: { a: 0, b: 0 }, factories: { a: 0, b: 0 }, acquire: { a: 0, b: 0 },
    stops: { a: 0, b: 0 }, owners: 0, maxOwners: 0, effects: [] };
  const artifact = { a: Object.freeze({ id: 'test/a', sha256: 'a'.repeat(64) }),
    b: Object.freeze({ id: 'test/b', sha256: 'b'.repeat(64) }) };
  const inputs = { a: request('test/provider/a'), b: request('test/provider/b') };
  const rows = {};
  const stopHooks = { a: undefined, b: undefined };
  const readHooks = { a: undefined, b: undefined };
  let currentGrants = grants;
  function provider(label) {
    return { async create(_deps, owner) {
      counts.factories[label]++;
      const register = owner.reserve();
      const resourceIdentity = Symbol(`${label}-resource`);
      let disposed = false;
      const resource = {
        resourceIdentity,
        read() { return owner.read(() => { if (disposed) throw Error('disposed'); return `${label}-value`; }); },
        write(value) { owner.effect(value); if (disposed) throw Error('disposed'); counts.effects.push(`${label}:${value}`); return `${label}:${value}`; },
        dispose() { if (disposed) throw Error('double-dispose'); disposed = true; counts.owners--; },
      };
      counts.owners++;
      counts.maxOwners = Math.max(counts.maxOwners, counts.owners);
      counts.acquire[label]++;
      register(resource);
      return { instance: { resourceId: `${label}-resource` }, capabilities: {
        'test/resource/read': { resourceId: `${label}-resource`, resourceIdentity, read: () => resource.read() },
        'test/resource/write': { resourceId: `${label}-resource`, resourceIdentity, write: value => resource.write(value) },
      } };
    } };
  }
  for (const label of ['a', 'b']) {
    const implementationId = `test/provider/${label}`;
    const load = async () => { counts.loaders[label]++; return provider(label); };
    rows[label] = Object.freeze([Object.freeze({ implementationId, load }),
      ...loaders.filter(row => ['test/writer/main', 'test/reader/main', 'test/root/main'].includes(row.implementationId))]);
  }
  const source = {
    subject(id) { return id === 'a' || id === 'b' ? Object.freeze({ candidateId: id, input: inputs[id], artifact: artifact[id], rows: rows[id] }) : undefined; },
    authorities() { return { inventory: candidates, grants: currentGrants }; },
    async stop(id, resource, attempt) { counts.stops[id]++; if (stopHooks[id]) return stopHooks[id](resource, attempt); resource?.dispose(); },
    async readback(id, attempt) { return readHooks[id]?.(attempt) ?? 'unknown'; },
  };
  const slot = new ReplacementSlot(source);
  usedSlots.add(slot);
  const start = async id => {
    const request = slot.requestReplacement(id);
    assert.equal(request.status, 'requested');
    return { request, receipt: await slot.observeReplacement(request.operationId) };
  };
  return { slot, source, counts, artifact, inputs, rows, stopHooks, readHooks, start,
    setGrants(value) { currentGrants = value; } };
}

// Regression: candidate import starts before the old physical owner is confirmed stopped.
test('replacement keeps candidate execution at zero until physical old stop and revokes old route', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const old = h.slot.currentRoot();
  assert.deepEqual(old.run(), ['a:write', 'a-value']);
  const gate = deferred(), entered = deferred();
  h.stopHooks.a = async resource => { entered.resolve(); await gate.promise; resource.dispose(); };
  const requested = h.slot.requestReplacement('b');
  assert.equal(requested.status, 'requested');
  assert.deepEqual(h.slot.requestReplacement('b'), { status: 'busy', operationId: requested.operationId });
  await entered.promise;
  assert.equal(h.counts.owners, 1);
  assert.equal(h.counts.loaders.b, 0);
  assert.equal(h.counts.factories.b, 0);
  assert.equal(h.counts.acquire.b, 0);
  assert.equal(h.slot.currentRoot(), undefined);
  assert.throws(() => old.run(), /host-revoked/);
  gate.resolve();
  assert.equal((await h.slot.observeReplacement(requested.operationId)).status, 'activated');
  assert.deepEqual(h.slot.currentRoot().run(), ['b:write', 'b-value']);
  assert.equal(h.counts.maxOwners, 1);
  assert.equal(h.counts.stops.a, 1);
  assert.equal(h.counts.loaders.b, 1);
  assert.equal(h.counts.factories.b, 1);
  assert.equal(h.counts.acquire.b, 1);
  assert.equal(events().includes('test/provider/b:loader'), true);
});

// Regression: an invalid last selected node leaks a H13 reservation on each refusal.
test('denied last node never loads and 65 early refusals do not exhaust capacity', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  h.inputs.b.selections[3].target = 'forged-target';
  for (let i = 0; i < 65; i++) {
    const x = await h.start('b');
    assert.equal(x.receipt.status, 'kept-old');
  }
  assert.equal(h.slot.currentCandidateId(), 'a');
  assert.equal(h.counts.loaders.b, 0);
  assert.equal(h.counts.factories.b, 0);
  assert.equal(h.counts.acquire.b, 0);
  assert.equal(h.counts.owners, 1);
});

// Regression: raw stop rejection or an observer deadline is mistaken for physical release.
test('unknown stop leaves candidate counters zero until trusted readback proves release', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  let resource;
  const entered = deferred();
  h.stopHooks.a = current => { resource = current; entered.resolve(); throw Error('uncertain'); };
  let answer = 'unknown';
  h.readHooks.a = () => { if (answer === 'released') resource.dispose(); return answer; };
  const request = h.slot.requestReplacement('b');
  await entered.promise;
  const attempt = h.slot.stopAttempt(request.operationId, 'old');
  assert.equal(typeof attempt, 'string');
  let stopRead;
  for (let turn = 0; turn < 20; turn++) {
    stopRead = await h.slot.reconcileStop(request.operationId, 'old', attempt);
    if (stopRead.status !== 'pending') break;
  }
  assert.equal(stopRead.status, 'unknown');
  assert.equal((await h.slot.observeReplacement(request.operationId, { deadlineAt: 0 })).reason, 'deadline');
  assert.equal(h.slot.readReplacement(request.operationId).status, 'pending');
  assert.equal(h.counts.loaders.b, 0);
  assert.equal(h.counts.acquire.b, 0);
  answer = 'released';
  assert.equal((await h.slot.reconcileStop(request.operationId, 'old', attempt)).status, 'released');
  assert.equal((await h.slot.observeReplacement(request.operationId)).status, 'activated');
  assert.equal(h.counts.maxOwners, 1);
  assert.equal((await h.slot.reconcileStop(request.operationId, 'old', attempt)).status, 'stale-attempt');
});

// Regression: a stale pre-stop grant, artifact or loader mapping starts executable code.
test('post-stop recheck refuses changed grant, artifact and loader before first candidate load', async () => {
  for (const change of ['grant', 'artifact', 'loader']) {
    const h = harness();
    assert.equal((await h.start('a')).receipt.status, 'activated');
    const gate = deferred(), entered = deferred();
    h.stopHooks.a = async resource => { entered.resolve(); await gate.promise; resource.dispose(); };
    const request = h.slot.requestReplacement('b');
    await entered.promise;
    if (change === 'grant') h.setGrants(grants.map(row => row.subject === 'fixture/reader'
      ? { ...row, receives: [] } : row));
    if (change === 'artifact') h.artifact.b = Object.freeze({ id: 'test/b', sha256: 'changed' });
    if (change === 'loader') h.rows.b = Object.freeze(h.rows.b.map(row => row.implementationId === 'test/provider/b'
      ? Object.freeze({ ...row, load: async () => { throw Error('must-not-load'); } }) : row));
    gate.resolve();
    const receipt = await h.slot.observeReplacement(request.operationId);
    assert.notEqual(receipt.status, 'activated', change);
    assert.equal(h.counts.loaders.b, 0, change);
    assert.equal(h.counts.factories.b, 0, change);
    assert.equal(h.counts.acquire.b, 0, change);
    assert.ok(h.counts.maxOwners <= 1, change);
  }
});

// Regression: permissions checked only once before awaiting the first loader.
test('revoking grants during first candidate loader blocks its factory and every following loader', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const entered = deferred(), gate = deferred();
  const original = h.rows.b[0];
  h.rows.b = Object.freeze([Object.freeze({ ...original, load: async () => { h.counts.loaders.b++; entered.resolve(); await gate.promise; return { async create() { h.counts.factories.b++; throw Error('must-not-run'); } }; } }), ...h.rows.b.slice(1)]);
  const beforeReaders = events().filter(item => item === 'test/reader/main:loader').length;
  const request = h.slot.requestReplacement('b');
  await entered.promise;
  h.setGrants(grants.map(row => row.subject === 'fixture/reader' ? { ...row, receives: [] } : row));
  gate.resolve();
  const receipt = await h.slot.observeReplacement(request.operationId);
  assert.equal(receipt.status, 'empty');
  assert.equal(h.counts.factories.b, 0);
  assert.equal(events().filter(item => item === 'test/reader/main:loader').length, beforeReaders); // no next loader
  assert.equal(h.counts.maxOwners, 1);
});

// Regression: failed candidate reuses revoked old generation or overlaps physical owners on rollback.
test('failed candidate cleans physically before fresh prior artifact rollback', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const old = h.slot.currentRoot();
  const base = h.rows.b[0];
  h.rows.b = Object.freeze([Object.freeze({ ...base, load: async () => ({ async create(_deps, owner) {
    h.counts.factories.b++;
    const register = owner.reserve();
    h.counts.owners++; h.counts.acquire.b++;
    h.counts.maxOwners = Math.max(h.counts.maxOwners, h.counts.owners);
    register({ dispose() { h.counts.owners--; } });
    throw Error('candidate-failed');
  } }) }), ...h.rows.b.slice(1)]);
  const receipt = (await h.start('b')).receipt;
  assert.equal(receipt.status, 'rolled-back');
  assert.equal(h.slot.currentCandidateId(), 'a');
  assert.throws(() => old.run(), /host-revoked/);
  assert.deepEqual(h.slot.currentRoot().run(), ['a:write', 'a-value']);
  assert.equal(h.counts.maxOwners, 1);
  assert.equal(h.counts.owners, 1);
  assert.equal(h.counts.stops.a, 1);
  assert.equal(h.counts.stops.b, 1);
});

// Regression: stale operation IDs report release after 256 bounded receipts are evicted.
test('replacement receipts are bounded and unknown IDs never imply release', async () => {
  const h = harness();
  for (let i = 0; i < 257; i++) {
    const x = await h.start('missing');
    assert.equal(x.receipt.status, 'empty');
    if (i === 0) h.first = x.request.operationId;
  }
  assert.equal(h.slot.readReplacement(h.first).status, 'unknown-or-expired');
  assert.equal(h.slot.readReplacement('replacement-absent').status, 'unknown-or-expired');
  assert.equal(h.slot.currentRoot(), undefined);
});

// Regression: a stop callback can await its own replacement flight and deadlock the slot.
test('nested stop callback observes self-wait without enrolling a waiter', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  let operationId, seen;
  h.stopHooks.a = resource => { seen = h.slot.observeReplacement(operationId); resource.dispose(); };
  const request = h.slot.requestReplacement('b');
  operationId = request.operationId;
  assert.equal((await h.slot.observeReplacement(operationId)).status, 'activated');
  assert.equal((await seen).status, 'self-wait');
});

// A typed H13 reservation flows into real Core/Assembly preparation without an unsafe cast.
test('typed H13 reservation supports the selected graph preparation', async () => {
  const h = harness();
  const owner = new TestRecoveryOwner();
  const reserved = owner.reserve(undefined, { canActivate: () => true });
  const { prepareAdmission } = await import('../../src/admission/run.ts');
  const prepared = await prepareAdmission(h.inputs.a, h.rows.a, undefined, h.source.authorities(), { owner: reserved.host });
  assert.equal(prepared.ok, true);
  assert.equal((await owner.close(reserved.operationId)).status, 'closed');
});

// Regression: top-level ESM evaluation captures an exclusive resource while old stop is pending.
test('real candidate ESM evaluation waits behind the physical stop barrier', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const actual = loaders.find(row => row.implementationId === 'test/provider/b');
  h.rows.b = Object.freeze([Object.freeze({ implementationId: actual.implementationId,
    load: () => { h.counts.loaders.b++; return actual.load(); } }), ...h.rows.b.slice(1)]);
  const gate = deferred(), entered = deferred();
  h.stopHooks.a = async resource => { entered.resolve(); await gate.promise; resource.dispose(); };
  const before = events().filter(item => item === 'b:evaluate').length;
  const x = h.slot.requestReplacement('b');
  await entered.promise;
  assert.equal(h.counts.loaders.b, 0);
  assert.equal(events().filter(item => item === 'b:evaluate').length, before);
  gate.resolve();
  assert.equal((await h.slot.observeReplacement(x.operationId)).status, 'activated');
  assert.equal(h.counts.loaders.b, 1);
  assert.equal(events().filter(item => item === 'b:evaluate').length, before + 1);
});

// Regression: uncertain candidate cleanup starts rollback while its physical owner still exists.
test('unknown candidate cleanup blocks rollback until trusted physical release', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const base = h.rows.b[0];
  h.rows.b = Object.freeze([Object.freeze({ ...base, load: async () => ({ async create(_deps, owner) {
    const register = owner.reserve();
    h.counts.owners++; h.counts.acquire.b++;
    h.counts.maxOwners = Math.max(h.counts.maxOwners, h.counts.owners);
    register({ dispose() { h.counts.owners--; } });
    throw Error('candidate-failed');
  } }) }), ...h.rows.b.slice(1)]);
  let resource;
  const stopEntered = deferred();
  h.stopHooks.b = current => { resource = current; stopEntered.resolve(); throw Error('uncertain'); };
  let release = false;
  h.readHooks.b = () => { if (release) resource.dispose(); return release ? 'released' : 'unknown'; };
  const x = h.slot.requestReplacement('b');
  await stopEntered.promise;
  const attempt = h.slot.stopAttempt(x.operationId, 'candidate');
  assert.equal(typeof attempt, 'string');
  let stopRead;
  for (let turn = 0; turn < 20; turn++) {
    stopRead = await h.slot.reconcileStop(x.operationId, 'candidate', attempt);
    if (stopRead.status !== 'pending') break;
  }
  assert.equal(stopRead.status, 'unknown');
  assert.equal((await h.slot.observeReplacement(x.operationId, { deadlineAt: 0 })).reason, 'deadline');
  assert.equal(h.slot.currentRoot(), undefined);
  assert.equal(h.counts.owners, 1);
  assert.equal(h.counts.loaders.a, 1); // rollback has not started
  release = true;
  assert.equal((await h.slot.reconcileStop(x.operationId, 'candidate', attempt)).status, 'released');
  assert.equal((await h.slot.observeReplacement(x.operationId)).status, 'rolled-back');
  assert.equal(h.counts.loaders.a, 2);
  assert.equal(h.counts.maxOwners, 1);
});

// Regression: replacement consumes the last H13 slot before checking capacity and retires a healthy old route.
test('H13 capacity refusal leaves the current route and physical owner intact', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const owner = h.slot.recoveryOwner();
  const held = Array.from({ length: 63 }, () => owner.reserve());
  assert.deepEqual(h.slot.requestReplacement('b'), { status: 'capacity-refused' });
  assert.equal(h.slot.currentCandidateId(), 'a');
  assert.deepEqual(h.slot.currentRoot().run(), ['a:write', 'a-value']);
  assert.equal(h.counts.stops.a, 0);
  assert.equal(h.counts.loaders.b, 0);
  await Promise.all(held.map(item => owner.close(item.operationId)));
});

// Regression: terminal completion rewrites a prior timeout receipt or the next observer misses completion.
test('replacement observer deadline is separate from raw operation completion', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const entered = deferred(), gate = deferred();
  h.stopHooks.a = async resource => { entered.resolve(); await gate.promise; resource.dispose(); };
  const x = h.slot.requestReplacement('b');
  await entered.promise;
  const timed = await h.slot.observeReplacement(x.operationId, { deadlineAt: 0 });
  assert.deepEqual(timed, { status: 'pending', operationId: x.operationId, reason: 'deadline' });
  const waiting = h.slot.observeReplacement(x.operationId);
  gate.resolve();
  assert.equal((await waiting).status, 'activated');
  assert.equal(timed.status, 'pending');
  assert.equal(h.slot.readReplacement(x.operationId).status, 'activated');
});

// Regression: old cache eviction deletes the newly published value under the same exact key.
test('same-artifact replacement retains a new inert cache blueprint', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const first = h.slot.currentCache();
  assert.equal(typeof first.key, 'string');
  assert.equal(Object.isFrozen(first), true);
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const second = h.slot.currentCache();
  assert.equal(second.key, first.key);
  assert.notStrictEqual(second, first);
  assert.equal(h.counts.maxOwners, 1);
});

// Regression: fixture shutdown clears the route before old physical stop but allows a new owner.
test('pending closeCurrent serializes replacement until old physical release', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const entered = deferred(), gate = deferred();
  h.stopHooks.a = async resource => { entered.resolve(); await gate.promise; resource.dispose(); };
  const closing = h.slot.closeCurrent();
  await entered.promise;
  try {
    const request = h.slot.requestReplacement('b');
    assert.equal(request.status, 'busy');
    assert.equal(h.counts.loaders.b, 0);
    assert.equal(h.counts.factories.b, 0);
    assert.equal(h.counts.acquire.b, 0);
    assert.equal(h.counts.owners, 1);
  } finally { gate.resolve(); }
  assert.equal((await closing).status, 'closed');
  assert.equal((await h.start('b')).receipt.status, 'activated');
  assert.equal(h.counts.maxOwners, 1);
});

// Regression: captured subject object is mutated in place while physical stop is pending.
test('in-place trusted subject artifact replacement is refused before candidate import', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const original = h.source.subject.bind(h.source);
  const shared = { ...original('b') };
  h.source.subject = id => id === 'b' ? shared : original(id);
  const entered = deferred(), gate = deferred();
  h.stopHooks.a = async resource => { entered.resolve(); await gate.promise; resource.dispose(); };
  const x = h.slot.requestReplacement('b');
  await entered.promise;
  shared.artifact = Object.freeze({ id: 'test/b', sha256: 'c'.repeat(64) });
  gate.resolve();
  const receipt = await h.slot.observeReplacement(x.operationId);
  assert.notEqual(receipt.status, 'activated');
  assert.equal(h.counts.loaders.b, 0);
  assert.equal(h.counts.factories.b, 0);
  assert.equal(h.counts.acquire.b, 0);
  assert.ok(h.counts.maxOwners <= 1);
});

// Regression: a detached callback delivers a physical resource after the factory ticket settled.
test('detached late registration is refused after construction settlement', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  let register;
  const base = h.rows.b[0];
  h.rows.b = Object.freeze([Object.freeze({ ...base, load: async () => ({ async create(_deps, owner) {
    register = owner.reserve();
    const resourceIdentity = Symbol('unowned-late');
    return { instance: { resourceId: 'late' }, capabilities: {
      'test/resource/read': { resourceId: 'late', resourceIdentity, read: () => owner.read(() => 'late') },
      'test/resource/write': { resourceId: 'late', resourceIdentity, write: value => { owner.effect(value); return value; } },
    } };
  } }) }), ...h.rows.b.slice(1)]);
  assert.equal((await h.start('b')).receipt.status, 'activated');
  assert.equal(typeof register, 'function');
  let disposed = 0;
  const resource = { dispose() { disposed++; } };
  try { assert.throws(() => register(resource), /registration-refused/); }
  finally { resource.dispose(); }
  assert.equal(disposed, 1);
  assert.equal(h.counts.maxOwners, 1);
});

async function reconcileSettled(slot, operationId, role, attemptId) {
  for (let turn = 0; turn < 20; turn++) {
    const read = await slot.reconcileStop(operationId, role, attemptId);
    if (read.status !== 'pending') return read;
  }
  throw Error('stop-never-settled');
}

// Regression: externally initiated readback and retry callbacks can await their own replacement flight.
test('external old readback and retry callbacks see replacement self-wait', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  let operationId, resource, readSeen, retrySeen;
  const entered = deferred();
  h.stopHooks.a = async current => {
    resource = current;
    if (h.counts.stops.a === 1) { entered.resolve(); throw Error('first-stop-uncertain'); }
    retrySeen = await h.slot.observeReplacement(operationId, { deadlineAt: 0 });
    resource.dispose();
  };
  h.readHooks.a = async () => {
    readSeen = await h.slot.observeReplacement(operationId, { deadlineAt: 0 });
    return 'retry-safe';
  };
  const x = h.slot.requestReplacement('b'); operationId = x.operationId;
  await entered.promise;
  const attempt = h.slot.stopAttempt(operationId, 'old');
  assert.equal((await reconcileSettled(h.slot, operationId, 'old', attempt)).status, 'retry-safe');
  assert.equal(readSeen.status, 'self-wait');
  assert.equal((await h.slot.retryStop(operationId, 'old', attempt)).status, 'released');
  assert.equal(retrySeen.status, 'self-wait');
  assert.equal((await h.slot.observeReplacement(operationId)).status, 'activated');
});

// Regression: candidate readback called by a detached controller can enroll on its own raw operation.
test('external candidate readback callback sees replacement self-wait', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const base = h.rows.b[0];
  h.rows.b = Object.freeze([Object.freeze({ ...base, load: async () => ({ async create(_deps, owner) {
    const register = owner.reserve();
    h.counts.owners++;
    register({ dispose() { h.counts.owners--; } });
    throw Error('candidate-failed');
  } }) }), ...h.rows.b.slice(1)]);
  let operationId, resource, seen;
  const entered = deferred();
  h.stopHooks.b = current => { resource = current; entered.resolve(); throw Error('uncertain'); };
  h.readHooks.b = async () => {
    seen = await h.slot.observeReplacement(operationId, { deadlineAt: 0 });
    resource.dispose();
    return 'released';
  };
  const x = h.slot.requestReplacement('b'); operationId = x.operationId;
  await entered.promise;
  const attempt = h.slot.stopAttempt(operationId, 'candidate');
  assert.equal((await reconcileSettled(h.slot, operationId, 'candidate', attempt)).status, 'released');
  assert.equal(seen.status, 'self-wait');
  assert.equal((await h.slot.observeReplacement(operationId)).status, 'rolled-back');
});

// Regression: rollback readback loses operation ancestry after its failed stage is cleaned up.
test('external rollback readback callback sees replacement self-wait', async () => {
  const h = harness();
  const baseA = h.rows.a[0], baseB = h.rows.b[0];
  let aCreates = 0;
  h.rows.a = Object.freeze([Object.freeze({ ...baseA, load: async () => {
    if (++aCreates === 1) return baseA.load();
    return { async create(_deps, owner) {
      const register = owner.reserve();
      h.counts.owners++;
      register({ dispose() { h.counts.owners--; } });
      throw Error('rollback-failed');
    } };
  } }), ...h.rows.a.slice(1)]);
  h.rows.b = Object.freeze([Object.freeze({ ...baseB, load: async () => ({ async create(_deps, owner) {
    const register = owner.reserve();
    h.counts.owners++;
    register({ dispose() { h.counts.owners--; } });
    throw Error('candidate-failed');
  } }) }), ...h.rows.b.slice(1)]);
  assert.equal((await h.start('a')).receipt.status, 'activated');
  let operationId, resource, seen;
  const entered = deferred();
  h.stopHooks.a = current => {
    if (h.counts.stops.a === 1) { current.dispose(); return; }
    resource = current; entered.resolve(); throw Error('rollback-stop-uncertain');
  };
  h.readHooks.a = async () => {
    seen = await h.slot.observeReplacement(operationId, { deadlineAt: 0 });
    resource.dispose();
    return 'released';
  };
  const x = h.slot.requestReplacement('b'); operationId = x.operationId;
  await entered.promise;
  const attempt = h.slot.stopAttempt(operationId, 'rollback');
  assert.equal((await reconcileSettled(h.slot, operationId, 'rollback', attempt)).status, 'released');
  assert.equal(seen.status, 'self-wait');
  assert.equal((await h.slot.observeReplacement(operationId)).status, 'empty');
  assert.equal(h.counts.maxOwners, 1);
  assert.equal(h.counts.owners, 0);
});

// Regression: a detached continuation inherits operation ALS after its stop callback has settled.
test('detached observer after settled stop callback is an independent deadline observer', async () => {
  const h = harness();
  assert.equal((await h.start('a')).receipt.status, 'activated');
  const detachedGate = deferred(), loaderGate = deferred(), loaderEntered = deferred();
  const oldLoad = h.rows.b[0];
  h.rows.b = Object.freeze([Object.freeze({ ...oldLoad, load: async () => {
    loaderEntered.resolve();
    await loaderGate.promise;
    return oldLoad.load();
  } }), ...h.rows.b.slice(1)]);
  let operationId, detached;
  h.stopHooks.a = resource => {
    detached = detachedGate.promise.then(() => h.slot.observeReplacement(operationId, { deadlineAt: 0 }));
    resource.dispose();
  };
  const x = h.slot.requestReplacement('b'); operationId = x.operationId;
  await loaderEntered.promise; // stop callback has settled; candidate loader is still pending
  try {
    detachedGate.resolve();
    const observed = await detached;
    assert.deepEqual(observed, { status: 'pending', operationId, reason: 'deadline' });
    assert.equal(h.slot.readReplacement(operationId).status, 'pending');
  } finally { loaderGate.resolve(); await h.slot.observeReplacement(operationId); }
  assert.equal(h.counts.maxOwners, 1);
});
