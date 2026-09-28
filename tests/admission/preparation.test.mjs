import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { compileComposition } from '@get-modular/core';
import { assemblyFor } from '@get-modular/assembly';
import { declarations, providerA, providerB, writer, reader, root, sentinel } from '../../src/fixtures/graph.ts';

async function fixture() {
  const composition = await compileComposition({ declarations, profile: {
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'test/preparation', roots: ['test/root/main'],
    selections: [providerA, writer, reader, root].map(d => ({ moduleId: d.moduleId, implementationId: d.implementationId })),
    bindings: [
      { consumerImplementationId: writer.implementationId, slotId: 'resource', providerImplementationIds: [providerA.implementationId] },
      { consumerImplementationId: reader.implementationId, slotId: 'resource', providerImplementationIds: [providerA.implementationId] },
      { consumerImplementationId: root.implementationId, slotId: 'actions', providerImplementationIds: [writer.implementationId, reader.implementationId] },
    ],
  } });
  assert.equal(composition.ok, true);
  const api = assemblyFor();
  const observed = { factories: 0, loaders: 0 };
  const unused = async () => {
    observed.factories += 1;
    observed.loaders += 1;
    await import('../../src/fixtures/candidates/a.mjs');
    throw Error('factory must not execute during preparation');
  };
  const a = api.bindFactory(providerA, unused);
  const b = api.bindFactory(providerB, unused);
  const w = api.bindFactory(writer, unused);
  const r = api.bindFactory(reader, unused);
  const app = api.bindFactory(root, unused);
  const s = api.bindFactory(sentinel, unused);
  return { api, composition, a, b, w, r, app, s, observed };
}
// Regression: preparation trusts a modified compiler envelope instead of rechecking it.
for (const [name, change, code] of [
  ['tampered-digest', x => ({ ...x.composition, digest: 'gm-plan:v1:sha-256:bad' }), 'assembly.prepare.plan-mismatch'],
  ['tampered-order', x => ({ ...x.composition, plan: { ...x.composition.plan, dependencyOrder: [...x.composition.plan.dependencyOrder].reverse() } }), 'assembly.prepare.plan-mismatch'],
]) {
  test(`${name} is refused by Assembly`, async () => {
    const x = await fixture();
    const result = await x.api.prepare({ composition: change(x), factories: [x.a, x.w, x.r, x.app], roots: { app: x.app } });
    assert.equal(result.status, 'failed'); assert.equal(result.error.code, code);
    assert.deepEqual(x.observed, { factories: 0, loaders: 0 });
  });
}
// Regression: missing, extra or forged selected handles are silently accepted.
for (const [name, select, code] of [
  ['missing-handle', x => [x.a, x.w, x.app], 'assembly.prepare.handles'],
  ['extra-handle', x => [x.a, x.w, x.r, x.app, x.s], 'assembly.prepare.handles'],
  ['wrong-provider-handle', x => [x.b, x.w, x.r, x.app], 'assembly.prepare.handles'],
]) {
  test(`${name} is refused by Assembly`, async () => {
    const x = await fixture();
    const result = await x.api.prepare({ composition: x.composition, factories: select(x), roots: { app: x.app } });
    assert.equal(result.status, 'failed'); assert.equal(result.error.code, code);
    assert.deepEqual(x.observed, { factories: 0, loaders: 0 });
  });
}
test('incomplete roots refuse preparation', async () => {
  const x = await fixture();
  const result = await x.api.prepare({ composition: x.composition, factories: [x.a, x.w, x.r, x.app], roots: {} });
  assert.equal(result.status, 'failed'); assert.equal(result.error.code, 'assembly.prepare.roots');
  assert.deepEqual(x.observed, { factories: 0, loaders: 0 });
});
