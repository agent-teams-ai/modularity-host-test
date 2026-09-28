import { assemblyFor } from '@get-modular/assembly';
import { defineModule, required } from '@get-modular/core';
import { writer, type Contracts } from '../../src/fixtures/graph.ts';
const api = assemblyFor<Contracts>();
const wrongToken = defineModule({ ...writer, provides: [{ capabilityId: 'test/action', compatibility: {
  family: 'exact', familyVersion: 1, token: 'test/action/v2',
} }] } as const);
const wrongCapability = defineModule({ ...writer, provides: [{ capabilityId: 'test/unknown', compatibility: {
  family: 'exact', familyVersion: 1, token: 'test/action/v1',
} }] } as const);
const wrongSlot = defineModule({ ...writer, slots: [{ slotId: 'resource', capabilityId: 'test/unknown',
  compatibility: { family: 'exact', familyVersion: 1, token: 'test/resource/write/v1' }, cardinality: required() }] } as const);
const action = { resourceId: 'r', resourceIdentity: Symbol('r'), run: () => 'x' };
const product = async () => ({ instance: {}, capabilities: { 'test/action': action } });
// Positive control: the product and asynchronous factory satisfy the valid declaration.
api.bindFactory(writer, product);
// Regression: exact token, capability ID, and slot capability escape typed binding.
// @ts-expect-error an unlisted exact token is rejected
api.bindFactory(wrongToken, product);
// @ts-expect-error an unknown provided capability is rejected
api.bindFactory(wrongCapability, product);
// @ts-expect-error an unknown slot capability is rejected
api.bindFactory(wrongSlot, product);
// Regression: synchronous constructors are accepted despite Assembly's Promise contract.
// @ts-expect-error factory must return a Promise
api.bindFactory(writer, () => ({ instance: {}, capabilities: { 'test/action': action } }));
