// Regression: a failed disposer must leave reachable Host debt after real Assembly construction.
import { fixture } from '../../tests/lifecycle/fixture.mjs';
const cleanupCause = Error('fixture-cleanup-cause');
const identity = Symbol('fixture-resource');
let disposeCalls = 0;
const x = await fixture(async ({ host, owner }) => {
  owner.reserve()({ resourceIdentity: identity, dispose() { disposeCalls++; throw cleanupCause; } });
  return { instance: {}, capabilities: {
    'test/resource/read': { resourceId: 'fixture', resourceIdentity: identity, read: () => host.read(() => 'value') },
    'test/resource/write': { resourceId: 'fixture', resourceIdentity: identity, write: value => { host.effect(value); return value; } },
  } };
});
const construction = await x.start();
const terminal = await x.host.close();
const status = x.host.status();
console.log(JSON.stringify({
  construction: construction.status, raw: construction.raw?.status, rawCode: construction.raw?.code,
  terminal: terminal.status, state: status.state, ready: status.ready,
  hasResource: status.hasResource, hasDebt: status.debt !== undefined,
  causeMatchesFixture: status.cause === cleanupCause, observers: status.observers, disposeCalls,
}));
