import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { admit } from '../../src/admission/policy.ts';

function request() {
  return { selections: [
    { moduleId: 'test/provider', implementationId: 'test/provider/a', ownerLabel: 'fixture/provider',
      target: 'test-host/local', injections: [] },
    { moduleId: 'test/writer', implementationId: 'test/writer/main', ownerLabel: 'fixture/writer',
      target: 'test-host/local', injections: [{ slot: 'resource', providerImplementationId: 'test/provider/a',
        capabilityId: 'test/resource/write', token: 'test/resource/write@1' }] },
    { moduleId: 'test/reader', implementationId: 'test/reader/main', ownerLabel: 'fixture/reader',
      target: 'test-host/local', injections: [{ slot: 'resource', providerImplementationId: 'test/provider/a',
        capabilityId: 'test/resource/read', token: 'test/resource/read@1' }] },
    { moduleId: 'test/root', implementationId: 'test/root/main', ownerLabel: 'fixture/root',
      target: 'test-host/local', injections: [
        { slot: 'actions', providerImplementationId: 'test/writer/main', capabilityId: 'test/action', token: 'test/action@1' },
        { slot: 'actions', providerImplementationId: 'test/reader/main', capabilityId: 'test/action', token: 'test/action@1' },
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
  input.selections[2].injections[0].token = 'test/resource/write@1';
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
