import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve('tests/admission/.scenarios');
const child = resolve('tests/admission/child.mjs');
function scenario(name) {
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(resolve(root, `${name}-`));
  const markers = resolve(dir, 'markers.log');
  try {
    const run = spawnSync(process.execPath, [child, name], {
      cwd: dir, encoding: 'utf8', timeout: 10000,
      env: { HOME: dir, TMPDIR: dir, LANG: 'C', TEST_MARKERS: markers },
    });
    assert.equal(run.error, undefined, `child infrastructure: ${run.error}`);
    assert.equal(run.status, 0, run.stderr);
    return { result: JSON.parse(run.stdout), events: existsSync(markers) ? readFileSync(markers, 'utf8').trim().split('\n') : [] };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const zero = ({ events }) => assert.deepEqual(events, []);
// Regression: lazy wrappers or marker instrumentation silently stop firing.
test('positive A imports selected modules once, runs ordered actions and disposes one resource', () => {
  const { result, events } = scenario('positive');
  assert.equal(result.phase, 'construction'); assert.equal(result.status, 'succeeded');
  assert.equal(result.created, 4);
  assert.deepEqual(result.values, ['a:write', 'a-value']);
  assert.deepEqual(result.identities, ['a-resource', 'a-resource']);
  assert.equal(result.sharedResource, true);
  assert.deepEqual(result.effects, ['write']);
  for (const name of ['a', 'writer', 'reader', 'root']) {
    assert.equal(events.filter(event => event === `${name}:evaluate`).length, 1);
    assert.equal(events.filter(event => event === `${name}:factory`).length, 1);
  }
  assert.equal(events.filter(event => event.endsWith(':loader')).length, 4);
  assert.equal(events.filter(event => event === 'transitive:evaluate').length, 1);
  assert.equal(events.filter(event => event === 'owner:acquire').length, 1);
  assert.equal(events.filter(event => event === 'owner:effect:write').length, 1);
  assert.equal(events.filter(event => event === 'a:dispose').length, 1);
  assert.equal(events.some(event => event.startsWith('sentinel:') || event.startsWith('b:')), false);
});
// Regression: elementwise validate-and-load admits earlier factories before the last invalid row.
for (const [name, reason] of [['wrong-target', 'wrong-target'], ['forged-owner', 'forged-owner'],
  ['wrong-token', 'provider-capability'], ['unauthorized-injection', 'injection-grant'],
  ['duplicate-selection', 'duplicate-module'], ['unknown-selection', 'unknown-selection']]) {
  test(`${name} refuses the whole graph before any executable marker`, () => {
    const observed = scenario(name); zero(observed);
    assert.deepEqual(observed.result, { phase: 'admission', reason });
  });
}
// Regression: malformed trusted rows reach executable loading after a policy change.
for (const [name, reason] of [['namespace-lookalike', 'namespace'], ['unknown-subject', 'subject-grant'],
  ['ungranted-provision', 'provision-grant'], ['ambiguous-inventory', 'ambiguous-inventory']]) {
  test(`${name} trusted table refuses before any child import`, () => {
    const observed = scenario(name); zero(observed);
    assert.deepEqual(observed.result, { phase: 'admission', reason });
  });
}
// Regression: lossy loader indexing or resolver fallback imports a selected candidate anyway.
for (const name of ['missing-loader', 'unknown-loader', 'duplicate-loader']) {
  test(`${name} rejects exact loader projection`, () => {
    const observed = scenario(name); zero(observed);
    assert.deepEqual(observed.result, { phase: 'mapping', reason: 'selected-loader-cardinality' });
  });
}
// Regression: Core diagnostics are discarded or construction begins on a bad binding.
for (const [name, code] of [['wrong-binding', 'binding.capability-missing'], ['missing-binding', 'binding.missing']]) {
  test(`${name} retains Core refusal before import`, () => {
    const observed = scenario(name); zero(observed);
    assert.equal(observed.result.phase, 'core');
    assert.ok(observed.result.diagnostics.includes(code), JSON.stringify(observed.result));
  });
}
// Regression: a changed caller request redirects a selected implementation after admission.
test('mutation after the snapshot keeps A selected', () => {
  const observed = scenario('mutated-request');
  assert.deepEqual(observed.result.values, ['a:write', 'a-value']);
  assert.equal(observed.events.includes('b:evaluate'), false);
});
// Regression: a trusted key accidentally points to B executable or profile order is reversed.
test('B alternative has a distinct independent result', () => {
  const observed = scenario('provider-b');
  assert.deepEqual(observed.result.values, ['b:write', 'b-value']);
  assert.deepEqual(observed.result.identities, ['b-resource', 'b-resource']);
  assert.equal(observed.result.sharedResource, true);
  assert.equal(observed.events.includes('a:evaluate'), false);
  assert.equal(observed.events.includes('sentinel:evaluate'), false);
});
test('swapped A loader is caught by the A oracle', () => {
  const observed = scenario('swapped-loader');
  assert.deepEqual(observed.result.values, ['b:write', 'b-value']);
  assert.equal(observed.events.includes('b:evaluate'), true);
});

// Regression: Assembly ignores the explicit profile order of a many slot.
test('reversed many binding changes the independent action oracle', () => {
  const observed = scenario('reverse-many');
  assert.deepEqual(observed.result.values, ['a-value', 'a:write']);
  assert.deepEqual(observed.result.identities, ['a-resource', 'a-resource']);
});

// Regression: an imported factory rejects after acquisition and loses its Host cleanup owner.
test('factory rejection after acquisition preserves construction phase and sole disposal', () => {
  const { result, events } = scenario('rejecting-reader');
  assert.equal(result.phase, 'construction');
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'assembly.run.factory-rejected');
  assert.equal(result.created, 1);
  assert.deepEqual(result.effects, []);
  assert.equal(events.filter(event => event === 'owner:acquire').length, 1);
  assert.equal(events.filter(event => event === 'a:dispose').length, 1);
  assert.equal(events.filter(event => event === 'rejecting-reader:factory').length, 1);
  assert.equal(events.some(event => event === 'writer:factory' || event === 'root:factory'), false);
});
