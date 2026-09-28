// Regression: Assembly 0.1 compares root handles with implementation IDs;
// 0.2 must accept a Core profile root whose module ID differs.
import { defineModule, compileComposition } from '@get-modular/core';
import { assemblyFor } from '@get-modular/assembly';

const root = defineModule({
  kind: 'get-modular.module-declaration', schemaVersion: 1,
  moduleId: 'test/probe/root', implementationId: 'test/probe/root-implementation',
  owner: { authority: 'test-probe', path: ['test', 'probe'] },
  provides: [], slots: [],
});
const composition = await compileComposition({ declarations: [root], profile: {
  kind: 'get-modular.composition-profile', schemaVersion: 1,
  profileId: 'test/probe/distinct-root', roots: [root.moduleId],
  selections: [{ moduleId: root.moduleId, implementationId: root.implementationId }],
  bindings: [],
} });
if (!composition.ok) {
  console.log(JSON.stringify({ phase: 'core', status: 'failed', diagnostics: composition.diagnostics.map(x => x.code) }));
  process.exitCode = 2;
} else {
  const api = assemblyFor();
  const handle = api.bindFactory(root, async () => ({ instance: {}, capabilities: {} }));
  const prepared = await api.prepare({ composition, factories: [handle], roots: { app: handle } });
  console.log(JSON.stringify(prepared.status === 'prepared'
    ? { phase: 'preparation', status: 'prepared' }
    : { phase: 'preparation', status: prepared.status, code: prepared.error.code }));
}
