import { runAdmission, loaders, projectProfile } from '../../src/admission/run.ts';
import { admitTrusted } from '../../src/admission/policy.ts';
import { candidates, grants, disputedAuthorities } from '../../src/inventory/trusted.ts';
import { declarations } from '../../src/fixtures/graph.ts';
import { compileComposition } from '@get-modular/core';
import { strict as assert } from 'node:assert';
const scenario = process.argv[2];
const provider = scenario === 'provider-b' ? 'test/provider/b' : 'test/provider/a';
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
if (scenario === 'unauthorized-injection') {
  request.selections[0].ownerLabel = 'fixture/alternate-provider';
  const expectedProfile = Object.freeze({
    kind: 'get-modular.composition-profile', schemaVersion: 1, profileId: 'test/admission',
    roots: Object.freeze(['test/root/main']),
    selections: Object.freeze([
      { moduleId: 'test/provider', implementationId: 'test/provider/a' },
      { moduleId: 'test/writer', implementationId: 'test/writer/main' },
      { moduleId: 'test/reader', implementationId: 'test/reader/main' },
      { moduleId: 'test/root/main', implementationId: 'test/root/main' },
    ].map(Object.freeze)),
    bindings: Object.freeze([
      { consumerImplementationId: 'test/writer/main', slotId: 'resource', providerImplementationIds: ['test/provider/a'] },
      { consumerImplementationId: 'test/reader/main', slotId: 'resource', providerImplementationIds: ['test/provider/a'] },
      { consumerImplementationId: 'test/root/main', slotId: 'actions', providerImplementationIds: ['test/writer/main', 'test/reader/main'] },
    ].map(binding => Object.freeze({ ...binding, providerImplementationIds: Object.freeze(binding.providerImplementationIds) }))),
  });
  const normal = admitTrusted({ selections: request.selections.map(selection => selection.implementationId === provider
    ? { ...selection, ownerLabel: 'fixture/provider' } : selection) }, candidates, grants);
  assert.equal(normal.ok, true);
  assert.deepEqual(projectProfile(normal.snapshot), expectedProfile);
  const compiled = await compileComposition({ declarations, profile: expectedProfile });
  assert.equal(compiled.ok, true, JSON.stringify(compiled.diagnostics));
  assert.deepEqual(compiled.plan.bindings.find(binding => binding.consumerImplementationId === 'test/reader/main'), {
    consumerImplementationId: 'test/reader/main', slotId: 'resource',
    providerImplementationIds: ['test/provider/a'], capabilityId: 'test/resource/read',
    compatibility: { family: 'exact', familyVersion: 1, token: 'test/resource/read/v1' },
  });
  const result = await runAdmission(request, loaders, undefined, disputedAuthorities);
  console.log(JSON.stringify({ ...result, coreValidDisputedBinding: true }));
  process.exit(0);
}
let rows = loaders;
let edit;
const trustedVariants = {
  'namespace-lookalike': () => {
    request.selections[3].moduleId = 'test/rootlike';
    return candidates.map(candidate => candidate.implementationId === 'test/root/main'
      ? { ...candidate, moduleId: 'test/rootlike' } : candidate);
  },
  'unknown-subject': () => {
    request.selections[3].ownerLabel = 'fixture/unknown';
    return candidates.map(candidate => candidate.implementationId === 'test/root/main'
      ? { ...candidate, subject: 'fixture/unknown' } : candidate);
  },
  'ungranted-provision': () => candidates.map(candidate => candidate.implementationId === 'test/root/main'
    ? { ...candidate, provides: [{ id: 'test/action', token: 'test/action/v1' }] } : candidate),
  'ambiguous-inventory': () => [...candidates, candidates[3]],
};
if (Object.hasOwn(trustedVariants, scenario)) {
  const trusted = trustedVariants[scenario]();
  const decision = admitTrusted(request, trusted, grants);
  // This control would enter the actual public Core/Assembly path if policy regressed.
  const result = decision.ok ? await runAdmission({ selections: [
    { moduleId: 'test/provider', implementationId: provider, ownerLabel: 'fixture/provider', target: 'test-host/local', injections: [] },
    ...request.selections.slice(1).map(selection => selection.moduleId === 'test/rootlike' || selection.ownerLabel === 'fixture/unknown'
      ? { ...selection, moduleId: 'test/root/main', ownerLabel: 'fixture/root' } : selection),
  ] }) : { phase: 'admission', reason: decision.reason };
  console.log(JSON.stringify(result));
  process.exit(0);
}

switch (scenario) {
  case 'wrong-target': request.selections[3].target = 'other-host'; break;
  case 'forged-owner': request.selections[3].ownerLabel = 'fixture/provider'; break;
  case 'wrong-token': request.selections[3].injections[1].token = 'test/action@other'; break;
  case 'duplicate-selection': request.selections[3].moduleId = 'test/writer'; break;
  case 'unknown-selection': request.selections[3].implementationId = 'test/root/missing'; break;
  case 'missing-loader': rows = loaders.filter(row => row.implementationId !== 'test/root/main'); break;
  case 'unknown-loader': rows = loaders.map(row => row.implementationId === 'test/root/main'
    ? { ...row, implementationId: 'test/root/unknown' } : row); break;
  case 'duplicate-loader': rows = [...loaders, loaders[4]]; break;
  case 'reverse-many': edit = p => ({ ...p, bindings: p.bindings.map(binding => binding.consumerImplementationId === 'test/root/main' ? { ...binding, providerImplementationIds: [...binding.providerImplementationIds].reverse() } : binding) }); break;
  case 'wrong-binding': edit = p => ({ ...p, bindings: p.bindings.map(binding => binding.consumerImplementationId === 'test/writer/main' ? { ...binding, providerImplementationIds: ['test/reader/main'] } : binding) }); break;
  case 'missing-binding': edit = p => ({ ...p, bindings: p.bindings.filter(binding => binding.consumerImplementationId !== 'test/reader/main') }); break;
  case 'mutated-request': edit = p => { request.selections[0].implementationId = 'test/provider/b'; return p; }; break;
  case 'rejecting-reader': rows = loaders.map(row => row.implementationId === 'test/reader/main'
    ? { ...row, load: () => import('../../src/fixtures/candidates/rejecting-reader.mjs') } : row); break;
  case 'missing-identity': rows = loaders.map(row => row.implementationId === 'test/reader/main'
    ? { ...row, load: () => import('../../src/fixtures/candidates/missing-identity-reader.mjs') }
    : row.implementationId === 'test/writer/main'
      ? { ...row, load: () => import('../../src/fixtures/candidates/missing-identity-writer.mjs') } : row); break;
  case 'distinct-identity': rows = loaders.map(row => row.implementationId === 'test/reader/main'
    ? { ...row, load: () => import('../../src/fixtures/candidates/distinct-identity-reader.mjs') } : row); break;
  case 'swapped-loader': rows = loaders.map(row => row.implementationId === 'test/provider/a' ? { ...row, load: loaders[1].load } : row); break;
}
const result = await runAdmission(request, rows, edit);
console.log(JSON.stringify(result));
