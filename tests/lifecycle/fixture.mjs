import { strict as assert } from 'node:assert';
import { compileComposition } from '@get-modular/core';
import { assemblyFor } from '@get-modular/assembly';
import { TestHost } from '../../src/host/lifetime.ts';
import { declarations, providerA, writer, reader, root } from '../../src/fixtures/graph.ts';

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export async function fixture(providerFactory, options = {}) {
  const composition = await compileComposition({ declarations, profile: {
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'test/lifecycle', roots: ['test/root/main'],
    selections: [providerA, writer, reader, root].map(d => ({ moduleId: d.moduleId, implementationId: d.implementationId })),
    bindings: [
      { consumerImplementationId: writer.implementationId, slotId: 'resource', providerImplementationIds: [providerA.implementationId] },
      { consumerImplementationId: reader.implementationId, slotId: 'resource', providerImplementationIds: [providerA.implementationId] },
      { consumerImplementationId: root.implementationId, slotId: 'actions', providerImplementationIds: [writer.implementationId, reader.implementationId] },
    ],
  } });
  assert.equal(composition.ok, true);
  const host = new TestHost(options.clock);
  const api = assemblyFor();
  const owner = Object.freeze({ reserve: () => host.reserve(), effect: value => host.effect(value), read: fn => host.read(fn),
    assertReady: () => host.assertOperationReady() });
  const load = async (path) => {
    assert.equal(host.isOpen(), true);
    const module = await import(path);
    if (!host.isOpen()) throw Error('post-import-authority-closed');
    return module;
  };
  const a = api.bindFactory(providerA, async deps => providerFactory
    ? providerFactory({ host, owner, deps, load })
    : (await load('../../src/fixtures/candidates/a.mjs')).create(deps, owner));
  const w = api.bindFactory(writer, async deps => (await load('../../src/fixtures/candidates/writer.mjs')).create(deps));
  const r = api.bindFactory(reader, async deps => (await load('../../src/fixtures/candidates/reader.mjs')).create(deps));
  const app = api.bindFactory(root, async deps => (await load('../../src/fixtures/candidates/root.mjs')).create(deps, owner));
  const prepared = await api.prepare({ composition, factories: [a, w, r, app], roots: { app } });
  assert.equal(prepared.status, 'prepared');
  const start = () => host.construct(signal => prepared.prepared.run({ signal }), out => out.status === 'succeeded' ? out.roots.app : undefined);
  return { host, start, run: signal => prepared.prepared.run({ signal }) };
}
