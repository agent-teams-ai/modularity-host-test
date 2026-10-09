import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname } from 'node:path';

const source = resolve(import.meta.dirname, '../..');
const pins = JSON.parse(readFileSync(join(source, 'third_party/pins.json')));
const expected = JSON.parse(readFileSync(join(source, 'scripts/evidence/expected.json')));
const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
const out = join(source, 'evidence/runs', id);
mkdirSync(out, { recursive: true });
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'modularity-host-test-evidence-')));
// node --test-name-pattern is a regular expression; suite names end with " [subject]".
const exactName = name => `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
const trainFile = name => name.startsWith('close-within: ') ? 'tests/sessions/close-within.test.mjs'
  : name.startsWith('process-group: ') ? 'tests/sessions/process-group.test.mjs'
    : 'tests/sessions/template.test.mjs';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sri = bytes => 'sha512-' + createHash('sha512').update(bytes).digest('base64');
const read = path => readFileSync(path);
const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
const files = [];
const sourcePaths = ['src', 'tests', 'scripts/evidence',
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'third_party',
  'docs/lifecycle-kernel-l2a.md', 'docs/lifecycle-kernel-l2b.md', 'docs/lifecycle-kernel-h04.md',
  'docs/lifecycle-kernel-h06-cohort.md', 'docs/lifecycle-kernel-h13-recovery.md', 'docs/lifecycle-kernel-l2c0.md',
  'docs/lifecycle-kernel-l2c1.md',
  'docs/evidence-replay.md', 'docs/train-030-01.md'];
const commitCoversWorktree = git('status', '--porcelain', '--untracked-files=all', '--', ...sourcePaths) === '';
function scan(path) {
  for (const entry of readdirSync(join(source, path), { withFileTypes: true })) {
    const name = join(path, entry.name);
    if (entry.isDirectory()) scan(name);
    else if (entry.isFile()) files.push({ path: name, sha256: sha256(read(join(source, name))) });
  }
}
for (const path of ['src', 'tests', 'scripts/evidence']) scan(path);
for (const path of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json',
  'third_party/pins.json', pins.consumerModuleStandard.path, pins.lifecycleKernel.path,
  'docs/lifecycle-kernel-l2a.md', 'docs/lifecycle-kernel-l2b.md', 'docs/lifecycle-kernel-h04.md',
  'docs/lifecycle-kernel-h06-cohort.md', 'docs/lifecycle-kernel-h13-recovery.md', 'docs/lifecycle-kernel-l2c0.md',
  'docs/lifecycle-kernel-l2c1.md',
  'docs/evidence-replay.md', 'docs/train-030-01.md'])
  files.push({ path, sha256: sha256(read(join(source, path))) });
files.sort((a, b) => a.path.localeCompare(b.path));
const report = {
  schemaVersion: 1, status: 'pending',
  source: { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    commitScope: 'baseline HEAD; replay uses the separately hashed worktree files',
    commitCoversWorktree,
    worktreeFiles: files, worktreeDigest: sha256(Buffer.from(JSON.stringify(files))) },
  standard: { sourceCommit: pins.getModularSourceCommit, repository: pins.consumerModuleStandard.repository,
    sourcePath: pins.consumerModuleStandard.sourcePath, anchor: pins.consumerModuleStandard.anchor,
    acceptingDecision: pins.consumerModuleStandard.acceptingDecision,
    copyPath: pins.consumerModuleStandard.path, sha256: sha256(read(join(source, pins.consumerModuleStandard.path))) },
  lifecycleKernel: { sourceCommit: pins.lifecycleKernel.sourceCommit, origin: pins.lifecycleKernel.origin },
  environment: { node: process.version, platform: process.platform, pnpm: null, typescript: null },
  limits: [
    'Synthetic fixed TEST Host only; no Agent Runtime, Extension Foundation, OpenClaw, or production conformance.',
    'No arbitrary JavaScript sandbox, physical effect cancellation, crash recovery, Windows, or Node 26 support.',
    'Core/Assembly 0.3.0, resources 0.1.0 and conformance 0.1.0 are retained release archives packed before npm publication; this run is not publication evidence.',
    'The lifecycle-kernel 0.1.0 archive is a separately packed private candidate.',
    'The process-group recipe is proven only for a cooperative two-level POSIX tree that stays in its group.',
    'Archive-only diagnostic replay is not an accepted frozen-lock installation or typecheck gate.',
  ], pairs: {}, failures: [],
};
const log = (name, value) => {
  const path = join(out, name);
  writeFileSync(path, value);
  return { path: relative(source, path), sha256: sha256(read(path)) };
};
function command(cwd, label, bin, args, timeout = 120000, extra = {}) {
  const dir = mkdtempSync(join(scratch, 'env-'));
  const env = { HOME: dir, TMPDIR: dir, LANG: 'C', CI: '1', COREPACK_ENABLE_NETWORK: '0',
    PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ''}`, ...extra };
  if (process.env.COREPACK_HOME) env.COREPACK_HOME = process.env.COREPACK_HOME;
  const run = spawnSync(bin, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 20 * 1024 * 1024 });
  const markerFiles = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of ['markers', 'markers.log']) {
      const path = join(dir, entry.name, name);
      if (existsSync(path)) markerFiles.push({
        path: join(entry.name, name), orderedEvents: readFileSync(path, 'utf8').trim().split('\n').filter(Boolean),
      });
    }
  }
  return { command: [bin, ...args], exitCode: run.status, signal: run.signal,
    infrastructureError: run.error?.code ?? null,
    stdout: log(label + '.stdout.log', run.stdout ?? ''), stderr: log(label + '.stderr.log', run.stderr ?? ''),
    markerFiles, text: run.stdout ?? '' };
}
function failed(message) { report.failures.push(message); }
if (scratch === source || scratch.startsWith(source + '/')) failed('replay root is inside the source repository');
for (const [kind, names] of Object.entries(expected).filter(([, value]) => Array.isArray(value))) {
  if (new Set(names).size !== names.length) failed(`duplicate expected ${kind} ID`);
}
if (!Number.isSafeInteger(expected.lifecycleStartIndex) || expected.lifecycleStartIndex < 1 ||
    expected.lifecycleStartIndex >= expected.tests.length)
  failed('invalid lifecycle scenario boundary');
if (!Number.isSafeInteger(expected.recoveryStartIndex) ||
    expected.recoveryStartIndex <= expected.lifecycleStartIndex ||
    expected.recoveryStartIndex >= expected.tests.length)
  failed('invalid recovery scenario boundary');
if (!Number.isSafeInteger(expected.replacementStartIndex) ||
    expected.replacementStartIndex <= expected.recoveryStartIndex ||
    expected.replacementStartIndex >= expected.tests.length)
  failed('invalid replacement scenario boundary');
if (!Number.isSafeInteger(expected.trainStartIndex) ||
    expected.trainStartIndex <= expected.replacementStartIndex ||
    expected.trainStartIndex >= expected.tests.length)
  failed('invalid train scenario boundary');
const TRAIN = ['core', 'assembly', 'resources', 'conformance'];
const TRAIN_ENGINES = '>=24.18.0 <25 || >=26.10.0 <27';
// Compare records without key order: pnpm pack writes conformance peers in varying order.
const sameRecord = (a, b) => JSON.stringify(Object.entries(a ?? {}).sort()) === JSON.stringify(Object.entries(b ?? {}).sort());
function checkTrainSet() {
  const pin = pins.trainSet;
  const archive = {};
  for (const name of TRAIN) {
    const spec = pin.packages[name];
    const bytes = read(join(source, spec.path));
    const text = execFileSync('tar', ['-xOzf', join(source, spec.path), 'package/package.json'], { encoding: 'utf8' });
    const manifest = JSON.parse(text);
    const item = { path: spec.path, origin: pin.origin, sourceCommit: pin.sourceCommit, version: manifest.version,
      sha256: sha256(bytes), sri: sri(bytes), engines: manifest.engines,
      dependencies: manifest.dependencies ?? null, peerDependencies: manifest.peerDependencies ?? null };
    if (manifest.name !== `@get-modular/${name}` || manifest.private !== undefined || item.sha256 !== spec.sha256 ||
        item.sri !== spec.sri || item.version !== spec.version || manifest.engines?.node !== TRAIN_ENGINES ||
        /"(workspace|link|file):/.test(text))
      failed(`trainSet/${name}: archive pin or manifest mismatch`);
    archive[name] = item;
  }
  const version = Object.fromEntries(TRAIN.map(name => [name, pin.packages[name].version]));
  if (!sameRecord(archive.assembly.dependencies, { '@get-modular/core': version.core }) || archive.assembly.peerDependencies)
    failed('trainSet/assembly: not exactly dependent on the pinned Core');
  for (const name of ['core', 'resources'])
    if (archive[name].dependencies || archive[name].peerDependencies) failed(`trainSet/${name}: unexpected dependency`);
  if (archive.conformance.dependencies || !sameRecord(archive.conformance.peerDependencies, {
    '@get-modular/assembly': `^${version.assembly}`, '@get-modular/core': `^${version.core}`,
    '@get-modular/resources': `^${version.resources}` }))
    failed('trainSet/conformance: peers are not one 0.x minor of the pinned set');
  return archive;
}
function checkKernelPin() {
  const pin = pins.lifecycleKernel;
  const bytes = read(join(source, pin.path));
  const manifest = JSON.parse(execFileSync('tar', ['-xOzf', join(source, pin.path), 'package/package.json']));
  const item = { path: pin.path, origin: pin.origin, sourceCommit: pin.sourceCommit,
    version: manifest.version, sha256: sha256(bytes), sri: sri(bytes), engines: manifest.engines,
    private: manifest.private };
  if (item.sha256 !== pin.sha256 || item.sri !== pin.sri || item.version !== pin.version ||
      manifest.name !== '@get-modular/lifecycle-kernel' || manifest.private !== true ||
      manifest.engines?.node !== '>=24.18.0 <25 || >=26.10.0 <27')
    failed('lifecycle-kernel: archive pin or manifest mismatch');
  return item;
}
function copyTestRoot(destination) {
  mkdirSync(destination, { recursive: true });
  for (const path of ['src', 'tests', 'scripts/evidence', 'third_party'])
    cpSync(join(source, path), join(destination, path), { recursive: true,
      filter: name => !name.includes('/.scenarios') });
  cpSync(join(source, 'tsconfig.json'), join(destination, 'tsconfig.json'));
  for (const path of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'])
    cpSync(join(source, path), join(destination, path));
  // pnpm 11's default release-age policy queries registry metadata even with --offline.
  // Only the disposable replay copy receives this overlay; archive SRI and lock stay exact.
  const workspace = join(destination, 'pnpm-workspace.yaml');
  writeFileSync(workspace, readFileSync(workspace, 'utf8') + '\nminimumReleaseAge: 0\ntrustPolicy: off\n');
}
function installedRoots(root, pair) {
  const script = `const {createRequire}=require('node:module');const {realpathSync,readFileSync}=require('node:fs');
    const {dirname,join}=require('node:path');
    const consumer=createRequire(process.cwd()+'/package.json');
    const real=name=>realpathSync(consumer.resolve('@get-modular/'+name));
    const roots=Object.fromEntries(['core','assembly','resources','conformance','lifecycle-kernel'].map(name=>[name,real(name)]));
    const from=(base,name)=>realpathSync(createRequire(base).resolve('@get-modular/'+name));
    const versionOf=x=>JSON.parse(readFileSync(join(dirname(dirname(x)),'package.json'))).version;
    console.log(JSON.stringify({roots,
      assemblyCore:from(roots.assembly,'core'),
      conformancePeers:{core:from(roots.conformance,'core'),assembly:from(roots.conformance,'assembly'),resources:from(roots.conformance,'resources')},
      versions:Object.fromEntries(Object.entries(roots).map(([name,path])=>[name,versionOf(path)]))}));`;
  const cmd = command(root, `${pair}.resolve`, process.execPath, ['-e', script]);
  if (cmd.exitCode !== 0) { failed(`${pair}: installed root resolution failed`); return { command: cmd }; }
  const found = JSON.parse(cmd.text);
  const wanted = { ...Object.fromEntries(TRAIN.map(name => [name, pins.trainSet.packages[name].version])),
    'lifecycle-kernel': pins.lifecycleKernel.version };
  if (Object.values(found.roots).some(path => !path.startsWith(root + '/')) ||
      found.assemblyCore !== found.roots.core ||
      found.conformancePeers.core !== found.roots.core || found.conformancePeers.assembly !== found.roots.assembly ||
      found.conformancePeers.resources !== found.roots.resources ||
      Object.entries(wanted).some(([name, version]) => found.versions[name] !== version))
    failed(`${pair}: installed package roots, versions, or peer resolution differ`);
  return { command: cmd, roots: found };
}
function tap(text, pair) {
  const rows = [];
  for (const line of text.split('\n')) {
    const match = /^(not ok|ok) \d+ - (.*)$/.exec(line);
    if (match) rows.push({ id: match[2], expected: 'pass', actual: match[1] === 'ok' ? 'pass' : 'fail' });
  }
  const totals = Object.fromEntries([...text.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)]
    .map(([, name, count]) => [name, Number(count)]));
  const expectedNames = expected.tests;
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.id)) failed(`${pair}: duplicate test ${row.id}`);
    if (!expectedNames.includes(row.id)) failed(`${pair}: unexpected test ${row.id}`);
    if (row.actual !== 'pass') failed(`${pair}: failed test ${row.id}`);
    seen.add(row.id);
  }
  for (const name of expectedNames) if (!seen.has(name)) failed(`${pair}: missing test ${name}`);
  if (totals.tests !== expectedNames.length || totals.pass !== expectedNames.length ||
      totals.fail !== 0 || (totals.skipped ?? 0) !== 0 || (totals.todo ?? 0) !== 0 ||
      (totals.cancelled ?? 0) !== 0) failed(`${pair}: TAP totals disagree with required scenarios`);
  return { rows, totals };
}
const preImport = new Set(['wrong-target', 'forged-owner', 'wrong-token', 'duplicate-selection',
  'unknown-selection', 'unauthorized-injection', 'namespace-lookalike', 'unknown-subject',
  'ungranted-provision', 'ambiguous-inventory', 'missing-loader', 'unknown-loader',
  'duplicate-loader', 'wrong-binding', 'missing-binding']);
const phaseFor = name => ['wrong-binding', 'missing-binding'].includes(name) ? 'core'
  : ['missing-loader', 'unknown-loader', 'duplicate-loader'].includes(name) ? 'mapping'
    : preImport.has(name) ? 'admission' : 'construction';
const refusal = {
  'wrong-target': 'wrong-target', 'forged-owner': 'forged-owner',
  'wrong-token': 'provider-capability', 'duplicate-selection': 'duplicate-module',
  'unknown-selection': 'unknown-selection', 'unauthorized-injection': 'injection-grant',
  'namespace-lookalike': 'namespace', 'unknown-subject': 'subject-grant',
  'ungranted-provision': 'provision-grant', 'ambiguous-inventory': 'ambiguous-inventory',
  'missing-loader': 'selected-loader-cardinality', 'unknown-loader': 'selected-loader-cardinality',
  'duplicate-loader': 'selected-loader-cardinality',
};
const coreDiagnostic = { 'wrong-binding': 'binding.capability-missing',
  'missing-binding': 'binding.missing' };
function markerCountsOf(events, complete) {
  const observed = { loader: events.filter(x => x.endsWith(':loader')).length,
    evaluation: events.filter(x => x.endsWith(':evaluate')).length,
    factory: events.filter(x => x.endsWith(':factory')).length,
    effect: events.filter(x => x.startsWith('owner:effect:')).length,
    acquisition: events.filter(x => x === 'owner:acquire').length,
    disposer: events.filter(x => x.endsWith(':dispose')).length };
  return { source: 'retained-fixture-markers', completeness: complete ? 'complete' : 'partial',
    observed, total: complete ? observed : null };
}
function expectedEvents(name) {
  if (preImport.has(name)) return [];
  const b = name === 'provider-b' || name === 'swapped-loader';
  const provider = b ? 'b' : 'a';
  const reader = name === 'rejecting-reader' ? 'rejecting-reader'
    : name === 'missing-identity' ? 'missing-identity-reader'
      : name === 'distinct-identity' ? 'distinct-identity-reader' : 'reader';
  const writer = name === 'missing-identity' ? 'missing-identity-writer' : 'writer';
  return [
    `test/provider/${name === 'swapped-loader' ? 'a' : provider}:loader`, 'transitive:evaluate',
    `${provider}:evaluate`, `${provider}:factory`, 'owner:acquire',
    'test/reader/main:loader', `${reader}:evaluate`, `${reader}:factory`,
    ...(name === 'rejecting-reader' ? [] : [
      'test/writer/main:loader', `${writer}:evaluate`, `${writer}:factory`,
      'test/root/main:loader', 'root:evaluate', 'root:factory', 'owner:effect:write',
    ]), `${provider}:dispose`,
  ];
}
function admissionChildren(root, pair) {
  const rows = [];
  for (const name of expected.admissionChildren) {
    const dir = mkdtempSync(join(scratch, `${name}-`));
    const marker = join(dir, 'markers.log');
    const cmd = command(dir, `${pair}.admission.${name}`, process.execPath,
      [join(root, 'tests/admission/child.mjs'), name], 15000, { TEST_MARKERS: marker });
    let result = null;
    try { result = JSON.parse(cmd.text.trim()); } catch { failed(`${pair}/${name}: invalid child JSON`); }
    const events = existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n').filter(Boolean) : [];
    const markerCounts = markerCountsOf(events, true);
    const expectedOutcome = name === 'rejecting-reader'
      ? { phase: 'construction', status: 'failed', code: 'assembly.run.factory-rejected', created: 1 }
      : { phase: phaseFor(name), ...(phaseFor(name) === 'construction' ? { status: 'succeeded', created: 4 } : {}),
        ...(refusal[name] ? { reason: refusal[name] } : {}) };
    const expectedMarkers = expectedEvents(name);
    const expectedValues = name === 'provider-b' || name === 'swapped-loader' ? ['b:write', 'b-value']
      : name === 'reverse-many' ? ['a-value', 'a:write'] : ['a:write', 'a-value'];
    if (cmd.exitCode !== 0 || !result || Object.entries(expectedOutcome).some(([k, v]) => result[k] !== v) ||
        (coreDiagnostic[name] && !result?.diagnostics?.includes(coreDiagnostic[name])) ||
        (result?.status === 'succeeded' && JSON.stringify(result.values) !== JSON.stringify(expectedValues)) ||
        JSON.stringify(events) !== JSON.stringify(expectedMarkers))
      failed(`${pair}/${name}: unexpected outcome or ordered marker`);
    rows.push({ id: name, expected: expectedOutcome, actual: result, expectedEvents: expectedMarkers, orderedEvents: events, markerCounts,
      terminalDebt: 'not exposed by admission child; see terminal-debt probe and lifecycle assertions',
      command: { ...cmd, text: undefined } });
  }
  return rows;
}
function lifecycleRuns(root, pair) {
  const names = expected.tests.slice(expected.lifecycleStartIndex, expected.trainStartIndex);
  const rows = [];
  for (const [index, name] of names.entries()) {
    const testFile = index + expected.lifecycleStartIndex >= expected.replacementStartIndex
      ? 'tests/lifecycle/replacement.test.mjs'
      : name.startsWith('l2c0 ') ? 'tests/lifecycle/staged-exclusive-stop.test.mjs'
      : index + expected.lifecycleStartIndex >= expected.recoveryStartIndex
      ? 'tests/lifecycle/recovery-inventory.test.mjs'
      : name.startsWith('terminal ') ? 'tests/lifecycle/stream-terminal.test.mjs'
        : 'tests/lifecycle/lifecycle.test.mjs';
    const cmd = command(root, `${pair}.lifecycle.${rows.length + 1}`, process.execPath,
      ['--test', '--test-reporter=tap', `--test-name-pattern=${exactName(name)}`,
        testFile], 30000, { TEST_PRESERVE_MARKERS: '1' });
    const totals = Object.fromEntries([...cmd.text.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)]
      .map(([, key, count]) => [key, Number(count)]));
    const actual = cmd.exitCode === 0 && cmd.text.split('\n').some(line =>
      line.startsWith('ok ') && line.endsWith(` - ${name}`)) ? 'pass' : 'fail';
    if (actual !== 'pass' || totals.tests !== 1 || totals.pass !== 1 || totals.fail !== 0 ||
        totals.skipped !== 0 || totals.cancelled !== 0 || totals.todo !== 0)
      failed(`${pair}: focused lifecycle scenario ${name} did not run exactly once`);
    const events = cmd.markerFiles.flatMap(file => file.orderedEvents);
    rows.push({ id: name, expected: 'pass', actual, totals,
      markerFiles: cmd.markerFiles, markerCounts: markerCountsOf(events, false), command: { ...cmd, text: undefined } });
  }
  return rows;
}
function trainRuns(root, pair) {
  const names = expected.tests.slice(expected.trainStartIndex);
  const rows = [];
  for (const name of names) {
    const cmd = command(root, `${pair}.train.${rows.length + 1}`, process.execPath,
      ['--test', '--test-reporter=tap', `--test-name-pattern=${exactName(name)}`, trainFile(name)], 60000);
    const totals = Object.fromEntries([...cmd.text.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)]
      .map(([, key, count]) => [key, Number(count)]));
    const actual = cmd.exitCode === 0 && cmd.text.split('\n').some(line =>
      line.startsWith('ok ') && line.endsWith(` - ${name}`)) ? 'pass' : 'fail';
    if (actual !== 'pass' || totals.tests !== 1 || totals.pass !== 1 || totals.fail !== 0 ||
        totals.skipped !== 0 || totals.cancelled !== 0 || totals.todo !== 0)
      failed(`${pair}: focused train scenario ${name} did not run exactly once`);
    rows.push({ id: name, expected: 'pass', actual, totals, command: { ...cmd, text: undefined } });
  }
  return rows;
}
function probe(root, pair, file, expectation) {
  const dir = mkdtempSync(join(scratch, 'probe-'));
  const marker = join(dir, 'markers.log');
  const cmd = command(root, `${pair}.${file}`, process.execPath,
    [join(root, `scripts/evidence/${file}.mjs`)], 15000, { TEST_MARKERS: marker });
  let actual = null;
  try { actual = JSON.parse(cmd.text.trim()); } catch { failed(`${pair}/${file}: invalid probe JSON`); }
  if (cmd.exitCode !== 0 || !actual || Object.entries(expectation).some(([k, v]) => actual[k] !== v))
    failed(`${pair}/${file}: unexpected process result`);
  const orderedEvents = existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { expected: expectation, actual, orderedEvents,
    markerCounts: markerCountsOf(orderedEvents, false),
    measuredCounts: file === 'terminal-debt-probe' && actual ?
      { source: 'fixture-disposer-counter', disposerCalls: actual.disposeCalls } : undefined,
    command: { ...cmd, text: undefined } };
}
function importFence(root, pair) {
  const row = probe(root, pair, 'import-fence-probe', { importStarted: true,
    sealed: 'draining', raw: 'failed', created: 0, terminal: 'closed', resource: false });
  if (JSON.stringify(row.orderedEvents) !== JSON.stringify(['transitive:evaluate', 'paused:evaluate']))
    failed(`${pair}: import-fence ordered marker mismatch`);
  return row;
}
const temp = mkdtempSync(join(scratch, 'replay-'));
try {
  if (!report.source.commitCoversWorktree)
    failed('source worktree is uncommitted; baseline commit/tree do not cover executed source snapshot');
  if (report.standard.sha256 !== pins.consumerModuleStandard.sha256) failed('CMS copy hash differs from pin');
  // Both exact Node patches are inside the immutable Core/Assembly and kernel engine ranges.
  if (!['v24.18.0', 'v24.21.0'].includes(process.version)) failed(`unreviewed Node binary ${process.version}`);
  report.lifecycleKernel.archive = checkKernelPin();
  const pnpmVersion = command(source, 'pnpm-version', 'pnpm', ['--version']);
  report.environment.pnpm = pnpmVersion.text.trim();
  if (pnpmVersion.exitCode !== 0 || report.environment.pnpm !== '11.20.0') failed('pnpm 11.20.0 unavailable');
  for (const [, label] of [['trainSet', 'train-0.3']]) {
    const root = join(temp, label);
    const pair = report.pairs[label] = { origin: pins.trainSet.origin,
      sourceCommit: pins.trainSet.sourceCommit, sourceTree: pins.trainSet.sourceTree, pins: checkTrainSet(),
      kernelPin: report.lifecycleKernel.archive, installRoot: root };
    copyTestRoot(root);
    pair.childNode = command(root, `${label}.node-version`, 'node',
      ['-p', 'JSON.stringify({version:process.version,execPath:process.execPath})']);
    const childNode = JSON.parse(pair.childNode.text);
    pair.childNode.resolved = childNode;
    if (pair.childNode.exitCode !== 0 || childNode.version !== process.version ||
        realpathSync(childNode.execPath) !== realpathSync(process.execPath))
      failed(`${label}: PATH node differs from reviewed driver`);
    delete pair.childNode.text;
    pair.lock = { sha256: sha256(read(join(root, 'pnpm-lock.yaml'))), path: 'pnpm-lock.yaml' };
    const lockText = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
    for (const name of TRAIN)
      if (!lockText.includes(pair.pins[name].path) || !lockText.includes(pair.pins[name].sri))
        failed(`${label}: lock lacks exact ${name} path/SRI`);
    if (!lockText.includes(pair.kernelPin.path) || !lockText.includes(pair.kernelPin.sri))
      failed(`${label}: lock lacks exact lifecycle-kernel path/SRI`);
    if (/published-0\.1|candidate-0\.2/.test(lockText))
      failed(`${label}: lock mentions a retired package subject`);
    // A registry resolution of a Get Modular package would not be one of the retained archives.
    if (/^\s+'?@get-modular\/[a-z-]+@(?!file:)/m.test(lockText))
      failed(`${label}: lock resolves a Get Modular package outside file:`);
    const store = process.env.TEST_EVIDENCE_PNPM_STORE;
    const args = ['install', '--frozen-lockfile', '--offline', ...(store ? ['--store-dir', store] : [])];
    pair.install = command(root, `${label}.install`, 'pnpm', args);
    if (pair.install.exitCode !== 0) {
      const output = readFileSync(join(source, pair.install.stdout.path), 'utf8') + '\n' +
        readFileSync(join(source, pair.install.stderr.path), 'utf8');
      pair.installError = output.split('\n').find(line => line.startsWith('[ERR_PNPM_')) ??
        `exit ${pair.install.exitCode}, signal ${pair.install.signal ?? 'none'}`;
    }
    delete pair.install.text;
    if (pair.install.exitCode === 0) {
      pair.resolution = installedRoots(root, label);
      const virtualStore = readdirSync(join(root, 'node_modules/.pnpm'));
      for (const name of [...TRAIN, 'lifecycle-kernel'])
        if (virtualStore.filter(entry => entry.startsWith(`@get-modular+${name}@`)).length !== 1)
          failed(`${label}: not exactly one installed copy of @get-modular/${name}`);
      pair.typecheck = command(root, `${label}.typecheck`, 'pnpm', ['typecheck']);
      delete pair.typecheck.text;
      if (pair.typecheck.exitCode !== 0) failed(`${label}: typecheck failed`);
      pair.compiler = command(root, `${label}.compiler-version`, join(root, 'node_modules/.bin/tsc'), ['--version']);
      report.environment.typescript = pair.compiler.text.trim();
      if (report.environment.typescript !== 'Version 7.0.2') failed(`${label}: wrong compiler`);
      delete pair.compiler.text;
      pair.test = command(root, `${label}.test`, 'pnpm', ['test']);
      pair.tests = tap(pair.test.text, label);
      if (pair.test.exitCode !== 0) failed(`${label}: pnpm test failed`);
      delete pair.test.text;
      pair.admission = admissionChildren(root, label);
      pair.lifecycle = lifecycleRuns(root, label);
      pair.train = trainRuns(root, label);
      pair.importFence = importFence(root, label);
      pair.distinctRoot = probe(root, label, 'distinct-root-probe', { phase: 'preparation', status: 'prepared' });
      pair.terminalDebt = probe(root, label, 'terminal-debt-probe', {
        construction: 'published', raw: 'succeeded', terminal: 'cleanup-incomplete',
        state: 'cleanup-incomplete', hasDebt: true, causeMatchesFixture: true, observers: 0, disposeCalls: 1,
      });
    } else {
      failed(`${label}: frozen offline install failed; ${pair.installError}; replay pending`);
      // Archive-only process probe diagnoses the known root-ID correction without
      // upgrading the pair to an accepted lock replay.
      const diagnostic = join(temp, `${label}-archive-probe`);
      for (const name of [...TRAIN, 'lifecycle-kernel'])
        mkdirSync(join(diagnostic, 'node_modules/@get-modular', name), { recursive: true });
      mkdirSync(join(diagnostic, 'scripts/evidence'), { recursive: true });
      for (const path of ['src', 'tests']) cpSync(join(source, path), join(diagnostic, path), { recursive: true });
      cpSync(join(source, 'package.json'), join(diagnostic, 'package.json'));
      for (const file of ['distinct-root-probe.mjs', 'terminal-debt-probe.mjs', 'import-fence-probe.mjs'])
        cpSync(join(source, 'scripts/evidence', file), join(diagnostic, 'scripts/evidence', file));
      for (const name of TRAIN)
        execFileSync('tar', ['-xzf', join(source, pair.pins[name].path), '-C',
          join(diagnostic, 'node_modules/@get-modular', name), '--strip-components=1']);
      execFileSync('tar', ['-xzf', join(source, pair.kernelPin.path), '-C',
        join(diagnostic, 'node_modules/@get-modular/lifecycle-kernel'), '--strip-components=1']);
      pair.archiveOnlyResolution = installedRoots(diagnostic, `${label}.archive-only`);
      pair.archiveOnlyDistinctRoot = probe(diagnostic, label, 'distinct-root-probe', { phase: 'preparation', status: 'prepared' });
      pair.archiveOnlyTest = command(diagnostic, `${label}.archive-only-test`, process.execPath,
        ['--test', '--test-reporter=tap']);
      pair.archiveOnlyTests = tap(pair.archiveOnlyTest.text, `${label}/archive-only`);
      if (pair.archiveOnlyTest.exitCode !== 0) failed(`${label}: archive-only tests failed`);
      delete pair.archiveOnlyTest.text;
      pair.archiveOnlyAdmission = admissionChildren(diagnostic, `${label}.archive-only`);
      pair.archiveOnlyLifecycle = lifecycleRuns(diagnostic, `${label}.archive-only`);
      pair.archiveOnlyTrain = trainRuns(diagnostic, `${label}.archive-only`);
      pair.archiveOnlyImportFence = importFence(diagnostic, `${label}.archive-only`);
      pair.archiveOnlyTerminalDebt = probe(diagnostic, `${label}.archive-only`, 'terminal-debt-probe', {
        construction: 'published', raw: 'succeeded', terminal: 'cleanup-incomplete',
        state: 'cleanup-incomplete', hasDebt: true, causeMatchesFixture: true, observers: 0, disposeCalls: 1,
      });
    }
  }
} catch (error) { failed(`runner infrastructure: ${error instanceof Error ? error.message : String(error)}`); }
report.status = report.failures.length === 0 ? 'accepted' : 'pending';
const manifest = join(out, 'evidence.json');
writeFileSync(manifest, JSON.stringify(report, null, 2) + '\n');
rmSync(scratch, { recursive: true, force: true });
console.log(JSON.stringify({ status: report.status, evidence: relative(source, manifest),
  failures: report.failures, pairs: Object.keys(report.pairs) }));
if (report.status !== 'accepted') process.exitCode = 1;
