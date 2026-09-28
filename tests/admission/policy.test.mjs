import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { admit } from '../../src/admission/policy.ts';

function request() {
  return { selections: [
    { moduleId: 'test/provider', implementationId: 'test/provider/a', ownerLabel: 'fixture/provider',
      target: 'test-host/local', injections: [] },
    { moduleId: 'test/writer', implementationId: 'test/writer/main', ownerLabel: 'fixture/writer',
      target: 'test-host/local', injections: [{ slot: 'resource', providerImplementationId: 'test/provider/a',
        capabilityId: 'test/resource/write', token: 'test/resource/write/v1' }] },
    { moduleId: 'test/reader', implementationId: 'test/reader/main', ownerLabel: 'fixture/reader',
      target: 'test-host/local', injections: [{ slot: 'resource', providerImplementationId: 'test/provider/a',
        capabilityId: 'test/resource/read', token: 'test/resource/read/v1' }] },
    { moduleId: 'test/root/main', implementationId: 'test/root/main', ownerLabel: 'fixture/root',
      target: 'test-host/local', injections: [
        { slot: 'actions', providerImplementationId: 'test/writer/main', capabilityId: 'test/action', token: 'test/action/v1' },
        { slot: 'actions', providerImplementationId: 'test/reader/main', capabilityId: 'test/action', token: 'test/action/v1' },
      ] },
  ] };
}

// Regression: retaining caller arrays lets a post-admission mutation redirect a loader.
test('admission copies and freezes the whole selected set', () => {
  const input = request();
  const decision = admit(input);
  assert.equal(decision.ok, true);
  input.selections[0].implementationId = 'test/provider/b';
  input.selections[1].injections[0].providerImplementationId = 'test/provider/b';
  assert.equal(decision.snapshot.selections[0].implementationId, 'test/provider/a');
  assert.equal(decision.snapshot.selections[1].injections[0].providerImplementationId, 'test/provider/a');
  assert.equal(Object.isFrozen(decision.snapshot.selections[1].injections[0]), true);
});

// Regression: elementwise admission accepts an invalid last candidate after earlier loads.
test('invalid last candidate is refused before projection', () => {
  const input = request();
  input.selections[3].target = 'other-host';
  assert.deepEqual(admit(input), { ok: false, phase: 'admission', reason: 'wrong-target' });
});

// Regression: a claimed owner label is accidentally treated as authenticated identity.
test('forged owner label is refused', () => {
  const input = request();
  input.selections[3].ownerLabel = 'fixture/provider';
  assert.equal(admit(input).reason, 'forged-owner');
});

// Regression: Core-valid edges are mistaken for authority to consume a capability.
test('unauthorized injection is refused', () => {
  const input = request();
  input.selections[2].injections[0].capabilityId = 'test/resource/write';
  input.selections[2].injections[0].token = 'test/resource/write/v1';
  assert.equal(admit(input).reason, 'injection-grant');
});

// Regression: indexing duplicate or unknown IDs loses an invalid selection.
test('duplicate and unknown selections are refused', () => {
  const duplicate = request();
  duplicate.selections[3].moduleId = 'test/writer';
  assert.equal(admit(duplicate).reason, 'duplicate-module');
  const unknown = request();
  unknown.selections[3].implementationId = 'test/root/missing';
  assert.equal(admit(unknown).reason, 'unknown-selection');
});

// Regression: extra request keys smuggle mutable policy data into a trusted snapshot.
test('malformed records are rejected exactly', () => {
  const input = request();
  input.selections[3].loader = './untrusted.mjs';
  assert.equal(admit(input).reason, 'malformed-request');
});

// Regression: a path-prefix lookalike gains a grant for a different namespace.
test('trusted namespace comparison requires a path segment', async () => {
  const { admitTrusted } = await import('../../src/admission/policy.ts');
  const { candidates, grants } = await import('../../src/inventory/trusted.ts');
  const inventory = candidates.map(candidate => candidate.implementationId === 'test/root/main'
    ? { ...candidate, moduleId: 'test/rootlike' } : candidate);
  const input = request(); input.selections[3].moduleId = 'test/rootlike';
  assert.equal(admitTrusted(input, inventory, grants).reason, 'namespace');
});
// Regression: a forged owner label is accepted as a trusted inventory subject.
test('unknown trusted subject has no grant', async () => {
  const { admitTrusted } = await import('../../src/admission/policy.ts');
  const { candidates, grants } = await import('../../src/inventory/trusted.ts');
  const inventory = candidates.map(candidate => candidate.implementationId === 'test/root/main'
    ? { ...candidate, subject: 'fixture/unknown' } : candidate);
  const input = request(); input.selections[3].ownerLabel = 'fixture/unknown';
  assert.equal(admitTrusted(input, inventory, grants).reason, 'subject-grant');
});
// Regression: a product-owned capability is provided without its exact grant.
test('ungranted provision is refused', async () => {
  const { admitTrusted } = await import('../../src/admission/policy.ts');
  const { candidates, grants } = await import('../../src/inventory/trusted.ts');
  const inventory = candidates.map(candidate => candidate.implementationId === 'test/root/main'
    ? { ...candidate, provides: [{ id: 'test/action', token: 'test/action/v1' }] } : candidate);
  assert.equal(admitTrusted(request(), inventory, grants).reason, 'provision-grant');
});
// Regression: Map indexing erases a duplicate trusted implementation association.
test('ambiguous trusted inventory is refused', async () => {
  const { admitTrusted } = await import('../../src/admission/policy.ts');
  const { candidates, grants } = await import('../../src/inventory/trusted.ts');
  assert.equal(admitTrusted(request(), [...candidates, candidates[3]], grants).reason, 'ambiguous-inventory');
});
