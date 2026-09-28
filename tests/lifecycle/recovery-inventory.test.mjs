import { after, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture, deferred } from './fixture.mjs';
import { TestCohortRetirement } from '../../src/host/lifetime.ts';
import { TestRecoveryOwner } from '../../src/host/recovery.ts';
const markerRoot = mkdtempSync(join(tmpdir(), 'test-host-recovery-'));
process.env.TEST_MARKERS = join(markerRoot, 'markers');
after(() => {
  if (process.env.TEST_PRESERVE_MARKERS !== '1') rmSync(markerRoot, { recursive: true, force: true });
});

// Regression: the 65th generation reaches a candidate factory before capacity refusal.
test('recovery reserves 64 generations before executable work and refuses the 65th', async () => {
  const recovery = new TestRecoveryOwner();
  const reserved = Array.from({ length: 64 }, () => recovery.reserve());
  const before = readFileSync(process.env.TEST_MARKERS, { encoding: 'utf8', flag: 'a+' });
  assert.equal(before, '');
  const startRecovered = async options => (await fixture(undefined, options)).start();
  await assert.rejects(startRecovered({ recoveryOwner: recovery }), /recovery-capacity-refused/);
  const after = readFileSync(process.env.TEST_MARKERS, 'utf8');
  assert.equal(after, '', 'selected loader, factory and acquisition markers stay at zero');
  assert.equal((await startRecovered({ recovery: reserved[0] })).status, 'published');
  const allowed = readFileSync(process.env.TEST_MARKERS, 'utf8').trim().split('\n');
  assert.ok(allowed.includes('a:evaluate'), 'selected provider import evaluated');
  assert.ok(allowed.includes('a:factory'), 'selected provider factory ran');
  assert.ok(allowed.includes('owner:acquire'), 'selected provider registered its resource');
  assert.equal((await recovery.close(reserved[0].operationId)).status, 'closed');
  assert.equal(recovery.read(reserved[0].operationId).outcomeCode, 'published');
  assert.equal(recovery.reserve().operationId, 'test-operation-65');
});

// Regression: a full inventory refuses cleanup for an already admitted generation.
test('existing cleanup runs at capacity and releases only proven slots', async () => {
  const recovery = new TestRecoveryOwner();
  const reservations = Array.from({ length: 64 }, () => recovery.reserve());
  let disposals = 0;
  const x = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() { disposals++; } });
    throw Error('factory-failure');
  }, { recovery: reservations[0] });
  assert.equal((await x.start()).status, 'failed');
  assert.throws(() => recovery.reserve(), /recovery-capacity-refused/);
  const first = recovery.close(reservations[0].operationId);
  assert.strictEqual(recovery.close(reservations[0].operationId), first);
  assert.equal((await first).status, 'closed');
  assert.equal(disposals, 1);
  assert.equal(recovery.read(reservations[0].operationId).summary, 'physical cleanup complete');
  assert.equal(recovery.reserve().operationId, 'test-operation-65');
});

// Regression: settled cleanup failure is misclassified as terminal and evicted from unresolved capacity.
test('cleanup debt retains its slot after flight settlement and observer cancellation', async () => {
  const recovery = new TestRecoveryOwner();
  const operation = recovery.reserve();
  let disposals = 0;
  const x = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() { disposals++; throw Error('physical-unknown'); } });
    throw Error('construction-failed');
  }, { recovery: operation });
  assert.equal((await x.start()).status, 'failed');
  const controller = new AbortController();
  const flight = recovery.close(operation.operationId);
  const observer = recovery.observe(operation.operationId, { signal: controller.signal });
  controller.abort();
  assert.deepEqual(await observer, { status: 'pending', reason: 'aborted' });
  assert.equal((await flight).status, 'cleanup-incomplete');
  assert.equal(recovery.read(operation.operationId).status, 'cleanup-incomplete');
  assert.equal(disposals, 1);
  Array.from({ length: 63 }, () => recovery.reserve());
  assert.throws(() => recovery.reserve(), /recovery-capacity-refused/);
  assert.strictEqual(recovery.close(operation.operationId), flight);
  assert.equal(disposals, 1);
});

// Regression: a deadline receipt frees capacity while physical disposal is still running.
test('deadline observation keeps the generation reserved until raw disposal settles', async () => {
  const recovery = new TestRecoveryOwner();
  const operation = recovery.reserve();
  const dispose = deferred();
  const resourceIdentity = Symbol('deadline-resource');
  const x = await fixture(async ({ host, owner }) => {
    owner.reserve()({ resourceIdentity, dispose: () => dispose.promise });
    return { instance: {}, capabilities: {
      'test/resource/read': { resourceId: 'shared', resourceIdentity, read: () => host.read(() => 'value') },
      'test/resource/write': { resourceId: 'shared', resourceIdentity, write: value => value },
    } };
  }, { recovery: operation });
  assert.equal((await x.start()).status, 'published');
  const flight = recovery.close(operation.operationId);
  assert.deepEqual(await recovery.observe(operation.operationId, { deadlineAt: -1 }),
    { status: 'pending', reason: 'deadline' });
  assert.equal(recovery.read(operation.operationId).status, 'pending');
  Array.from({ length: 63 }, () => recovery.reserve());
  assert.throws(() => recovery.reserve(), /recovery-capacity-refused/);
  dispose.resolve();
  assert.equal((await flight).status, 'closed');
  assert.equal(recovery.read(operation.operationId).status, 'closed');
  recovery.reserve();
});

// Regression: recovery depends on the lost construction return value or raw error closure.
test('failed construction remains closable by ID after the returned handle is lost', async () => {
  const recovery = new TestRecoveryOwner();
  let disposals = 0;
  const operationId = await (async () => {
    const reservation = recovery.reserve();
    const x = await fixture(async ({ owner }) => {
      owner.reserve()({ dispose() { disposals++; } });
      throw Error('lost-construction');
    }, { recovery: reservation });
    assert.equal((await x.start()).status, 'failed');
    return reservation.operationId;
  })();
  assert.equal(recovery.read(operationId).status, 'open');
  assert.equal((await recovery.close(operationId)).status, 'closed');
  assert.equal(disposals, 1);
  assert.deepEqual(recovery.read(operationId), {
    status: 'closed', operationId, outcomeCode: 'failed', summary: 'physical cleanup complete',
  });
});

// Regression: receipt eviction uses reservation order or falsely reports release for an evicted ID.
test('257 terminal receipts evict the oldest physical completion', async () => {
  const recovery = new TestRecoveryOwner();
  const first = recovery.reserve(), second = recovery.reserve();
  await recovery.close(second.operationId);
  await recovery.close(first.operationId);
  for (let i = 0; i < 255; i++) {
    const operation = recovery.reserve();
    await recovery.close(operation.operationId);
  }
  assert.deepEqual(recovery.read(second.operationId), { status: 'unknown-or-expired' });
  assert.equal((await recovery.observe(second.operationId)).status, 'unknown-or-expired');
  assert.equal((await recovery.close(second.operationId)).status, 'unknown-or-expired');
  assert.equal(recovery.read(first.operationId).status, 'closed');
});

// Regression: a guessed ID is treated as a released receipt.
test('unknown recovery IDs never report released', async () => {
  const recovery = new TestRecoveryOwner();
  assert.deepEqual(recovery.read('guess'), { status: 'unknown-or-expired' });
  assert.deepEqual(await recovery.observe('guess'), { status: 'unknown-or-expired' });
  assert.deepEqual(await recovery.close('guess'), { status: 'unknown-or-expired' });
});

// Regression: reentrant abort callback sees no published inventory flight.
test('abort reentry finds the prepublished ID and one close flight', async () => {
  const recovery = new TestRecoveryOwner();
  const reservation = recovery.reserve();
  const x = await fixture(undefined, { recovery: reservation });
  await x.start();
  let reentrant;
  x.host.controller.signal.addEventListener('abort', () => {
    assert.equal(recovery.read(reservation.operationId).status, 'pending');
    reentrant = recovery.close(reservation.operationId);
  });
  const first = recovery.close(reservation.operationId);
  assert.strictEqual(reentrant, first);
  assert.equal((await first).status, 'closed');
});

// Regression: a failed cohort member keeps a successfully closed sibling's raw Host graph alive.
test('cohort compacts successful sibling while failed member keeps debt', async () => {
  const recovery = new TestRecoveryOwner();
  const good = recovery.reserve(), bad = recovery.reserve();
  const a = await fixture(undefined, { recovery: good });
  const b = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() { throw Error('debt'); } });
    throw Error('construction');
  }, { recovery: bad });
  await Promise.all([a.start(), b.start()]);
  const cohort = new TestCohortRetirement([a.host, b.host]);
  assert.equal((await recovery.close(good.operationId)).status, 'closed');
  assert.equal(recovery.read(good.operationId).status, 'closed');
  assert.equal(recovery.read(bad.operationId).status, 'cleanup-incomplete');
  assert.equal(cohort.members.includes(a.host), false);
  assert.equal(cohort.members.includes(b.host), true);
  assert.equal(a.host.status().hasResource, false);
});

// Regression: default stackful AbortError in a failed sibling can retain the closed stream's resource.
test('retirement inside a sibling stream leaves only an inert abort reason with debt', async () => {
  const recovery = new TestRecoveryOwner();
  const good = recovery.reserve(), bad = recovery.reserve();
  const a = await fixture(undefined, { recovery: good });
  const b = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() { throw Error('debt'); } });
    throw Error('construction');
  }, { recovery: bad });
  await Promise.all([a.start(), b.start()]);
  const badSignal = b.host.controller.signal;
  const cohort = new TestCohortRetirement([a.host, b.host]);
  let streamCloses = 0;
  const stream = a.host.retainStream({ close() { streamCloses++; } });
  await stream.run(() => { cohort.requestRetirement(); });
  assert.equal((await cohort.close()).status, 'cleanup-incomplete');
  assert.equal(recovery.read(good.operationId).status, 'closed');
  assert.equal(recovery.read(bad.operationId).status, 'cleanup-incomplete');
  assert.equal(badSignal.reason, 'host-retired');
  assert.equal(streamCloses, 1);
  assert.equal(cohort.members.includes(a.host), false);
});

// Regression: cause summary invokes a hostile plugin-owned message getter after physical cleanup.
test('terminal receipt uses only safe Host-owned summary', async () => {
  const recovery = new TestRecoveryOwner();
  const reservation = recovery.reserve();
  let getterCalls = 0;
  const hostile = Object.defineProperty({}, 'message', { get() { getterCalls++; throw Error('getter'); } });
  const x = await fixture(async ({ owner }) => {
    owner.reserve()({ dispose() {} });
    throw hostile;
  }, { recovery: reservation });
  assert.equal((await x.start()).status, 'failed');
  await recovery.close(reservation.operationId);
  assert.equal(recovery.read(reservation.operationId).summary, 'physical cleanup complete');
  assert.equal(getterCalls, 0);
  assert.deepEqual(Object.keys(recovery.read(reservation.operationId)),
    ['status', 'operationId', 'outcomeCode', 'summary']);
});
