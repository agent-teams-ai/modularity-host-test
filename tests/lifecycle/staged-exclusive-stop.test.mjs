import { after, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TestHost } from '../../src/host/lifetime.ts';
import { TestRecoveryOwner } from '../../src/host/recovery.ts';
import { deferred, fixture } from './fixture.mjs';

const markerRoot = mkdtempSync(join(tmpdir(), 'test-host-exclusive-stop-'));
process.env.TEST_MARKERS = join(markerRoot, 'markers');
after(() => {
  if (process.env.TEST_PRESERVE_MARKERS !== '1') rmSync(markerRoot, { recursive: true, force: true });
});

const rootOf = out => out.status === 'succeeded' ? out.roots.app : undefined;

function product(host) {
  const resourceId = 'shared';
  const resourceIdentity = Symbol.for('lifecycle-test-resource');
  return { instance: {}, capabilities: {
    'test/resource/read': { resourceId, resourceIdentity, read: () => host.read(() => 'exclusive') },
    'test/resource/write': { resourceId, resourceIdentity, write: text => { host.effect(text); return text; } },
  } };
}

async function stagedFixture(providerFactory) {
  let allowed = true;
  const host = new TestHost(undefined, { canActivate: () => allowed });
  const x = await fixture(providerFactory, { recovery: { host } });
  return { ...x, revoke: () => { allowed = false; },
    stage: () => host.constructStaged(signal => x.run(signal), rootOf) };
}

async function stopFixture(stop, readback, recoveryOwner) {
  const recovery = recoveryOwner?.reserve();
  const x = await fixture(({ host }) => {
    host.createExclusiveStop({ stop, readback });
    return product(host);
  }, recovery ? { recovery } : {});
  assert.equal((await x.start()).status, 'published');
  return { ...x, recovery };
}

// Regression: a staged receipt leaks the callable root or raw Assembly journal.
test('l2c0 staged construction keeps root and raw private until activation', async () => {
  const x = await stagedFixture();
  const stage = await x.stage();
  assert.equal(stage.status, 'constructed');
  assert.deepEqual(Object.keys(stage), ['status', 'token']);
  assert.deepEqual(Object.keys(stage.token), []);
  assert.equal(x.host.status().ready, false);
  assert.throws(() => x.host.effect('before-activation'), /host-revoked/);
  const active = x.host.activateConstructed(stage.token);
  assert.equal(active.status, 'published');
  assert.deepEqual(active.root.run(), ['a:write', 'a-value']);
  assert.equal(x.host.status().ready, true);
  assert.deepEqual(x.host.activateConstructed(stage.token), { status: 'activation-refused', code: 'invalid-token' });
  assert.equal((await x.host.close()).status, 'closed');
});

// Regression: a factory throw between record creation and registration loses physical stop ownership.
test('l2c0 exclusive stop creation registers before a throwing factory returns', async () => {
  const owner = new TestRecoveryOwner();
  const reservation = owner.reserve();
  let stops = 0;
  const x = await fixture(({ host }) => {
    host.createExclusiveStop({
      stop() { stops++; return Promise.reject(Error('uncertain stop')); },
      readback() { return 'released'; },
    });
    throw Error('factory failed after acquisition');
  }, { recovery: reservation });
  assert.equal((await x.start()).status, 'failed');
  const close = owner.close(reservation.operationId);
  await new Promise(setImmediate);
  assert.equal(stops, 1);
  assert.equal(owner.read(reservation.operationId).status, 'pending');
  const attempt = x.host.exclusiveStopAttempt();
  assert.equal((await x.host.reconcileExclusiveStop(attempt)).status, 'released');
  assert.equal((await close).status, 'closed');
  assert.equal(owner.read(reservation.operationId).outcomeCode, 'failed');
});

// Regression: marker I/O throws after ownership transfer but before Host stores stop control.
test('l2c0 marker failure after registration retains stop control and original close', async () => {
  const inventory = new TestRecoveryOwner();
  const reservation = inventory.reserve();
  let stops = 0, reads = 0;
  const x = await fixture(({ host }) => {
    const marker = process.env.TEST_MARKERS;
    process.env.TEST_MARKERS = join(markerRoot, 'missing-directory', 'markers');
    try {
      host.createExclusiveStop({
        stop() { stops++; return Promise.reject(Error('uncertain stop')); },
        readback() { reads++; return 'released'; },
      });
    } finally { process.env.TEST_MARKERS = marker; }
    return product(host);
  }, { recovery: reservation });
  assert.equal((await x.start()).status, 'failed');
  assert.equal(x.host.status().hasResource, true);
  const close = inventory.close(reservation.operationId);
  await new Promise(setImmediate);
  assert.equal(stops, 1);
  assert.equal(inventory.read(reservation.operationId).status, 'pending');
  const attempt = x.host.exclusiveStopAttempt();
  assert.equal(typeof attempt, 'string');
  assert.equal((await x.host.reconcileExclusiveStop(attempt)).status, 'released');
  assert.equal((await close).status, 'closed');
  assert.equal(reads, 1);
  assert.equal(inventory.read(reservation.operationId).outcomeCode, 'failed');
});

// Regression: a failed stage returns callable raw products or an exception object.
test('l2c0 failed staged construction returns an inert receipt', async () => {
  let disposed = 0;
  const x = await stagedFixture(({ owner }) => {
    owner.reserve()({ dispose() { disposed++; } });
    throw Error('private failure with raw resource');
  });
  const result = await x.stage();
  assert.deepEqual(result, { status: 'failed', code: 'construction-failed' });
  assert.equal((await x.host.close()).status, 'closed');
  assert.equal(disposed, 1);
});

// Regression: a stale grant or another Host's exact token publishes a staged route.
test('l2c0 revoked and foreign staged tokens cannot activate', async () => {
  const a = await stagedFixture();
  const b = await stagedFixture();
  const first = await a.stage();
  const second = await b.stage();
  assert.equal(first.status, 'constructed');
  assert.equal(second.status, 'constructed');
  assert.deepEqual(a.host.activateConstructed(second.token), { status: 'activation-refused', code: 'invalid-token' });
  a.revoke();
  assert.deepEqual(a.host.activateConstructed(first.token), { status: 'activation-refused', code: 'revoked' });
  assert.equal(a.host.status().ready, false);
  assert.equal(b.host.activateConstructed(second.token).status, 'published');
  assert.equal((await a.host.close()).status, 'closed');
  assert.equal((await b.host.close()).status, 'closed');
});

// Regression: close between stage and activation leaves an acquired resource live.
test('l2c0 close revokes staged token and disposes the acquired resource', async () => {
  let disposed = 0;
  const x = await stagedFixture(({ host, owner }) => {
    owner.reserve()({ dispose() { disposed++; } });
    return product(host);
  });
  const result = await x.stage();
  assert.equal(result.status, 'constructed');
  const close = x.host.close();
  assert.deepEqual(x.host.activateConstructed(result.token), { status: 'activation-refused', code: 'invalid-token' });
  assert.equal((await close).status, 'closed');
  assert.equal(disposed, 1);
});

// Regression: H13 stores a raw construction product or labels unactivated work published.
test('l2c0 H13 closes staged work with a constructed-only inert receipt', async () => {
  const inventory = new TestRecoveryOwner();
  const reservation = inventory.reserve(undefined, { canActivate: () => true });
  const x = await fixture(undefined, { recovery: reservation });
  const staged = await x.host.constructStaged(signal => x.run(signal), rootOf);
  assert.equal(staged.status, 'constructed');
  assert.equal((await inventory.close(reservation.operationId)).status, 'closed');
  assert.deepEqual(inventory.read(reservation.operationId), {
    status: 'closed', operationId: reservation.operationId, outcomeCode: 'constructed',
    summary: 'physical cleanup complete',
  });
  assert.deepEqual(x.host.activateConstructed(staged.token), { status: 'activation-refused', code: 'invalid-token' });
});

// Regression: raw stop rejection settles close and evicts the H13 slot prematurely.
test('l2c0 exclusive stop failure retains original close flight and recovery slot until readback release', async () => {
  const entered = deferred();
  let stops = 0, reads = 0;
  const recoveryOwner = new TestRecoveryOwner();
  const x = await stopFixture(() => { stops++; entered.resolve(); return Promise.reject(Error('raw stop failed')); },
    () => { reads++; return 'released'; }, recoveryOwner);
  const close = recoveryOwner.close(x.recovery.operationId);
  await entered.promise;
  await new Promise(setImmediate);
  const attempt = x.host.exclusiveStopAttempt();
  assert.equal(typeof attempt, 'string');
  assert.equal(recoveryOwner.read(x.recovery.operationId).status, 'pending');
  assert.equal(x.host.readRetirement(x.host.currentRetirementId()).status, 'pending');
  assert.equal((await x.host.reconcileExclusiveStop(attempt)).status, 'released');
  assert.equal((await close).status, 'closed');
  assert.equal((await recoveryOwner.close(x.recovery.operationId)).status, 'closed');
  assert.equal(recoveryOwner.read(x.recovery.operationId).outcomeCode, 'published');
  assert.equal(stops, 1);
  assert.equal(reads, 1);
});

// Regression: an inconclusive trusted readback is misread as physical release.
test('l2c0 unknown readback keeps the original close pending', async () => {
  let reads = 0;
  const x = await stopFixture(() => Promise.reject(Error('uncertain')),
    () => ++reads === 1 ? 'unknown' : 'released');
  const close = x.host.close();
  await new Promise(setImmediate);
  const attempt = x.host.exclusiveStopAttempt();
  assert.equal((await x.host.reconcileExclusiveStop(attempt)).status, 'unknown');
  assert.equal(x.host.readRetirement(x.host.currentRetirementId()).status, 'pending');
  assert.equal((await x.host.observeClose({ deadlineAt: 0 })).status, 'pending');
  assert.equal((await x.host.reconcileExclusiveStop(attempt)).status, 'released');
  assert.equal((await close).status, 'closed');
  assert.equal(reads, 2);
});

// Regression: a retry-safe readback is cached and hides later proof of release.
test('l2c0 retry-safe readback can later prove release without replay', async () => {
  let reads = 0, stops = 0;
  const x = await stopFixture(() => { stops++; return Promise.reject(Error('uncertain')); },
    () => ++reads === 1 ? 'retry-safe' : reads === 2 ? 'unknown' : 'released');
  const close = x.host.close();
  await new Promise(setImmediate);
  const attempt = x.host.exclusiveStopAttempt();
  assert.equal((await x.host.reconcileExclusiveStop(attempt)).status, 'retry-safe');
  assert.equal(x.host.readRetirement(x.host.currentRetirementId()).status, 'pending');
  assert.equal((await x.host.reconcileExclusiveStop(attempt)).status, 'unknown');
  assert.equal((await x.host.retryExclusiveStop(attempt)).status, 'unknown');
  assert.equal((await x.host.reconcileExclusiveStop(attempt)).status, 'released');
  assert.equal((await close).status, 'closed');
  assert.equal(reads, 3);
  assert.equal(stops, 1);
});

// Regression: retry replays a successful sibling or accepts readback from an old attempt.
test('l2c0 one explicit retry uses a new attempt without replaying a closed sibling', async () => {
  let stops = 0, reads = 0, siblingCloses = 0;
  const firstStopped = deferred();
  const x = await stopFixture(() => {
    stops++;
    if (stops === 1) { firstStopped.resolve(); return Promise.reject(Error('first stop failed')); }
  }, () => { reads++; return 'retry-safe'; });
  x.host.retainStream({ close() { siblingCloses++; } });
  const close = x.host.close();
  await firstStopped.promise;
  await new Promise(setImmediate);
  const first = x.host.exclusiveStopAttempt();
  assert.equal((await x.host.reconcileExclusiveStop(first)).status, 'retry-safe');
  assert.equal((await x.host.retryExclusiveStop(first)).status, 'released');
  const second = x.host.exclusiveStopAttempt();
  assert.notEqual(second, first);
  assert.equal((await x.host.reconcileExclusiveStop(first)).status, 'stale-attempt');
  assert.equal((await x.host.retryExclusiveStop(first)).status, 'stale-attempt');
  assert.equal((await close).status, 'closed');
  assert.equal(stops, 2);
  assert.equal(reads, 1);
  assert.equal(siblingCloses, 1);
});

// Regression: concurrent retry callers create a third physical stop or lose the first flight.
test('l2c0 concurrent retry joins one physical stop flight', async () => {
  const secondStop = deferred();
  let stops = 0;
  const x = await stopFixture(() => {
    stops++;
    return stops === 1 ? Promise.reject(Error('uncertain')) : secondStop.promise;
  }, () => 'retry-safe');
  const close = x.host.close();
  await new Promise(setImmediate);
  const first = x.host.exclusiveStopAttempt();
  assert.equal((await x.host.reconcileExclusiveStop(first)).status, 'retry-safe');
  const retryA = x.host.retryExclusiveStop(first);
  const retryB = x.host.retryExclusiveStop(first);
  assert.strictEqual(retryA, retryB);
  assert.equal(stops, 2);
  assert.equal(x.host.readRetirement(x.host.currentRetirementId()).status, 'pending');
  secondStop.resolve();
  assert.equal((await retryA).status, 'released');
  assert.equal((await close).status, 'closed');
  assert.equal(stops, 2);
});

// Regression: a stop/readback callback can enroll itself as a waiter on its own close.
test('l2c0 exclusive stop callbacks see self-wait and a published single flight', async () => {
  let host, rawClose, seen, readbackSeen;
  const entered = deferred();
  const x = await stopFixture(() => {
    rawClose = host.close();
    seen = host.observeClose();
    entered.resolve();
    return Promise.reject(Error('uncertain stop'));
  }, () => {
    readbackSeen = host.observeClose();
    return 'released';
  });
  host = x.host;
  const close = host.close();
  await entered.promise;
  assert.strictEqual(rawClose, close);
  assert.equal((await seen).status, 'self-wait');
  await new Promise(setImmediate);
  const attempt = host.exclusiveStopAttempt();
  assert.equal((await host.reconcileExclusiveStop(attempt)).status, 'released');
  assert.equal((await readbackSeen).status, 'self-wait');
  assert.equal((await close).status, 'closed');
});
