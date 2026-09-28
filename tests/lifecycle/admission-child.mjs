import { runAdmission, loaders } from '../../src/admission/run.ts';
import { TestHost } from '../../src/host/lifetime.ts';

const mode = process.argv[2];
const release = Promise.withResolvers();
let owner, close, checks = 0, createCalls = 0;
globalThis.__testImportStarted = () => { if (mode === 'import') process.send({ type: 'import-started' }); };
globalThis.__testImportRelease = mode === 'import' ? release.promise : Promise.resolve();
globalThis.__testCreateCalled = () => { createCalls++; };

// Observe the public Host check to place seal at the post-load microtask boundary.
const originalIsOpen = TestHost.prototype.isOpen;
TestHost.prototype.isOpen = function () {
  const open = originalIsOpen.call(this);
  if (open) {
    owner = this;
    if (mode === 'gap' && ++checks === 2) queueMicrotask(() => { close = this.close(); });
  }
  return open;
};

const provider = 'test/provider/a';
const request = { selections: [
  { moduleId: 'test/provider', implementationId: provider, ownerLabel: 'fixture/provider', target: 'test-host/local', injections: [] },
  { moduleId: 'test/writer', implementationId: 'test/writer/main', ownerLabel: 'fixture/writer', target: 'test-host/local', injections: [
    { slot: 'resource', providerImplementationId: provider, capabilityId: 'test/resource/write', token: 'test/resource/write/v1' }] },
  { moduleId: 'test/reader', implementationId: 'test/reader/main', ownerLabel: 'fixture/reader', target: 'test-host/local', injections: [
    { slot: 'resource', providerImplementationId: provider, capabilityId: 'test/resource/read', token: 'test/resource/read/v1' }] },
  { moduleId: 'test/root/main', implementationId: 'test/root/main', ownerLabel: 'fixture/root', target: 'test-host/local', injections: [
    { slot: 'actions', providerImplementationId: 'test/writer/main', capabilityId: 'test/action', token: 'test/action/v1' },
    { slot: 'actions', providerImplementationId: 'test/reader/main', capabilityId: 'test/action', token: 'test/action/v1' }] },
] };
const rows = loaders.map(row => row.implementationId === provider
  ? { ...row, load: () => import('../../src/fixtures/candidates/import-paused.mjs') } : row);

process.on('message', message => {
  if (mode === 'import' && message === 'seal') {
    close = owner.close();
    process.send({ type: 'sealed', state: owner.status().state });
  } else if (mode === 'import' && message === 'release') release.resolve();
});

try {
  const result = await runAdmission(request, rows);
  const terminal = await (close ?? owner.close());
  process.send({ type: 'result', phase: result.phase, status: result.status, created: result.created,
    createCalls, terminal: terminal.status, hasResource: owner.status().hasResource });
} catch (error) {
  process.send({ type: 'error', message: String(error) });
}
